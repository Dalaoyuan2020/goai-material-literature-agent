# DSH-CAP-P0-01：比赛阅读器插件骨架与真实知识概览

日期：2026-08-16

## 达到的能力

- 比赛仓库拥有第一方 `dsh-cap-reader` Host/Client 插件包；
- Client 通过公开 `shell.overlay` 插槽注册 CAP 阅读器入口；
- Client 通过公开 `ctx.connection` 读取真实 DSH Host 握手；
- Host 通过现有 DSH `webServer` 注册 `/cap/knowledge-summary` 只读路由；
- 路由从运行时配置的比赛仓库读取真实 `outputs/pipeline_report.json`；
- 隔离 Web Profile 的安装、加载、禁用和重新启用均通过；
- 没有启动 `workbench/server`，没有建立第二套会话或模型服务。

## 真实结果

验证时路由返回：

- 核心材料：94；
- 核心关系：81；
- 扩展材料：46；
- 扩展关系：210；
- 候选假设：6；
- 非退化证据：326。

这些值由验证脚本从 Host 路由读取，不存在于 Client 源码的固定数据中。

## 尚未达到

- 未验证 Desktop/Electron 中的实际可视渲染；
- 未迁移文献列表、全文阅读器和知识图谱；
- 未迁移会改变产物的 Science 工作流；
- P0-02 的公开工具详情选择接口阻塞仍然存在。

## 文件

- `result.json`：真实 DSH Web 生命周期与知识概览结果；
- `commands.txt`：复现命令；
- `test-results.txt`：本轮验证摘要。
