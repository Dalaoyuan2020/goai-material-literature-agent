# Codex 任务 · 搜索循环结构性修复 + 真实 LLM 接入 + 智能体四端口

> 给本地 Codex：读完直接开工，不用等确认。今晚要做完，明天要接前端。
> 这份任务书建立在上一轮 `search.py` 已完成的基础上，不是重写，是修复 + 补全。

## 〇、为什么要改（先说清楚问题，不是没事找事）

上一轮复核 `run_family_search`（`src/search.py:198-319`）发现一个结构性问题：`candidate_pool` 在进入轮次循环**之前**一次性生成（第 222-240 行），循环内部（第 246-282 行）的 `propose_next_round` 只是从这个写死的池子里按 4 个一批分页，池子本身**不会因为任何一轮的打分结果而改变**。所谓"收敛"（`consecutive_no_new >= 2`）本质是"池子发完了"，不是"探索到头了"。

根因在 `find_analogy_source`（`src/application.py:19-41`）：这个函数对每个 `relation_type` 只返回**全局最优的一对**（`abs(cosine)` 最大的那对非退化组合），且没有排除已用组合的参数。所以 `warmstart_candidates` 无论调用几次、在哪一轮调用，对同一个 `relation_type` 拿到的永远是同一对源变换 —— 池子从第一轮就已经穷尽了整个搜索空间，第二轮往后没有任何新东西可以被发现。

官方要求是两条，不是一条：① 真的要有个搜索/优化算法在探索，② LLM 要真正参与这个探索过程。之前的计划（只把 `warmstart_candidates`/`propose_next_round` 内部换成真 LLM 调用）只解决②，①还是没解决——LLM 去给一份写死的清单重新排序，那是 reranker，不是参与搜索。这次要把两条一起解决。

**验证标准（写死在代码里，不是嘴上说）**：第 N+1 轮的候选集里，必须能挑出至少一个"用第 1 轮的输入不可能枚举到"的候选 ID。`verify_search_case.py`（见任务四）要能自动断言这一条。

## 一、结构性修复：让候选池随轮次真正扩张

### 1.1 `find_analogy_source` 加排除参数

`src/application.py:19`：

```python
def find_analogy_source(edges, materials, vecs, comp_dims, relation_type: str, exclude_pairs: set | None = None):
    """在同类关系里找一组非退化、高平行性的"源变换"作为迁移模板。
    exclude_pairs：已经用过的 (pair1, pair2) 组合集合（无序对，两种顺序都要能匹配），
    传入后返回"次优"、"次次优"……而不是每次都返回全局最优。
    """
```

内部逻辑：遍历时若 `frozenset({(a1,b1),(a2,b2)})` 命中 `exclude_pairs` 就跳过，其余保持不变（仍然按 `abs(cosine)` 取当前候选集里的最优）。

### 1.2 `warmstart_candidates` 透传排除集

`src/search.py:37`：新增参数 `exclude_source_pairs: set | None = None`，透传给 `find_analogy_source`。其余逻辑不变。

### 1.3 `run_family_search` 改成"轮次驱动扩张"而不是"一次性穷举"

`src/search.py:198-319` 的循环体改成：

```
round 1:
    用 warmstart_candidates（不排除任何 source pair）对每个 relation_type 生成初始候选池
    → 这一步是 LLAMBO"热启动"位置，任务二会把它接成真 LLM 调用
    打分 → propose_next_round 选 batch_size 个 → 记录 history

round N (N>=2):
    调用 LLM（任务二的"扩张决策"调用），把 round N-1 的 history（含每个候选的 score/penalty_reasons/degenerate）
    喂给它，问它："继续深挖这些还有价值的 relation_type/家族，还是换一个方向"
    根据 LLM 的返回，对被判定"值得继续"的 relation_type 再调一次 warmstart_candidates，
    这次传入 exclude_source_pairs = 该 relation_type 已经用过的所有 source pair
    → 拿到的新候选追加进 candidate_pool（去重仍按 candidate_id）
    → propose_next_round 从"当前累积的候选池"里选 batch_size 个（这一步是任务二的第二个真 LLM 调用位置）
```

