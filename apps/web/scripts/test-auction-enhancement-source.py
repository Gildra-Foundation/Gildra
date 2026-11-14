"""Offline negative tests for cross-build compatibility using the checked-in real DB2 row."""
import copy, importlib.util, json, pathlib, unittest

here=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('builder',here/'build-auction-enhancement-catalog.py')
builder=importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
snapshot=json.loads((here/'../data/wow/auction-enhancements/catalog.json').read_text())

class CompatibilityTests(unittest.TestCase):
    def test_complete_semantic_rowsets_reject_added_removed_and_changed_rows(self):
        old=builder.semantic_chain_rows(snapshot['rows'],244010)
        self.assertTrue(builder.compatible_item_chain(old,list(reversed(old)),244010))
        for table in ['ItemXItemEffect','SpellEffect','SpellEquippedItems']:
            original=next(r for r in old if r['table']==table)
            extra=copy.deepcopy(original)
            extra['id']=999999999
            extra['payload']['ID']='999999999'
            with self.subTest(added=table):
                self.assertFalse(builder.compatible_item_chain(old,[*old,extra],244010))
            with self.subTest(removed=table):
                self.assertFalse(builder.compatible_item_chain(old,[r for r in old if r is not original],244010))
        changed=copy.deepcopy(old)
        restriction=next(r for r in changed if r['table']=='SpellEquippedItems')
        restriction['payload']['EquippedItemInvTypes']='2'
        self.assertFalse(builder.compatible_item_chain(old,changed,244010))

    def test_new_link_to_new_spell_is_not_hidden_by_old_spell_ids(self):
        old=builder.semantic_chain_rows(snapshot['rows'],244010)
        extra_link=copy.deepcopy(next(r for r in old if r['table']=='ItemXItemEffect'))
        extra_effect=copy.deepcopy(next(r for r in old if r['table']=='ItemEffect'))
        extra_spell=copy.deepcopy(next(r for r in old if r['table']=='SpellEffect'))
        for offset,r in enumerate([extra_link,extra_effect,extra_spell]):
            r['id']=999999990+offset; r['payload']['ID']=str(r['id'])
        extra_link['payload']['ItemEffectID']=str(extra_effect['id'])
        extra_effect['payload']['SpellID']='999999999'
        extra_spell['payload']['SpellID']='999999999'
        current=[*old,extra_link,extra_effect,extra_spell]
        self.assertFalse(builder.compatible_item_chain(old,current,244010))
        self.assertIn(extra_spell,builder.semantic_chain_rows(current,244010))

    def test_real_enchant_schema_and_negative_changes(self):
        old=next(r['payload'] for r in snapshot['rows'] if r['table']=='SpellItemEnchantment' and r['id']==8020)
        current={**old,'ItemSquishEraID':'0'}
        self.assertTrue(builder.compatible_payload('SpellItemEnchantment',old,current))
        for key,value in [('Condition_ID','1'),('ItemLevelMax','120'),('EffectArg_0','999'),('ItemSquishEraID','1'),('UnknownConstraint','0')]:
            with self.subTest(key=key):
                self.assertFalse(builder.compatible_payload('SpellItemEnchantment',old,{**current,key:value}))
        missing=dict(current); missing.pop('RequiredSkillID')
        self.assertFalse(builder.compatible_payload('SpellItemEnchantment',old,missing))

    def test_no_general_missing_zero_equivalence(self):
        self.assertFalse(builder.compatible_payload('ItemSparse',{'ID':'244010'},{'ID':'244010','ItemSquishEraID':'0'}))

    def test_real_mapping_and_complete_proof(self):
        proof=next(p for p in snapshot['rankedCompatibilityProofs'] if p['itemId']==244010)
        mapping=next(r for r in snapshot['rankedMappings'] if r['id']==proof['qualityRowId'])
        self.assertEqual(mapping['payload']['SpellItemEnchantmentID'],'8020')
        self.assertEqual(proof['sourceBuild'],'12.1.5.70783')
        self.assertEqual(proof['semanticRowsetVersion'],1)
        self.assertEqual({r['table'] for r in proof['semanticRowsets']},{'ItemXItemEffect','ItemEffect','SpellEffect','SpellEquippedItems'})
        self.assertEqual({r['table'] for r in proof['rows']},{'Item','ItemSparse','ItemXItemEffect','ItemEffect','SpellEffect','SpellEquippedItems','CraftingData','SpellItemEnchantment'})

if __name__=='__main__': unittest.main()
