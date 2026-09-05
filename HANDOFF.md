# Soft Pudding 交接

更新日期：2026-09-05。项目根目录为本文件所在目录。

## 接手时先知道

现有焦糖奶油布丁已经完成实现、验收和 Sites 公开部署；原实施 goal 已完成。

公开地址：[Soft Pudding](https://soft-pudding-lab-0905.x-ma.chatgpt.site)。用户的部署目的明确是把链接发给其他人玩。

最新讨论转向：用户可能提供一个外部 3D 模型，希望通过 Blender 等方式获得类似布丁的 Q 弹质感。目前只有可行性讨论，尚未收到模型，也没有开始外部模型适配、通用上传器或 Blender 安装。此次请求仅是把交接文档保存到项目文件夹。

## 下一步：外部模型 Q 弹化

收到模型后，先检查格式、网格结构、面数、材质/贴图、骨骼、闭合性及独立部件，给出针对该资产的方案。优先接收 GLB 或 `.blend`；保持原文件作为基准，在副本上加工。

只澄清会改变结果的事项：

1. 最终交付是视频、点击播放的动画，还是像现有网页一样自由抓捏？之前的上下文偏向可分享的网页实时交互，但用户尚未针对新模型作出明确选择。
2. 哪些部件要软，哪些必须保持刚性或原始外观？例如小熊肚子可软，眼睛可以保持形状。

已向用户解释的候选路线：

- 视频：在 Blender 中制作软体动画、灯光和材质后渲染。
- 预设网页动画：制作骨骼或形态键动画，导出 GLB，再用 Three.js 播放。
- 自由抓捏：整理原始模型，建立简化物理代理与表面绑定，在网页端实时求解。

材质与回弹分别处理：换材质只能改变外观；弹性需要形变、体积保持、碰撞及阻尼。Blender 的软体求解设置不会随 GLB 自动成为网页物理；支持的骨骼/形态键动画与实时求解是不同交付方式。导出边界可查 [Blender glTF 说明](https://docs.blender.org/manual/id/5.0/addons/import_export/scene_gltf2.html)。

现有框架可复用渲染、控件和部分物理逻辑，但当前平滑表面绑定依赖程序生成的布丁笼。外部 GLB 不能只替换模型文件就获得可靠 Q 弹效果；需重新建立代理、绑定，并验证材质接缝、法线、刚性部件和大幅形变。

此前 `Get-Command blender` 未找到命令，且没有可调用的 Blender 专用工具。这不证明机器未安装 Blender。实际需要时先定位安装程序；安装软件属于另一个动作，当前讨论没有授权安装。

## 按需要读取的资料

| 接手事项 | 资料 |
| --- | --- |
| 启动、功能、脚本和运行边界 | [README.md](README.md)，具体依赖及命令以 [package.json](package.json) 为准 |
| 定位模块、理解实际修正原因 | [docs/implementation.md](docs/implementation.md) |
| 了解初始设计及参考图方向 | [docs/initial-design.md](docs/initial-design.md)、[layout.svg](layout.svg)；它们是设计存档，当前实现以源码及实施决策为准 |
| 查看本地验收及未测范围 | [docs/verification.md](docs/verification.md)；原始证据在其链接中 |
| 查看 Fable 独立审查 | [reviews/fable-5.1-high-review.md](reviews/fable-5.1-high-review.md)，同时读 [reviews/review-assessment.md](reviews/review-assessment.md)，区分原始推断和采纳意见 |
| 后续管理同一 Sites 站点 | [.openai/hosting.json](.openai/hosting.json) 为站点标识的来源；发布版本、提交及公网检查在 [evidence/sites-deployment.json](evidence/sites-deployment.json) |

`reviews/`、`evidence/` 和 `.sites-deploy/` 是本地保留并被 Git 忽略的目录。接手本机项目时可读取；只拿到远端源码时可能没有这些文件，不能假设证据随仓库同步。

验收中的旧记录“目录不是 Git 仓库”描述的是初次本地交付。之后因 Sites 发布流程需要，已在本项目根目录初始化 Git；当前状态以 `git status` 和 `git log` 为准。

## 运行与发布状态

- 开发服务与本地生产预览服务在公开部署后已停止。后续本地检查先按 README 启动，不假设原 localhost 地址还在运行。
- 最新发布已验证公开 HTML、JavaScript、CSS 均可在不带登录凭证时访问；线上没有重新执行完整 GPU 基准。详细本地性能及设备适用范围见验收报告。
- 后续继续使用现有 `.openai/hosting.json` 中的站点，不重复创建。需要发布时重新获得短期源码凭据，保持其仅在内存及单次进程认证中使用。
- Windows 下 Sites 官方打包脚本使用 Git Bash，而非 WSL。调用脚本的项目和归档参数使用 `/d/...` 形式；GNU tar 会把 `D:/...` 中的冒号解释为远端路径。临时目录限制在项目 `.sites-deploy/` 内。具体 helper 位置以当轮 Sites 技能为准。
- 网站部署和修改访问范围按当轮用户授权执行。此次交接文档不需要推送或重新部署。

## 工作约定

使用原生 PowerShell、`rg`、现有 pnpm 锁文件和 UTF-8。每次写入保持在 300 行、12,000 字符以内。修改前检查 Git 状态，保留其他人的变更；按用户已有约定提交本任务改动，推送或重写历史需要相应授权。

默认单代理工作。先前 Fable 5.1 High 的独立审查是一次已完成的明确请求，不是后续额外付费模型或代理调用的持续授权。未提供新模型前不启动模型改造。

## Suggested skills（建议使用的技能）

- **sites:sites-building / sites:sites-hosting**：修改或再次发布现有 Sites 网页时使用，复用已有站点。
- **browser:control-in-app-browser**：需要检查三维交互、响应式、截图或真实浏览器渲染时使用；先查找现有站点标签页。
- **write-goal**：仅当用户再次显式调用该技能时，用于整理新的复杂模型适配目标；不能从这份交接文档自动启动新 goal。
- **writing-for-agents**：维护面向下一位 agent 的交接或规则文档时使用，避免重复现有规格与验收材料。
- **handoff**：仅在用户再次显式要求交接时使用。当前文件位置遵从用户要求保存在项目目录的指令。
