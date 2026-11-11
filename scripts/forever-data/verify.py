#!/usr/bin/env python3
"""Offline release gate: hash, identity and relation checks on the shipped read model."""
import argparse
import gzip
import hashlib
import json
import pathlib

def verify(root):
    manifest=json.loads((root/'manifest.json').read_text());rows={}
    for name,expected in manifest['files'].items():
        blob=(root/name).read_bytes()
        if hashlib.sha256(blob).hexdigest()!=expected:raise ValueError('Hash mismatch: '+name)
        data=json.loads(gzip.decompress(blob))
        if name.endswith('/index.json.gz'):continue
        kind,shard=name.split('/');shard=int(shard.split('.')[0])
        for ident,row in data.items():
            if row['edition']!='forever' or row['build']!=manifest['build'] or row['type']!=kind or str(row['id'])!=ident or row['id']%64!=shard:raise ValueError('Identity mismatch: '+name)
            rows[kind,row['id']]=row
    for row in rows.values():
        for edge in row['relations']:
            if (edge['type'],edge['id']) not in rows:raise ValueError('Dangling relation')
    for kind,stats in manifest['inventory'].items():
        index=json.loads(gzip.decompress((root/kind/'index.json.gz').read_bytes()))
        ids={r['id'] for r in rows.values() if r['type']==kind}
        if len(index)!=stats['imported'] or ids!={r['id'] for r in index}:raise ValueError('Index mismatch: '+kind)
    return {'files':len(manifest['files']),'records':len(rows),'build':manifest['build']}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('directory',type=pathlib.Path);print(json.dumps(verify(p.parse_args().directory)))
