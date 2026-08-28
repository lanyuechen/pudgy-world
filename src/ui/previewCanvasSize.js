/**
 * Keep in-panel preview canvases (showcase / anim) from stretching when the viewport resizes.
 * @param {{
 *   canvas: HTMLCanvasElement,
 *   renderer: import('three').WebGLRenderer,
 *   camera: import('three').PerspectiveCamera,
 *   getPixelRatio?: () => number,
 * }} ctx
 * @param {number} width CSS pixels
 * @param {number} height CSS pixels
 * @returns {boolean} true when drawing buffer or aspect changed
 */
export function applyPreviewCanvasSize(ctx, width, height) {
  if (width < 2 || height < 2) return false;

  const getPixelRatio = ctx.getPixelRatio ?? (() => Math.min(window.devicePixelRatio, 2));
  const pr = getPixelRatio();
  const needW = Math.max(1, Math.floor(width * pr));
  const needH = Math.max(1, Math.floor(height * pr));
  const aspect = width / height;

  if (
    ctx.canvas.width === needW &&
    ctx.canvas.height === needH &&
    Math.abs(ctx.camera.aspect - aspect) < 1e-6
  ) {
    return false;
  }

  ctx.renderer.setPixelRatio(pr);
  ctx.renderer.setSize(width, height, false);
  ctx.camera.aspect = aspect;
  ctx.camera.updateProjectionMatrix();
  return true;
}

/**
 * @param {{
 *   canvas: HTMLCanvasElement,
 *   renderer: import('three').WebGLRenderer,
 *   camera: import('three').PerspectiveCamera,
 *   getPixelRatio?: () => number,
 * }} ctx
 * @returns {boolean}
 */
export function syncPreviewCanvasSize(ctx) {
  const parent = ctx.canvas.parentElement;
  let w = 0;
  let h = 0;
  if (parent) {
    const rect = parent.getBoundingClientRect();
    w = Math.round(rect.width);
    h = Math.round(rect.height);
  }
  if (w < 2) w = Math.round(ctx.canvas.clientWidth);
  if (h < 2) h = Math.round(ctx.canvas.clientHeight);
  return applyPreviewCanvasSize(ctx, w, h);
}
