# Codex 今晚任务总纲 · 7-8小时自循环执行

> 这是今晚唯一要读的文件。里面已经把结构修复任务的完整内容嵌进来了（不用等 git fetch 成功再开工——你现在到 GitHub 的连接可能还在被重置，2026-08-11 log.md 里已经记过这个问题，处理方式见〇）。
> 核心原则：**做完一项，验证，commit，写心跳，立刻接下一项，不等确认**。今晚没有人在旁边盯着，自己判断优先级、自己往下推。

## 〇、先处理网络：不要卡在这一步

上次连接测试 `git fetch origin` 报 `Recv failure: Connection was reset`。开工前：
1. 重试 `git fetch origin` 最多 3 次，每次间隔 30 秒。
2. 3 次都失败：不要继续重试，也不要空等——直接按本文件内容开工（内容是自包含的，不依赖 fetch 成功）。
3. `git push` 大概率也会因 443 端口重置失败——沿用你自己在 2026-08-11 log.md 里记录过的方案：git push 连续失败 2 次后，改用已认证的 GitHub API，以已知的远端最新 commit（`3a4abe7`，如果你能 fetch 到就用 fetch 到的最新值）为父提交写入文件树。这条路径你之前已经用过、有效，不用重新摸索。
4. 每次因为网络失败切换到 API 路径，在心跳文件里记一句，不用大费笔墨。

## 一、P0（今晚必须做完，预算前 3 小时）：搜索循环结构修复 + 真 LLM 接入 + 智能体四端口

### 背景（为什么要改）

复核 `run_family_search`（`src/search.py:198-319`）发现：`candidate_pool` 在轮次循环**之前**一次性生成（第 222-240 行），循环内部只是从这个写死的池子里分页，池子不会因为任何一轮的打分结果而改变。根因在 `find_analogy_source`（`src/application.py:19-41`）：对每个 `relation_type` 只返回全局最优的一对，没有排除已用组合的参数，所以 `warmstart_candidates` 无论调用几次，同一个 `relation_type` 拿到的永远是同一对源变换——池子第一轮就已经穷尽。

官方要求两条：① 真的要有个搜索/优化算法在探索，② LLM 要真正参与探索过程。只把两个函数内部换成真 LLM 调用只解决②——LLM 给一份写死的清单重新排序，是 reranker 不是参与搜索。这次两条一起解决。

**验证标准（写进代码，不是嘴上说）**：第 N+1 轮的候选集里，必须能挑出至少一个"用第 1 轮的输入不可能枚举到"的候选 ID。

### 1.1 `find_analogy_source` 加排除参数

`src/application.py:19`：

```python
def find_analogy_source(edges, materials, vecs, comp_dims, relation_type: str, exclude_pairs: set | None = None):
    """exclude_pairs：已用过的 (pair1, pair2) 组合集合（无序对，两种顺序都要能匹配），
    传入后返回"次优"、"次次优"……而不是每次都返回全局最优。"""
```
内部：遍历时若 `frozenset({(a1,b1),(a2,b2)})` 命中 `exclude_pairs` 就跳过，其余逻辑不变。

### 1.2 `warmstart_candidates` 透传排除集

`src/search.py:37`：新增参数 `exclude_source_pairs: set | None = None`，透传给 `find_analogy_source`。

### 1.3 `run_family_search` 改成轮次驱动扩张

`src/search.py:198-319` 循环体改成：

```
round 1：
    warmstart_candidates（不排除任何 source pair）对每个 relation_type 生成初始候选池
    → LLAMBO"热启动"位置，任务二接真 LLM 调用
    打分 → propose_next_round 选 batch_size 个 → 记录 history

round N (N>=2)：
    调用 LLM（任务二"扩张决策"），把 round N-1 的 history（每个候选的 score/penalty_reasons/degenerate）
    喂给它，问"继续深挖这些还有价值的 relation_type，还是换方向"
    对判定"值得继续"的 relation_type 再调一次 warmstart_candidates，
    传入 exclude_source_pairs = 该 relation_type 已用过的所有 source pair
    → 新候选追加进 candidate_pool（按 candidate_id 去重）
    → propose_next_round 从"当前累积的候选池"里选 batch_size 个（任务二第二个真 LLM 调用位置）
```

`report` 新增字段：
- `pool_growth_by_round`：每轮结束后候选池累计大小，必须非递减且至少一轮严格增长
- `expansion_source_by_round`：每轮新增候选来自哪个 relation_type + `rank_within_relation_type`（第几优的 source pair）——这是"第N+1轮候选不可能在第1轮枚举到"的直接证据

