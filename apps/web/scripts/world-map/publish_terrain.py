#!/usr/bin/env python3
"""Attach generated terrain to retail/era nodes using each client's assignment.

Run after terrain.py and eras.py. Never reuses the retail old world before
Cataclysm. Uses cached source DB2 geometry, not art rectangle approximations.
"""
import argparse
import json
import pickle
from pathlib import Path

from geometry import Geometry, ui_to_world, world_to_ui
from terrain import DATA_DIR


def reproject(terrain, source, target):
    """Carry both corners through world coordinates; frames can differ by era."""
    result = dict(terrain)
    a, b, c, d = terrain['rect']
    first = world_to_ui(target, *ui_to_world(source, a, b))
    last = world_to_ui(target, *ui_to_world(source, c, d))
    result['rect'] = [round(v, 6) for v in (*first, *last)]
    return result


def publish(work):
    maps_path, eras_path = DATA_DIR / 'maps.json', DATA_DIR / 'eras.json'
    maps, eras = json.loads(maps_path.read_text()), json.loads(eras_path.read_text())
    manifests, geometries, trees = {}, {}, {}
    products = {'retail': 'wow', 'classic': 'wow_classic_era', 'tbc': 'wow_anniversary', 'wrath': 'wow_classic_titan', 'mists': 'wow_classic'}
    for key, product in products.items():
        path = DATA_DIR / ('terrain-manifest.json' if key == 'retail' else f'terrain-{key}.json')
        if not path.exists():
            continue
        manifests[key] = json.loads(path.read_text())
        # Older generation sessions may have emitted a shared folder without
        # its product namespace. Canonicalize before publishing any references.
        if key != 'retail':
            for terrain in manifests[key]['maps'].values():
                for field in ('url', 'index', 'empty'):
                    if field in terrain and not terrain[field].startswith(f'/maps/terrain/{key}/'):
                        terrain[field] = terrain[field].replace('/maps/terrain/', f'/maps/terrain/{key}/', 1)
            path.write_text(json.dumps(manifests[key], indent=2) + '\n')
        tables = pickle.loads((work / f'tables-{product}.pkl').read_bytes())
        geometries[key] = Geometry(tables['UiMapAssignment'], tables['UiMapLink'])
    for era in ('classic', 'burning-crusade', 'wrath-of-the-lich-king', 'cataclysm-pandaria'):
        trees[era] = pickle.loads((work / f'era-tree-{era}.pkl').read_bytes())['tree']
    # Alternate sibling maps on the same instance need their own projection;
    # ordinary descendants already inherit a correctly placed ancestor layer.
    published = {m['id']: m for m in maps}
    ground = manifests['retail']['maps']
    source_ids = {stat['mapId']: key for key, stat in manifests['retail']['stats'].items()}
    for m in maps:
        key = str(m['id'])
        if key in ground or m['id'] == 1550 or m['type'] not in ('continent', 'zone') or not m.get('art'):
            continue  # Shadowlands overview is a stylized chart, not a world plane.
        row = geometries['retail'].primary(m['id'])
        if not row or row['MapID'] not in source_ids:
            continue
        parent = published.get(m.get('parentId'))
        covered = False
        while parent:
            r = geometries['retail'].primary(parent['id'])
            if str(parent['id']) in ground and r and r['MapID'] == row['MapID']:
                covered = True
                break
            parent = published.get(parent.get('parentId'))
        if not covered:
            source_id = source_ids[row['MapID']]
            source = geometries['retail'].primary(int(source_id))
            ground[key] = reproject(ground[source_id], source, row)
    (DATA_DIR / 'terrain-manifest.json').write_text(json.dumps(manifests['retail'], indent=2) + '\n')
    for m in maps:
        if str(m['id']) in manifests['retail']['maps']:
            m['terrain'] = manifests['retail']['maps'][str(m['id'])]
    retail = {str(m['id']): m for m in maps}
    resolved = {}
    for era in eras:
        terrain_nodes = dict(resolved.get(era.get('inherits'), {}))
        for key, value in list(era['maps'].items()):
            if isinstance(value, dict) and value.get('absent'):
                terrain_nodes.pop(key, None)
                continue
            record = retail.get(key, {})
            if era.get('inherits'):
                # Phased art can erase inherited terrain in the engine. The game
                # does not expose phase-specific WDT minimaps: cap at painted art.
                if isinstance(value, dict) and 'art' in value:
                    value['terrain'] = None
                continue
            target = geometries['retail'].primary(int(key)) if key.isdigit() else None
            source_key, source_id = 'retail', key
            if era['id'] in trees and era['id'] != 'cataclysm-pandaria':
                node = trees[era['id']].get(int(key) if key.isdigit() else key, {})
                target = node.get('_box')
                client_id = node.get('_client')
                source_key = 'classic' if target and target['MapID'] in (0, 1) else 'tbc' if target and target['MapID'] == 530 else 'wrath'
                source_id = str(1414 if key == '12' else 1415 if key == '13' else client_id)
            elif era['id'] in ('cataclysm', 'cataclysm-pandaria', 'warlords-of-draenor', 'legion'):
                node = trees['cataclysm-pandaria'].get(int(key) if key.isdigit() else key, {})
                target = node.get('_box', target)
                if key in manifests.get('mists', {}).get('maps', {}):
                    source_key = 'mists'
                elif target and target['MapID'] == 530:
                    tbc_node = trees['burning-crusade'].get(int(key) if key.isdigit() else key, {})
                    source_key, source_id = 'tbc', str(tbc_node.get('_client'))
                elif key == '113':
                    source_key = 'wrath'
            terrain = manifests.get(source_key, {}).get('maps', {}).get(source_id)
            if terrain and target:
                source = geometries[source_key].primary(int(source_id))
                terrain = reproject(terrain, source, target)
            else:
                terrain = None
            # Add only meaningful overrides; an art replacement must explicitly
            # retain terrain, and unavailable historical terrain must clear it.
            if terrain or record.get('terrain'):
                if value == 'unchanged':
                    value = {}
                    era['maps'][key] = value
                value['terrain'] = terrain
            elif isinstance(value, dict):
                value.pop('terrain', None)
            if terrain:
                terrain_nodes[key] = terrain
        resolved[era['id']] = terrain_nodes
    maps_path.write_text('[\n' + ',\n'.join(json.dumps(n,ensure_ascii=False,separators=(',',':')) for n in maps) + '\n]\n')
    eras_path.write_text('[\n' + ',\n'.join(json.dumps(n,ensure_ascii=False,separators=(',',':')) for n in eras) + '\n]\n')
    for era, nodes in resolved.items():
        print(f'{era}: {len(nodes)} terrain nodes')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path, required=True)
    publish(parser.parse_args().work)
