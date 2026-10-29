"""Dump the menu/info/ticker strings of PROG.EXE (obj3 tables) to web/assets/strings.json.
Usage: python3 tools/extract_strings.py"""
import struct, json, sys
sys.path.insert(0, 'tools'); import le
objs, _, _ = le.load('PROG.EXE'); o3 = bytes(objs[2]['mem']); B = 0x40000
p = lambda a: struct.unpack('<I', o3[a-B:a-B+4])[0]
def s(a): i = a-B; return o3[i:o3.index(0, i)].decode('cp437')
d = dict(files=[s(p(0x41455+4*i)) for i in range(1, 7)], menu=[s(p(0x414e9+4*i)) for i in range(6)],
         info=[[s(p(0x41501+(g*13+l)*4)) for l in range(13)] for g in range(6)], ticker=[s(p(0x41471+4*i)) for i in range(30)])
json.dump(d, open('web/assets/strings.json', 'w'), indent=1, ensure_ascii=False)
