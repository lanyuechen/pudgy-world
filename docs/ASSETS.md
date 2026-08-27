# Assets 目录结构与 Web 移植状态

> 生成日期：2026-08-25  
> Unity 资源根目录：`Assets/`  
> Web 运行时资源：`public/assets/`  
> 逻辑代码：`src/`（Three.js + Vite）

本文说明 Unity `Assets` 的职责划分，以及哪些内容已迁入 Web 端、哪些仍留在 Unity 源树中。

---

## 1. 总览

| 位置 | 体量（约） | 角色 |
|------|------------|------|
| `Assets/` | ~2.9GB+（主体在 `PudgyWorldAssets`） | Unity 工程全部资源与逻辑 |
| `public/assets/` | 运行时精选拷贝（约 449 FBX + 4 PNG） | 浏览器可加载的静态资源 |
| `src/` | JS 模块 | 用 Three.js **重写/近似** Unity 行为，而非直接跑 C# |

**原则：** Web 端不是整包镜像 `Assets/`，而是按玩法需要挑模型/贴图，并在 JS 里复现渲染、移动、钓鱼、换装等。

**数量对比（FBX，不含 `.meta`）：**

| 范围 | FBX 约数 |
|------|----------|
| `Assets/` 全库 | ~1433 |
| `Assets/PudgyWorldAssets` | ~1330+ |
| `public/assets/models` | ~449 |

---

## 2. `Assets/` 顶层结构

```
Assets/
├── PudgyWorldAssets/     ★ 游戏美术主库（最大）
├── Scenes/               Unity 场景（.unity）
├── Prefabs/              预制体
├── Scriptable Objects/   配置/定义数据
├── Scripts/              C# 游戏逻辑
├── Shaders/              Toon / Outline 等着色器
├── Materials/            材质
├── Animators/            Animator Controller
├── FBXs/                 少量零散 FBX
├── Plugins/              第三方插件
├── Settings/             URP / 质量等工程设置
├── TextMesh Pro/         UI 字体与 TMP
├── TutorialInfo/         Unity 模板说明
└── _Recovery/            恢复数据
```

### 2.1 非美术、基本未移植（Unity 专用）

| 目录 | 用途 | Web 状态 |
|------|------|----------|
| `Scripts/` | C# 玩法、网络、状态机等 | **未移植**；行为在 `src/` 用 JS 重写 |
| `Prefabs/` | 角色/UI/道具预制体 | **未移植**（只抽了其中用到的网格） |
| `Scriptable Objects/` | Trait / 鱼 / 关卡等定义 | **部分语义**写进 `src/config/*`（如鱼表、特质表） |
| `Scenes/` | `Pengu_Plaza`、`Asset_List`、`SampleScene`、`Debug` | **未直接加载**；用 `build*Scene.js` 重建 |
| `Animators/` | Animator Controller | **未移植**；用 Three.js `AnimationMixer` |
| `Settings/` / `Plugins/` / `TextMesh Pro/` / `TutorialInfo/` / `_Recovery/` | 工程/插件/UI | **不需要** |
| `Network*.asset` / `PredictedPrefabs.asset` | 联机相关 | **未移植** |

### 2.2 渲染相关（逻辑移植，资源不原样搬）

| Unity | Web |
|-------|-----|
| `Shaders/ToonShader`、`Outline PP.shadergraph` 等 | `src/rendering/toonMaterial.js`、`outlineComposer.js`、`hullOutline.js` |
| 材质 `.mat` | 运行时创建 `ShaderMaterial` + atlas 贴图 |

---

## 3. `Assets/PudgyWorldAssets/`（美术主库）

```
PudgyWorldAssets/
├── Land Models/       地形 / 城镇 / 世界地图块
├── Pudgy Models/      玩家、NPC、换装部件
├── Animations/        玩家 / NPC 动画 FBX
├── Fish Models/       鱼类模型
├── Levels/            各城镇任务/收集物道具
├── Textures/         调色板 / Atlas
├── Materials/         少量材质
├── VFX/               Houdini / Blender 特效源工程
└── uv2 special coordenates.png
```

### 3.1 Land Models（~530MB，~117 FBX）