### 二、两处真实 LLM 调用

新建 `src/llm_client.py`，模式仿照 `src/sciverse.py` 的 `_load_key()`（先查环境变量，再查 `_digital_assets/api_keys.env`）：

```python
def call_llm(system_prompt: str, user_prompt: str, *, json_mode: bool = True) -> dict:
    """优先 STEP_API_KEY/STEP_BASE_URL（阶跃星辰，国内直连不用代理）。
    失败（网络/超额/超时）不静默吞掉，返回 {"llm_call_status": "fallback_used", "error": "..."}。
    每次调用（无论成败）落盘 outputs/llm_calls/<hash>.json，字段跟 outputs/sciverse_calls/ 审计格式对齐。
    """
```
先探一下 `{STEP_BASE_URL}/chat/completions` 实际能用的 `model` 值，不确定就先探测别瞎猜写死。阶跃走不通（鉴权失败/模型名不对反复试超过3次），换 `GEMINI_KEY`（Google Gemini API 格式）兜底；两条都不通，保留启发式路径，但 `llm_integration_mode` 如实标 `"heuristic_fallback_llm_unreachable"`，不能标成真调用成功。

**调用点一**（扩张决策，round N 问"继续深挖还是换方向"）：
```
system_prompt = "你是材料科学证据评估助手。基于已完成轮次的候选评分（余弦相似度、退化标记、已知反例惩罚），判断哪些 relation_type 值得用次优源变换继续深挖，哪些该放弃。只能给出解释和取舍，不能编造材料或数据。"
```
输出：`{"continue_relation_types": [...], "reasoning": "..."}`

**调用点二**（`propose_next_round` 采样/剪枝，替换现在纯 `sort()`）：
```
system_prompt = "你是材料科学候选筛选助手。从未观察过的候选里选出本轮最值得验证的 batch_size 个，综合考虑分数高低、是否已知反例边界（如Co/Mn）、和已选候选的多样性（不要挤在同一个 relation_type）。理由必须引用候选自带字段，不能凭空编。"
```
输出：`{"selected_candidate_ids": [...], "reasoning": {...}}`。**LLM 返回的 ID 不在候选集合里就丢弃，不能硬塞**（防幻觉污染报告）。

两处都把 `llm_integration_mode` 从 `HEURISTIC_MODE` 改成 `"real_llm_call"`，`real_llm_api_called` 改成 `True`；走兜底如实标注。`method` 字段从 `"bayesian_optimization_style_search"` 改成 `"llm_guided_iterative_candidate_expansion_and_pruning"`——现在的打分是点估计，没有后验分布、没有 Expected Improvement，谈不上贝叶斯优化，官方原文是"均可"，没必要硬凑这个名字。`CLAUDE.md` 里"搜索与可视化"一节同步改。

### 三、智能体四端口：补"灵魂"和"工作流"

"记忆"（`knowledge/*.csv`）和"技能概览"（`outputs/pipeline_report.json`）已存在。新建顶层目录 `agent/`（跟 `raw/knowledge/src` 平级，运行时身份配置，不是知识编译产物），`CLAUDE.md` 补一节说明这个目录定位。

`agent/soul.json`：从 `CLAUDE.md`"铁律"一节提炼：
```json
{
  "name": "材料科学文献知识库 Agent",
  "role": "从文献中抽取材料关系，用类比迁移生成候选假设，不做实验验证",
  "boundaries": [
    "只生成候选假设，标注(未验证)，不包装成结论",
    "证据分核心(DOI可溯源)/扩展(MatKG弱证据)两级，绝不混淆",
    "抽不出证据摘录的边不入库",
    "候选假设必须标注下一步交叉验证要求(MP/OQMD/NOMAD)"
  ]
}
```

`agent/workflow.json`：意图→后端函数固定映射表，不做真实语言理解：
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
这跟 `docs/frontend/frontend_dev_spec.md` 第04节接口契约是同一套东西，补的正是当时没建的第3、4个端口，前端直接读文件渲染。

### 四、自查脚本 `src/verify_search_case.py`

