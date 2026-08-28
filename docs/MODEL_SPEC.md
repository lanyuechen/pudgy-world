# 模型规范（GLB 统一标准）

> 实施模型管线重构前的约定。运行时以 **GLB** 为准；FBX 仅作转换源或开发兜底，加载后必须规范化为同一标准。

---

## 1. 目标

| 原则 | 说明 |
|------|------|
| **GLB 唯一运行时标准** | 轴系、单位、朝向、UV、蒙皮/bind、动画 clip 均以规范 GLB 为准 |
| **转换期烘焙（方案 A）** | 修正主要在 `npm run convert:glb` 写入磁盘；运行时只做统一 `normalizeLoadedModel()` |
| **业务零补丁** | 玩家/NPC/换装/场景/预览等不再各自 `rotation.y = π`、`orientTraitGeometry`、`MESH_YAW_OFFSET` 等 |
| **双格式可渲染** | 加载 **GLB 或 FBX** 均可正常显示；FBX 路径必须走同一套 profile + normalize，输出与 GLB 等价 |

---

## 2. 项目 GLB 规范（Target Spec）

### 2.1 坐标与朝向

- **Up**：+Y
- **角色前进**：+Z（与 `characterController` 的 `atan2(dx, dz)` 一致）
- **Rest pose**：站立（ tallest 轴为 Y ），不在运行时依赖 Body/Armature 节点 `-90°X` 维持姿态

### 2.2 单位

| Profile | 目标单位 | 说明 |
|---------|----------|------|
| `character` | **米 (m)** | player、npcs、player/traits |
| `prop` | **米 (m)** | fish、levels、小道具 |
| `environment` | **米 (m)** | neighborhoods、individuals、extras；世界坐标在转换期烘焙，运行时不再 `cm→m` 缩放父节点（或保留单一 documented 入口） |
| `clip` | **米 (m)** | animations/ 下仅动画 FBX；mesh 可剔除，保留 skeleton + clip |

### 2.3 蒙皮与 Trait

- 蒙皮网格 **bind 空间与 player Body 一致**；trait 运行时只做 skeleton 绑定，**不做几何旋转补丁**
- 贴图 atlas：**OpenGL UV** → `Texture.flipY = false`（TheBerg / Traits / Billboard）

### 2.4 动画

- Clip 不应再依赖「Armature 根节点 -90°X」等静态姿态 track 才能站立
- 转换期：烘焙或剔除维持 bind pose 的 Armature/Body 静态 rotation track（具体策略在 `convert:glb` profile `clip` / `character` 实现）

### 2.5 压缩

- 磁盘格式：**GLB + meshopt**（`EXT_meshopt_compression`，`EncoderMethod.FILTER`）
- 转换管线：`reorder()` + FILTER 压缩；**不使用** `quantize()` / `KHR_mesh_quantization`（避免蒙皮 IBM 被改写、trait bind 错位）
- 顶点/UV/法线保持 **float32**，与自定义 toon shader 兼容

---

## 3. Profile（按目录自动选择）

`scripts/convertFbxToGlb.mjs` 与运行时 `normalizeLoadedModel(root, profile)` 共用同一套 profile：

| Profile | 路径前缀（`public/assets/models/`） |
|---------|-------------------------------------|
| `character` | `player/`（含 `player_pudgy`）、`npcs/`、`player/traits/`、`player/fishing/` |
| `environment` | `neighborhoods/`、`individuals/`、`extras/`、`special/` |
| `prop` | `fish/`、`levels/` |
| `clip` | `animations/` |

未匹配目录：默认 `prop`，并在转换日志中 `warn`。

---

## 4. 资产与部署

| 项 | 策略 |
|----|------|
| **Git** | 保留 FBX 源文件 + 生成 GLB（便于重跑 `convert:glb`） |
| **CDN / GitHub Pages** | 仅发布 **GLB**（+ 贴图）；`VITE_ASSET_BASE` 指向 CDN 时不打包 `models/**/*.fbx` |
| **配置路径** | 继续写 `.fbx`；`assetUrl()` 自动改写为 `.glb`（方案 A） |

