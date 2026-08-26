# Unity Scripts 玩法 vs Web 实现对照

> 生成日期：2026-08-25  
> Unity 逻辑：`Assets/Scripts/`（约 72 个 `.cs`）  
> Web 逻辑：`src/`（Three.js + Vite 重写，非 C# 直译）  
> 资源对照见：[`docs/ASSETS.md`](./ASSETS.md)

本文说明 Unity 端玩法架构与各系统职责，并对照当前 Web 端已实现、近似实现、未实现的部分。

---

## 1. 总览结论

| 维度 | Unity | Web |
|------|-------|-----|
| 运行时 | Unity + **PurrNet 预测同步** | 纯本地浏览器，**无联机** |
| 玩法核心 | 预测移动 / 交互 / 特质 / 雪球；钓鱼数据已定义但流程不完整 | 本地移动 / 相机 / 换装 / 雪球 / 钓鱼小游戏（逻辑较完整） |
| 数据驱动 | ScriptableObjects（鱼、特质、钓鱼步骤） | `src/config/*` + generated catalog |
| 场景 | NetworkBehaviour + LevelLoader | `build*Scene.js` + 场景下拉 |

**一句话：** Web 把「单机可玩子集」重写了一遍（移动、相机、换装、雪球、钓鱼、氛围 NPC）；Unity 里的 **联机预测、管理器编排、完整任务/库存** 基本未移植。钓鱼在 Unity 源码里反而更残（进状态后几乎不推进步骤），Web 侧反而补全了 cast → idle → struggle → 展示鱼。

---

## 2. Unity `Assets/Scripts` 结构

```
Assets/Scripts/
├── Objects/              Player、Snowball
├── Components/
│   ├── Player/           移动、相机、动画、特质、交互
│   └── Interactables/    FishingHole、InteractableObject
├── States/Movement States/  Unrestricted / Restricted / Fishing
├── Managers/             Player / Event / Prediction / Registry / Settings / File
├── Events/               Input / Player / Server / Client / Loading / Settings
├── Data/                 Fishing steps、ThrowContext、TransformState
├── Scriptable Objects/   FishDefinition、TraitDefinition、MovementProfile、Registries
├── Scripting/            Enums、Interfaces、Constants、Extensions
├── UI/                   SnowballHitCounter
├── Utility/              LevelLoader、NavMesh、ReconnectSyncer
├── Common/               BaseObject（预测 Identity 基类）
└── Editor/               编辑器工具（不进运行时）
```

约 **72** 个 `.cs`；其中 Editor 约 7 个，仅服务 Unity 编辑器。

---

## 3. Unity 架构（玩法如何串起来）

```
Input System
    → EventManager.InputEvents
        → Player（PredictedIdentity）本地输入缓冲
            → Simulate 预测 tick
                ├─ PlayerMovement（PredictedStateMachine）
                │     ├─ UnrestrictedMovementState  行走/滑行/跳跃
                │     ├─ RestrictedMovementState    禁交互；Return 退出
                │     └─ FishingMovementState       装备钓具 + kinematic
                ├─ PlayerInteract → IInteractable（如 FishingHole）
                ├─ TraitEquipper → PredictionManager.TryCreate 特质实例
                └─ ThrowSnowball → PredictionManager.TryCreate Snowball

PlayerManager（服务器）→ 为远端玩家生成预测角色
RegistryManager → TraitRegistry 查特质预制体
```

**预测 vs 本地呈现**

| 预测 / 网络侧 | 本地呈现侧 |
|---------------|------------|
| `Player`、`PlayerMovement`、交互、特质装备、雪球、`FishingHole` | `PlayerCamera`、`PlayerAnimator`、雪球命中计数 UI |
| `PlayerManager` 服务器刷人 | 输入事件路由 |

---

## 4. 系统对照表（核心玩法）

### 4.1 移动（Locomotion）

| | Unity | Web |
|--|-------|-----|
| 脚本 | `UnrestrictedMovementState` + `PlayerMovement` | `src/control/characterController.js` |
| 物理 | `PredictedRigidbody` | Rapier CharacterController + capsule |
| 行走 / 滑行 / 跳 | ✅ | ✅ |
| 相机相对方向 | ✅ | ✅ |
| 面向移动方向 | ✅（约 600°/s） | ✅（`rotateSmooth`） |
| 墙体 / Capsule 碰撞 | Rigidbody 碰撞 | Rapier trimesh + capsule |
| 状态机多状态 | Unrestricted / Restricted / Fishing | 实质只有「自由移动」+ 钓鱼会话锁输入 |

**关键常量：** 见 `src/config/playerConfig.js` 的 `CONTROL`（walk/run、gravity、jump 等）。

> Unity 另有 `MovementProfile` SO（Speed=5 等），**未被移动状态引用**；Web 以 `CONTROL` 为准。

