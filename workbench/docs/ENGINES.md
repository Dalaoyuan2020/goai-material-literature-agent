# 开源图谱引擎接入说明

本工作台不打包任何二进制，只提供引擎检测、启动、安装命令和路径清理。每个引擎按强项和适配点接入。

## 引擎矩阵

| 引擎 | 仓库 | 强项 | 适配点 | 检测方式 | 启动方式 |
|---|---|---|---|---|---|
| PyBibX | https://github.com/Valdecy/pybibx | Scopus/WoS/PubMed/OpenAlex、共现/共被引/突现/时间线、Web App | Python 自动化、批量导入、导出 | `python -c "import pybibx"` | `python -c "import pybibx; pybibx.web_app(port=5174, open_browser=True)"` |
| Bibliometrix + Biblioshiny | https://github.com/massimoaria/bibliometrix | R 科学计量全流程、主题演化、聚类、耦合、合作网络 | 研究报告、统计面板 | `Rscript -e "cat(as.character(packageVersion('bibliometrix')))"` | `Rscript -e "bibliometrix::biblioshiny()"` |
| Sci2 Tool | https://github.com/CIShell/sci2 | 时间、地理、网络、多尺度分析、CIShell 模块化 | 复杂科学学分析、多源数据工作流 | `SCI2_HOME` 或常见安装路径 | 启动 `sci2.exe` / `sci2.bat` |
| Gephi | https://github.com/gephi/gephi | 大规模网络可视化、布局、过滤、社区发现 | 发表级图谱、网络精修 | `GEPHI_HOME` 或常见安装路径 | 启动 `gephi64.exe` / `gephi.exe` |
| ScientoPy | https://github.com/jpruiz84/ScientoPy | WoS/Scopus 快速预处理、趋势、演化、词云 | 快速趋势报告、文献集预处理 | `SCIENTOPY_HOME` 或常见安装路径 | 启动 `ScientoPyGui.py` / `ScientoPyGui.exe` |

## 推荐组合

- 快速趋势报告：ScientoPy
- 科学计量统计与主题演化：Bibliometrix + Biblioshiny
- Python 自动化与 Web 面板：PyBibX
- 复杂科学学分析：Sci2 Tool
- 发表级网络图：Gephi

## 路径污染清理

启动子进程前，Electron 主进程会：

1. 移除 `ELECTRON_SMOKE`、`SMOKE_OUTPUT`、`KNOWLEDGE_DATA_DIR`、`MATERIALS_DATA_DIR`、`CITESPACE_HOME`、`PORTABLE_EXECUTABLE_*`。
2. 设置 `PYTHONUNBUFFERED=1`。
3. 保留系统 `PATH`、`SystemRoot`、`TEMP` 等运行所需变量。
4. 清理遗留的 `citespace` 目录，确保不会把旧二进制路径混入新引擎。

## 接口

详见 `API.md` 的 `engines.detect()`、`engines.launch()`、`engines.cleanPaths()`。
