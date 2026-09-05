# Soft Pudding

一个可抓取、会回弹的焦糖奶油布丁实验台。Three.js 原生 WebGPU 渲染，CPU XPBD 体积软体，原生 HTML/CSS 控制面板，无后端。

## 本地运行

环境：Node.js 24 或符合 Vite 要求的 Node.js 版本，pnpm 11。测试命令使用 Node 24 的 TypeScript 去类型和无子进程测试模式。

```powershell
cd D:\code\codex-test\pudding-lab
pnpm install --frozen-lockfile
pnpm dev
```

打开终端输出的本地地址，通常是 `http://127.0.0.1:5173/`。请使用能够获取 WebGPU adapter 的浏览器并开启硬件加速；localhost 属于安全上下文。

生产构建与本地预览：

```powershell
pnpm build
pnpm preview
```

预览通常位于 `http://127.0.0.1:4173/`。仅在本机监听，不部署到外部。

## 怎样玩

- 点击布丁：轻戳命中位置。
- 按住拖动：抓住可见表面的一小片；松开后保留惯性并回弹。
- Give it a nudge：从侧面轻推，也可使用键盘激活按钮。
- Vanilla / Berry / Matcha：切换材质，保留当前运动。
- Firmness：从柔软蛋奶感到弹性更强；方向键调节滑块。
- Internal damping：控制内部晃动的衰减，不用全局空气阻力掩盖接触问题。
- ¼ speed、Show mesh、Pause：慢动作、实际细分表面线框、暂停。
- Reset：恢复默认口味、参数、形状、速度及控件，解除抓取和暂停。

窄屏控制卡位于舞台下方，可滚动页面。只有三维舞台捕获拖拽。系统开启减少动态效果时不播放入场落地，仍保留主动交互。

## 实现边界

- 486 个体积节点、1,920 个四面体、9,216 个可见三角形。
- 240Hz 固定物理步，每个子步一轮 XPBD 边长、抓取与体积约束；过长帧最多补 12 步，后台不累计补帧债务。
- 对闭合四边形边界预计算两层 Catmull–Clark 细分权重。可见顶点由物理节点的非负归一化权重驱动，不使用笼外负重心权重外推。
- 每帧更新位置、法线及包围范围；射线命中可见插值表面后，将抓取权重映射回物理节点。真实阴影使用同一形变几何。
- 地面碰撞有摩擦；舞台边界通过限制整体水平质心避免出画，不逐顶点夹到隐形墙上。它是展示交互边界，不宣称真实容器物理。
- 抓取目标距离原抓取点最多 0.62 个场景单位，跟随速度上限 2.5 单位/秒；首版不支持切割、撕裂、打结或完整自碰撞。
- 蛋奶与焦糖使用同一物理节点材质，通过静止表面的遮罩混合颜色、粗糙度和清漆；没有路径追踪、透射或流动焦糖模拟。
- 体积读数来自实际四面体体积，Motion 是动能平方根的展示值，无标定物理单位。不展示虚构 kPa 或 mJ。
- 必须初始化原生 WebGPU；不把 Three.js 自动回退标成 WebGPU。不可用时提供说明和重试，设备丢失时停止循环。

## 检查与证据

```powershell
pnpm typecheck
pnpm test
pnpm validate:physics
pnpm build
```

`pnpm test` 覆盖体积/接触、实际指针取消与失焦处理、暂停重置、慢速、后台恢复、实际约 30% 压缩、滑块端点及无 WebGPU 环境。

`pnpm validate:physics` 执行固定输入的 60 秒模拟，检查所有采样帧是否有限且无翻转，保存体积、接触和回摆数据到 `evidence/physics-validation.json` 及 `evidence/nudge-response.csv`。

在地址后添加 `?inspect=1` 打开诊断面板：显示实际后端/适配器信息，可记录 60 秒帧时间或固定顶部压缩。性能记录排除两秒预热，交替轻推，使用未截断的实际动画帧间隔；该面板仅用于验收。

- [验收报告](docs/verification.md)
- [实施决策](docs/implementation.md)
- [初始设计存档](docs/initial-design.md)
- [Fable 5.1 High 独立评审](reviews/fable-5.1-high-review.md)
- [评审核对](reviews/review-assessment.md)

移动视口验证不能证明真实手机 GPU 性能。构建包含 Three.js WebGPU 引擎，会有单块超过 500kB 的体积提示；实际 gzip JavaScript 约 244kB，构建成功。

## 分享与部署

通过 Sites 发布分享版本。站点配置位于 `.openai/hosting.json`，仅托管 `dist` 中的静态网页资源。浏览器仍需支持 WebGPU。

为 Sites 的源码保存流程初始化了本项目的 Git 仓库。评审原文、机器信息和本地验收产物保留在本地，不上传为站点源码或网页资源。