`report` 里新增字段：
- `pool_growth_by_round`：`[12, 15, 18, ...]` 每轮结束后候选池的累计大小，必须是非递减且在至少一轮里严格增长（否则说明扩张没生效）
- `expansion_source_by_round`：每轮新增候选来自哪个 `relation_type` + 是第几优的 source pair（`rank_within_relation_type: 1/2/3...`），这是"第 N+1 轮候选不可能在第 1 轮枚举到"的直接证据

## 二、两处真实 LLM 调用

新建 `src/llm_client.py`，模式仿照 `src/sciverse.py` 的 `_load_key()`（先查环境变量，再查 `~/Documents/Claude_Mini_agent/_digital_assets/api_keys.env`）：

```python
def call_llm(system_prompt: str, user_prompt: str, *, json_mode: bool = True) -> dict:
    """优先用 STEP_API_KEY/STEP_BASE_URL（阶跃星辰，国内直连不用代理）。
    失败（网络/超额/超时）时不静默吞掉，返回 {"llm_call_status": "fallback_used", "error": "..."}，
    调用方据此决定要不要退回启发式路径，并在候选/报告里如实标注，不许伪装成真调用成功。
    每次调用（无论成功失败）都要落盘到 outputs/llm_calls/<hash>.json，字段跟 outputs/sciverse_calls/ 的审计格式对齐：
    请求内容、响应内容、模型名、耗时、状态。
    """
```

先用一个最小 prompt 探一下 `{STEP_BASE_URL}/chat/completions` 实际能用的 `model` 字段值（可能是 `step-1-8k`/`step-2-mini` 之类，不确定就先探测，不要瞎猜写死）。如果阶跃这条路走不通（鉴权失败/模型名不对反复试错超过 3 次），换 `GEMINI_KEY`（Google Gemini API 格式）当兜底；两条都不通，就在 `search.py` 里保留现在的启发式路径，但把 `llm_integration_mode` 如实标成 `"heuristic_fallback_llm_unreachable"`，不能标成真调用成功。

**调用点一**（`src/search.py`，扩张决策，对应 1.3 里 round N 的"问 LLM 继续深挖还是换方向"）：

```python
system_prompt = "你是材料科学证据评估助手。基于已完成轮次的候选评分（余弦相似度、退化标记、已知反例惩罚），判断哪些 relation_type 值得用次优源变换继续深挖，哪些该放弃。只能给出解释和取舍，不能编造材料或数据。"
```
输入：上一轮 `history` 里每个候选的 `relation_type/score/degenerate/penalty_reasons`。输出（JSON）：`{"continue_relation_types": [...], "reasoning": "..."}`。

**调用点二**（`propose_next_round`，采样/剪枝位置，替换现在纯 `sort()` 的部分）：

```python
system_prompt = "你是材料科学候选筛选助手。从未观察过的候选里选出本轮最值得验证的 batch_size 个，需要综合考虑分数高低、是否已知反例边界（如Co/Mn）、以及和已选候选的多样性（不要挤在同一个 relation_type）。给出选择和理由，理由必须引用候选自带的字段，不能凭空编。"
```
输出（JSON）：`{"selected_candidate_ids": [...], "reasoning": {...}}`。**如果 LLM 返回的 ID 不在候选集合里，丢弃该 ID，不能硬塞进结果**（防止幻觉污染报告）。

两处都要把 `llm_integration_mode` 从 `HEURISTIC_MODE` 改成 `"real_llm_call"`，`real_llm_api_called` 改成 `True`；如果走了兜底，如实标注（见上）。`method` 字段从 `"bayesian_optimization_style_search"` 改成 `"llm_guided_iterative_candidate_expansion_and_pruning"` —— 现在的打分是 `rules.cosine` 的点估计，没有后验分布、没有 Expected Improvement，谈不上贝叶斯优化，不要用这个名字，官方原文是"均可"（BO/GA/MCTS等任选），没必要硬凑。`CLAUDE.md` 里"搜索与可视化"一节提到"贝叶斯优化风格"的地方一并改掉。

## 三、补全智能体的"灵魂"和"工作流"两个端口

"记忆"（`knowledge/*.csv`）和"技能概览"（`outputs/pipeline_report.json`）已经存在，不用动。新建顶层目录 `agent/`（跟 `raw/knowledge/src` 平级，代表运行时身份配置，不是知识编译产物），并在 `CLAUDE.md` 里补一节说明这个目录的定位。

