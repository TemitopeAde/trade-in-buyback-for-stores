// Renders the listing images from the HTML sources with headless Chrome, then normalises
// them with sharp (exact size, sRGB, no alpha channel) into ../images. Widget Add Panel
// thumbnails (`dir: publicDir`) go to the app's public/ folder, served at {{BASE_URL}}.
//
// Usage (from the repo root):  node app-market-listing/source/render.mjs
// Override the browser with CHROME_PATH=/path/to/chrome if Chrome isn't in /Applications.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'images');
const publicDir = join(here, '..', '..', 'public');
const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BRAND = '#0f5f4f';

// viewport = CSS size of the page; out = final pixel size written to images/.
const jobs = [
  { src: 'icon.html', out: 'app-icon.png', viewport: [1000, 1000], scale: 1, size: [1000, 1000] },
  { src: '01-main.html', out: '01-main.png', viewport: [1200, 900], scale: 2, size: [2400, 1800] },
  { src: '02-trade-in-form.html', out: '02-trade-in-form.png', viewport: [1200, 900], scale: 2, size: [2400, 1800] },
  { src: '03-product-button.html', out: '03-product-button.png', viewport: [1200, 900], scale: 2, size: [2400, 1800] },
  { src: '04-dashboard.html', out: '04-dashboard.png', viewport: [1200, 900], scale: 2, size: [2400, 1800] },
  { src: '05-design-settings.html', out: '05-design-settings.png', viewport: [1200, 900], scale: 2, size: [2400, 1800] },
  { src: '06-mobile.html', out: '06-mobile.png', viewport: [1200, 900], scale: 2, size: [2400, 1800] },
  { src: 'banner.html', out: 'promo-banner.jpg', viewport: [540, 360], scale: 2, size: [540, 360] },
  { src: 'thumb-trade-in-form.html', out: 'trade-in-form-thumbnail.png', viewport: [600, 360], scale: 1, size: [600, 360], dir: publicDir },
  { src: 'thumb-trade-in-status.html', out: 'trade-in-status-thumbnail.png', viewport: [600, 360], scale: 1, size: [600, 360], dir: publicDir },
  { src: 'thumb-my-trade-ins.html', out: 'my-trade-ins-thumbnail.png', viewport: [600, 360], scale: 1, size: [600, 360], dir: publicDir },
];

const only = process.argv.slice(2);
const tmp = mkdtempSync(join(tmpdir(), 'listing-'));

try {
  for (const job of jobs) {
    if (only.length && !only.includes(job.src)) continue;
    const raw = join(tmp, job.out + '.raw.png');
    execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      `--window-size=${job.viewport[0]},${job.viewport[1]}`,
      `--force-device-scale-factor=${job.scale}`,
      '--virtual-time-budget=5000',
      `--screenshot=${raw}`,
      pathToFileURL(join(here, job.src)).href,
    ], { stdio: 'ignore' });

    let img = sharp(raw)
      .resize(job.size[0], job.size[1], { fit: 'cover', position: 'top', kernel: 'lanczos3' })
      .flatten({ background: BRAND })
      .removeAlpha()
      .toColorspace('srgb');
    img = job.out.endsWith('.jpg') ? img.jpeg({ quality: 92, mozjpeg: true }) : img.png({ compressionLevel: 9 });
    await img.toFile(join(job.dir ?? outDir, job.out));
    console.log('wrote', job.out);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
