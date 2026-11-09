"""Geometry regressions: run with the pipeline's Python environment."""
import io
import struct
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from PIL import Image
from terrain import block_box, wdt_minimaps, build_pyramid
from publish_terrain import reproject


def png(color):
    buf = io.BytesIO()
    Image.new('RGB', (256, 256), color).save(buf, 'PNG')
    return buf.getvalue()


class TerrainTest(unittest.TestCase):
    def test_maid_axes(self):
        chunk = bytearray(64 * 64 * 32)
        struct.pack_into('<I', chunk, (11 * 64 + 7) * 32 + 28, 123)
        self.assertEqual(wdt_minimaps(b'DIAM' + struct.pack('<I', len(chunk)) + chunk), {(7, 11): 123})

    def test_shared_instance_union_and_native_texels(self):
        def row(x, y):
            a,b,c,d = block_box(x,y)
            return {'Region':[a,b,0,c,d,0], 'UiMin':[0,0], 'UiMax':[1,1]}
        chunk = bytearray(64 * 64 * 32)
        for x in (31,33):
            struct.pack_into('<I',chunk,(31*64+x)*32+28,x)
        refs={31:SimpleNamespace(read=lambda:png('red')),33:SimpleNamespace(read=lambda:png('blue'))}
        client=SimpleNamespace(tables={'Map':{1:{'WdtFileDataID':1}}},client=SimpleNamespace(read_fdid=lambda _:b'DIAM'+struct.pack('<I',len(chunk))+chunk,resolve=lambda _:refs))
        with tempfile.TemporaryDirectory() as directory:
            import json
            root=Path(directory)
            result=build_pyramid(1,[row(31,31),row(33,31)],client,root,70,2,512)
            self.assertEqual(result['width'],768) # native 256, never upsample
            self.assertEqual(result['height'],256)
            self.assertEqual(json.loads((root/'empty.json').read_text())['2'],['1_0'])
            self.assertFalse((root/'2/1_0.webp').exists())
            with Image.open(root/'2/0_0.webp') as image:
                self.assertGreater(image.getpixel((255,100))[0],245)

    def test_era_reprojection(self):
        source={'Region':[0,0,0,100,100,0],'UiMin':[0,0],'UiMax':[1,1]}
        target={'Region':[0,0,0,200,100,0],'UiMin':[0,0],'UiMax':[1,1]}
        self.assertEqual(reproject({'rect':[0,0,1,1]},source,target)['rect'],[0,0.5,1,1])



class EdgeTest(unittest.TestCase):
    def test_continuous_source_across_adt_and_output_edges(self):
        """A smooth source must not acquire a stripe at ADT/256px boundaries."""
        import numpy as np
        chunk = bytearray(64 * 64 * 32)
        refs = {}
        rows = []
        for bx in (31, 32):
            struct.pack_into('<I', chunk, (31 * 64 + bx) * 32 + 28, bx)
            a,b,c,d = block_box(bx,31)
            rows.append({'Region':[a,b,0,c,d,0]})
            pixels = np.zeros((512,512,4),dtype=np.uint8)
            pixels[:,:,0] = np.arange((bx-31)*512,(bx-30)*512)[None,:] // 8 + 32
            pixels[:,:,1] = np.arange(512)[:,None] // 4 + 32
            pixels[:,:,2] = 64
            pixels[:,:,3] = 255
            buf=io.BytesIO();Image.fromarray(pixels).save(buf,'PNG')
            refs[bx]=SimpleNamespace(read=lambda data=buf.getvalue():data)
        client=SimpleNamespace(tables={'Map':{1:{'WdtFileDataID':1}}},client=SimpleNamespace(read_fdid=lambda _:b'DIAM'+struct.pack('<I',len(chunk))+chunk,resolve=lambda _:refs))
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            result=build_pyramid(1,rows,client,root,85,2,512)
            for z in range(result['maxZoom']+1):
                files=sorted((root/str(z)).glob('*.webp'))
                for f in files:
                    x,y=map(int,f.stem.split('_'));adj=f.with_name(f'{x+1}_{y}.webp')
                    if not adj.exists():continue
                    a=np.array(Image.open(f).convert('RGBA'),dtype=float)
                    b=np.array(Image.open(adj).convert('RGBA'),dtype=float)
                    self.assertTrue((a[:,-1,3]==255).all())
                    self.assertTrue((b[:,0,3]==255).all())
                    self.assertLess(np.abs(a[:,-1,:3]-b[:,0,:3]).mean(),4)
                    factor = 2 ** (result['maxZoom'] - z)
                    expected_left = 32 + ((x*256 + 255)*factor + (factor-1)/2) / 8
                    expected_right = 32 + ((x+1)*256*factor + (factor-1)/2) / 8
                    self.assertLess(np.abs(a[:,-1,0] - expected_left).mean(), 4)
                    self.assertLess(np.abs(b[:,0,0] - expected_right).mean(), 4)
                    self.assertLess(np.abs(a[:,-1,2] - 64).mean(), 4)

            self.assertFalse((root/'.native').exists())

class PackagedEdgeTest(unittest.TestCase):
    def test_sampled_kalimdor_neighbours_have_no_added_border_stripe(self):
        import numpy as np
        import json
        from terrain import TERRAIN_DIR
        root = TERRAIN_DIR / '12'
        index = json.loads((root / 'index.json').read_text())
        level = max(map(int, index))
        tiles = set(index[str(level)])
        checked = 0
        for key in sorted(tiles)[::97]:
            x, y = map(int, key.split('_'))
            for dx, dy in [(1, 0), (0, 1)]:
                neighbour = f'{x+dx}_{y+dy}'
                if neighbour not in tiles:
                    continue
                with Image.open(root / str(level) / f'{key}.webp') as im:
                    a = np.asarray(im.convert('RGBA'), dtype=float)
                with Image.open(root / str(level) / f'{neighbour}.webp') as im:
                    b = np.asarray(im.convert('RGBA'), dtype=float)
                if dx:
                    edge_a, inside_a, edge_b, inside_b = a[:,-1], a[:,-2], b[:,0], b[:,1]
                else:
                    edge_a, inside_a, edge_b, inside_b = a[-1], a[-2], b[0], b[1]
                if not ((edge_a[:,3] == 255).all() and (edge_b[:,3] == 255).all()):
                    continue  # genuine coastline / missing source alpha
                edge = np.abs(edge_a[:,:3] - edge_b[:,:3]).mean()
                local = (np.abs(edge_a[:,:3] - inside_a[:,:3]).mean() + np.abs(edge_b[:,:3] - inside_b[:,:3]).mean()) / 2
                # Neighbours are different texels, not duplicated gutters. Compare
                # with their real texture gradients, allowing codec/source noise.
                self.assertLess(edge, local + 12, f'{key} → {neighbour}: {edge:.2f}/{local:.2f}')
                checked += 1
        self.assertGreaterEqual(checked, 20)

if __name__ == '__main__':
    unittest.main()