**映射：** `UnrestrictedMovementState` → `characterController.js` + `playerConfig.js`

---

### 4.2 相机

| | Unity | Web |
|--|-------|-----|
| 玩法相机 | `PlayerCamera`（跟随参考点、鼠标轨道） | `src/control/springArmCamera.js` |
| 浏览相机 | （编辑器/调试） | `exploreCamera.js`（OrbitControls） |
| Boom 距离 | 参考点最大距离约 3 | `CONTROL.camDefaultDistance`（可滚轮 min–max） |
| 俯仰限制 | [-35°, 60°] | `CONTROL.pitchMin` / `pitchMax` |
| 遮挡处理 | （视实现） | boom 射线 + sticky spring |

**映射：** `PlayerCamera` → `springArmCamera.js`；探索模式无 Unity 对等玩法脚本。

---

### 4.3 输入

| | Unity | Web |
|--|-------|-----|
| 系统 | Input System → `InputEvents` | `src/control/playerInput.js` |
| 移动 / 滑行 / 跳 / 看 / 扔雪球 / 交互 / Return | ✅ | ✅（WASD、Shift、Space、F、点击、Esc 退钓鱼等） |
| 手柄 / 键位重绑 | Input System | **无** |

**`InputEvents` 主要事件：** `Move`、`Look`、`SlidePressed`、`JumpPressed`、`RotateCameraPressed`、`ThrowSnowballPressed`、`Interact`、`Return`

---

### 4.4 动画

| | Unity | Web |
|--|-------|-----|
| 驱动 | `PlayerAnimator` + Animator Controller | `playerAnimator.js` + `AnimationMixer` |
| 触发名 | `idle` / `walk` / `slide` / `jump` / `throw` / `fishing_idle` | 同语义别名匹配 FBX 剪辑 |
| AFK | （视 Controller） | idle 约 10s 后 AFK1–3 |
| 钓鱼姿势 | fishing_idle 等 | cast / idle / struggle / HoldingFish 等 |

**映射：** `PlayerAnimator` + `AnimationTriggerConstants` → `playerAnimator.js`

---

### 4.5 交互（Interact）

| | Unity | Web |
|--|-------|-----|
| 接口 | `IInteractable` | 无通用接口；钓鱼洞专用 |
| 组件 | `PlayerInteract`（预测射线，最远 **7.5**） | `createPlayerSystem.tryInteract` + 钓鱼洞射线 |
| 范围触发 | `LocalPlayerTrigger` + `InteractableObject` | 钓鱼洞 `playerRangeRadius` 2.25 变色 |
| 通用可互动物 | 框架有 | **未泛化**（无宝箱/NPC 对话交互） |

**映射：** `PlayerInteract` / `FishingHole` → `fishingHoles.js` + `createPlayerSystem.js`

---

### 4.6 钓鱼（差异最大）

#### Unity（`FishingHole` + `FishingMovementState`）

1. 交互 → `GenerateSequence()`（`PredictedRandom`）  
2. `FishingStepType`：`Idle`、`Hold`、`Struggle`  
3. 定义默认：Idle/Hold 时长约 (0.1, 5)；Struggle 点击约 (10, 30)  
4. `FishingMovementState.Enter`：装备 Rod/Rope/Bait，播 `fishing_idle`，刚体 kinematic  
5. **进入后几乎不推进步骤**（序列存着、打日志；未见完整 QTE / 收杆 / 出鱼）  
6. `Fish` / `FishDefinition` 有数据壳，**无完整捕获奖励循环**

#### Web（实现更完整的本地小游戏）

| 步骤 | 行为 |
|------|------|
| 靠近冰洞 | 圆盘变色（out `0x75b6fb` / in `0xaef0ff`） |
| 点击开始 | 装备默认钓具；锁移动 |
| cast → idle → struggle | 时长 / 点击次数随机（见下） |
| 完成 | 随机鱼展示（`catchPresenter`）；Esc 可取消 |

**Web 默认序列**（`fishingConfig.js`）：

| 步骤 | 参数 |
|------|------|
| cast | 0.55s |
| idle | 5–7.5s |
| struggle | 10–20 次点击 |

**洞位：** `FISHING.holes` 写在配置里，由 **`buildPenguPlazaScene`**（`src/scene/buildScene.js`）创建。

> **接线注意（2026-08-25）：** `sceneOptions.js` 里各选项目前均写死 `isPenguPlaza: false`，Pengu Plaza 会走 `buildNeighborhoodScene`，**不一定挂上钓鱼洞**。钓鱼代码在，但入口可能未接到当前下拉场景——属已知缺口。

**映射：**

