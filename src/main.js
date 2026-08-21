import './styles.css';
import * as THREE from 'three';
import { buildPenguPlazaScene } from './scene/buildScene.js';
import { createExploreCamera } from './camera/exploreCamera.js';

const canvas = document.getElementById('c');
const loadingEl = document.getElementById('loading');
const loadingBar = document.getElementById('loading-bar');
const loadingStatus = document.getElementById('loading-status');

function setProgress(ratio, status) {
  loadingBar.style.width = `${Math.round(ratio * 100)}%`;
  if (status) loadingStatus.textContent = status;
}

const loadingManager = new THREE.LoadingManager();
loadingManager.onProgress = (_url, loaded, total) => {
  setProgress(total ? loaded / total : 0, `Loading assets… (${loaded}/${total})`);
};
loadingManager.onError = (url) => {
  console.error('Failed to load', url);
  loadingStatus.textContent = `Failed: ${url}`;
};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const { camera, controls, reset } = createExploreCamera(canvas);

let world = null;
const clock = new THREE.Clock();

async function init() {
  setProgress(0.05, 'Building Pengu Plaza…');
  world = await buildPenguPlazaScene({
    loadingManager,
    onProgress: (msg) => setProgress(0.4, msg),
  });
  setProgress(1, 'Ready');
  loadingEl.classList.add('hidden');

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      reset();
    }
  });

  animate();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  controls.update();
  world?.update(dt);
  renderer.render(world.scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

init().catch((err) => {
  console.error(err);
  loadingStatus.textContent = err?.message || String(err);
});
