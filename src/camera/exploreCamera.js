import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SCENE } from '../config/sceneConfig.js';

/**
 * Explore camera with OrbitControls; view can be swapped per scene.
 */
export function createExploreCamera(canvas) {
  const cfg = SCENE.camera;
  const camera = new THREE.PerspectiveCamera(
    cfg.fov,
    window.innerWidth / window.innerHeight,
    cfg.near,
    cfg.far,
  );

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(85);

  let activeView = null;

  function applyView(view) {
    activeView = {
      lookAt: view.lookAt,
      orbitDistance: view.orbitDistance ?? cfg.orbitDistance,
      orbitPitch: view.orbitPitch ?? cfg.orbitPitch,
      orbitYaw: view.orbitYaw ?? cfg.orbitYaw,
      far: view.far ?? cfg.far,
      minDistance: view.minDistance ?? cfg.distance,
      maxDistance: view.maxDistance ?? 180,
    };

    camera.far = activeView.far;
    camera.near = cfg.near;
    camera.updateProjectionMatrix();

    controls.minDistance = activeView.minDistance;
    controls.maxDistance = activeView.maxDistance;
    reset();
  }

  function reset() {
    if (!activeView) return;
    const look = new THREE.Vector3(
      activeView.lookAt.x,
      activeView.lookAt.y,
      activeView.lookAt.z,
    );
    const pitch = THREE.MathUtils.degToRad(activeView.orbitPitch);
    const yaw = THREE.MathUtils.degToRad(activeView.orbitYaw);
    const d = activeView.orbitDistance;

    controls.target.copy(look);
    camera.position.set(
      look.x + Math.sin(yaw) * Math.cos(pitch) * d,
      look.y + Math.sin(pitch) * d,
      look.z + Math.cos(yaw) * Math.cos(pitch) * d,
    );
    controls.update();
  }

  applyView({
    lookAt: cfg.lookAt,
    orbitDistance: cfg.orbitDistance,
    orbitPitch: cfg.orbitPitch,
    orbitYaw: cfg.orbitYaw,
    far: cfg.far,
    minDistance: cfg.distance,
    maxDistance: 180,
  });

  return { camera, controls, applyView, reset };
}
