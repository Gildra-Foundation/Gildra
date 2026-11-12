#!/usr/bin/env python3
"""Export links to existing atlas tiles; creates no images and uses no network."""
import json
from pathlib import Path
root = Path(__file__).resolve().parents[2]
public = root / 'apps/web/public'
result = {}
for record in json.loads((root / 'apps/web/data/wow/map/maps.json').read_text()):
    art = record.get('art') or {}
    template = art.get('url', '')
    image = template.replace('{z}', '0').replace('{x}', '0').replace('{y}', '0')
    if not image.startswith('/maps/tiles/') or not (public / image.lstrip('/')).is_file():
        continue
    value = {'image_url': image, 'tile_url': template, 'width': art['width'],
             'height': art['height'], 'tile_size': art['tileSize'], 'max_zoom': art['maxZoom']}
    ru = art.get('urlRu', '')
    ru_image = ru.replace('{z}', '0').replace('{x}', '0').replace('{y}', '0')
    if ru.startswith('/maps/tiles/') and (public / ru_image.lstrip('/')).is_file():
        value.update(image_url_ru=ru_image, tile_url_ru=ru)
    result[str(record['id'])] = value
(root / 'backend/internal/catalog/world_map_pictures.json').write_text(json.dumps(result, indent=2, sort_keys=True) + '\n')
print(f'{len(result)} verified map pictures')
