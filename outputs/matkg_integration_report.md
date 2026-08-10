# MatKG 接入执行报告（2026-08-11）

## 结论

接入代码、证据隔离、Windows 路径修复和自动测试已经完成；完整 MatKG 数据没有成功取得，因此本轮**没有**生成或提交 `knowledge/edges_matkg.csv`，也不声称点/边规模已经增长。核心集仍为 35 个材料点、36 条 DOI 可溯源边。

## 下载与降级结果

按 `CODEX_TRIGGER.md` 最多尝试三次：首次下载在 3.4% 中断，两次断点续传分别在 7.1% 和 23.4% 中断，三次均为 `curl error 18: end of response`。达到重试上限后停止下载，没有进行第 4 次尝试。

随后切换到 `CODEX_WORKFLOW.md` 指定的 Sciverse 路线，但本机既没有 `SCIVERSE_KEY` 环境变量，也没有文档约定的 `api_keys.env`，因此无法发起新的可审计检索调用。

## 实际格式发现

真实文件头为 `Subject,Object,Rel,Count`。结合 MatKG 官方生成笔记本可知：

- `Rel` 是两个 NER 实体类型的组合，例如 `CHM-SMT`，不是“掺杂/取代”等语义关系。
- `Count` 是聚合前共同出现的不同 DOI 数量，但 `SUBRELOBJ.csv` 没有保留这些 DOI 的具体值。
- 因此不能把 `Rel` 硬映射为 R1-R9，也不能把较高的 `Count` 当成逐条可溯源证据。

转换器保留 MatKG 原始标签，只生成 `MKG-DOPING`、`MKG-SUBSTITUTION`、`MKG-SYNTHESIS`、`MKG-STRUCTURE` 四类弱关系，并固定写入空 DOI、`强证据资格=false`。

## 23.4% 前缀诊断（不入库）

已下载前缀为 42,990,292 字节，流式读取 1,295,587 行；材料层命中 150 行，两层过滤后保留 44 行、31 个唯一节点，其中命中的材料实体为 10 个。44 行按范围分为：掺杂 6、取代 0、合成 4、结构 34。由于这只是源文件的 23.4%，结果仅用于验证解析器，未冒充完整扩展集入库。

## 代码约束

- `src/matkg.py` 使用 Python 标准库逐行读取，不一次性载入 184MB CSV。
- `build_graph(include_extended=True)` 可把扩展集用于向量空间；默认仍是核心集。
- Pipeline 的 L3 平行性证据和 L4 源边/目标节点显式只使用核心集。
- `outputs/pipeline_report.json` 显式记录 `evidence_source: core_only`。
- 两项单元测试覆盖两层过滤、空 DOI/弱证据标记，以及核心/扩展读取隔离。

## 解锁条件

满足任一条件即可继续：

1. 将完整 `SUBRELOBJ.csv` 放到本机并运行 `python src/matkg.py --input <路径>`；或
2. 配置 `SCIVERSE_KEY`，再按 `CODEX_WORKFLOW.md` 执行检索抽取路线。

完整计数和失败明细见 `outputs/matkg_import_report.json`。
