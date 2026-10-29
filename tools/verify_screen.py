"""Run PROG.EXE's own draw routines under unicorn and dump the 360x480 shadow buffer.
Usage: python3 tools/verify_screen.py out.bin   (then: node tools/verify_screen.mjs out.bin)"""
import sys, struct
from unicorn import *
from unicorn.x86_const import *
sys.path.insert(0, 'tools'); import le
objs, eip, _ = le.load('PROG.EXE')
mu = Uc(UC_ARCH_X86, UC_MODE_32)
for o in objs:
    sz = (max(len(o['mem']), 0x6d000) + 0xfff) & ~0xfff if o['base'] == 0x40000 else (len(o['mem']) + 0xfff) & ~0xfff
    mu.mem_map(o['base'], sz); mu.mem_write(o['base'], bytes(o['mem']))
mu.mem_map(0xb0000, 0x200000)  # heap/stack headroom (fb arrays live inside obj3: 0x48b8c..)
STACK = 0x2a0000
# --- data the real loaders (0x101c5 / 0x108d3) would have put in memory ---
gfx = open('GFX.DAT', 'rb').read()
mu.mem_write(0xa41ec, gfx[32:800]); mu.mem_write(0x79eec, gfx[800:])
def font(path, base_rows, base_wid, h):
    f = open(path, 'rb').read(); first = f[0]; rec = h + 1; o = 4; c = first
    while o + rec <= len(f):
        mu.mem_write(base_rows + c * 16, f[o:o + h]); mu.mem_write(base_wid + c, bytes([f[o + h]])); o += rec; c += 1
    mu.mem_write(0xabe50 + (1 if base_rows == 0x4658c else 2), bytes([h]))
font('FONT2.FNT', 0x4658c, 0x4868c, 10); font('FONT.FNT', 0x4758c, 0x4878c, 9)
mu.mem_write(0x4458c, open('VGA.FNT', 'rb').read())
RET = 0x20000
def call(addr, regs=(), stack=()):
    sp = STACK
    for v in reversed(stack): sp -= 4; mu.mem_write(sp, struct.pack('<I', v))
    sp -= 4; mu.mem_write(sp, struct.pack('<I', RET)); mu.reg_write(UC_X86_REG_ESP, sp)
    for r, v in regs: mu.reg_write(r, v)
    mu.emu_start(addr, RET, count=50_000_000)
def hook(uc, a, sz, _):
    if a == 0x11088:   # stack-check prologue helper: drop its argument, return
        sp = uc.reg_read(UC_X86_REG_ESP); ret = struct.unpack('<I', uc.mem_read(sp, 4))[0]
        uc.reg_write(UC_X86_REG_ESP, sp + 8); uc.reg_write(UC_X86_REG_EIP, ret)
    elif a == 0x17231:  # memcpy(eax=dst, edx=src, ebx=n) (uses segment regs; do it natively)
        r = lambda n: uc.reg_read(n); sp = r(UC_X86_REG_ESP); ret = struct.unpack('<I', uc.mem_read(sp, 4))[0]
        uc.mem_write(r(UC_X86_REG_EAX), bytes(uc.mem_read(r(UC_X86_REG_EDX), r(UC_X86_REG_EBX))))
        uc.reg_write(UC_X86_REG_ESP, sp + 4); uc.reg_write(UC_X86_REG_EIP, ret)
    elif a == 0x117a1:  # strlen(eax)
        sp = uc.reg_read(UC_X86_REG_ESP); ret = struct.unpack('<I', uc.mem_read(sp, 4))[0]; p = uc.reg_read(UC_X86_REG_EAX); n = 0
        while uc.mem_read(p + n, 1)[0]: n += 1
        uc.reg_write(UC_X86_REG_EAX, n); uc.reg_write(UC_X86_REG_ESP, sp + 4); uc.reg_write(UC_X86_REG_EIP, ret)
    elif a == 0x10028:  # VRAM flip: nothing to do, we read the shadow buffer
        sp = uc.reg_read(UC_X86_REG_ESP); ret = struct.unpack('<I', uc.mem_read(sp, 4))[0]
        uc.reg_write(UC_X86_REG_ESP, sp + 4); uc.reg_write(UC_X86_REG_EIP, ret)
mu.hook_add(UC_HOOK_CODE, hook, begin=0x10028, end=0x17232)
try: call(0x10985)
except UcError as e: print(e, hex(mu.reg_read(UC_X86_REG_EIP)), hex(mu.reg_read(UC_X86_REG_EDI)), hex(mu.reg_read(UC_X86_REG_ESP))); raise
out = bytes(mu.mem_read(0x48b8c, 360 * 480))
# 0x1032e on a custom string (ticker path): eax=text, edx=x, ebx=y, ecx=colour
msg = b'f i v e   m u s i c i a n s  1 9 9 5\0'; mu.mem_write(0xa8000, msg)
call(0x1032e, [(UC_X86_REG_EAX, 0xa8000), (UC_X86_REG_EDX, 51), (UC_X86_REG_EBX, 450), (UC_X86_REG_ECX, 11)])
out2 = bytes(mu.mem_read(0x48b8c, 360 * 480))
open(sys.argv[1], 'wb').write(out + out2); print('ok', len(out))
