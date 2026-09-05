# 验收记录

日期：2026-09-05。结果：规定的功能、构建、行为和参考设备性能检查通过。

## 运行环境

- Windows，Node.js 24.20.0，pnpm 11.14.0。
- CPU：AMD Ryzen AI 7 H 350。
- 浏览器：Codex 内置浏览器，Chromium 152。
- 实际 WebGPU adapter：NVIDIA / Blackwell。系统枚举到 NVIDIA GeForce RTX 5060 Laptop GPU，驱动 32.0.15.8088；另有 AMD 集显及虚拟显示适配器，见 [原始硬件记录](../evidence/hardware.json)。
- 本地生产预览：`http://127.0.0.1:4173/`。没有部署或推送。

## 已执行检查

| 检查 | 结果与证据 |
| --- | --- |
| TypeScript 检查 | `pnpm typecheck` 通过；生产构建也执行 `tsc --noEmit` |
| 生产构建 | `pnpm build` 通过，[构建输出](../evidence/build.txt) |
| 行为测试 | `pnpm test`：7 项通过，0 失败、0 跳过，[测试输出](../evidence/tests.txt) |
| 60 秒物理压力测试 | 检查全部 14,400 个固定子步，节点有限，无四面体翻转，[JSON](../evidence/physics-validation.json) |
| 体积保持 | 过程中总体体积为静止值的 99.011%–100.239%；稳定后误差约 0.054%，低于 3% |
| 单元与接触 | 最小单元体积比约 0.696，保持正值；最低节点 y=0，无地面穿透 |
| 默认回摆 | 四个可辨正负峰值，顶部相对底部最大横向位移约 0.096；两秒时动能约为峰值的 0.12%，[时序 CSV](../evidence/nudge-response.csv) |
| 约 30% 压缩 | 检查实际顶点位移，测试接受范围 26%–34%；约 27% 的局部顶部压缩通过 |
| 真实 WebGPU | 原生后端检查通过，生产页错误/警告为空；[日志](../evidence/browser-console.json) 保留并区分此前已修复的开发页警告 |
| 实际拖拽 | 浏览器记录到 1 次命中抓取、79 次移动、1 次释放，释放距离约 129px、释放时动能非零，[记录](../evidence/drag-release.json) |
| 控件与键盘 | Berry 切换、Firmness 方向键 45→46、Damping End→100、慢速、线框和暂停通过，[状态快照](../evidence/controls-checked.txt) |
| 暂停与重置 | 暂停后轻推不改变时间与物理状态；重置恢复 Vanilla、45/38、正常速度和非暂停，[重置快照](../evidence/reset-checked.txt) |
| 取消与恢复 | 实际指针处理函数通过 pointercancel、lostpointercapture、blur；模拟通过后台暂停及有上限的恢复补步 |
| 响应式 | 1440×900、390×844、1024×900 检查通过。手机与平板采用上下布局，无横向溢出，[手机几何](../evidence/mobile-layout.json)、[平板几何](../evidence/tablet-layout.json) |

## 真实浏览器性能

生产渲染配置，1440×900，DPR≈1.0（应用上限 1.5），每三秒交替轻推。排除两秒预热，累计 60.008 秒、9,831 帧。

| 指标 | 实测 | 门槛 |
| --- | --- | --- |
| 平均帧率 | 163.83fps | ≥55fps |
| 95% 帧时间 | 6.2ms | ≤20ms |
| 最大帧时间 | 48.5ms | 如实记录，未设置最大帧门槛 |
| 平均 CPU 更新耗时 | 2.60ms | 分项诊断，不冒充 GPU 时间 |

原始数据：[benchmark-final.json](../evidence/benchmark-final.json)。最后的平板断点与幂等资源清理修正不改变该 1440×900 稳态渲染路径；另行验证了平板布局及最终构建。

这些数字仅代表本次参考设备和视口，不能外推为所有 GPU 或 DPR 1.5 下的结果。

## 画面证据

- [默认桌面](../evidence/desktop.jpg)
- [约 30% 压缩](../evidence/compressed-desktop.jpg) 与 [当时物理状态](../evidence/compressed-state.json)
- [Matcha 材质](../evidence/matcha-desktop.jpg)
- [手机舞台](../evidence/mobile-top.jpg)、[手机控制卡](../evidence/mobile-controls.jpg)
- [平板布局](../evidence/tablet-top.jpg)

检查了奶油主体、焦糖高光、局部压缩时连续的表面、接地阴影及控制卡位置。截图为浏览器原生 JPEG，没有后期修图。视觉判断属于本次审查结果，用户的后续审美反馈仍可作为新的修改任务。

## 未执行项与限制

- 未测试真实手机硬件、Safari 或 Firefox；手机截图是桌面浏览器的 390×844 视口。
- 没有人为断开 GPU 设备，也没有修改系统加速设置；已实现设备丢失处理，无 WebGPU 分支有测试。
- 未进行材料参数标定、完整自碰撞、撕裂或透射/焦散模拟，这些不在授权范围。
- 生产构建保留单块大于 500kB 的提示；JavaScript gzip 约 244kB。它是 Three.js WebGPU 引擎体积提示，不是构建失败。
- 本目录不是 Git 仓库，提交不适用；未初始化仓库。

原方案与 Fable 评审保留，实际修正理由见 [实施决策](implementation.md)。没有未完成的必要验收项。
