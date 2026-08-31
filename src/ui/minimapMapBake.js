import * as THREE from 'three';

/**
 * Render a top-down orthographic preview of island geometry for the minimap.
 * @returns {Promise<{ canvas: HTMLCanvasElement, bounds: { minX: number, maxX: number, minZ: number, maxZ: number } } | null>}
 */
export async function bakeTopDownMap(mapRoot, bakeSize = 512) {
  if (!mapRoot) return null;

  mapRoot.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(mapRoot);
  if (box.isEmpty()) return null;

  box.expandByScalar(0.04);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z, 8);
  const pad = span * 0.05;
  const half = span * 0.5 + pad;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(bakeSize, bakeSize, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const clone = mapRoot.clone(true);
  clone.traverse((obj) => {
    if (obj.userData?.isEnemy) obj.visible = false;
    if (obj.name?.includes('Sky') || obj.userData?.isSky) obj.visible = false;
  });
  scene.add(clone);

  const hemi = new THREE.HemisphereLight(0xd8f4ff, 0x284860, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 0.75);
  sun.position.set(0.2, 1, 0.15);
  scene.add(sun);

  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 600);
  camera.position.set(center.x, box.max.y + Math.max(60, size.y + 30), center.z);
  camera.up.set(0, 0, -1);
  camera.lookAt(center.x, center.y, center.z);
  camera.updateMatrixWorld();

  renderer.render(scene, camera);

  const canvas = document.createElement('canvas');
  canvas.width = bakeSize;
  canvas.height = bakeSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    renderer.dispose();
    return null;
  }
  ctx.clearRect(0, 0, bakeSize, bakeSize);
  ctx.drawImage(renderer.domElement, 0, 0, bakeSize, bakeSize);

  clone.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.geometry?.dispose?.();
  });
  renderer.dispose();

  return {
    canvas,
    bounds: {
      minX: center.x - half,
      maxX: center.x + half,
      minZ: center.z - half,
      maxZ: center.z + half,
    },
  };
}
