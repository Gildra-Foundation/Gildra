#!/usr/bin/env python3
"""Fetch a complete public source set before normalization; max 4 concurrent requests."""
import argparse
import concurrent.futures
import json
import pathlib
import subprocess

def fetch_snapshot(root):
    root.mkdir(parents=True,exist_ok=True)
    def fetch(name):
        dest=root/name.replace('/','__');tmp=dest.with_suffix('.download')
        subprocess.run(['curl','--fail','--silent','--show-error','--location','--retry','2','--max-time','60',
                        'https://foreverdb.net/data/'+name,'-o',str(tmp)],check=True)
        json.loads(tmp.read_text());tmp.replace(dest)
    fetch('datamine.json');before=(root/'datamine.json').read_bytes()
    fetch('world.json')
    initial=['items.json','spells.json','classes.json','professions.json','search/ru.json','questguides/index.json','vendors.json','trainers.json','rares.json','l10n/ru/spells.json','l10n/ru/quests.json','stats.json','l10n/ru/ui.json']
    with concurrent.futures.ThreadPoolExecutor(4) as executor:list(executor.map(fetch,initial))
    professions=json.loads((root/'professions.json').read_text())['professions']
    shards=[f'{kind}/{i}.json' for kind in ['spells','questguides','l10n/ru/spells'] for i in range(64)]
    shards += [f"professions/{x['slug']}.json" for x in professions]
    with concurrent.futures.ThreadPoolExecutor(4) as executor:list(executor.map(fetch,shards))
    fetch('datamine.json')
    if before != (root/'datamine.json').read_bytes():raise RuntimeError('Upstream manifest changed during fetch; repeat into a fresh directory')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);fetch_snapshot(p.parse_args().output)
