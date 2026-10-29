// compares web/js/screen.js against the emulated original (tools/verify_screen.py)
import fs from 'node:fs'; import { Screen, textVga, W, H } from '../web/js/screen.js';
const A = n => new Uint8Array(fs.readFileSync(new URL('../' + n, import.meta.url)));
const sc = new Screen({ gfx: A('GFX.DAT'), font2: A('FONT2.FNT'), vga: A('VGA.FNT') }, JSON.parse(fs.readFileSync(new URL('../web/assets/strings.json', import.meta.url))));
const ref = new Uint8Array(fs.readFileSync(process.argv[2])), n = W * H;
const diff = (a, b) => { let d = 0; for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++; return d; };
console.log('initial screen: differing pixels =', diff(sc.buf, ref.subarray(0, n)));
textVga(sc.buf, sc.vga, 'f i v e   m u s i c i a n s  1 9 9 5', 51, 450, 11);
console.log('after VGA text: differing pixels =', diff(sc.buf, ref.subarray(n)));
