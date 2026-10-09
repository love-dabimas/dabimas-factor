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
