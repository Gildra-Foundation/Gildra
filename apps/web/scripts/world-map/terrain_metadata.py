#!/usr/bin/env python3
"""Complete sparse metadata for old and new pyramids; emit coverage/budget audit."""
import json
import math
from collections import Counter
from PIL import Image

from terrain import DATA_DIR, WEB

PUBLIC = WEB / 'public'


def ocean(node):
    art = node.get('art') or {}
    url = art.get('url', '').replace('{z}', '0').replace('{x}', '0').replace('{y}', '0')
    path = PUBLIC / url.lstrip('/')
    if not url or not path.exists():
        return '#163747'
    with Image.open(path) as image:
        image = image.convert('RGB')
        # Most frequent quantized blue ocean pixel; parchment has no blue sea
        # and uses the inherited default. Quantization avoids picking lettering.
        colors = Counter((r//8*8, g//8*8, b//8*8) for r,g,b in image.getdata() if b > r*1.15 and b >= g*.95 and b > 35)
    if not colors:
        return '#163747'
    return '#%02x%02x%02x' % colors.most_common(1)[0][0]


def main():
    maps = json.loads((DATA_DIR/'maps.json').read_text())
    eras = json.loads((DATA_DIR/'eras.json').read_text())
    seen = set()
    for n in maps + [v for e in eras for v in e['maps'].values() if isinstance(v, dict)]:
        t = n.get('terrain')
        if not t:
            continue
        if t['index'] not in seen:
            index = json.loads((PUBLIC/t['index'].lstrip('/')).read_text())
            empty = {}
            for z in range(t['maxZoom']+1):
                scale = 2**(t['maxZoom']-z)
                present = set(index[str(z)])
                empty[str(z)] = [f'{x}_{y}' for x in range(math.ceil(t['width']/256/scale)) for y in range(math.ceil(t['height']/256/scale)) if f'{x}_{y}' not in present]
            (PUBLIC/t['index'].lstrip('/')).with_name('empty.json').write_text(json.dumps(empty,separators=(',',':'))+'\n')
            seen.add(t['index'])
        t['empty'] = t['index'].replace('index.json','empty.json')
        t['ocean'] = ocean(n)
    (DATA_DIR/'maps.json').write_text('[\n' + ',\n'.join(json.dumps(n,ensure_ascii=False,separators=(',',':')) for n in maps) + '\n]\n')
    (DATA_DIR/'eras.json').write_text('[\n' + ',\n'.join(json.dumps(n,ensure_ascii=False,separators=(',',':')) for n in eras) + '\n]\n')
    # Synchronize manifests with final descriptor fields for reproducibility.
    for path in DATA_DIR.glob('terrain-*.json'):
        manifest = json.loads(path.read_text())
        if 'maps' not in manifest:
            continue
        by_url = {n['terrain']['url']:n['terrain'] for n in maps if n.get('terrain')}
        for t in manifest['maps'].values():
            t['empty'] = t['index'].replace('index.json','empty.json')
            t['ocean'] = by_url.get(t['url'],{}).get('ocean','#163747')
        for key, stats in manifest.get('stats', {}).items():
            terrain = manifest['maps'].get(key)
            if terrain:
                folder = (PUBLIC/terrain['index'].lstrip('/')).parent
                stats['bytes'] = sum(p.stat().st_size for p in folder.rglob('*') if p.is_file())
        path.write_text(json.dumps(manifest,indent=2)+'\n')
    root = PUBLIC / 'maps'
    paths = [root, *root.rglob('*')]
    if any(p.name == '.native' for p in paths):
        raise SystemExit('unfinished native intermediates must not be published')
    size = sum(p.stat().st_size for p in paths if p.is_file())
    allocated = sum(p.stat().st_blocks * 512 for p in paths)
    if allocated > 1_100_000_000:
        raise SystemExit(f'on-disk budget exceeded: {allocated/1e6:.1f} MB')
    if size > 1_000_000_000:
        raise SystemExit(f'budget exceeded: {size/1e6:.1f} MB')
    print(f'public/maps: {size/1e6:.1f} MB logical, {allocated/1e6:.1f} MB on disk; {len(seen)} pyramids')


if __name__ == '__main__':
    main()