`agent/soul.json`：从 `CLAUDE.md` 的"铁律"一节提炼，结构化成前端能直接渲染的"关于本 Agent"面板数据：

```json
{
  "name": "材料科学文献知识库 Agent",
  "role": "从文献中抽取材料关系，用类比迁移生成候选假设，不做实验验证",
  "boundaries": [
    "只生成候选假设，标注(未验证)，不包装成结论",
    "证据分核心(DOI可溯源)/扩展(MatKG弱证据)两级，绝不混淆",
    "抽不出证据摘录的边不入库",
    "候选假设必须标注下一步交叉验证要求(MP/OQMD/NOMAD)"
  ],
  "tone": "..."
}
```

`agent/workflow.json`：意图 → 后端函数的固定映射表，V1 不做真实语言理解：

```json
{
  "intents": [
    {"trigger_examples": ["122体系有什么新候选", "帮我搜122"], "action": "search.run_family_search", "params": {"run_name": "122", "family": "122"}},
    {"trigger_examples": ["1111体系", "掺氟这类的"], "action": "search.run_family_search", "params": {"run_name": "1111", "family": "1111"}},
    {"trigger_examples": ["11体系"], "action": "search.run_family_search", "params": {"run_name": "11", "family": "11"}},
    {"trigger_examples": ["看看整体统计", "知识库现在多大"], "action": "pipeline.main", "params": {}}
  ]
}
```

前端（谭力奎那边）直接读这两个文件渲染，不需要理解后端怎么算的——这跟 `docs/frontend/frontend_dev_spec.md` 第 04 节的接口契约是同一套东西，补的就是那份文档里当时还没建的第 3、4 个端口。

## 四、自查脚本 `src/verify_search_case.py`

读 `outputs/search_runs/<name>.json`，输出一份 JSON 评价报告，字段：

- `structural_search_assertion_passed`：bool，检查是否存在某一轮的候选，其 `rank_within_relation_type >= 2`（即证明这个候选在第1轮不可能被枚举到）
- `llm_participation_rate`：两个调用点里，`llm_integration_mode == "real_llm_call"` 的轮次占比
- `evidence_tier_correct`：bool，所有候选的 `source_evidence_tier`/`target_evidence_tier` 都不是从 MatKG 扩展集来的
- `exploration_diversity`：`{"relation_types_round1": N, "relation_types_final": M}`，M 应该 >= N 或者至少 source_pair 的 rank 有变化
- `candidates_have_next_step`：bool，所有候选都带 `next_step_required`
- `audit_log_complete`：`outputs/llm_calls/` 下的记录数是否等于报告里声称的 LLM 调用次数

跑法：`python src/verify_search_case.py --run 1111`，人和评委都能一眼看结果对不对，不用逐条翻 JSON。

## 五、旗舰案例定哪个家族

不用 122（核心材料 3、候选池 12，第 3 轮就把池子耗尽，池子太小看不出扩张效果）。**用 1111 家族**（核心材料 9、候选池 49、之前 5 轮跑满都没耗尽），结构修复后能看出"探索方向随轮次真正演化"这件事，跑法：`python src/search.py`（`run_all()` 四个家族都会跑，1111 单独作为报告里重点展示的案例，其余三个照常跑完留作补充证据）。

## 六、交付清单

- [ ] `find_analogy_source` 支持 `exclude_pairs`，`warmstart_candidates` 透传
- [ ] `run_family_search` 改成轮次驱动扩张，`pool_growth_by_round` 至少有一轮严格增长
- [ ] `src/llm_client.py` 建好，StepFun 优先、Gemini 兜底，失败如实标注，每次调用落盘审计
- [ ] 两处真 LLM 调用接入，`llm_integration_mode`/`real_llm_api_called` 如实反映
- [ ] `method` 字段改名，`CLAUDE.md` 同步改掉"贝叶斯优化风格"的表述
- [ ] `agent/soul.json`、`agent/workflow.json` 建好，`CLAUDE.md` 补一节说明 `agent/` 目录定位
- [ ] `src/verify_search_case.py` 跑通，对 1111 输出评价报告
- [ ] `logs/log.md` 追加本轮记录（做了什么、验证结果是什么、有没有踩坑）
- [ ] 全部改动 commit + push，commit message 里说清楚这次是"结构修复"不是"新功能"
