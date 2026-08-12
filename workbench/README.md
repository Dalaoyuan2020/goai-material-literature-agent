# 材料文献智能工作台

本目录基于 `LL-LK/cl-agent` 的 `UI-3` 前端框架融合而来，最终运行主体是当前
`goai-material-literature-agent` 仓库。React/Electron 提供桌面交互，Node 服务只负责
HTTP/SSE 与进程桥接，知识计算和搜索仍由仓库已有 Python 运算层完成。

```text
React UI -> local Node API/SSE -> src/ui_bridge.py
                              -> agent/workflow.json 白名单
                              -> pipeline.py / search.py

React UI -> knowledge API -> knowledge/edges.csv
                          -> knowledge/edges_matkg.csv
                          -> outputs/pipeline_report.json
```

桥接失败时返回真实错误，不生成模拟分析指标。核心 DOI 证据、MatKG 聚合弱证据和
未验证候选继续遵守仓库根目录 `CLAUDE.md` 与 `agent/CLAUDE.md` 的分层规则。

## 安装

```powershell
cd workbench
npm install
npm --prefix server install
```

## 启动整体应用

开发模式（API、Vite、Electron 一起启动）：

```powershell
cd workbench
npm run dev
```

构建并启动：

```powershell
cd workbench
npm start
```

需要指定 Python 解释器时：

```powershell
$env:PYTHON_BIN='D:\path\to\python.exe'
npm run dev
```

## 验证

```powershell
python -m unittest discover -s tests
cd workbench
npm run typecheck
npm run build
```

真实 API 默认监听 `http://127.0.0.1:8787/api/v1`。

## 来源

- 前端框架：`LL-LK/cl-agent` 的 `UI-3`，导入提交 `bc31c893e9f10b2727bc657635edf6a50cc6224a`
- 融合落点：本仓库 `workbench/`
- Python 公共动作：`agent/workflow.json`
