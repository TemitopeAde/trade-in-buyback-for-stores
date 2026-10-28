// Captures the promo film's UI plates: the real app components rendered by the App Market
// screenshot harness (app-market-listing/harness), one PNG per state at 2x, plus the CSS-pixel
// boxes of the elements the cursor clicks (public/plates/plates.json).
//
// Usage, from videos/: node scripts/plates.mjs [plate ...]   (add --no-build to reuse the harness build)

import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../..');
const out = join(here, '../public/plates');
const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 4799;
const base = `http://127.0.0.1:${port}/app-market-listing/harness/index.html`;

const form = 'scene=form&product=p-aero&step=condition';
// size = CSS viewport; frame = phone/panel width rendered in an iframe (no measuring there).
const plates = [
  { name: 'cta', query: 'scene=cta', size: [1020, 640], measure: ['Trade in', 'Add to cart'] },
  { name: 'cta-open', query: 'scene=cta&open=1', size: [1020, 760] },
  { name: 'form-none', query: `${form}&pick=none`, size: [1020, 1040], measure: ['Yes, fully working', 'Light wear'] },
  { name: 'form-works', query: `${form}&pick=works`, size: [1020, 1040], measure: ['Yes, fully working', 'Light wear'] },
  { name: 'form-all', query: `${form}&pick=all`, size: [1020, 1040], measure: ['Light wear', 'Estimated credit', 'Continue'] },
  { name: 'form-brand', query: `${form}&pick=all&theme=brand`, size: [1020, 1040] },
  { name: 'panel-light', query: 'scene=panel&theme=light', frame: [300, 760] },
  { name: 'panel-brand', query: 'scene=panel&theme=brand', frame: [300, 760] },
  { name: 'dash-detail', query: 'scene=dash&path=/requests/ti-24817', size: [1180, 1000], measure: ['Confirm value & issue credit', 'Estimate breakdown', 'Being inspected'] },
  { name: 'dash-credit', query: 'scene=dash&path=/requests/ti-24817&state=credit', size: [1180, 1000], measure: ['Credit issued', 'Gift card issued'] },
  { name: 'status-credit', query: 'scene=status&ti=demoAccessToken0123456789&state=credit&mobile', frame: [390, 844] },
  { name: 'dash-overview', query: 'scene=dash&path=/', size: [1180, 900], measure: ['$1,843.00', 'Credit issued'] },
];

const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith('--'));
if (!args.includes('--no-build')) {
  execFileSync(join(repo, 'node_modules/.bin/vite'), ['build', '--config', 'app-market-listing/harness/vite.config.mjs'], { cwd: repo, stdio: 'inherit' });
}
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '-d', join(repo, 'app-market-listing/harness/dist')], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const chromeArgs = (w, h) => ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-color-profile=srgb', `--window-size=${w},${h}`, '--force-device-scale-factor=2', '--virtual-time-budget=10000'];

mkdirSync(out, { recursive: true });
const metaPath = join(out, 'plates.json');
const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
try {
  const { default: sharp } = await import(join(repo, 'node_modules/sharp/lib/index.js'));
  for (const p of plates) {
    if (only.length && !only.includes(p.name)) continue;
    const file = join(out, p.name + '.png');
    const [w, h] = p.frame ? [Math.max(600, p.frame[0]), p.frame[1]] : p.size;
    const url = `${base}?${p.query}${p.frame ? `&frame=${p.frame[0]}x${p.frame[1]}` : ''}`;
    const shot = p.frame ? file + '.full.png' : file;
    execFileSync(chrome, [...chromeArgs(w, h), `--screenshot=${shot}`, url], { stdio: 'ignore' });
    if (p.frame) {
      await sharp(shot).extract({ left: 0, top: 0, width: p.frame[0] * 2, height: p.frame[1] * 2 }).toFile(file);
      rmSync(shot);
    }
    let rects = {};
    if (p.measure) {
      const dom = execFileSync(chrome, [...chromeArgs(w, h), '--dump-dom', `${url}&measure=${encodeURIComponent(p.measure.join('|'))}`], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
      const m = dom.match(/<pre id="rects" hidden="">([^<]*)<\/pre>/);
      rects = m ? JSON.parse(m[1].replaceAll('&amp;', '&').replaceAll('&quot;', '"')) : {};
      const missing = p.measure.filter((l) => !rects[l]);
      if (missing.length) console.warn(`  ${p.name}: not found: ${missing.join(', ')}`);
    }
    meta[p.name] = { size: p.frame ?? p.size, rects };
    console.log('plate', p.name, JSON.stringify(rects));
  }
} finally {
  server.kill();
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
}