| Unity | Web |
|-------|-----|
| `FishingHole` | `fishing/fishingHoles.js` |
| `FishingStep` / `FishingStepDefinition` | `config/fishingConfig.js` |
| `FishingMovementState` | `fishing/fishingSession.js` + 动画 |
| `FishDefinition` | `fishConfig.js` / `fishCatalog.generated.js` |
| （无完整展示） | `fishing/catchPresenter.js`、`ui/fishingPrompt.js` |

---

### 4.7 换装 / Traits

| | Unity | Web |
|--|-------|-----|
| 定义 | `TraitDefinition` + `TraitRegistry` | `traitsCatalog.generated.js` + `traitsConfig.js` |
| 装备 | `TraitEquipper`（预测生成，本地 Owner 请求） | `traitEquipper.js`（本地 SkinnedMesh 绑定） |
| 类型 | Skin / Head / Face / Body / FullBody / Rod / Bait / Rope | 同语义 |
| 冲突 | FullBody ↔ Head+Body；Skin 关默认皮 | 同 |
| 骨骼重映射 | `PlayerTrait.RemapToPlayer` | JS bind / bake |
| UI | （游戏内换装间等，见 Land Special Environments） | `ui/traitCustomizer.js` 设置面板 |
| 持久化 | Settings/File（部分 TO-DO） | `localStorage`（外观 + bait） |

**稀有度枚举（Unity）：** Default / Common / Uncommon / Rare / Epic / Mythical

**映射：** `TraitEquipper` / `PlayerTrait` / `RegistryManager` → `traitEquipper.js`、`traitCustomizer.js`、`traitPersistence.js`

---

### 4.8 雪球

| | Unity | Web |
|--|-------|-----|
| 投掷 | `Player.ThrowSnowball` + 冷却默认 1s | `snowball.js`，冷却 1s，F 键 |
| 物体 | 预测 `Snowball` + Rigidbody | 程序白球 + 重力 + 射线命中 |
| 命中 | 本地 Owner 触发 `PlayerEvents.SnowballHit` | 命中网格计数 |
| UI | `SnowballHitCounter`（服务器不显示） | `ui/snowballHitCounter.js` |

**映射：** `Snowball` / `SnowballHitCounter` → `snowball.js` + `snowballHitCounter.js`

---

### 4.9 滑行特效

| | Unity | Web |
|--|-------|-----|
| 资源 | 多在 VFX 源 / 粒子（见 `docs/ASSETS.md`） | `slideFx.js`（贴图粒子条带，注释对齐 Houdini slide-fx） |

---

### 4.10 NPC

| | Unity Scripts | Web |
|--|---------------|-----|
| 本仓库 Scripts | **几乎无**专用 NPC AI / 对话脚本（NPC 更偏资源与场景摆放） | `npc/loadNpc.js`、`createNpcCrowd.js` |
| 行为 | （若在其他包/场景） | 岛上精选刷怪：idle/表情/巡逻；下拉 NPCs 预览 |

Web 氛围 NPC ≠ Unity 完整任务 NPC。

---

### 4.11 管理器 / 联机 / 加载（Web 基本未做）

| Unity | 职责 | Web |
|-------|------|-----|
| `PlayerManager` | 服务器玩家列表、刷预测角色 | **无** |
| `PredictionManager` | 预测物体创建/销毁门面 | **无** |
| `EventManager` | 全局事件总线 | 局部回调，无对等总线 |
| `RegistryManager` | 特质注册表 | catalog 静态表 |
| `SettingsManager` / `FileManager` | 设置与 JSON 存档 | 仅 localStorage 子集 |
| `LevelLoader` / `ReconnectSyncer` | 分步加载 / 重连 | Intro/场景切换自管；无重连 |
| `ServerEvents` / `ClientEvents` | 联机会话 | **无** |

---

### 4.12 数据与枚举

| Unity | Web |
|-------|-----|
| `FishDefinition` | `fishCatalog.generated.js` |
| `TraitDefinition` / `TraitType` / `TraitRarity` | traits catalog + config |
| `FishingStepType` Idle/Hold/Struggle | Web 另加 **cast**，Hold 语义弱化 |
| `ActionType`、`CommonID` | Scripts 内几乎未被玩法引用 |
| `ThrowContext` | 声明存在，雪球路径未用 |

---

## 5. Web 场景模式 vs Unity 场景

| Web 模式 | 行为 | Unity 对应 |
|----------|------|------------|
| Intro | 过场，不可玩 | Intro 场景意图（资源曾不兼容，现降级） |
| Individuals（playable） | 刷玩家 + NPC 人群 | 单岛 / Plaza 可玩体验子集 |
| World Map | 仅浏览 | TheBerg / Neighborhood 拼接浏览 |
| NPCs / Levels / Extras | 仅预览 | Asset 展示类，非玩法状态机 |

入口：`src/main.js` + `src/config/sceneOptions.js`。

---

## 6. 类 / 模块映射速查

