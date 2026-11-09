"""A registry must fail closed when source-art segmentation changes."""
import unittest
from label_text import apply


class LabelTextTest(unittest.TestCase):
    def test_preserves_layout_and_localizes_plain_boxes(self):
        box = [.1, .2, .3, .4]
        art = {'url': '/map.webp', 'paintedLabels': [box]}
        words = {'en': 'The Drag', 'ru': 'Волок'}
        self.assertEqual(apply(art, {'/map.webp': {'0': {'box': box, 'text': words}}}), 1)
        self.assertEqual(art['paintedLabels'][0], {'box': box, 'text': words})

    def test_does_not_attach_names_to_changed_art(self):
        record = {'box': [0, 0, .5, .5], 'text': {'en': 'Old Town', 'ru': 'Старый город'}}
        with self.assertRaisesRegex(ValueError, 'box changed'):
            apply({'url': '/map.webp', 'paintedLabels': [{'box': [0, 0, 1, 1]}]}, {'/map.webp': {'0': record}})
        with self.assertRaisesRegex(ValueError, 'missing'):
            apply({'url': '/map.webp', 'paintedLabels': []}, {'/map.webp': {'0': record}})



class PublishedLabelTest(unittest.TestCase):
    def test_every_reviewed_region_is_localized_or_nonword_art(self):
        import json
        from label_text import DATA
        registry = json.loads((DATA/'painted-label-text.json').read_text())
        for url, records in registry.items():
            for index, record in records.items():
                with self.subTest(url=url, index=index):
                    if record.get('kind') == 'ornament':
                        self.assertNotIn('text', record)
                    else:
                        self.assertTrue(record['text']['en'].strip())
                        self.assertTrue(record['text']['ru'].strip())
        maps = json.loads((DATA/'maps.json').read_text())
        eras = json.loads((DATA/'eras.json').read_text())
        for node in maps + [v for e in eras for v in e['maps'].values() if isinstance(v, dict)]:
            art = node.get('art') or {}
            for index, label in enumerate(art.get('paintedLabels', [])):
                self.assertIn(str(index), registry[art['url']])
                if label.get('kind') != 'ornament':
                    self.assertTrue(label['text']['en'].strip())
                    self.assertTrue(label['text']['ru'].strip())

    def test_capitals_keep_both_locales_at_terrain_depth(self):
        import json
        from label_text import DATA
        maps = {n['id']: n for n in json.loads((DATA/'maps.json').read_text())}
        for uid in [84,85,87,88,89,90,103,110,111,125,627,1670,2112,2339]:
            for label in maps[uid]['art']['paintedLabels']:
                text = label.get('text')
                self.assertIsNotNone(text, f'{uid}: {label["box"]}')
                self.assertTrue(text['en'].strip())
                self.assertRegex(text['ru'], '[А-Яа-яЁё]')
        dornogal = [l['text'] for l in maps[2339]['art']['paintedLabels']]
        self.assertIn({'en': 'The Coreway', 'ru': 'Артерия'}, dornogal)
        self.assertIn({'en': 'The Forgegrounds', 'ru': 'Кузница'}, dornogal)

    def test_registry_still_matches_all_shipped_era_art(self):
        import copy
        import json
        from label_text import DATA
        registry = json.loads((DATA/'painted-label-text.json').read_text())
        maps = json.loads((DATA/'maps.json').read_text())
        eras = json.loads((DATA/'eras.json').read_text())
        for node in maps + [v for e in eras for v in e['maps'].values() if isinstance(v,dict)]:
            art = node.get('art')
            if art:
                clone = copy.deepcopy(art)
                apply(clone, registry)
                self.assertEqual(art, clone)

if __name__ == '__main__':
    unittest.main()
