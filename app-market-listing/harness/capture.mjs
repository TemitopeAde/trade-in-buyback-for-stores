// Captures the real app components from the harness build into raw/ (2x pixel density).
//
// Usage, from the repo root:
//   node_modules/.bin/vite build --config app-market-listing/harness/vite.config.mjs
//   python3 -m http.server 4799 --bind 127.0.0.1 -d app-market-listing/harness/dist   (separate shell)
//   node app-market-listing/harness/capture.mjs [shot-name ...]

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import sharp from 'sharp';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const base = process.env.HARNESS_URL ?? 'http://127.0.0.1:4799/app-market-listing/harness/index.html';

// size = CSS viewport; frame = render in an iframe of that size and crop to it. PNGs are 2x.
export const shots = [
  { name: 'form', query: 'scene=form&product=p-aero&step=condition', size: [1020, 1040] },
  { name: 'cta', query: 'scene=cta', size: [1020, 640] },
  { name: 'cta-open', query: 'scene=cta&open=1', size: [1020, 760] },
  { name: 'status-mobile', query: 'scene=status&ti=demoAccessToken0123456789&mobile', frame: [390, 844] },
  { name: 'form-mobile', query: 'scene=form&product=p-aero&step=condition&mobile&scroll=560', frame: [390, 844] },
  { name: 'dash-overview', query: 'scene=dash&path=/', size: [1180, 900] },
  { name: 'dash-requests', query: 'scene=dash&path=/requests', size: [1180, 900] },
  { name: 'dash-detail', query: 'scene=dash&path=/requests/ti-24817', size: [1180, 1000] },
  { name: 'panel', query: 'scene=panel&theme=brand', frame: [300, 760] },
  { name: 'form-brand', query: 'scene=form&product=p-aero&step=condition&theme=brand', size: [1020, 1040] },
];

const only = process.argv.slice(2);
mkdirSync(join(here, 'raw'), { recursive: true });
for (const s of shots) {
  if (only.length && !only.includes(s.name)) continue;
  const out = join(here, 'raw', s.name + '.png');
  const [w, h] = s.frame ? [Math.max(600, s.frame[0]), s.frame[1]] : s.size;
  const shot = s.frame ? out + '.full.png' : out;
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-color-profile=srgb',
    `--window-size=${w},${h}`, '--force-device-scale-factor=2', '--virtual-time-budget=10000',
    `--screenshot=${shot}`, `${base}?${s.query}${s.frame ? `&frame=${s.frame[0]}x${s.frame[1]}` : ''}`,
  ], { stdio: 'ignore' });
  if (s.frame) {
    await sharp(shot).extract({ left: 0, top: 0, width: s.frame[0] * 2, height: s.frame[1] * 2 }).toFile(out);
    rmSync(shot);
  }
  console.log('captured', s.name);
}
