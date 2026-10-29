"""Load PROG.EXE's embedded LE (PMODE/W) into a flat relocated image.
Usage: python3 -I tools/le.py PROG.EXE out_dir   -> obj1.bin obj2.bin obj3.bin + info"""
import struct, sys, os
LE = 0x2410; DATA = 0x6200
def load(path):
    d = open(path, 'rb').read()
    u = lambda o, n=4: int.from_bytes(d[LE+o:LE+o+n], 'little')
    nobj, ot = u(0x44), u(0x40)
    objs = []
    for i in range(nobj):
        vs, base, fl, pi, n = struct.unpack('<5I', d[LE+ot+i*24:LE+ot+i*24+20])
        objs.append(dict(vs=vs, base=base, pi=pi, n=n))
    npg, ps, last = u(0x14), u(0x28), u(0x2c)
    pgoff = lambda p: DATA + (p-1)*ps
    for o in objs:
        buf = bytearray(max(o['vs'], o['n']*ps))
        for k in range(o['n']):
            p = o['pi']+k
            ln = last if p == npg else ps
            buf[k*ps:k*ps+ln] = d[pgoff(p):pgoff(p)+ln]
        o['mem'] = buf
    # fixups
    fpt, frec = LE+u(0x68), LE+u(0x6c)
    pages = [struct.unpack('<I', d[fpt+4*i:fpt+4*i+4])[0] for i in range(npg+1)]
    nfix = 0
    for p in range(1, npg+1):
        a, e = frec+pages[p-1], frec+pages[p]
        while a < e:
            src, flg = d[a], d[a+1]; a += 2
            off = struct.unpack('<h', d[a:a+2])[0]; a += 2
            assert flg & 3 == 0, 'internal ref only'
            ot_ = d[a] if not flg & 0x40 else struct.unpack('<H', d[a:a+2])[0]; a += 1 + (1 if flg & 0x40 else 0)
            if src & 0xf == 7 or src & 0xf == 8:
                tgt = struct.unpack('<I' if flg & 0x10 else '<H', d[a:a+(4 if flg & 0x10 else 2)])[0]; a += 4 if flg & 0x10 else 2
            else: raise SystemExit('src %x' % src)
            tobj = objs[ot_-1]
            ob = next(o for o in objs if o['pi'] <= p < o['pi']+o['n'])
            pos = (p-ob['pi'])*ps + off
            if src & 0xf == 7:
                struct.pack_into('<I', ob['mem'], pos, tobj['base']+tgt)
            else:  # rel32
                struct.pack_into('<I', ob['mem'], pos, (tobj['base']+tgt - (ob['base']+pos+4)) & 0xffffffff)
            nfix += 1
    return objs, u(0x1c), nfix
if __name__ == '__main__':
    objs, eip, nfix = load(sys.argv[1]); os.makedirs(sys.argv[2], exist_ok=True)
    print('fixups', nfix, 'eip', hex(objs[0]['base']+eip))
    for i, o in enumerate(objs):
        open('%s/obj%d.bin' % (sys.argv[2], i+1), 'wb').write(o['mem']); print(i+1, hex(o['base']), hex(len(o['mem'])))