| 子目录 | 内容 | Web 移植 |
|--------|------|----------|
| `Neighborhoods/` | 世界地图用城镇块 `Neighborhood_*`、`Berg_Filler*`、`Locked/` | **部分**：`public/assets/models/neighborhoods/`（多为 `_02` 版本；源里有更新的 `_03`、Locked、旧版未全搬） |
| `Individual Neighborhoods/` | 独立可玩岛屿 `Individual_*`（含节日变体） | **部分**：`public/.../individuals/`（主城镇；节日/圣诞等多数未搬） |
| `Extras/` | 摩天轮、赛道、门、树、海鸥等 | **大部分**：`public/.../extras/` |
| `Special Environments/` | 换装间 `DressUp_Boy/Girl/Neutral` | **未移植** |
| `TheBerg_V_01/02/03.fbx` | The Berg 整体 | **部分**：Web 用 `TheBerg_V_02`（World Map） |

场景下拉对应：

- **Neighborhoods → World Map**：拼接 Neighborhood + Berg filler  
- **Individuals**：单岛可玩  
- **Extras**：道具预览 + Catalog  

### 3.2 Pudgy Models（~2.1GB，~1138 FBX）

| 子类 | 源约数 | Web | 路径 |
|------|--------|-----|------|
| 玩家本体 / Rig | 多套 | **已用** `player_pudgy.fbx` 等 | `public/assets/models/player/` |
| 玩家 Traits（换装） | 大量旧版 + Exports | **约 228** 可用件 | `.../player/traits/` |
| 钓鱼配件 Traits | ~9–11 | **9** | `.../player/fishing/` |
| NPC 角色 | ~60+ Bowlcut/Pudgino 等 | **71** 角色 FBX | `.../npcs/NPC_*.fbx` |
| NPC 专用动画捆（如 Bonko） | 少量 | Bonko **已移除** | — |
| Loading Screen Pudgys | 4 | **未移植** | — |
| `.c4d` / Trait 预览 PNG | 大量 | **不搬**（用 Color Atlas） | — |

场景下拉：**NPCs** 分组可预览全部已拷角色；Individuals 场景内默认只刷少量 NPC（见 `INDIVIDUAL_NPCS`）。

### 3.3 Animations（统一目录 `public/assets/models/animations/`）

| 子目录 | Web |
|--------|-----|
| `NPC_Animations/` | 通用 idle/walk/talk/wave 等 → `animations/NPC_Animations/`（`npcConfig` + 动画配置页） |
| `Pudgy_Animations/` / `V1/` | 玩家 / 钓鱼变体 → `animations/Pudgy_Animations/`、`animations/V1/`（动画配置页预览；运行时仍可读玩家 FBX 内嵌 clip） |
| 道具动画（门 / 海鸥 / 巴士等） | → `animations/Extras/`（场景摆放引用，非角色预览） |

### 3.4 Fish Models（~3MB，~51 FBX）

| 状态 | 说明 |
|------|------|
| **基本齐** | `public/assets/models/fish/` ≈ 51；目录见 `src/config/fishCatalog.generated.js` |

### 3.5 Levels（~1.3MB，29 FBX）

| 状态 | 说明 |
|------|------|
| **已移植** | `public/assets/models/levels/<Town>/`；场景下拉 **Levels** 分组预览 |

城镇：BlubberBay、BoogieBerg、CoralCove、IceBreakerAlley、PudgyPort、WhisperingHollow。

### 3.6 Textures

| Unity | Web |
|-------|-----|
| Traits / Berg / Billboard 等 atlas | **已拷关键关键用**：`Traits_ColorAtlas.png`、`TheBerg_ColorAtlas.png`、`BillboardTexture_02.png`、`snow-particle.png` → `public/assets/textures/` |
| 其余零散贴图 | 多数未搬 |

### 3.7 VFX（~12MB）

| 内容 | Web |
|------|-----|
| Houdini `.hiplc`、Blender `.blend` 源工程 | **不能直接加载** |
| 滑行等效果 | **思路复刻**：`src/player/slideFx.js`（非源文件导入） |

### 3.8 Materials

