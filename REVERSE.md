# PROG.EXE (Progression, Necros/FM 1995) - reverse notes

Run the port: `python3 -m http.server --directory web 8000` -> http://localhost:8000/

## Executable
- MZ stub + **PMODE/W 1.16** DOS extender, with an uncompressed **LE** image at file offset 0x2410 (data pages at 0x6200). Built with Watcom C 10.0, DSIK 2.05 (Carlos Hasan) sound library.
- 3 objects: code 0x10000 (app code = 0x10000-0x11088, the rest is Watcom/DSIK libs), a 0xA7-byte stub at 0x30000 (mode set), data/bss at 0x40000. `tools/le.py` loads and relocates it.
- Video: `0x30000` does `int 10h` mode 13h, unchains (SEQ 604h) and reprograms the CRTC for **360x480, 256 colours, 90 bytes/row, 4 planes** (misc 0xE7 = 480-line timing -> 4:3 monitor, so pixels are ~1.78x wider than tall).
- All drawing goes to a 360x480 shadow buffer (0x48b8c); `0x10028` copies it plane by plane (map mask 0x3C5) to VRAM.
- Palette: GFX.DAT holds an 8-bit RGB palette; the EXE writes `v>>2` to the DAC (`0x1088c`). The fade routines (0x10080/0x10124) are dead code.
- UI timer: PIT divisor 0x4295 -> 70 Hz. Callback `0x105fe` counts 71 ticks -> `seconds++`. The idle loop redraws the **progress bar when the counter is a multiple of 6** and the **ticker when it is a multiple of 25** (each draw also bumps the counter).
- Keys: Up/Down change song (and start it), Left/Right = previous/next **order** (`[player+0x60a]`), Esc quits. When a song ends the next one starts; the last one just stops.
- `0x107f1` builds sine tables that nothing uses.

## Data
| file | format |
|---|---|
| GFX.DAT | `mhwanh` 32-byte header, 768-byte palette, 360x480 raw indices (back-drop + two panels) |
| VGA.FNT | 256 x 16 bytes, **narrow 5-px face**, drawn on a 6-px pitch (`0x1032e`), msb-first |
| FONT2.FNT / FONT.FNT | 4-byte header `[first, ?, height, ?]`, then per glyph `height` rows + 1 width byte, lsb-first. FONT2 (h=10) is the menu font, drawn with every row doubled (`0x104cb`); FONT.FNT is loaded but unused |
| *.S3M | ScreamTracker 3 modules, played by DSIK |

Strings (menu, 6x13 info lines, 30 ticker messages) are in the data object: `tools/extract_strings.py`.

## Verification
`tools/verify_screen.py` runs the EXE's own `0x10985` (screen draw) and `0x1032e` (VGA text) under unicorn; `tools/verify_screen.mjs` shows `web/js/screen.js` is **pixel-identical** (0 differing pixels).

## Port
- `web/js/screen.js`: renderer (functions annotated with the original addresses). `web/js/app.js`: UI, 70 Hz timer, keys, pause and order seek.
- Audio: **chiptune3 / libopenmpt** (`web/vendor`, the maintained descendant of the ModPlug engine) with cubic-spline interpolation (`interpolationFilter: 4`, libmodplug's "spline"); `8` = windowed sinc.
