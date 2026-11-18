# Progression (Necros / FM, 1995) - asm snippets worth reading

Honest preface: `PROG.EXE` is a **C program** (Watcom C 10.0, 32-bit flat, PMODE/W 1.16, no packing) whose own code is only `0x10000-0x11088`, about 4 KB; the rest
of the code object is the Watcom runtime and DSIK. There is no hand-tuned inner loop, no self-modifying code and no MMX/FPU. The compiler output is unoptimized
in places (see the stack-check call at the top of every function). So this document is short: it shows the few things that are actually instructive.

Addresses are linear addresses of the relocated image built by `tools/le.py` (code object at `0x10000`, stub object at `0x30000`). Listings come from
`_re/obj1.asm` (the project's disassembly of that object) and `ndisasm -b 32` over `_re/obj2.bin`; no instruction below was reconstructed from memory.

## 1. Programming an unchained 360x480 mode with 17 register writes (0x30000)

```
30000: mov ax,0x13  / int 0x10          ; BIOS mode 13h
3000a: mov dx,0x3c4 / mov ax,0x604 / out dx,ax   ; seq reg 4 <- 06: chain-4 off
30010: mov ax,0xf02 / out dx,ax                  ; map mask <- 0f : clear all 4 planes
30024: mov al,0xe7 / out 0x3c2,al                ; 480-line sync polarity / clock
30031: mov dx,0x3d4 / mov al,0x11 / out dx,al
       inc dx / in al,dx / and al,0x7f / out dx,al / dec dx   ; unlock CRTC regs 0-7
30040: mov ax,0x6b00 / out dx,ax                 ; ... one 16-bit `out` per register
       mov ax,0x5901 / ... 0x5a02 0x8e03 0x5e04 0x8a05 0x0d06 0x3e07 0x4009
       0xea10 0xac11 0xdf12 0x2d13 0x0014 0xe715 0x0616 0xe317
```

Each CRTC register is written with a single `out dx,ax` (index in `al`, value in `ah`, data port follows at `dx+1`): half the I/O instructions of the 8-bit way.
The numbers (`0x59` horizontal end, `0xdf` + overflow vertical end, `0x2d` offset) give 360x480 with 90 bytes per plane per line. That the standard mode-X
register list was copy-pasted from a well-known recipe is plausible but is not something the binary proves; only the values themselves are verified here.

## 2. The 4-plane flip: one pass per plane (0x10028)

```
1003f: mov cl,dl / and cl,3
10044: mov ax,0x102 / shl ah,cl          ; ah = 1 << plane
1004a: mov dx,0x3c4 / out dx,ax          ; map mask = this plane only
10050: xor eax,eax                       ; eax = byte index in the plane
10052: mov ebx,eax
10054: xor edx,edx
10056: mov dl,[esp]                      ; plane number
10059: mov dl,[edx+ebx*4+0x48b8c]        ; shadow[ i*4 + plane ]
10060: mov [eax+0xa0000],dl              ; VRAM[ i ]
10066: inc eax
10067: cmp eax,0xa8c0                    ; 43 200 bytes per plane = 360*480/4
1006c: jl 10052
```

The shadow buffer is linear (pixel `x + 360 y`), but in unchained VGA pixel `p` lives in plane `p & 3` at offset `p >> 2`. Because 360 is a multiple of 4, that
mapping is simply "plane `k` takes every 4th byte starting at `k`", so the whole flip is four sequential passes. The map-mask register is set once per plane
(`mov ax,0x102; shl ah,cl`: the classic way to build `0x0102 << plane` in the high byte), and the scaled-index addressing mode `[edx+ebx*4+disp32]` does the
stride-4 gather in the load itself. The cost is 43 200 x 4 byte moves per full flip, which is why the program never flips per frame: it flips only when the
progress bar, the ticker or the selection actually changed (`call 0x10028` at `0x10e05`, `0x10a42`).

## 3. Multiplying by 360 without a multiplier (0x10d5b, 0x10d74, 0x103a0, 0x10576)

Every pixel address `y*360 + x` is computed with shifts and subtractions. Here for the progress-bar clear, with `edx = y`:

```
10d5b: lea edx,[ecx+0x1a3]       ; y = row + 419
10d61: mov eax,edx
10d63: shl eax,2                 ; 4y
10d66: sub eax,edx               ; 3y
10d68: shl eax,3                 ; 24y
10d6b: mov edx,eax
10d6d: shl eax,4                 ; 384y
10d70: sub eax,edx               ; 384y - 24y = 360y
10d72: add eax,[esp]             ; + x
10d77: mov [eax+0x48bdb],dl      ; shadow[ ... ] (0x48b8c + 79 = 0x48bdb)
```

`360 = 24 x 15 = 24 x 16 - 24`, so `3y`, `<<3`, `<<4`, `-` is exactly three shifts and two subtractions. This is the Watcom code generator's strength reduction of a
constant multiply (the C source almost certainly just says `y * 360`). The same sequence
appears in the two text routines. Similarly `200 * order / numOrders` for the progress width (`0x10da0`...) is `((o<<2) - o) << 3` + `o`, then `<<3` = `25o << 3`,
followed by one `idiv`.

## 4. Bit-test glyph blitting with the mask table in the stack frame (0x1032e)

```
1034c: mov edi,esp
1034e: mov esi,0x10010                    ; 8-byte table 80 40 20 10 08 04 02 01
10353: movsd / movsd                      ; copy it to the stack in two instructions
...
1036a: mov bl,[edx+eax+0x4458c]           ; glyph row byte  (VGA.FNT + char*16 + row)
10373: mov al,[esp+ecx]                   ; mask for column ecx
10376: and ebx,eax
10378: cmp ebx,eax
1037a: jnz skip                           ; bit not set -> transparent
...    ; pixel offset = x + col + 6*i + 360*(y + row), colour stored with `mov [edi+eax+0x48b8c],bl`
```

Two small things: the 8 mask bytes are copied into a local array with a pair of `movsd` (the compiler's way to initialise a `static const` local), and the test is the
`and`/`cmp` pair ("`(b & m) == m`"), which is correct for single-bit masks. The three font routines (`0x1032e`, `0x103ce`, `0x104cb`) differ only in the mask table
(`0x10010` msb-first for VGA.FNT, `0x10018` / `0x10020` lsb-first for FONT*.FNT) and in the doubled row of the menu font. This is plain, correct, slow code: a byte of
the glyph is re-read for every column. The program has nothing to speed up (a few hundred glyph pixels per redraw), so nothing here was tuned.

## 5. The 70 Hz tick: 71 ticks to a "second" (0x105fe)

```
10608: push ecx / push edx
1060a: call 0x12174                       ; DSIK sound-library tick
1060f: mov edx,[0xa44f4] / inc edx / mov [0xa44f4],edx
1061c: cmp edx,0x46                       ; > 70 ?
1061f: jng 0x1062f
10621: xor ecx,ecx / mov [0xa44f4],ecx
10629: inc dword [0xa44f0]                ; "seconds"
```

`cmp edx,0x46 / jng` means the sub-counter takes the values 1..70 then wraps, so a "second" is **71 ticks** (the port reproduces this: `if (++tick70 > 70)`). With the PIT
divisor `0x4295` (17 045) the base rate is 1 193 182 / 17 045, about 70.0 Hz, so the UI "second" is about 1.014 s. The callback itself only counts: all drawing is
left to the main loop (section 6 of the effects write-up), which is the sane way to use a timer interrupt in DOS (no VGA writes with the interrupt flag in an
unknown state).

## 6. Palette upload (0x1088c)

```
108a8: mov eax,0x3c8 / call 0x110c7       ; outp(0x3c8, 0)  : DAC write index 0
108b4: mov dl,[ecx+ebx]
108b9: sar edx,2                          ; 8-bit -> 6-bit
108bc: mov eax,0x3c9 / call 0x110c7       ; outp(0x3c9, v>>2)
108c6: inc ebx / cmp ebx,0x300 / jl 108b4
```

`outp` is the Watcom library function called three hundred times (it is a real `call 0x110c7`, not an inline `out`), and the shift discards the two low bits of
the 8-bit palette stored in `GFX.DAT`. The port mirrors the loss on purpose (DAC value = `v >> 2`, then expanded to 8 bits for display).

## What is not here

No decompression (the EXE is not packed; PMODE/W stores the LE image uncompressed, so no Unicorn unpacking was needed: `tools/le.py` only parses and relocates it),
no self-modifying code, no table-driven effect, no FPU or MMX code in the program's own region. The sound engine (DSIK 2.05, Carlos Hasan) is a separate
library inside the same object and was **not** analysed for this write-up; the port replaces it with libopenmpt.
`0x107f1` builds sine tables that nothing uses (per `REVERSE.md`).
