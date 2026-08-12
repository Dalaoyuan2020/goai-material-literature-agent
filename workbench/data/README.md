# 本地数据说明

融合版本不再复制一份 `workbench/data` 示例知识库。API 和 Electron 本地兜底都读取
当前仓库根目录的真实文件：

```text
knowledge/edges.csv
knowledge/edges_matkg.csv
outputs/pipeline_report.json
outputs/search_runs/*.json
```

如需将工作台指向另一个同结构仓库，API 设置 `MATERIAL_AGENT_ROOT`；Electron 设置
`KNOWLEDGE_DATA_DIR`。找不到真实数据时不得把示例指标当作工作流结果。
