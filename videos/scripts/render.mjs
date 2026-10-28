// Final render: bundles once, renders the Promo composition to out/promo/vN/trade-in-credit-promo.mp4.
// node scripts/render.mjs <version>
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';

const root = resolve(import.meta.dirname, '..');
const version = process.argv[2] ?? 'v1';
const out = join(root, 'out/promo', version);
mkdirSync(out, { recursive: true });
const serveUrl = await bundle({ entryPoint: join(root, 'src/index.ts'), publicDir: join(root, 'public') });
const composition = await selectComposition({ serveUrl, id: 'Promo' });
let last = -1;
await renderMedia({
  serveUrl, composition, codec: 'h264', crf: 16, pixelFormat: 'yuv420p', colorSpace: 'bt709', muted: true,
  outputLocation: join(out, 'trade-in-credit-promo.mp4'),
  onProgress: ({ progress }) => { const p = Math.floor(progress * 10); if (p !== last) { last = p; console.log(`${p * 10}%`); } },
});
// Poster from the closing lockup (frame 0 is the empty brand field).
await renderStill({ serveUrl, composition, frame: 2250, output: join(out, 'poster.png'), overwrite: true });
console.log('done', out);
