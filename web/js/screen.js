// 360x480 unchained-VGA ("mode X") screen of PROG.EXE, re-implemented from the disassembly.
// Every routine below mirrors a function of the original (address in comments).
// Pure functions on an 8-bit palettised buffer: runs in the browser and in node.
export const W = 360, H = 480;
const MASK = [0x80, 0x40, 0x20, 0x10, 8, 4, 2, 1];           // 0x10010 table (VGA.FNT: msb first)
const MASK_LSB = [1, 2, 4, 8, 0x10, 0x20, 0x40, 0x80];       // 0x10018/0x10020 tables (FONT*.FNT: lsb first)
const MENU_X = 25, MENU_Y = 160, MENU_DY = 40;                // 0x10985: menu entries
const INFO_X = 148, INFO_Y = 154, INFO_RECT = [148, 340, 154, 380]; // right text panel (bg restored from here)

// GFX.DAT = "mhwanh" header, 768-byte RGB palette (8-bit), 360x480 raw pixels  (0x108d3)
export function loadGfx(dat) {
  return { pal: dat.subarray(32, 32 + 768), bg: dat.subarray(32 + 768, 32 + 768 + W * H) };
}
// FONT*.FNT: 4-byte header [first char, ?, height, ?] then per glyph: height bitmap rows + 1 width byte (0x101c5)
export function loadFnt(f) {
  const first = f[0], h = f[2], rows = new Uint8Array(256 * 16), wid = new Uint8Array(256);
  const rec = h + 1;
  for (let c = first, o = 4; o + rec <= f.length && c < 256; c++, o += rec) { rows.set(f.subarray(o, o + h), c * 16); wid[c] = f[o + h]; }
  return { h, rows, wid };
}
// 0x104cb: proportional font drawn with every pixel doubled vertically (the screen is 480 lines for a 240-line look)
export function textFnt(buf, font, s, x, y, col) {
  let ofs = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    if (ch === 32) { ofs += 6; continue; }
    if (!ch) continue;
    const w = font.wid[ch];
    for (let r = 0; r < font.h; r++) {
      const b = font.rows[ch * 16 + r];
      for (let c = 0; c < w; c++) if (b & MASK_LSB[c & 7]) { const p = (y + 2 * r) * W + x + ofs + c; buf[p] = col; buf[p + W] = col; }
    }
    ofs += w;
  }
}
// 0x1032e: fixed 8x16 VGA.FNT glyphs on a 6-pixel pitch (the shipped VGA.FNT is a narrow 5-wide face)
export function textVga(buf, vga, s, x, y, col) {
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    for (let c = 0; c < 8; c++) for (let r = 0; r < 16; r++) if (vga[ch * 16 + r] & MASK[c]) buf[(y + r) * W + x + c + 6 * i] = col;
  }
}

export class Screen {
  constructor(assets, strings) {
    this.g = loadGfx(assets.gfx); this.font = loadFnt(assets.font2); this.vga = assets.vga; this.str = strings;
    this.buf = new Uint8Array(W * H); this.sel = 0; this.cnt = 0; this.tick70 = 0; this.tick = 0; this.msg = 0;
    this.pos = 0; this.len = 1;
    this.draw();
  }
  restore(x0, x1, y0, y1) { for (let y = y0; y < y1; y++) this.buf.set(this.g.bg.subarray(y * W + x0, y * W + x1), y * W + x0); }
  item(i, col) { textFnt(this.buf, this.font, this.str.menu[i], MENU_X, MENU_Y + MENU_DY * i, col); }
  info(i) {
    this.restore(INFO_RECT[0], INFO_RECT[1], INFO_RECT[2], INFO_RECT[3]);
    this.str.info[i].forEach((l, n) => textVga(this.buf, this.vga, l, INFO_X, INFO_Y + 16 * n, 0x80 + n));
  }
  draw() {                                   // 0x10985
    this.buf.set(this.g.bg);
    for (let i = 0; i < 6; i++) this.item(i, 9);
    this.item(0, 15); this.info(0);
  }
  select(i) {                                // key handlers 0x10a66: old entry -> colour 9, new -> 15, panel text redrawn
    this.item(this.sel, 9); this.sel = i; this.item(i, 15); this.info(i);
  }
  progress(pos, len) {                       // 0x10d3b: 200-px bar at x=80, y=420..425 (cleared 79..279 x 419..426)
    for (let y = 0x1a3; y < 0x1ab; y++) this.buf.fill(0, y * W + 0x4f, y * W + 0x4f + 0xca);
    const w = Math.floor(200 * pos / len);
    for (let y = 0x1a4; y < 0x1aa; y++) this.buf.fill(9, y * W + 0x50, y * W + 0x50 + w);
  }
  ticker() {                                 // 0x10e25: every 25th "second", 43-char scroller line centred at y=450
    this.restore(0, W, 450, 466);
    const s = this.str.ticker[this.msg];
    textVga(this.buf, this.vga, s, 180 - 3 * s.length, 450, 11);
    this.msg = (this.msg + 1) % 30;
  }
  // Called at the original's 70 Hz timer rate; mirrors the callback 0x105fe + idle loop.
  timer70() {
    if (++this.tick70 > 70) { this.tick70 = 0; this.cnt++; }
    let dirty = false;
    if (this.cnt % 6 === 0) { this.progress(this.pos, this.len); this.cnt++; dirty = true; }
    if (this.cnt % 25 === 0) { this.ticker(); this.cnt++; dirty = true; }
    return dirty;
  }
}
