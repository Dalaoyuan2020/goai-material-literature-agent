# dsh-cap-reader

比赛仓库自有的 DSH Client 插件。它把“材料证据链（CAP）”入口注册到公开 `shell.overlay` 插槽，并只展示来自公开 `ctx.connection` 的真实 DSH Host 握手状态。

当前是 P0 骨架：

- 已建立可安装的 Client 插件包；
- 不启动 `workbench/server`；Host 面只在现有 DSH `webServer` 注册只读路由；
- 不建立第二套会话、模型、工具或权限服务；
- 不显示固定知识统计或模拟工作流结果；
- 阅读和 Science 数据尚未迁移到 DSH Host，界面会明确显示这一边界。

验证：

```powershell
cd integrations/dsh-cap-reader
npm.cmd test

# 使用已安装依赖的 DSH Desktop 工作树做真实 Web Profile 生命周期验证
node scripts/verify-dsh-web.mjs --dsh-root H:\path\to\deepseek-harness-desktop --cap-root H:\path\to\competition-repository
```

后续真实 DSH Web/Desktop 生命周期验证继续复用 DSH 宿主仓库的隔离 Profile 测试方法，不修改固定的 `deepseek-harness/` 子模块。
