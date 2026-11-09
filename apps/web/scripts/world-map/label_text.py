#!/usr/bin/env python3
"""Reapply verified bilingual painted words after annotate/labels rebuilds.

The registry keys the exact client picture URL, label index and bounding box.
A changed box is rejected instead of attaching a district name to new artwork.
Run last: python apps/web/scripts/world-map/label_text.py
"""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / 'data/wow/map'


def apply(art, registry):
    if not art:
        return 0
    count = 0
    for key, record in registry.get(art['url'], {}).items():
        index = int(key)
        labels = art.get('paintedLabels', [])
        if index >= len(labels):
            raise ValueError(f"label missing: {art['url']} #{index}")
        label = labels[index]
        if isinstance(label, list):
            label = {'box': label}
            labels[index] = label
        if not isinstance(label, dict) or label.get('box') != record['box']:
            raise ValueError(f"label box changed: {art['url']} #{index}")
        label['text'] = record['text']
        count += 1
    return count


def main():
    registry = json.loads((DATA/'painted-label-text.json').read_text())
    maps = json.loads((DATA/'maps.json').read_text())
    eras = json.loads((DATA/'eras.json').read_text())
    count = 0
    for node in maps + [v for era in eras for v in era['maps'].values() if isinstance(v, dict)]:
        count += apply(node.get('art'), registry)
    for name, value in [('maps.json', maps), ('eras.json', eras)]:
        (DATA/name).write_text('[\n' + ',\n'.join(json.dumps(n, ensure_ascii=False, separators=(',', ':')) for n in value) + '\n]\n')
    print(f'{count} verified label instances applied')


if __name__ == '__main__':
    main()
