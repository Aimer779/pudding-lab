# 实施决策与原型发现

## 最终结构

| 模块 | 职责 |
| --- | --- |
| `src/physics/mesh.ts` | 体积笼、共享面一致的四面体剖分、质量和单元质量检查 |
| `src/physics/soft-body.ts` | 固定子步中的 XPBD、内部阻尼、抓取及接触 |
| `src/physics/simulation.ts` | 暂停、慢速、失焦和固定时间调度 |
| `src/pudding/surface.ts` | 闭合表面的平滑细分绑定和抓取权重回映射 |
| `src/scene/world.ts` | WebGPU、材质、照明、阴影、相机与资源释放 |
| `src/interaction/grab.ts` | 可见表面射线拾取、指针捕获和取消 |
| `src/ui/panel.ts`、`src/styles.css` | 内容结构、控件、响应式版式 |
| `src/main.ts` | 应用生命周期、状态连接、可见诊断及基准采样 |

## 依据测试作出的修正

### 网格角部质量

最初的完全方形到圆盘映射在角部出现近退化单元：最小形状质量约 0.053，未通过生成器门槛。保留非零角部雅可比后，最小质量提高到约 0.255，最大边长比约 2.776。细分表面负责圆润轮廓，不将所有圆滑细节强压到体积笼上。

### 表面连续性

采用预计算 Catmull–Clark 权重代替逐可见顶点搜索四面体。每一层面点、边点和顶点的稀疏权重都归一化，整个闭合网格共享细分顶点。绑定是物理表面的平滑线性组合；翻转和自交仍必须由几何与交互测试约束，不能单凭权重为正宣称绝不会自交。

该方案没有另加每帧拉普拉斯滤波器，不会靠后处理把原始静止形状持续缩小。实际渲染、法线、阴影和拾取共用更新后的表面。

### 舞台边界

最初逐节点夹到隐形侧墙，在确定性拖拽的第 679 帧把同一四面体四个节点压到同一平面，体积归零。修正为整体水平质心约束，边界平移不改变相对几何。后续同一输入的 60 秒测试未翻转。地面仍是接触约束并使用摩擦。

### 抓取力度

最初限制每个子步的抓取修正量，导致输入要求压下 0.405，但实际只压下约 0.151。修正为限制目标跟随速度、使用完整柔顺抓取约束；默认情况下实际压下约 0.36，即静止高度的约 27%，符合“约 30%”的测试范围。行为测试要求实际压缩在 26%–34% 内，不只检查目标位置。

### 晃动调校

最初的边约束过硬、内部衰减过快，位移只有约 0.014，0.4 秒后已难辨。调高柔顺性并降低每条边的阻尼系数后，默认顶部相对底部的最大横向位移约 0.096，产生四个可辨正负峰值。两秒时动能约为峰值的 0.12%，而非永久自动摆动。

阻尼是边方向成对速度冲量，保留整体平移和旋转分量。接触摩擦、数值积分和内部阻尼共同耗散能量，页面没有伪造持续摆动的正弦动画。

## 渲染与兼容性

锁定 Three.js 0.185.1、类型包 0.185.4、Vite 8.2.2 与 TypeScript 7.0.2。先验证 `navigator.gpu` 和 adapter，再验证渲染器的原生 WebGPU 后端标志。测试中实际使用 NVIDIA Blackwell adapter。

焦糖和蛋奶共用一个 MeshPhysicalNodeMaterial，用顶点遮罩混合参数。主光、RoomEnvironment 和半球光提供柔光棚效果，1024² VSM 阴影与形变表面同步。初版没有 transmission，因此不存在为了透射而额外渲染背景的成本。

首次环境预过滤的模糊参数过大产生警告，已从 0.06 降至 0.035。生产页面另行检查控制台，旧开发页的警告不当成修复后日志。

## 参考资料

- [Three.js WebGPU 使用说明](https://threejs.org/manual/en/webgpurenderer)
- [MeshPhysicalNodeMaterial](https://threejs.org/docs/pages/MeshPhysicalNodeMaterial.html)
- [RoomEnvironment](https://threejs.org/docs/pages/RoomEnvironment.html)
- [XPBD](https://matthias-research.github.io/pages/publications/XPBD.pdf)
- [Small Steps](https://matthias-research.github.io/pages/publications/smallsteps.pdf)

这些资料提供算法和 API 依据，性能与稳定性的结论以本项目 `evidence` 中的实际记录为准。