---

## 5. 加载管线（目标形态）

```
assetUrl(configPath)          → …/foo.glb
        ↓
loadModelRoot(url, profile)   → GLTFLoader（优先）| FBXLoader（显式 .fbx 或 dev 兜底）
        ↓
normalizeLoadedModel(root, profile)  → 统一轴/单位/UV 约定；标记 userData.modelNormalized
        ↓
业务（材质 atlas、animator、trait bind、physics…）  → 不再改朝向/轴
```

- **GLB**：转换已烘焙时，normalize 多为 **校验 + 贴图/材质 hook**（幂等）
- **FBX**：normalize **必须**执行与 GLB 等价的修正，保证渲染结果一致

---

## 6. 已删除资源（FBX 6100，无法解析）

以下文件已从磁盘删除（assimp 无法导出）；运行时 catalog 从未引用：

| 文件 | 说明 |
|------|------|
| `animations/Extras/Anim_RaceTrackLights.fbx` | 动画 clip，无运行时引用 |
| `npcs/NPC_Elizabeth_04.fbx` | 损坏 NPC 变体 |
| `npcs/NPC_Peaches_02.fbx` | 损坏 NPC 变体 |

可用变体：`NPC_Elizabeth.fbx` / `NPC_Elizabeth_01.fbx` / `NPC_Elizabeth_03.fbx` 等。

---

## 7. 实施阶段

### Phase 1（角色与换装）

- [x] `src/loaders/modelProfiles.js` + `normalizeLoadedModel.js`
- [x] 扩展 `convertFbxToGlb.mjs`（profile、FILTER meshopt、轴/单位烘焙）
- [x] 统一 `loadModelRoot(url, { profile })`
- [x] 清理：`loadPlayer.js`、`loadNpc.js`、`traitEquipper.js`、`createNpcCrowd.js`、`showcasePreview.js`、`atlasMaterials.js` 中的分散补丁
- [x] 删除 §6 NPC 条目；`npm run convert:glb -- --force`
- [x] 验证：玩家 idle/走、NPC 预览、换装、动画 tab

### Phase 2（场景与收尾）

- [x] `environment` / `prop` profile 烘焙与 `prepareFbxRoot` → `applyAtlasMaterials` 简化
- [x] 文档同步 `docs/ASSETS.md`
- [x] 生产构建剥离 `dist/assets/models/**/*.fbx`；CDN 模式仍整包省略 models/textures

---

## 8. 验收清单

- [ ] 仅 GLB：玩家站立、+Z 前进、换装对齐、NPC 动画正常
- [ ] 强制 FBX 路径（dev）：与 GLB 视觉一致（normalize 后）
- [ ] 场景岛 / World Map：贴图非全黑、比例正确
- [ ] 业务代码中无 `rotation.y = Math.PI`、trait 几何 rotate、NPC `MESH_YAW_OFFSET` 等补丁（normalize 层除外）

---

## 9. 相关文件（现状 → 目标）

| 文件 | 现状问题 | 目标 |
|------|----------|------|
| `src/loaders/loadModel.js` | GLB 优先 + FBX fallback，无 profile/normalize | 统一入口 + profile |
| `src/player/loadPlayer.js` | 单位、flipY、曾有的 Y 旋转 | 只调 normalize + 材质 |
| `src/player/traitEquipper.js` | `orientTraitGeometry` 等 | 仅 bind skeleton |
| `src/npc/loadNpc.js` | 同 player 分散逻辑 | normalize(`character`) |
| `src/npc/createNpcCrowd.js` | `MESH_YAW_OFFSET`、位移符号 | 标准 +Z  locomotion |
| `src/scene/atlasMaterials.js` | flipY、prepare 内 normalize | `applyAtlasMaterials` 只管材质；单位在 normalize |
| `scripts/convertFbxToGlb.mjs` | FILTER meshopt，未烘焙轴 | profile 烘焙 |
