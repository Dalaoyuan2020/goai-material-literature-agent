# CAP 融合进度

更新日期：2026-08-12

## 目标

把外部 `LL-LK/cl-agent` 仓库 UI-3 前端作为交互框架，融合进本仓库的材料文献知识计算后端，形成可以本地运行、可点击验证的材料智能体 Demo。

## 已完成

### 前端融合

- 导入 UI-3 的 React/Electron 工作台到 `workbench/`；
- 保留适合科研工作流的任务、技能和知识库交互；
- 将技能卡片替换为本仓库真实工作流入口；
- 将默认稳定入口调整为 Web，避免 Electron 原生崩溃阻塞演示。
- 增加 `Track / Science` 双模式：Track 面向非专业文献阅读，Science 面向专业研究；
- 增加应用内三步 Demo，引导用户从阅读、图谱到真实工作流；
- 增加基于真实关系数据的 SVG 交互知识图谱，支持证据层级、材料/DOI 聚焦和证据选择。

### Node/TypeScript 后端

- 增加本地 HTTP/SSE API；
- `/knowledge/search` 和 `/knowledge/stats` 读取真实知识目录；
- 支持核心 CSV 和 MatKG 扩展 CSV 的中英文字段别名；
- 识别扩展集字段 `实体A`、`实体B`、`扩展关系类型`，210 条扩展边不再被丢弃；
- `/workflow/run` 调用真实 Python 桥接层，并将真实指标返回 UI。

### Python 智能体融合

- 新增 `src/ui_bridge.py` 作为稳定 JSON 进程协议；
- 通过 `agent/workflow.json` 白名单限制可调用动作；
- 接入知识概览、知识管线编译、四家族搜索和全部家族搜索；
- 保留 LLM 调用审计以及无法调用真实模型时的诚实降级标记。

## 验收结果

- TypeScript 类型检查：通过；
- Vite、Electron 主进程和 Node API 构建：通过；
- 已提交快照 Python 测试：19/19 通过；
- Web 页面真实操作：通过；
- 真实知识统计：94 个核心材料、81 条核心边、46 个扩展材料、210 条扩展边；
- 管线结果：140 个节点、291 条边、326 组证据、6 个候选；
- 1111 案例：20 个保留候选；
- Electron 冒烟测试：失败，Windows 原生退出码 `3221225477`。

## 当前定位

可以称为“CAP 材料智能体 Web MVP v0.1”，可以本地提交、运行和演示。还不能称为完整桌面产品或正式生产系统。

## 已知边界

1. Electron 桌面入口尚未通过；
2. CSV/JSON 知识库尚未升级为正式数据库；
3. 任务、作业和报告状态在 Node 内存中，服务重启后丢失；
4. 当前工作区存在未提交的搜索实验输出，这些数据没有混入融合代码提交；
5. 图谱/CiteSpace 模块不在本轮真实接入范围；
6. npm 审计在当前受限网络环境无法完成。

## 提交节奏

本轮采用小步、可复盘提交：

1. `feat: integrate UI-3 workbench with material agent`：完成前后端与 Python 融合；
2. `chore: make web workbench the stable default`：将可运行 Web 入口设为默认；
3. `docs: add reproducible CAP demo and progress report`：补充 Demo、截图、完成度与数据库决策材料。
