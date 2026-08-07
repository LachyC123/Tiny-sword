/**
 * Image + manifest loading with progress reporting.
 *
 * Manifest paths are repo-root-relative ("assets/units/…") and get resolved
 * against a base URL at load time, so the game runs unchanged from a domain
 * root, a subdirectory (GitHub Pages serves it at /<repo>/), or file://.
 * The returned image map stays keyed by the *manifest* path so every lookup
 * elsewhere can use the string the manifest gave it.
 */

const cache = new Map();

export function loadImage(src) {
  if (cache.has(src)) return cache.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
  cache.set(src, p);
  return p;
}

/**
 * Loads every image referenced by `srcs`, reporting progress as it goes.
 * Resolves to a `manifestPath -> HTMLImageElement` map.
 */
export async function preload(srcs, { base, onProgress } = {}) {
  const unique = [...new Set(srcs)];
  const out = {};
  let done = 0;
  await Promise.all(
    unique.map(async (src) => {
      out[src] = await loadImage(new URL(src, base).href);
      done += 1;
      onProgress?.(done / unique.length, src);
    })
  );
  return out;
}

export async function loadManifest(base) {
  const url = new URL('assets/manifest.json', base).href;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `manifest ${res.status} at ${url} — run tools/build_manifest.py and serve from the repo root`
    );
  }
  return res.json();
}

/**
 * Rewrites a blue-palette asset path onto another palette.
 * `/assets/units/blue/warrior/warrior-idle.png` -> `/assets/units/red/...`
 */
export function repalette(path, palette) {
  return path.replace('/assets/units/blue/', `/assets/units/${palette}/`);
}
