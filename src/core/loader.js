/** Image + manifest loading with progress reporting. */

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
 * Resolves to a plain `src -> HTMLImageElement` map.
 */
export async function preload(srcs, onProgress) {
  const unique = [...new Set(srcs)];
  const out = {};
  let done = 0;
  await Promise.all(
    unique.map(async (src) => {
      out[src] = await loadImage(src);
      done += 1;
      onProgress?.(done / unique.length, src);
    })
  );
  return out;
}

export async function loadManifest(url = '/assets/manifest.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`manifest ${res.status} ${res.statusText} — is the dev server running from the repo root?`);
  return res.json();
}

/**
 * Rewrites a blue-palette asset path onto another palette.
 * `/assets/units/blue/warrior/warrior-idle.png` -> `/assets/units/red/...`
 */
export function repalette(path, palette) {
  return path.replace('/assets/units/blue/', `/assets/units/${palette}/`);
}
