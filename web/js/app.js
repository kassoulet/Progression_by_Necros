import { Screen, W, H } from './screen.js';
import { ChiptuneJsPlayer } from '../vendor/chiptune3.js';

const $ = id => document.getElementById(id);
const get = async u => new Uint8Array(await (await fetch(u)).arrayBuffer());
const [gfx, font2, vga, strings] = await Promise.all([get('assets/GFX.DAT'), get('assets/FONT2.FNT'), get('assets/VGA.FNT'),
  fetch('assets/strings.json').then(r => r.json())]);
const sc = new Screen({ gfx, font2, vga }, strings);

// palette: the EXE writes (v >> 2) to the 6-bit DAC; expand back to 8 bits like a monitor would
const cv = $('scr'), ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), pal = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  const c = k => { const v = sc.g.pal[i * 3 + k] >> 2; return (v << 2) | (v >> 4); };
  pal[i] = 0xff000000 | (c(2) << 16) | (c(1) << 8) | c(0);
}
const px = new Uint32Array(img.data.buffer);
const paint = () => { for (let i = 0; i < W * H; i++) px[i] = pal[sc.buf[i]]; ctx.putImageData(img, 0, 0); };
paint();

let player = null, song = 0, orders = 1, order = 0, paused = false, ended = false, dragging = false, stopped = false;
const seek = $('seek'), label = $('time');
const ui = () => { seek.max = Math.max(0, orders - 1); if (!dragging) seek.value = order; label.textContent = `${order + 1}/${orders}`; };

function load(i) {
  song = Math.max(0, Math.min(5, i)); ended = false; stopped = false; paused = false; order = 0; $('pp').innerHTML = '&#10074;&#10074;';
  sc.select(song); paint();
  player.load('assets/' + strings.files[song]);
}
function next() { if (song < 5) load(song + 1); }          // end of song: advance, last song just stops (0x10eae)
function goOrder(o) {
  if (o >= orders) return next();                          // seeking past the last order ends the song, like the original
  order = Math.max(0, o); player.setOrderRow(order, 0); sc.pos = order; ui();
}
function togglePause() { if (stopped) return load(song); player.togglePause(); paused = !paused; $('pp').innerHTML = paused ? '&#9654;' : '&#10074;&#10074;'; }
function stop() { player.stop(); stopped = true; paused = true; $('pp').innerHTML = '&#9654;'; }

$('start').onclick = () => {
  $('start').remove();
  player = new ChiptuneJsPlayer({ repeatCount: 0, stereoSeparation: 100, interpolationFilter: 4 });   // 4 = cubic spline (libmodplug "spline")
  player.onMetadata(m => { orders = m.song?.orders?.length || 1; sc.len = orders; ui(); });
  player.onProgress(p => { order = p.order; sc.pos = order; ui(); });
  player.onEnded(() => { if (!ended) { ended = true; next(); } });
  player.onInitialized(() => load(0));
};
$('pp').onclick = () => player && togglePause();
$('prev').onclick = () => player && song > 0 && load(song - 1);
$('next').onclick = () => player && next();
seek.oninput = () => { dragging = true; label.textContent = `${+seek.value + 1}/${orders}`; };
seek.onchange = () => { dragging = false; player && goOrder(+seek.value); };
addEventListener('keydown', e => {
  if (!player) return;
  const k = { ArrowUp: () => song > 0 && load(song - 1), ArrowDown: next, ArrowLeft: () => goOrder(order - 1), ArrowRight: () => goOrder(order + 1),
    ' ': togglePause, Escape: stop }[e.key];
  if (k) { e.preventDefault(); k(); }
});
cv.addEventListener('pointerdown', e => {                  // click on a menu entry (x 20..130, 40-px pitch from y=160 in screen pixels)
  const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
  if (player && x > 20 && x < 135 && y >= 156 && y < 396) load(Math.floor((y - 156) / 40));
});

// CRT scanlines (display only): stage height = k*H device px so each source row is exactly k device px, overlay period = k device px
const crtc = $('crtc'), stage = $('stage');
try { crtc.checked = localStorage.crt === '1'; } catch {}
function layoutCrt() {
  const dpr = devicePixelRatio, availH = Math.min(innerHeight - 150, (innerWidth - 32) * 3 / 4) * dpr;   // 150 css px ~ title + bar
  const k = Math.floor(availH / H), ok = k >= 2, on = crtc.checked && ok;
  $('crtl').classList.toggle('off', !ok);
  $('crtl').title = ok ? 'CRT scanlines (C)' : 'Window too small for CRT scanlines (needs 2+ device pixels per source row)';
  document.body.classList.toggle('crt', on);
  if (on) {
    stage.style.height = k * H / dpr + 'px'; stage.style.width = k * H * 4 / 3 / dpr + 'px';
    stage.style.setProperty('--p', k / dpr + 'px');
  } else { stage.style.height = stage.style.width = ''; }
}
const setCrt = v => { crtc.checked = v; try { localStorage.crt = v ? '1' : '0'; } catch {} layoutCrt(); };
crtc.onchange = () => setCrt(crtc.checked);
addEventListener('resize', layoutCrt); document.addEventListener('fullscreenchange', layoutCrt);
addEventListener('keydown', e => { if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey) setCrt(!crtc.checked); });
layoutCrt();

// The original ran its UI off a 70 Hz timer (PIT divisor 0x4295 = 17045 -> 1193182/17045 = 70.0 Hz)
let acc = 0, last = performance.now();
(function frame(t) {
  acc += t - last; last = t;
  let dirty = false;
  while (acc >= 1000 / 70) { acc -= 1000 / 70; if (player && !paused) dirty = sc.timer70() || dirty; }
  paint(); requestAnimationFrame(frame);
})(last);
if (location.hash === '#auto') $('start').click();   // test hook (headless runs)
