from copy import deepcopy

from test_game_master_source import sources
from test_pedigree_master_fetch import game_documents
import build_dabimas_stream as build
from game_master_source import GameUpdate
from pedigree_master_fetch import validate_game_masters
from pedigree_master_source import PedigreeMasterSource


def test_game_id_on_new_and_existing_rows_and_summary():
    stallion, mare = sources()
    for source in (stallion, mare):
        entry = source.build_entry(source.find_record('1'), {})
        assert entry['gameId'] == '1'
        entry['id'] = 's123' if entry['sex'] == '0' else 'b123'
        entry.pop('gameId')
        source.rebuild_pedigree_fields(entry, {})
        assert entry['gameId'] == '1'
        summary = build.entry_to_summary(entry, 0)
        for row in (entry, summary):
            keys = list(row)
            assert keys[keys.index('nodeId') - 1] == 'gameId'
            assert row['gameId'] == '1'


def test_unmatched_node_has_null_game_id():
    stallion, _ = sources()
    entry = stallion.build_entry(stallion.find_record('1'), {})
    entry['nodeId'] = '0000333190-00'
    stallion.rebuild_pedigree_fields(entry, {})
    assert entry['nodeId'] == '0000333190-00' and entry['gameId'] is None
    entry.update(nodeId='absent', name='unknown horse', subName='')
    stallion.rebuild_pedigree_fields(entry, {})
    assert entry['nodeId'] is None and entry['gameId'] is None


def test_v5_mares_still_supply_game_ids():
    docs = game_documents()
    docs[4]['schema_version'] = 5
    source = PedigreeMasterSource(docs[0], docs[1])
    update = GameUpdate(validate_game_masters(*docs), source, [], 'daily', 0, (set(), set()))
    _, mare = sources()
    entry = mare.build_entry(mare.find_record('1'), {})
    entry['id'] = 'b123'
    entry.pop('gameId')
    update.rebuild(entry)
    assert entry['gameId'] == '1' and not update.mares_enabled


def test_duplicate_node_preserves_explicit_game_id():
    stallion, _ = sources()
    second = dict(stallion.find_record('1'), game_stallion_id='2')
    stallion.fields.set_stallions([second])
    entry = stallion.build_entry(second, {})
    assert entry['gameId'] == '2'
    entry['id'] = 's123'
    stallion.rebuild_pedigree_fields(entry, {})
    assert entry['gameId'] == '2'
    entry.pop('gameId')
    stallion.rebuild_pedigree_fields(entry, {})
    assert entry['gameId'] == '1'


def test_duplicate_node_uses_ability_and_nature_and_rejects_ambiguity():
    stallion, _ = sources()
    stallion.abilities.update({'8': {'name': '非凡A', 'effect_group_id_raw': 99},
                               '9': {'name': '非凡B', 'effect_group_id_raw': 99},
                               '10': {'name': '天性', 'effect_group_id_raw': 0}})
    record = dict(stallion.find_record('1'), game_stallion_id='2', nonordinary_ability_id='8', sub_ability_id='10')
    stallion.fields.set_stallions([record])
    entry = stallion.build_entry(record, {})
    entry['id'] = 's123'
    entry.pop('gameId')
    stallion.rebuild_pedigree_fields(entry, {})
    assert entry['gameId'] == '2'
    # 公開属性が同じ非凡A/Bを、番号の大小だけで断定しない。
    stallion.fields.set_stallions([dict(record, game_stallion_id='3', nonordinary_ability_id='9')])
    entry.pop('gameId')
    stallion.rebuild_pedigree_fields(entry, {})
    assert entry['gameId'] is None


def test_real_ability_versions_get_correct_game_ids():
    from test_game_master_source import real_sources
    stallion, _, entries = real_sources()
    expected = {'エルコンドルパサー': '100082', 'キタサンブラック': '100061',
                'ナリタブライアン': '100172', 'ハイセイコー': '100179'}
    seen = set()
    for entry in entries:
        if not entry['subName'] and entry['abilityType'] == 'normal' and entry['name'] in expected:
            stallion.rebuild_pedigree_fields(entry, {})
            assert entry['gameId'] == expected[entry['name']]
            seen.add(entry['name'])
        if entry['id'] in ('s0234185338', 's8810303245'):
            stallion.rebuild_pedigree_fields(entry, {})
            assert entry['gameId'] is None
        if entry['id'] == 's8465243129':
            stallion.rebuild_pedigree_fields(entry, {})
            assert entry['gameId'] == '361'
    assert seen == set(expected)


def test_weekly_adoption_retains_known_game_id_for_ambiguous_abilities():
    from game_master_source import StallionMasterSource
    docs = game_documents()
    template = docs[2]['stallions'][0]
    docs[2]['stallions'] = [dict(template, game_stallion_id='2', nonordinary_ability_id='8'),
                            dict(template, game_stallion_id='3', nonordinary_ability_id='9')]
    docs[2]['stallion_count'] = 2
    docs[3]['abilities'] = [{'game_ability_id': '8', 'name': '能力A', 'effect_group_id_raw': 99},
                            {'game_ability_id': '9', 'name': '能力B', 'effect_group_id_raw': 99}]
    docs[3]['ability_count'] = 2
    source = PedigreeMasterSource(docs[0], docs[1])
    stallion = StallionMasterSource(docs[2], docs[3], source)
    old = stallion.build_entry(stallion.find_record('2'), {})
    update = GameUpdate(validate_game_masters(*docs), source, [old], 'weekly', 0, (set(), set()))
    current = dict(old, id='s123')
    current.pop('gameId')
    update.weekly_entry(current)
    assert current['id'] == 'sg2' and current['gameId'] == '2'
