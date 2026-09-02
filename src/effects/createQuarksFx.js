import * as THREE from 'three';
import { BatchedRenderer, QuarksLoader, QuarksUtil } from 'three.quarks';
import { assetUrl } from '../config/assetUrl.js';

const EFFECT_URLS = {
  hit: assetUrl('assets/effects/Cartoon Bang.json'),
  death: assetUrl('assets/effects/Confetti Blast.json'),
};

async function loadTemplate(loader, url, name) {
  const template = await loader.loadAsync(url);
  template.visible = false;
  template.name = name;
  return template;
}

/**
 * Quarks VFX pool — shared BatchedRenderer, clone-on-play templates.
 */
export async function createQuarksFx(scene, loadingManager) {
  const batchedRenderer = new BatchedRenderer();
  batchedRenderer.name = 'QuarksFx';
  scene.add(batchedRenderer);

  const loader = new QuarksLoader(loadingManager);
  const [hitTemplate, deathTemplate] = await Promise.all([
    loadTemplate(loader, EFFECT_URLS.hit, 'CartoonBangTemplate'),
    loadTemplate(loader, EFFECT_URLS.death, 'ConfettiBlastTemplate'),
  ]);

  const _pos = new THREE.Vector3();

  function playTemplate(template, position) {
    _pos.copy(position);
    const instance = template.clone();
    instance.position.copy(_pos);
    instance.visible = true;
    scene.add(instance);
    QuarksUtil.addToBatchRenderer(instance, batchedRenderer);
    QuarksUtil.setAutoDestroy(instance, true);
    QuarksUtil.play(instance);
  }

  function playHitAt(position) {
    playTemplate(hitTemplate, position);
  }

  function playDeathAt(position) {
    playTemplate(deathTemplate, position);
  }

  function update(dt) {
    batchedRenderer.update(dt);
  }

  function dispose() {
    hitTemplate.removeFromParent();
    deathTemplate.removeFromParent();
    batchedRenderer.removeFromParent();
  }

  return { playHitAt, playDeathAt, update, dispose };
}
