// Contact sheet: tiles review stills into one PNG. node scripts/sheet.mjs <dir> <out.png> [cols]
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
const { default: sharp } = await import('../../node_modules/sharp/lib/index.js');
const [dir, out, colsArg] = process.argv.slice(2);
const files = readdirSync(dir).filter((f) => /^f\d+\.png$/.test(f)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
const cols = Number(colsArg ?? 5), w = 480, h = 270, rows = Math.ceil(files.length / cols);
const tiles = await Promise.all(files.map(async (f, i) => ({ input: await sharp(join(dir, f)).resize(w - 6, h - 6).toBuffer(), left: (i % cols) * w + 3, top: Math.floor(i / cols) * h + 3 })));
await sharp({ create: { width: cols * w, height: rows * h, channels: 3, background: '#000' } }).composite(tiles).png().toFile(out);
console.log(out, files.join(' '));