| Unity | Web |
|-------|-----|
| `Player` | `createPlayerSystem.js` + `loadPlayer.js` |
| `UnrestrictedMovementState` | `src/control/characterController.js` |
| `RestrictedMovementState` / `FishingMovementState` | 钓鱼会话内锁移动（无完整状态机类） |
| `PlayerCamera` | `src/control/springArmCamera.js` |
| `PlayerAnimator` | `playerAnimator.js` |
| `PlayerInteract` | `createPlayerSystem` 交互 + `fishingHoles.js` |
| `TraitEquipper` / `PlayerTrait` | `traitEquipper.js` |
| `FishingHole` / Fishing steps | `fishingHoles.js`、`fishingSession.js`、`fishingConfig.js` |
| `Fish` / `FishDefinition` | `fishConfig.js`、`catchPresenter.js` |
| `Snowball` / `SnowballHitCounter` | `snowball.js`、`snowballHitCounter.js` |
| InputEvents | `src/control/playerInput.js` |
| Prediction* / PlayerManager / 网络事件 | — |
| LevelLoader | `main.js` 场景加载 + Loading UI |
| Editor 工具 | — |

---

## 7. 完成度矩阵

| 系统 | Unity 完整度 | Web 完整度 | 说明 |
|------|--------------|------------|------|
| 自由移动 | ★★★★☆ | ★★★★☆ | 手感接近；Web 无刚体墙碰 |
| 第三人称相机 | ★★★★☆ | ★★★★☆ | 可用；无遮挡 |
| 动画切换 | ★★★★☆ | ★★★☆☆ | Mixer 近似 Controller |
| 交互框架 | ★★★☆☆ | ★★☆☆☆ | Web 仅钓鱼等特例 |
| 钓鱼 | ★★☆☆☆（进状态为主） | ★★★★☆（本地流程更全） | Web 需确认 Plaza 洞位接线 |
| 换装 | ★★★★☆ | ★★★★☆ | Web 无换装间场景 |
| 雪球 | ★★★★☆（预测） | ★★★☆☆（本地） | 无同步命中 |
| 联机预测 | ★★★★★ | ☆☆☆☆☆ | 未移植 |
| 任务 / 库存 / 对话 | （多在 SO/场景，Scripts 薄） | ☆☆☆☆☆ | Levels 仅模型预览 |
| NPC 氛围 | 资源侧 | ★★★☆☆ | 巡逻/预览有，无对话 |
| 存档 | 部分 TO-DO | ★★☆☆☆ | localStorage 外观 |

---

## 8. Unity 中明确未完成 / 未接线（Scripts 内）

- 钓鱼步骤进入后 **不推进** Idle/Hold/Struggle 玩法循环  
- `Fish` 捕获与结算未形成闭环  
- `MovementProfile`、`ActionType`、`ThrowContext`、`CommonID` 基本未参与主路径  
- `RegistryManager.TryGetRegisteredObject` 存根失败  
- `ReconnectSyncer` 客户端同步大段注释  
- `SettingsManager` 文件持久化 TO-DO  
- `PlayerManager.HandleLoadingComplete` 刷人调用曾被注释  

---

## 9. Web 已知缺口（相对「完整 Unity 客户端」）

1. **无网络**：无预测、无多人、无服务器刷人  
2. **无通用交互 / 任务 / 背包 / 经济**  
3. **无 NPC 对话与任务链**  
4. **无 DressUp 换装间**（仅设置面板）  
5. **World Map 不可玩**  
6. **碰撞**仅贴地与雪球射线  
7. **音频**未形成玩法模块  
8. **Pengu Plaza 专用建造路径**与场景下拉 `isPenguPlaza` 可能未对齐 → 钓鱼洞未必出现在当前可选场景  

---

## 10. 建议后续（若继续对齐玩法）

| 优先级 | 项 |
|--------|----|
| P0 | 恢复 Individuals / Plaza 的 `fishingHoles` 接线，保证可玩岛能钓鱼 |
| P1 | 通用 `IInteractable` 风格交互（NPC、Levels 道具） |
| P2 | 钓鱼结果进简单背包 / 图鉴 |
| P3 | 换装间场景（`Special Environments`） |
| P4 | 联机（成本高，需重选网络方案，难直接复用 PurrNet） |

---

## 11. 相关文件索引

**Unity：** `Assets/Scripts/Objects/Player.cs`、`Components/Player/*`、`States/Movement States/*`、`Components/Interactables/*`、`Managers/*`、`Events/*`、`Data/Fishing/*`、`Scriptable Objects/Definitions/*`

**Web：** `src/control/*`、`src/player/*`、`src/fishing/*`、`src/camera/exploreCamera.js`、`src/ui/*`、`src/npc/*`、`src/config/playerConfig.js`、`fishingConfig.js`、`traitsConfig.js`、`src/main.js`

**资源：** [`docs/ASSETS.md`](./ASSETS.md)