读 `outputs/search_runs/<name>.json`，输出评价报告：
- `structural_search_assertion_passed`：是否存在某轮候选 `rank_within_relation_type >= 2`（证明第1轮不可能枚举到）
- `llm_participation_rate`：两个调用点里 `llm_integration_mode == "real_llm_call"` 的轮次占比
- `evidence_tier_correct`：所有候选的 evidence_tier 都不是来自 MatKG 扩展集
- `exploration_diversity`：`{"relation_types_round1": N, "relation_types_final": M}`
- `candidates_have_next_step`：所有候选带 `next_step_required`
- `audit_log_complete`：`outputs/llm_calls/` 记录数等于报告声称的调用次数

跑法：`python src/verify_search_case.py --run 1111`

### 旗舰案例：1111 家族

不用122（候选池12，第3轮就耗尽）。用**1111**（核心材料9、候选池49，之前5轮跑满没耗尽），结构修复后能看出探索方向真正随轮次演化。

### P0 交付清单
- [ ] `find_analogy_source`/`warmstart_candidates` 支持排除集
- [ ] `run_family_search` 轮次驱动扩张，`pool_growth_by_round` 至少一轮严格增长
- [ ] `src/llm_client.py`，两处真调用接入，审计落盘
- [ ] `method`/`llm_integration_mode` 字段如实更新，CLAUDE.md 同步
- [ ] `agent/soul.json`、`agent/workflow.json`
- [ ] `src/verify_search_case.py` 跑通 4 个家族

---

## 二、P1（P0做完接着做，不用等指示，预算1-2小时）

1. **全家族验证**：对 122/1111/11/MgB2 都跑一遍 `verify_search_case.py`，任何一项 checklist 不过就回头修，不要留着不过的检查项交差。
2. **新增第6张图**：`src/visualize.py` 加一张"候选池随轮次增长曲线"（读 `pool_growth_by_round`），至少画出 1111 家族的曲线——这是"真的在搜索"最直观的可视化证据。
3. **旗舰案例走查文档**：把 1111 家族结构修复后的完整跑一遍过程（每轮池子多大、LLM做了什么决策、为什么、最终候选是什么），写成 `outputs/flagship_case_1111_walkthrough.md`，人话叙述+关键数字，这份是明天写系统说明书时"案例"那一节的原始素材，越具体越好。
4. **技术实现小结**：把今晚实际改了什么，写一份诚实的技术摘要 `logs/tonight_technical_summary.md`（不是正式交付文档，是给明天写 Proposal 用的原始素材）：改了哪几个函数、为什么、验证结果是什么、还有哪些已知局限没解决。

## 三、P2（时间还有余量再做，严格封顶，不许开新坑）

- 用 Sciverse 再检索一批核心边，**最多新增10条**、每条必须有真实DOI和证据摘录，达不到10条也别硬凑质量差的边。
- 全部改动做完后，完整跑一遍 `python src/pipeline.py` 确认没有回归。

**明确不做的事**（防止今晚开新坑）：不重写算法（不上高斯过程/MCTS）、不碰 `raw/` 层、不改现有 schema 结构、不写任何前端UI代码（那是谭力奎的活）、不直接改 `_digital_assets/api_keys.env`（只读）。

---

## 四、自循环协议（怎么撑满7-8小时不掉线）

1. **做完一项就往下走**：完成一个条目 → 跑它自己的验证 → commit（消息说清楚这是哪个条目）→ 追加一条 `logs/log.md` → 立刻开始下一项，不等确认、不等回复。
2. **心跳文件**：每完成一个条目或每隔约45分钟（先到者为准），更新（不是追加）`logs/OVERNIGHT_STATUS.md`，覆盖写这几行：
   ```
   更新时间：...
   当前在做：P0/P1/P2 的哪一项
   已完成：...
   下一项：...
   卡住的地方（如果有）：...
   ```
   这是断点接力卡，不是日志，明天早上我们一眼就知道进度到哪，不用翻全部 log.md。
3. **卡住超过20分钟真实尝试后**：不要死磕。把卡在哪、试过什么，写进心跳文件的"卡住的地方"，回退到有把握的路径（比如 LLM 调用两条路都不通就用启发式兜底，如实标注），继续下一项。永远不要把工作区留在一半破碎、没提交的状态就切换任务。
4. **时间到了怎么收尾**：如果7-8小时用完 P0 还没做完，停止开新工作，确保已完成的部分是干净、已验证、已提交推送的状态，心跳文件写清楚最终状态——不要留着一堆未完成的修改摆在那。P0 优先级严格高于 P1/P2，P1/P2 没做完完全没关系。
