# CAP 材料文献智能体

这是一个面向材料科研人员的本地 Web MVP：把 `LL-LK/cl-agent` 的 UI-3 交互框架融合到本仓库已有的材料知识计算、候选搜索和证据审计流程中。

当前不是单纯的前端样例。页面能够读取真实的核心 DOI 证据和 MatKG 扩展数据，并通过 Node API 调用 Python 工作流。

## 快速体验 Demo

```powershell
cd workbench
npm.cmd install
npm.cmd --prefix server install
npm.cmd run dev
```

浏览器打开 `http://localhost:5173`。详细点击步骤、预期结果和截图见 [Demo 操作手册](docs/DEMO.md)。

## 当前完成度

| 能力 | 状态 |
|---|---|
| UI-3 前端融合 | 已完成 |
| Node/TypeScript 本地 API | 已完成 |
| 读取核心与 MatKG 扩展知识数据 | 已完成 |
| 从页面调用 Python 材料智能体 | 已完成 |
| 1111、122、11、MgB2 家族搜索 | 已接入 |
| Web 本地 Demo | 已通过验收 |
| Electron 桌面版 | 当前 Windows 验收机原生崩溃，未通过 |
| SQL/图数据库持久化 | 尚未实现；当前为 CSV/JSON 文件知识库 |

验收时的真实数据：94 个核心材料、81 条核心边、46 个扩展材料、210 条 MatKG 扩展边。知识管线产生 140 个节点、291 条边、326 组非退化证据和 6 个未验证候选。

## 项目结构

```text
workbench/                React + Node/TypeScript 本地应用
src/ui_bridge.py          Node 到 Python 工作流的 JSON 桥
agent/workflow.json       允许调用的工作流白名单
knowledge/                当前 CSV 知识数据
outputs/                  管线、搜索与审计产物
tests/                    Python 合约与回归测试
```

## 验证

```powershell
python -m unittest discover -s tests
cd workbench
npm.cmd run typecheck
npm.cmd run build
```

已提交快照的验收结果：Python 19/19 通过、TypeScript 类型检查通过、生产构建通过。完整状态和边界见 [当前进度](docs/PROGRESS.md)。

## 关于“数据库”

当前系统拥有可查询、可追溯的本地材料知识数据，但存储介质是 CSV/JSON，并不是 SQLite、PostgreSQL 或图数据库。明日需要围绕科研人员真实工作流决定是否升级及升级范围，见 [数据库决策清单](docs/DATABASE_DECISION.md)。
