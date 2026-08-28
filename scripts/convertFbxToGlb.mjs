#!/usr/bin/env node
/**
 * Convert public/assets/models FBX files → sibling .glb with meshopt compression.
 *
 * Pipeline: assimp (FBX→GLB) → reorder + EXT_meshopt_compression (FILTER)
 * Requires: `assimp` on PATH (brew install assimp)
 *
 * Usage:
 *   npm run convert:glb
 *   npm run convert:glb -- --dir fish
 *   npm run convert:glb -- --force
 *   npm run convert:glb -- --concurrency 2
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, reorder } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import {
  MODEL_SPEC_VERSION,
  MODEL_PROFILE,
  profileFromAssetPath,
} from '../src/loaders/modelProfiles.js';
import {
  bakeCharacterGltfDocument,
  bakeEnvironmentGltfDocument,
  bakePropGltfDocument,
  sanitizeCharacterAnimations,
} from '../src/loaders/bakeModelSpec.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MODELS_ROOT = join(ROOT, 'public/assets/models');

const args = process.argv.slice(2);
function flag(name) {
  return args.includes(`--${name}`);
}
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const FORCE = flag('force');
const CONCURRENCY = Math.max(1, Number(opt('concurrency', '2')) || 2);
const DIR_FILTER = opt('dir', '');

const EMPTY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

class SoftIO extends NodeIO {
  async readURI(uri, responseType) {
    try {
      return await super.readURI(uri, responseType);
    } catch {
      return responseType === 'text' ? '' : EMPTY_PNG;
    }
  }
}

function listFbx(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) listFbx(p, out);
    else if (name.toLowerCase().endsWith('.fbx')) out.push(p);
  }
  return out;
}

function ensureAssimp() {
  const r = spawnSync('assimp', ['version'], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('assimp not found. Install with: brew install assimp');
    process.exit(1);
  }
}

async function createIo() {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  return new SoftIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });
}

/** meshopt FILTER-only: vertex reorder + filter compression, no KHR_mesh_quantization. */
function applyFilterMeshopt(doc) {
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
}

/**
 * Anim clip FBXs: strip textures + aggressive prune (only clips are used).
 * Everything else: keep skins/leaves, replace missing textures with 1×1.
 */
async function meshoptCompress(io, srcGlb, destGlb, { animationOnly, rel }) {
  const doc = await io.read(srcGlb);
  const profile = profileFromAssetPath(rel);

  if (profile === MODEL_PROFILE.CHARACTER && !animationOnly) {
    bakeCharacterGltfDocument(doc, rel);
  } else if (profile === MODEL_PROFILE.ENVIRONMENT) {
    bakeEnvironmentGltfDocument(doc);
  } else if (profile === MODEL_PROFILE.PROP) {
    bakePropGltfDocument(doc);
  } else if (animationOnly) {
    sanitizeCharacterAnimations(doc);
  }

  const asset = doc.getRoot().getAsset();
  asset.extras = {
    ...(asset.extras || {}),
    pudgyProfile: profile,
    pudgySpecVersion: MODEL_SPEC_VERSION,
  };

  const reorderMeshes = reorder({ encoder: MeshoptEncoder, target: 'size' });

  if (animationOnly) {
    for (const t of [...doc.getRoot().listTextures()]) t.dispose();
    await doc.transform(dedup(), prune(), reorderMeshes);
  } else {
    for (const t of doc.getRoot().listTextures()) {
      const img = t.getImage();
      if (!img || img.byteLength < 64) {
        t.setImage(EMPTY_PNG).setMimeType('image/png');
      }
    }
    await doc.transform(dedup(), prune({ keepAttributes: true, keepLeaves: true }), reorderMeshes);
  }

  applyFilterMeshopt(doc);

  mkdirSync(dirname(destGlb), { recursive: true });
  await io.write(destGlb, doc);
}

function assimpExport(fbxPath, glbPath) {
  mkdirSync(dirname(glbPath), { recursive: true });
  const r = spawnSync('assimp', ['export', fbxPath, glbPath], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.status !== 0 || !existsSync(glbPath)) {
    const msg = (r.stderr || r.stdout || 'assimp failed').trim();
    throw new Error(msg.slice(0, 500));
  }
}

async function convertOne(io, fbxPath, tmpRoot) {
  const rel = relative(MODELS_ROOT, fbxPath);

  const destGlb = join(MODELS_ROOT, rel.replace(/\.fbx$/i, '.glb'));
  const fbxStat = statSync(fbxPath);

  if (!FORCE && existsSync(destGlb)) {
    const glbStat = statSync(destGlb);
    if (glbStat.mtimeMs >= fbxStat.mtimeMs) {
      return { rel, status: 'skip', fbxBytes: fbxStat.size, glbBytes: glbStat.size };
    }
  }

  const tmpGlb = join(tmpRoot, rel.replace(/\.fbx$/i, '.glb'));
  mkdirSync(dirname(tmpGlb), { recursive: true });
  assimpExport(fbxPath, tmpGlb);

  const animationOnly = rel.split(/[/\\]/)[0] === 'animations';
  await meshoptCompress(io, tmpGlb, destGlb, { animationOnly, rel });

  const glbBytes = statSync(destGlb).size;
  return { rel, status: 'ok', fbxBytes: fbxStat.size, glbBytes };
}

async function mapPool(items, concurrency, worker) {
  let next = 0;
  const results = new Array(items.length);
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => run()));
  return results;
}

async function main() {
  ensureAssimp();
  const io = await createIo();

  let files = listFbx(MODELS_ROOT);
  if (DIR_FILTER) {
    const prefix = join(MODELS_ROOT, DIR_FILTER);
    files = files.filter((f) => f.startsWith(prefix));
  }
  files.sort();

  console.log(
    `Converting ${files.length} FBX → GLB+meshopt (concurrency=${CONCURRENCY}${FORCE ? ', force' : ''})`,
  );

  const tmpRoot = mkdtempSync(join(tmpdir(), 'pudgy-glb-'));
  let ok = 0;
  let skip = 0;
  let fail = 0;
  let fbxTotal = 0;
  let glbTotal = 0;

  try {
    await mapPool(files, CONCURRENCY, async (fbxPath, index) => {
      const label = relative(MODELS_ROOT, fbxPath);
      try {
        const result = await convertOne(io, fbxPath, tmpRoot);
        fbxTotal += result.fbxBytes ?? 0;
        glbTotal += result.glbBytes ?? 0;
        if (result.status === 'skip') {
          skip += 1;
          if ((index + 1) % 50 === 0) {
            console.log(`[${index + 1}/${files.length}] …`);
          }
        } else {
          ok += 1;
          const ratio = result.fbxBytes ? ((result.glbBytes / result.fbxBytes) * 100).toFixed(0) : '?';
          console.log(
            `[${index + 1}/${files.length}] ${label}  ${(result.fbxBytes / 1e6).toFixed(2)}MB → ${(result.glbBytes / 1e6).toFixed(2)}MB (${ratio}%)`,
          );
        }
        return result;
      } catch (err) {
        fail += 1;
        console.error(`[${index + 1}/${files.length}] FAIL ${label}:`, err.message || err);
        return { rel: label, status: 'fail' };
      }
    });
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }

  const summary = {
    ok,
    skip,
    fail,
    fbxMB: +(fbxTotal / 1e6).toFixed(1),
    glbMB: +(glbTotal / 1e6).toFixed(1),
  };
  console.log('\nDone:', summary);
  writeFileSync(join(ROOT, 'scripts/.last-glb-convert.json'), JSON.stringify(summary, null, 2));
  if (fail) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
