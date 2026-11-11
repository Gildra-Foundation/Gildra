import importlib.util
import os
import pathlib
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('forever_import',pathlib.Path(__file__).with_name('import.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
SOURCE=pathlib.Path(os.environ.get('FOREVER_SOURCE','/tmp/forever-platform-20261111/DATA/sources'))

class SnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.rows,cls.evidence=module.normalize(SOURCE)
    def test_measured_client_totals(self):
        self.assertEqual(self.evidence['inventory']['item']['sourceTotal'],23339)
        self.assertEqual(self.evidence['inventory']['spell']['sourceTotal'],32110)
        for kind,data in self.evidence['inventory'].items():self.assertEqual(data['sourceTotal'],data['imported']+data['excluded'])
    def test_no_cross_edition_or_dangling_relations(self):
        for r in self.rows.values():
            self.assertEqual(r['edition'],'forever');self.assertEqual(r['build'],'1.60.1.70862')
            for edge in r['relations']:self.assertIn((edge['type'],edge['id']),self.rows)
            self.assertNotRegex(r['name'].get('ru',''),r'Quest #\d+')
    def test_quest_classic_fields_do_not_leak(self):
        quest=self.rows['quest',8]
        self.assertEqual(quest['level'],5)
        self.assertNotIn('requiredLevel',quest) # minimum level is Classic, not confirmed Forever
        self.assertNotIn('desc',quest)
        self.assertFalse(any(x['kind']=='next' and x['id']==590 for x in quest['relations']))
        self.assertIn(('quest',1149),self.rows) # Test of Faith is a real quest
        self.assertIn(('quest',98223),self.rows) # Old Habits is a real quest
    def test_recipe_products_and_reagents(self):
        self.assertTrue(any(e.get('quantityRange')==[1,3] for e in self.rows['recipe',3931]['relations'] if e['kind']=='creates'))
        r=self.rows['recipe',1245250]
        self.assertTrue(any(x['id']==247755 and x['kind']=='creates' for x in r['relations']))
        self.assertTrue(any(x['id']==765 and x['quantity']==1 and x['kind']=='reagent' for x in r['relations']))
    def test_source_shard_identity_mismatch_fails(self):
        original_read=module.read
        for filename in ['spells/0.json','questguides/0.json']:
            def corrupt(root,name):
                data=original_read(root,name)
                if name==filename:
                    first=next(iter(data));data[first]['id']=int(first)+1
                return data
            with self.subTest(filename=filename),patch.object(module,'read',side_effect=corrupt):
                with self.assertRaisesRegex(ValueError,'Corrupt .* shard'):module.normalize(SOURCE)
    def test_every_recipe_has_current_spell(self):
        for (kind,ident),row in self.rows.items():
            if kind=='recipe':
                self.assertIn(('spell',ident),self.rows)
                self.assertTrue(any(e['type']=='spell' and e['id']==ident and e['kind']=='ability' for e in row['relations']))
    def test_import_idempotence(self):
        with tempfile.TemporaryDirectory() as d:
            a=module.write_snapshot(SOURCE,pathlib.Path(d)/'a');b=module.write_snapshot(SOURCE,pathlib.Path(d)/'b')
            self.assertEqual(a,b)
            for name in a['files']:self.assertEqual((pathlib.Path(d)/'a'/name).read_bytes(),(pathlib.Path(d)/'b'/name).read_bytes())

if __name__=='__main__':unittest.main()
