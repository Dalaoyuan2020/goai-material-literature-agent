# 入库日志（append-only，只追加不修改）

## 2026-08-10 · 初次编译

- 原料：那晚从超导材料文献人工核验出的 36 条边（迁移进 `knowledge/edges.csv`）
- 编译产物：35 个材料点，45 组非退化平行性证据，4 个类比迁移候选假设
- 已知假信号：6 组"编码退化"（成分增量完全相同，平行性由构造保证非实测），已在 `src/rules.py` 里做自动检测排除
- Sciverse API 接通，`outputs/sciverse_calls/` 已有首条调用审计记录

## 2026-08-11 · MatKG 接入尝试（下载失败后降级）

- 按 `CODEX_TRIGGER.md` 下载 `SUBRELOBJ.csv`：首次在 3.4% 中断，断点续传第 2 次在 7.1% 中断，第 3 次在 23.4% 中断；三次均为 `curl error 18: end of response`，达到上限后未继续重试。
- 真实格式已核验为 `Subject,Object,Rel,Count`。MatKG 官方生成笔记本表明 `Rel` 是 NER 标签对，`Count` 是聚合前共同出现的不同 DOI 数；CSV 不含逐行 DOI，不能硬映射为 R1-R9 或作为强证据。
- 23.4% 前缀诊断：42,990,292 字节，流式处理 1,295,587 行；材料层命中 150 行，两层过滤后 44 行（掺杂 6、取代 0、合成 4、结构 34），31 个唯一节点、10 个匹配材料实体。因文件不完整，仅作解析诊断，未写入正式 `knowledge/edges_matkg.csv`。
- 已切换 Sciverse 路线，但 `SCIVERSE_KEY` 在环境变量和约定密钥文件中均不存在，未能发起新调用。下一步：提供完整 MatKG CSV 或配置 Sciverse Key 后续跑。
- 已完成可继续复用的工作：新增标准库流式转换器、核心/扩展证据隔离、Windows 路径修复和单元测试。Pipeline 仍诚实报告核心 35 点/36 边、扩展 0 边，L3/L4 强证据只来自核心集。

## 2026-08-11 · 完整 MatKG 导入（环境解锁后续跑）

- 已核对完整 `SUBRELOBJ.csv` 为 184,088,025 字节；流式处理 5,411,478 行，0 个畸形行，材料层命中 878 行，两层过滤后正式写入 210 条扩展三元组、51 个唯一扩展相关节点，命中 13 个材料实体。
- 210 条按弱关系族分布：`MKG-DOPING` 30（14.29%）、`MKG-SUBSTITUTION` 0（0%）、`MKG-SYNTHESIS` 34（16.19%）、`MKG-STRUCTURE` 146（69.52%）。所有行均为空 DOI、`强证据资格=false`；可作为强证据的 MatKG 行为 0。
- 与 23.4% 前缀诊断交叉验证：完整文件行数为前缀的 4.1769 倍，入选边数为 4.7727 倍；总体入选率由 0.003396% 变为 0.003881%，完整集高约 14.27%，量级基本一致但并非严格等比例。
- 分布差异如实保留：掺杂 13.64%→14.29%、取代 0%→0%、合成 9.09%→16.19%、结构 77.27%→69.52%。完整集的合成类占比更高、结构类更低，说明 23.4% 前缀不能代表全文件的关系构成；筛选标准未为凑数而放宽。
- Pipeline 接入后为 82 个向量空间节点（核心 35、扩展 47）和 246 条边（核心 36、MatKG 210）；L3 仍为 `evidence_source=core_only`，L4 的源边与目标节点也均为 `core_only`，扩展集没有污染强证据。
- 验证：`E:\Anaconda3\Scripts\pytest.exe tests/test_matkg_integration.py -v`，2 项测试全部通过。

## 2026-08-11 · 贝叶斯优化风格搜索层

- 启动时按要求同步远端：`git pull --ff-only` 连续 2 次被 GitHub HTTPS 重置，随后 `git fetch` 也因 443 连接失败中止；工作区始终干净、无部分合并。通过 GitHub API 核对本地 `dd31af3` 到远端 `e3dbdf4` 只新增 5 份任务说明、没有代码变化，因此读取远端说明后继续实现，发布前再重试正常同步。
- 搜索控制器的 LLAMBO 热启动、判断和候选采样均为**启发式近似，非真实 LLM 调用**；代理分数直接来自 `rules.cosine` 对核心 DOI 可溯源变换的真实计算，不训练或伪装黑箱模型。
- 证据边界：36 条核心边用于源变换、余弦打分和候选目标；210 条 MatKG 弱边仅扩展向量空间背景。每条搜索记录显式写入 `core_doi_backed` 与 `vector_space_context_only`，未把 MatKG 当强证据。
- 122：核心材料 3 个，候选池 12 个，运行 5 轮，保留 12 个不重复的未验证候选；连续 2 轮无新非退化候选后收敛。
- 1111：核心材料 9 个，候选池 49 个，运行 5 轮，保留 20 个不重复的未验证候选；到达 5 轮上限，未声称收敛。
- 11：核心材料 7 个，候选池 38 个，运行 5 轮，保留 20 个不重复的未验证候选；到达 5 轮上限，未声称收敛。
- MgB2/diboride：核心材料 1 个，候选池 5 个，运行 4 轮，保留 5 个不重复的未验证候选；连续 2 轮无新非退化候选后收敛。样本少这一限制保留在结果中，没有扩充或伪造材料。
- 验证：搜索记录审计确认 57 个已观察候选 ID 全部唯一，证据层级一致，`real_llm_api_called=false`；搜索与 MatKG 回归测试合计 5 项全部通过。

