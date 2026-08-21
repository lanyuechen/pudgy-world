import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { SCENE } from '../config/sceneConfig.js';

function isBillboard(name = '') {
  return name.toLowerCase().includes('billboard');
}

/**
 * Load Individual_PenguPlaza_02.fbx and apply TheBerg / Billboard atlases.
 * Unity imports this FBX with useFileScale (cm → m), so we scale by 0.01.
 *
 * Texture flipY must stay true (TextureLoader default): FBX/Unity UVs use
 * V=0 at the bottom of the image. TheBerg atlas has empty black at the
 * bottom — flipY:false made most meshes sample that black region.
 */
export async function loadPenguPlaza(loadingManager) {
  const textureLoader = new THREE.TextureLoader(loadingManager);
  const fbxLoader = new FBXLoader(loadingManager);

  const [bergMap, billboardMap, root] = await Promise.all([
    textureLoader.loadAsync(SCENE.assets.bergAtlas),
    textureLoader.loadAsync(SCENE.assets.billboardAtlas),
    fbxLoader.loadAsync(SCENE.assets.plazaFbx),
  ]);

  for (const map of [bergMap, billboardMap]) {
    map.colorSpace = THREE.SRGBColorSpace;
    map.flipY = true;
    map.anisotropy = 8;
    map.needsUpdate = true;
  }

  // Lambert keeps atlas colors readable; MeshToon without a gradientMap
  // crushes unlit faces to near-black under sparse lighting.
  const bergMaterial = new THREE.MeshLambertMaterial({
    map: bergMap,
    color: 0xffffff,
  });

  const billboardMaterial = new THREE.MeshLambertMaterial({
    map: billboardMap,
    color: 0xffffff,
    transparent: true,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  root.name = 'Individual_PenguPlaza_02';
  root.scale.setScalar(0.01);

  root.traverse((child) => {
    if (!child.isMesh) return;

    child.castShadow = true;
    child.receiveShadow = true;

    const matList = Array.isArray(child.material) ? child.material : [child.material];
    const useBillboard =
      isBillboard(child.name) || matList.some((m) => isBillboard(m?.name));

    child.material = useBillboard ? billboardMaterial.clone() : bergMaterial.clone();

    const geo = child.geometry;
    if (geo && !geo.attributes.uv && geo.attributes.uv1) {
      geo.setAttribute('uv', geo.attributes.uv1);
    }
  });

  return root;
}
