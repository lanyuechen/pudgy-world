/**
 * Prefix public asset paths with Vite `base` (needed for GitHub Pages project sites).
 * Accepts `/assets/...` or `assets/...`.
 */
export function assetUrl(path) {
  const cleaned = String(path).replace(/^\//, '');
  return `${import.meta.env.BASE_URL}${cleaned}`;
}
