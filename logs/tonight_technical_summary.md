# 2026-08-12 夜间技术总结

## 结果摘要

今晚完成了全部 P0 与指定 P1：搜索空间从静态池改成逐轮扩张；加入 STEP→Gemini→启发式的审计决策链；补齐 agent 双端口；新增四家族自查；跑通全家族回归；新增候选池增长曲线和 1111 旗舰 walkthrough。

最关键的验收数字是 1111 候选池 **49→85**，并且第 2–5 轮每轮都实际观察到了首轮完整 49 个候选中不可能存在的新 ID。四家族自查总结果为 PASS。

## 为什么要改

旧版 `find_analogy_source()` 对每个 relation type 只返回全局最佳的一对变换；`run_family_search()` 又在进入循环前一次性生成候选。所谓多轮只是从同一个静态列表继续取值，不能探索新证据方向。

旧版还把整个方法写成“贝叶斯优化风格”，但代码没有高斯过程、后验分布或 Expected Improvement。LLAMBO 三个位置也只是启发式近似，不是真实 API。这个命名会让实现显得比实际更强，必须纠正。

## 改了什么

### 1. 多源类比与轮次扩张

- `application.find_analogy_source(..., ranked_pairs=True)` 现在返回全部非退化类比源的确定性排序；默认调用仍返回全局最佳来源，保持兼容。
- 搜索首轮只开放每个关系类型的第一个来源；每轮结束后再决定深挖当前 relation type 或切换方向，并开放下一排名来源。
- 候选 ID 加入源变换和参考变换，避免不同证据方向碰撞。
- 新开放候选优先进入下一轮，同时仍由本地规则保证已观察 ID 不重复。

### 2. 审计型 LLM 接口

- 新增 `src/llm_client.py`，只用 Python 标准库。
- 调用顺序：STEP（`STEP_API_KEY` + `STEP_BASE`）→ Gemini（`GEMINI_KEY`）→ 明确启发式兜底。
- 两个接入点：候选筛选排序；每轮后的“继续深挖还是换方向”决策。
- 每个逻辑调用都写入 `outputs/llm_calls/<call_id>.json`，包含请求、provider 尝试、失败原因、模式和结果，但不含凭证。
- provider 返回的陌生候选 ID、已观察 ID 和不可扩张 relation type 会被本地白名单拒绝。
- `method` 改为“可解释余弦评分 + LLM引导扩张与剪枝”，不再称贝叶斯优化。

本机实际情况：环境和约定 `_digital_assets/api_keys.env` 都没有 STEP/Gemini 必要配置，所以本轮 40 个逻辑调用全部诚实使用 `heuristic_fallback_not_real_llm`，四份报告均为 `real_llm_api_called=false`。单测用 mock 验证了 STEP 成功解析路径和密钥不落审计，但这不等于今晚发生过真实网络调用。

### 3. Agent 双端口

- `agent/CLAUDE.md`：提炼 raw 只读、schema 稳定、核心/MatKG 证据隔离、未验证假设、LLM 诚信、密钥保护和允许操作边界。
- `agent/workflow.json`：把 9 个意图映射到真实 Python 函数，包括检索、构图、向量化、类比源、单/全家族搜索、自查、主管线和可视化。
- 契约测试逐个 import 目标函数，避免文档指向不存在的接口。

### 4. 自动自查

新增 `src/verify_search.py`，检查：

- 四份家族报告齐全且映射正确；
- 方法名诚实；
- 候选池逐轮严格增长；
- 每个后续轮都有首轮完整池外 ID；
- 已观察 ID 唯一；
- 所有条目仍标为未验证假设；
- 核心 DOI 与 MatKG 弱背景没有混用；
- 每轮恰有候选排序和扩张决策两份审计；
- 真实 LLM 标志与逐份审计一致；
- 1111 首轮必须为 49 且最终大于 49。

结果写入 `outputs/search_verification.json`。

### 5. 可视化与案例说明

- 新增 `outputs/visualizations/04_candidate_pool_growth.png`，完全从四份搜索 JSON 读取增长数据。
- 流程图把 `BO-style search` 改成 `Iterative search`，并写出当前为审计型启发式降级。
- 新增 `outputs/flagship_case_1111_walkthrough.md`，逐轮解释 1111 的池增长、候选保留/剪枝、审计状态和科学局限。

## 四家族验证结果

| 家族 | 初始池 | 最终池 | 实际观察 | 保留 | 后续轮首轮外 ID | LLM 审计 | 真实 API |
|---|---:|---:|---:|---:|---:|---:|---|
| 122 | 12 | 24 | 20 | 20 | 12 | 10 | 否 |
| 1111 | 49 | 85 | 20 | 12 | 16 | 10 | 否 |
| 11 | 38 | 55 | 20 | 12 | 15 | 10 | 否 |
| MgB2 | 5 | 9 | 9 | 7 | 4 | 10 | 否 |

“最终池”是累计生成的未验证假设空间；“实际观察”是五轮中取出并打分的唯一 ID；“保留”是非退化且分数大于 0、等待外部验证的数量。这三列不能混为“发现的材料数”。

## 测试与运行环境

- 搜索、LLM、agent 契约、MatKG 隔离、自查、可视化和 walkthrough 共 15 项测试全部通过。
- `E:\Anaconda3` base 环境混有 NumPy 1.26/2.2 文件，Matplotlib 会出现两个不同的 `numpy.uint8` 类及 `ERR_IGNORE` 导入错误。未修改全局环境。
- 使用现有 `E:\Anaconda3\envs\camel_agent`（NumPy 1.26.4 / Matplotlib 3.10.1）运行完整测试和出图，全部通过。
- 新增长图和更新后的流程图已人工视觉检查，无文字溢出。

复现命令：

```powershell
E:\Anaconda3\python.exe src\search.py
E:\Anaconda3\python.exe src\verify_search.py
E:\Anaconda3\envs\camel_agent\python.exe -m unittest discover -s tests -v
E:\Anaconda3\envs\camel_agent\python.exe src\visualize.py
```

## 仍然存在的局限

1. 本轮没有真实 STEP/Gemini 成功响应；现在验证的是调用链、降级、审计和输出约束，不是 LLM 判断质量。
2. `score_candidate` 评价源变换与参考变换的平行性，不使用目标材料特征，因此同一证据方向迁到不同目标时会同分。
3. 成分向量是全式归一化表示，不是位点占据、价态、相稳定性或合成可行性模型；预测增量不能直接当实验配方。
4. 跨结构家族迁移可能几何上平行但化学上牵强。所有候选仍需 Materials Project/OQMD/NOMAD、原文或实验交叉验证。
5. 当前“继续深挖”只开放排序中的下一组来源，没有引入高斯过程、MCTS 或新的复杂算法；这是按任务边界有意保持的简单状态机。
6. GitHub 443 在开工前按规则 fetch 三次均失败。所有本地提交保持干净；远端同步仍需在最终阶段按两次 push 上限和 GitHub API 备用路径处理。

## 下一步

P0/P1 已完成。剩余余量工作是使用已有 Sciverse 配置检索 1–2 个新方向，只在摘要中存在可逐字核对的材料关系、真实 DOI 和证据摘录时追加核心边，然后运行完整 `pipeline.py` 与全部回归；若检索结果不满足入库铁律，则只保留调用审计，不凑边。
