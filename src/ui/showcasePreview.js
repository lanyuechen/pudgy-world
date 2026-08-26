/**
 * In-panel 3D preview for 橱窗 — does not switch the active game scene.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { INTRO } from '../config/introConfig.js';
import { assetUrl } from '../config/assetUrl.js';
import { loadNpcModel } from '../npc/loadNpc.js';
import { createAtlasMaterials, prepareFbxRoot } from '../scene/atlasMaterials.js';
import { createLights } from '../scene/lights.js';
import { syncToonLightDirection } from '../rendering/toonMaterial.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {THREE.LoadingManager} loadingManager
 */
export function createShowcasePreview(canvas, loadingManager) {
  const getPixelRatio = () => Math.min(window.devicePixelRatio, 2);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(getPixelRatio());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 500);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.5;
  controls.maxDistance = 120;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.55;

  const idleBeforeAutoRotate = 1.2;
  let interacting = false;
  let idleElapsed = idleBeforeAutoRotate;

  /** @type {THREE.DirectionalLight|null} */
  let sun = null;
  /** @type {THREE.Group|null} */
  let contentRoot = null;
  /** @type {THREE.AnimationMixer[]} */
  const mixers = [];
  /** @type {Awaited<ReturnType<typeof createAtlasMaterials>>|null} */
  let atlasMaterials = null;
  let busy = false;

  controls.addEventListener('start', () => {
    interacting = true;
    controls.autoRotate = false;
    idleElapsed = 0;
  });
  controls.addEventListener('end', () => {
    interacting = false;
    idleElapsed = 0;
  });

  function resetAutoRotateIdle() {
    interacting = false;
    idleElapsed = idleBeforeAutoRotate;
    controls.autoRotate = Boolean(contentRoot);
  }

  async function ensureAtlasMaterials() {
    if (!atlasMaterials) {
      atlasMaterials = await createAtlasMaterials(loadingManager);
    }
    return atlasMaterials;
  }

  function clearContent() {
    for (const mixer of mixers) mixer.stopAllAction();
    mixers.length = 0;
    if (contentRoot) {
      scene.remove(contentRoot);
      contentRoot.traverse((obj) => {
        if (obj.isMesh) {
          obj.geometry?.dispose?.();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats) mat?.dispose?.();
        }
      });
      contentRoot = null;
    }
    controls.autoRotate = false;
    idleElapsed = 0;
  }

  function frameObject(object) {
    object.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z, 0.5);
    const dist = Math.max(maxDim * 1.8, 2.5);
    center.y += size.y * 0.05;

    camera.position.set(
      center.x + dist * 0.55,
      center.y + dist * 0.28,
      center.z + dist * 0.75,
    );
    controls.target.copy(center);
    controls.minDistance = Math.max(0.4, maxDim * 0.25);
    controls.maxDistance = Math.max(40, maxDim * 8);
    camera.near = Math.max(0.05, dist / 200);
    camera.far = Math.max(200, dist * 20);
    camera.updateProjectionMatrix();
    controls.update();

    if (sun) {
      sun.position.set(center.x + 12, center.y + 18, center.z + 10);
      sun.target.position.copy(center);
      sun.target.updateMatrixWorld();
    }
  }

  async function loadFbxRoot(url, name, placement = null) {
    const materials = await ensureAtlasMaterials();
    const loader = new FBXLoader(loadingManager);
    const root = await loader.loadAsync(assetUrl(url));
    root.name = name;
    prepareFbxRoot(root, { ...materials, castShadow: true });

    const wrapper = new THREE.Group();
    wrapper.name = `${name}_Showcase`;
    if (placement?.rotation) {
      wrapper.quaternion.set(
        placement.rotation.x,
        placement.rotation.y,
        placement.rotation.z,
        placement.rotation.w,
      );
    }
    if (placement?.scale) {
      wrapper.scale.set(placement.scale.x, placement.scale.y, placement.scale.z);
    }
    wrapper.add(root);

    const box = new THREE.Box3().setFromObject(root);
    if (!box.isEmpty()) {
      wrapper.position.y -= box.min.y;
    }

    return wrapper;
  }

  /**
   * @param {import('../config/sceneOptions.js').getSceneOptions extends Function ? never : any} option
   */
  async function previewOption(option) {
    if (!option || busy) return;
    busy = true;
    clearContent();
    try {
      if (option.isNpcPreview && option.modelKey) {
        const { root, fbx } = await loadNpcModel(option.modelKey, loadingManager);
        root.rotation.y = Math.PI;
        if (fbx?.animations?.length) {
          const mixer = new THREE.AnimationMixer(fbx);
          const clip = fbx.animations.find((a) => /idle/i.test(a.name)) ?? fbx.animations[0];
          if (clip) {
            const action = mixer.clipAction(clip);
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.play();
            mixers.push(mixer);
          }
        }
        contentRoot = root;
      } else if (option.isIntro || option.isTheBerg) {
        contentRoot = await loadFbxRoot(INTRO.bergFbx, option.label || 'Preview');
      } else if (option.placement) {
        contentRoot = await loadFbxRoot(option.placement.url, option.placement.name, option.placement);
      } else {
        busy = false;
        return;
      }

      scene.add(contentRoot);
      if (!sun) {
        const lights = createLights(scene, {
          target: { x: 0, y: 1, z: 0 },
          castShadow: true,
          sunDistance: 40,
        });
        sun = lights.sun;
      }
      frameObject(contentRoot);
      syncToonLightDirection(contentRoot, sun);
      resetAutoRotateIdle();
      renderer.render(scene, camera);
    } catch (err) {
      console.error('[showcase]', err);
      clearContent();
    } finally {
      busy = false;
    }
  }

  function update(dt) {
    for (const mixer of mixers) mixer.update(dt);
    if (!interacting && contentRoot) {
      idleElapsed += dt;
      controls.autoRotate = idleElapsed >= idleBeforeAutoRotate;
    }
    controls.update();
    if (contentRoot && sun) {
      syncToonLightDirection(contentRoot, sun);
    }
    renderer.render(scene, camera);
  }

  function resize(width, height) {
    if (width <= 0 || height <= 0) return;
    renderer.setPixelRatio(getPixelRatio());
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (contentRoot) frameObject(contentRoot);
  }

  function dispose() {
    clearContent();
    controls.dispose();
    renderer.dispose();
  }

  return { previewOption, update, resize, dispose, clearContent };
}
