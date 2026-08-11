# 2026-08-12 夜间技术总结

## 结果摘要

P0、P1 和余量阶段均已完成：搜索从静态池改为逐轮扩张；加入 STEP→Gemini→诚实启发式降级的审计决策链；补齐 agent 四端口；新增全家族与单案例自查；生成候选池增长曲线和 1111 旗舰说明；用 Sciverse 再检索并仅收入 2 条 DOI 可核验核心边。

远端 `610354a` 已有 79 条核心边，本地 2 条新边合并后为 81 条。完整基线上，1111 首轮候选从历史 49 增至 56，随后 **56→66→76→86→96**。后续轮观察到 16 个首轮外 ID，满足结构验收。

## 根因与结构修复

旧版 `find_analogy_source()` 对每个 relation type 只返回全局最优的一对变换，`run_family_search()` 又在循环前一次性生成候选，多轮只能切同一个列表。

- `find_analogy_source(..., exclude_pairs=None, ranked_pairs=True)` 现在可以返回过滤后的完整确定性排序，默认仍兼容旧的“返回最佳一项”。
- `warmstart_candidates(..., exclude_source_pairs=None)` 支持跳过已用来源。
- 搜索首轮开放每类第一来源；每轮排序后再审计一次“深挖/换方向”决策，并开放新的来源排名。
- 候选 ID 包含源、参考与目标，保证不同证据方向不碰撞；报告新增 `rank_within_relation_type`、`pool_growth_by_round`、`expansion_source_by_round`。

方法字段固定为 `llm_guided_iterative_candidate_expansion_and_pruning`。代码没有高斯过程、后验分布或 Expected Improvement，因此不再使用“贝叶斯优化”措辞。

## LLM 接入与诚信边界

`src/llm_client.py` 依次尝试 STEP（兼容 `STEP_BASE`/`STEP_BASE_URL`）和 Gemini；两者不可达时使用 `heuristic_fallback_llm_unreachable`。接入点是候选筛选排序与每轮扩张决策，每次调用都写 `outputs/llm_calls/<call_id>.json`，且不写密钥。

本机未发现可用的 STEP/Gemini 完整配置，所以本轮四家族共 40 次逻辑调用均为启发式降级，`real_llm_api_called=false`。mock 测试证明 STEP 成功响应路径可解析且凭证不会落审计；这不等于本轮发生过真实模型调用。

## Agent 四端口与自查

- `agent/CLAUDE.md`：人类可读铁律。
- `agent/soul.json`：机器可读身份、语气、证据立场和降级原则。
- `agent/workflow.json`：8 个意图到真实 Python 函数的固定映射，与前端规范第 04 节同层。
- `src/verify_search_case.py --run <family>`：输出结构断言、LLM 参与率、证据层级、探索多样性、候选下一步与审计完整性。

`src/verify_search.py` 同时核验四家族：池逐轮增长、后续轮有首轮外 ID、观察 ID 唯一、证据层未混用、每轮恰有两份审计、真实调用标志一致。1111 接受标准为不得低于历史 49 基线并必须继续增长，避免把远端新增证据造成的 56 错判为失败。

## 完整数据与验证结果

主管线结果：53 篇唯一 DOI 文献、81 条核心边、94 个核心材料、210 条 MatKG 弱边、140 个向量节点、326 组非退化核心证据、6 个 L4 未验证候选。

| 家族 | 初始池 | 最终池 | 实际观察 | 保留 | 后续轮首轮外 ID | 审计 | 真实 API |
|---|---:|---:|---:|---:|---:|---:|---|
| 122 | 33 | 52 | 20 | 20 | 16 | 10 | 否 |
| 1111 | 56 | 96 | 20 | 20 | 16 | 10 | 否 |
| 11 | 56 | 96 | 20 | 20 | 16 | 10 | 否 |
| MgB2 | 44 | 76 | 20 | 20 | 16 | 10 | 否 |

“最终池”是累计未验证假设空间，不是发现材料数。四个单案例验收均通过；全家族总验收在修正历史 49 的硬编码后通过。

## Sciverse 余量检索

调用审计为 `outputs/sciverse_calls/30f701db4f80.json` 与 `c1f9ff5c42d9.json`。仅收入：

- La4Ni3O10-delta 压力诱导超导，Nature 2024，DOI `10.1038/s41586-024-07553-3`；
- BaFe1.9Pt0.1As2 的 Pt 取代超导，PRB 2010，DOI `10.1103/PhysRevB.81.104525`。

仅有 arXiv、没有核对发表 DOI、或关系不清的结果均未入核心库；raw 层未改，CSV schema 未改。

## 局限

1. 没有真实 STEP/Gemini 成功响应，当前验证的是接口、降级、审计与约束，不是模型判断质量。
2. 余弦分数评价证据方向而非目标材料，同一方向迁到多个目标时可能同分。
3. 成分向量不是位点化学、价态、相稳定性或合成模型。
4. 启发式本轮持续选择 R2 深挖；“换方向”能力已具备但未由真实模型检验。
5. 所有搜索产物仍是 `候选假设(未验证)`，必须继续做数据库、原文或实验交叉验证。
6. GitHub 443 导致 fetch 三次、push 两次失败；最终同步改用用户指定的已认证 GitHub API，以远端最新提交为父原子写树。

## 复现

```powershell
E:\Anaconda3\python.exe src\pipeline.py
E:\Anaconda3\python.exe src\search.py
E:\Anaconda3\python.exe src\verify_search.py
E:\Anaconda3\python.exe src\verify_search_case.py --run 1111
E:\Anaconda3\envs\camel_agent\python.exe src\visualize.py
E:\Anaconda3\envs\camel_agent\python.exe -m unittest discover -s tests -v
```
