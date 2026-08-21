import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SCENE } from '../config/sceneConfig.js';

/**
 * Step-1 camera: FOV/near/far match PlayerCamera; OrbitControls for exploration
 * until the player follow camera is ported with gameplay.
 */
export function createExploreCamera(canvas) {
  const cfg = SCENE.camera;
  const camera = new THREE.PerspectiveCamera(
    cfg.fov,
    window.innerWidth / window.innerHeight,
    cfg.near,
    cfg.far,
  );

  const look = new THREE.Vector3(cfg.lookAt.x, cfg.lookAt.y, cfg.lookAt.z);
  const pitch = THREE.MathUtils.degToRad(cfg.orbitPitch);
  const yaw = THREE.MathUtils.degToRad(cfg.orbitYaw);
  const d = cfg.orbitDistance;

  camera.position.set(
    look.x + Math.sin(yaw) * Math.cos(pitch) * d,
    look.y + Math.sin(pitch) * d,
    look.z + Math.cos(yaw) * Math.cos(pitch) * d,
  );
  camera.lookAt(look);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(look);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(85);
  controls.minDistance = cfg.distance;
  controls.maxDistance = 180;
  controls.update();

  function reset() {
    controls.target.copy(look);
    camera.position.set(
      look.x + Math.sin(yaw) * Math.cos(pitch) * d,
      look.y + Math.sin(pitch) * d,
      look.z + Math.cos(yaw) * Math.cos(pitch) * d,
    );
    controls.update();
  }

  return { camera, controls, reset };
}
