# MatKG 接入执行报告（2026-08-11）

## 结论

完整 MatKG `SUBRELOBJ.csv` 已成功导入。转换器扫描 5,411,478 行，按既定两层过滤保留 210 条弱证据扩展边并写入 `knowledge/edges_matkg.csv`。核心集继续独立保存在 `knowledge/edges.csv`；扩展集只扩大向量空间，不参与 L3/L4 强证据推断。

## 上一轮下载与降级结果（历史记录）

按 `CODEX_TRIGGER.md` 最多尝试三次：首次下载在 3.4% 中断，两次断点续传分别在 7.1% 和 23.4% 中断，三次均为 `curl error 18: end of response`。达到重试上限后停止下载，没有进行第 4 次尝试。

随后切换到 `CODEX_WORKFLOW.md` 指定的 Sciverse 路线，但本机既没有 `SCIVERSE_KEY` 环境变量，也没有文档约定的 `api_keys.env`，因此无法发起新的可审计检索调用。

## 实际格式发现

真实文件头为 `Subject,Object,Rel,Count`。结合 MatKG 官方生成笔记本可知：

- `Rel` 是两个 NER 实体类型的组合，例如 `CHM-SMT`，不是“掺杂/取代”等语义关系。
- `Count` 是聚合前共同出现的不同 DOI 数量，但 `SUBRELOBJ.csv` 没有保留这些 DOI 的具体值。
- 因此不能把 `Rel` 硬映射为 R1-R9，也不能把较高的 `Count` 当成逐条可溯源证据。

转换器保留 MatKG 原始标签，只生成 `MKG-DOPING`、`MKG-SUBSTITUTION`、`MKG-SYNTHESIS`、`MKG-STRUCTURE` 四类弱关系，并固定写入空 DOI、`强证据资格=false`。

## 完整导入与 23.4% 前缀交叉验证

- 输入文件已核对为 184,088,025 字节，与续跑文档记录的官方发布大小一致。
- 完整扫描 5,411,478 行，材料层命中 878 行，两层过滤后入选 210 条、畸形行 0、唯一节点 51、命中材料实体 13。
- 弱关系族为：`MKG-DOPING` 30（14.29%）、`MKG-SUBSTITUTION` 0（0%）、`MKG-SYNTHESIS` 34（16.19%）、`MKG-STRUCTURE` 146（69.52%）。

前缀诊断处理 1,295,587 行、入选 44 条；完整文件处理行数为前缀的 4.1769 倍，入选边数为 4.7727 倍。入选率从 0.003396% 变为 0.003881%，完整集高约 14.27%，总体量级相符但不是严格等比例。

关系构成也存在值得保留的差异：掺杂 13.64%→14.29%、取代 0%→0%、合成 9.09%→16.19%、结构 77.27%→69.52%。23.4% 前缀不能代表全文件的关系族分布；本轮没有为追求更大数字而放宽筛选标准。

MatKG 仍不含逐行 DOI。210 条扩展边全部为空 DOI、`强证据资格=false`，强证据合格行数为 0；`Count` 只保留为聚合共现数。

## 代码约束

- `src/matkg.py` 使用 Python 标准库逐行读取，不一次性载入 184MB CSV。
- `build_graph(include_extended=True)` 可把扩展集用于向量空间；默认仍是核心集。
- Pipeline 的 L3 平行性证据和 L4 源边/目标节点显式只使用核心集。
- `outputs/pipeline_report.json` 显式记录 `evidence_source: core_only`。
- 两项单元测试覆盖两层过滤、空 DOI/弱证据标记，以及核心/扩展读取隔离。

Pipeline 实测结果：
- `L2_structure.materials_count = 82`（核心 35、扩展 47），`edges_count = 246`（核心 36、MatKG 210）。
- `L3_rules.evidence_source = core_only`，非退化证据仍为 45 组。
- `L4_application.source_edges = core_only`、`target_nodes = core_only`，候选仍为 4 个。

## 验证

`E:\Anaconda3\Scripts\pytest.exe tests/test_matkg_integration.py -v`：2 项测试全部通过。

机器可读计数见 `outputs/matkg_import_report.json`，管线输出见 `outputs/pipeline_report.json`。
