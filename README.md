# Soft Pudding

一个可抓取、会回弹的焦糖奶油布丁实验台。Three.js 原生 WebGPU 渲染，CPU XPBD 体积软体，原生 HTML/CSS 控制面板，无后端。

[在线体验](https://aimer779.github.io/pudding-lab/) · [GitHub 仓库](https://github.com/Aimer779/pudding-lab)

体验需要支持 WebGPU 的浏览器，并开启硬件加速。

## 灵感来源

本项目的灵感来自 [@scottstts 在 X 上的这篇帖子](https://x.com/scottstts/status/2096008241104711698)。感谢原作者的分享！

## 本地运行

环境：Node.js 24 或符合 Vite 要求的 Node.js 版本，pnpm 11。测试命令使用 Node 24 的 TypeScript 去类型和无子进程测试模式。

```powershell
git clone https://github.com/Aimer779/pudding-lab.git
cd pudding-lab
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
- Fingers / Spoon：切换舞台工具。勺子模式下勺子跟随指针悬停在表面外侧；按住时勺碗压入布丁，松开时挖走勺内的那一口，抬起、缩小、吃掉。
- Take a bite：键盘替代操作，自动切到勺子并从面向观众的最高处挖一口。
- Vanilla / Berry / Matcha：切换材质，保留当前运动。
- Firmness：从柔软蛋奶感到弹性更强；方向键调节滑块。
- Internal damping：控制内部晃动的衰减，不用全局空气阻力掩盖接触问题。
- ¼ speed、Show mesh、Pause：慢动作、实际细分表面线框、暂停。
- Reset：恢复默认口味、参数、完整形状、速度及控件，解除抓取、勺子和暂停。

左下 EATEN 读数是已挖走单元的静止体积占完整布丁的比例。全部吃完后舞台留空并显示 All eaten，Reset 端上一个新的。

窄屏控制卡位于舞台下方，可滚动页面。只有三维舞台捕获拖拽。系统开启减少动态效果时不播放入场落地，仍保留主动交互。

## 实现边界

- 486 个体积节点、1,920 个四面体、9,216 个可见三角形。
- 240Hz 固定物理步，每个子步一轮 XPBD 边长、抓取与体积约束；过长帧最多补 12 步，后台不累计补帧债务。
- 对闭合四边形边界预计算两层 Catmull–Clark 细分权重。可见顶点由物理节点的非负归一化权重驱动，不使用笼外负重心权重外推。
- 每帧更新位置、法线及包围范围；射线命中可见插值表面后，将抓取权重映射回物理节点。真实阴影使用同一形变几何。
- 地面碰撞有摩擦；舞台边界通过限制整体水平质心避免出画，不逐顶点夹到隐形墙上。它是展示交互边界，不宣称真实容器物理。
- 抓取目标距离原抓取点最多 0.62 个场景单位，跟随速度上限 2.5 单位/秒；不支持任意切割、撕裂、打结或完整自碰撞。
- 挖勺是按体积笼的六面体单元格整块移除，不是贴合勺面的几何切割：松开时中心落在勺碗椭球（外扩 0.08）内的单元格被删掉，然后自动补吃只沿边或顶点相连的单元和失去面接触的碎屑，保证剩余部分是一个闭合流形体。移除后重算边、质量和边界四边形，重建细分表面，节点位置和速度按网格编号带过去；新暴露的内部面按 `cut` 遮罩渲染成无焦糖的切面。
- 勺子在物理中是一个只作用于下半碗的软推挤器，节点每子步向碗面移动 25%，因此勺子会沉进布丁而不是当成刚性墙；勺碗底部被限制在地面以上 0.12，避免压穿最底层。
- 蛋奶与焦糖使用同一物理节点材质，通过静止表面的遮罩混合颜色、粗糙度和清漆；没有路径追踪、透射或流动焦糖模拟。
- 体积读数来自实际四面体体积（相对剩余部分的静止体积），EATEN 来自被移除单元的静止体积，Motion 是动能平方根的展示值，无标定物理单位。不展示虚构 kPa 或 mJ。
- 必须初始化原生 WebGPU；不把 Three.js 自动回退标成 WebGPU。不可用时提供说明和重试，设备丢失时停止循环。

## 检查与证据

```powershell
pnpm typecheck
pnpm test
pnpm validate:physics
pnpm build
```

`pnpm test` 覆盖体积/接触、实际指针取消与失焦处理、暂停重置、慢速、后台恢复、实际约 30% 压缩、滑块端点及无 WebGPU 环境；挖勺部分覆盖完整笼子不变、移除后边界闭合流形、边/顶点接触与碎屑修复、勺子按压不翻转、单口体积上限、逐口吃完再 Reset 复原，以及勺子指针按下、松开、失焦取消和键盘咬一口。

`pnpm validate:physics` 执行固定输入的 60 秒模拟，检查所有采样帧是否有限且无翻转，保存体积、接触和回摆数据到 `evidence/physics-validation.json` 及 `evidence/nudge-response.csv`。

在地址后添加 `?inspect=1` 打开诊断面板：显示实际后端/适配器信息，可记录 60 秒帧时间或固定顶部压缩。性能记录排除两秒预热，交替轻推，使用未截断的实际动画帧间隔；该面板仅用于验收。

- [验收报告](docs/verification.md)
- [实施决策](docs/implementation.md)
- [初始设计存档](docs/initial-design.md)

评审原文及验收报告中引用的 `evidence/` 产物仅保留在本地，不包含在公开仓库中。

移动视口验证不能证明真实手机 GPU 性能。构建包含 Three.js WebGPU 引擎，会有单块超过 500kB 的体积提示；实际 gzip JavaScript 约 244kB，构建成功。

## 分享与部署

公开体验站点托管在 [GitHub Pages](https://aimer779.github.io/pudding-lab/)。推送到 `main` 后，[部署工作流](.github/workflows/pages.yml) 自动安装锁定依赖、执行行为测试和物理验证，再完成类型检查、构建与发布。也可在 GitHub Actions 中手动运行。

工作流通过 Vite 的 `--base` 参数设置仓库子路径，仅发布 `dist` 中的静态资源。部署配置参考 [Vite 官方指南](https://vite.dev/guide/static-deploy#github-pages)。

原有 Sites 配置保留在 `.openai/hosting.json`。默认 `pnpm build` 仍用于根路径托管；GitHub Pages 使用工作流中的带子路径构建。浏览器仍需支持 WebGPU。
