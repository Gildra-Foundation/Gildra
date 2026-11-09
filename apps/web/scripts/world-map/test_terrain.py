"""Geometry regressions: run with the pipeline's Python environment."""
import io
import struct
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from PIL import Image
from terrain import block_box, blocks_in, wdt_minimaps, build_pyramid
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


if __name__ == '__main__':
    unittest.main()
