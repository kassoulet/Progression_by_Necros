# Progression by Necros / FM (1995) - JavaScript port

Browser port of the MS-DOS music disk `PROG.EXE`: the 360x480 screen is rebuilt from the disassembly (pixel-identical to the original draw routines), shown at 4:3, with pause and order seek. Audio uses libopenmpt (ModPlug engine) via chiptune3.

- Run: `python3 -m http.server --directory web 8000`
- Optional "CRT" checkbox / key `C` (display only): scanline + faint vignette CSS overlay, one band per source row (480), sized to a whole number of device pixels per row to avoid moire; needs >= 2 device px per row (window big enough), otherwise greyed out. Choice stored in localStorage.
- Reverse notes: [REVERSE.md](REVERSE.md); tools in `tools/`
- Original files (`PROG.EXE`, `*.S3M`, `GFX.DAT`, fonts) are kept for preservation; the music and program are (C) 1995 Necros / FM.