Unity `.mat` 未原样移植；Web 用 toon + atlas。

---

## 4. Web 资源树（`public/assets/`）

```
public/assets/
├── textures/
│   ├── Traits_ColorAtlas.png
│   ├── TheBerg_ColorAtlas.png
│   ├── BillboardTexture_02.png
│   └── snow-particle.png
└── models/
    ├── neighborhoods/     # World Map 拼块
    ├── individuals/       # 可玩单岛
    ├── extras/            # 道具 / Lobby 等
    ├── levels/            # 任务收集物
    ├── npcs/              # 角色 FBX（动画不在此）
    ├── animations/        # 全部动画：NPC / Pudgy / V1 / Extras
    ├── player/            # 本体 + traits/ + fishing/
    └── fish/              # 鱼类
```

---

## 5. Web 功能 ↔ Assets 对照

| Web 能力 | 主要来源 | 状态 |
|----------|----------|------|
| Intro 开场（降级） | Berg 壳 + 玩家钓鱼循环；原 Intro FBX 曾因格式问题不可用 | **降级可用** |
| World Map 浏览 | Neighborhoods + Berg | **可用**（explore） |
| Individuals / Pengu Plaza 可玩 | Individual FBX + 玩家 + NPC 人群 | **可用** |
| 换装 | Traits FBX + Traits atlas | **可用** |
| 钓鱼 | 鱼洞逻辑 + Fish Models + 钓鱼配件 | **可用** |
| NPC 预览下拉 | 全部已拷 NPC | **可用**（explore） |
| Levels 道具预览 | Levels FBX | **可用**（explore） |
| Extras / Catalog | Land Extras + Asset_List 布局数据 | **可用**（explore） |
| Toon / Outline | Shaders 逻辑移植 | **近似 Unity** |
| 联机 / 完整任务系统 | Scripts + ScriptableObjects | **未做** |
| 换装间场景 | Special Environments | **未做** |
| Houdini 特效源 | VFX/ | **未导入**（可导出后再接） |
| Locked 未探索城镇外观 | Neighborhoods/Locked | **未接** |
| 节日变体城镇 | Individual 圣诞/夏日等 | **大多未拷** |

---

## 6. 场景下拉分组（与资源关系）

| 分组 | 内容 |
|------|------|
| Intro | 开场流程 |
| Neighborhoods | World Map |
| Individuals | 可玩岛屿 |
| NPCs | 单角色预览（71） |
| Levels | 任务道具预览（29） |
| Extras | Catalog + 零散道具 |

配置入口：`src/config/sceneOptions.js`。

---

## 7. 移植完成度（粗估）

| 类别 | 完成度 | 备注 |
|------|--------|------|
| 鱼类模型 | ★★★★★ | 基本全 |
| Levels 道具 | ★★★★★ | 29/29 |
| 玩家换装 Traits | ★★★★☆ | 运行时集合齐；源树旧版未全搬 |
| NPC 角色网格 | ★★★★★ | 角色 FBX 已进 public；岛上刷怪仍精选 |
| NPC 动画 | ★★☆☆☆ | 仅通用 10 套 |
| Land / 城镇 | ★★★☆☆ | 主路径有；`_03`、节日、Locked 不全 |
| 玩家动画全集 | ★★★☆☆ | 够玩；变体不全 |
| Unity 逻辑/联机/任务 | ★☆☆☆☆ | JS 重写子集 |
| VFX 源工程 | ☆☆☆☆☆ | 需导出后才能用 |
| Special Environments | ☆☆☆☆☆ | 未移植 |

---

## 8. 备注

1. **`.meta` 文件**：Unity 专用；Web / Three.js **不读取**。  
2. **单位**：Land / Asset_List 类 FBX 多为 cm，加载时 `normalizeFbxToMeters`（cm→m）。  
3. **版本**：Web 中 Neighborhood/Individual 多为 `_02`；Unity 源树常有 `_03` 更新，未全部替换。  
4. **FBX 6100**：部分早期 Intro 资源曾无法被 Three.js 解析，故 Intro 采用降级方案。  
5. 本文随仓库演进可能过期；以 `public/assets` 与 `src/config` 实际文件为准。