## 2026-08-11 · 三类真实数据可视化

- 共生成 5 张 PNG + 1 份 Mermaid 源码：过程图 `01_pipeline_flow`，结果图 `02a_relation_distribution` / `02b_family_coverage`，方法图 `03a_parallelism_distribution` / `03b_analogy_case_demo`。所有图均由 `src/visualize.py` 一次性生成，没有手工填写图中数字。
- 过程图读取 `pipeline_report.json` 与 4 份 `search_runs`：20 篇唯一 DOI 文献、36 条核心边/35 个核心材料、210 条 MatKG 弱边/47 个扩展节点、82 个向量节点/33 个成分维度、45 组非退化核心证据、4 个 L4 未验证假设、4 个搜索家族/57 个已观察未验证假设。
- 关系分布和家族覆盖读取主管线新增的机器可读计数：核心 R1-R9 合计 36，MatKG 四类合计 210；六个家族节点分别保持核心/扩展两组，边按源端点家族归类以避免重复计数，异构 MatKG `entity:*` 节点归入 `other` 并在图注说明。
- 平行性图使用主管线重新计算的 45 个非退化核心余弦值；随机基线从 486 个真实可选的非退化核心边配对中以固定种子 20260811 抽取 45 个，实算均值 0.109661、总体标准差 0.326713。未采用任务说明里仅作历史回忆、当前报告无法追溯的旧基线数字。
- 类比示意图读取真实 L4 候选 `BaFe2As2→BaFe1.8Co0.2As2` 到 `KFe2As2→D′`，保留源余弦 0.9992、预测成分增量 Co +0.0400 / Fe -0.0400，并把 D′ 明确标为未验证候选。
- 全部图统一：核心 DOI 证据为深色实线，MatKG 弱证据为浅色阴影/虚线，未验证假设为橙色虚线；方法图明确注明 MatKG 被排除在强证据与类比源之外。视觉 QA 修正了流程框文字溢出、关系图标签/图注间距和缺字字体问题。
- 提交前再次执行 `git fetch origin master` 已成功，把远端指针从 `dd31af3` 更新到 `e3dbdf4`；稍后提交后会在该最新任务说明提交之上 rebase，不覆盖远端新增文档。
- rebase 后普通 `git push origin master` 连续 2 次失败：第 1 次为 `Recv failure: Connection was reset`，第 2 次为 443 端口 21 秒连接超时。按总控规则停止继续重试 Git 传输，改用已认证的 GitHub API 以远端 `e3dbdf4` 为父提交写入同一份已验证文件树。

## 2026-08-11 · 第二轮入库（Sciverse 检索扩库）

- 原料：Sciverse API 10 个关键词检索（iron pnictide doping / cuprate substitution / FeSe Te doping / MgB2 doping / nickel oxide pressure / kagome doping / chemical pressure / transition metal doping / hydride high pressure / cuprate rare earth substitution），共 150 条记录，筛出 58 条候选文献，审计记录 10 条存 `outputs/sciverse_calls/`
- 新增边：43 条（R1×11, R2×8, R3×1, R5×2, R7×12, R9×9），全部带真实 DOI（31 个唯一 DOI，经 CrossRef 验证存在）+ 摘要原文证据摘录（程序化逐字核验）
- 证据强度：direct 42，negative 1（FeTe 加压不超导，负样本）
- 查重：与现有 36 条边三元组无重复；候选内跳过 11 条重复边、20 条无明确证据边
- 新关系类型发现：**氧位H-掺杂 O→H（1111系）**（LaFeAsO→LaFeAsO1-xHx，10.1038/ncomms1913，2012，第二超导穹顶 Tc 36K@x=0.3）——现有 R4 仅定义 O→F，O→H 不属于任何现有类型，按铁律不强行归类，仅记录候选，供后续 schema 扩展决策（R4 是否需要泛化为"氧位阴离子掺杂"）
- 规模变化：材料点 35→91，边 36→79（注：合并远程 MatKG 提交后，知识层含核心 edges.csv 79 条 + 扩展 edges_matkg.csv 210 条）
