from collections import Counter
from copy import deepcopy
import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import game_master_source as game
from pedigree_master_source import PedigreeMasterSource
from test_pedigree_master_fetch import game_documents


def sources():
    master, nodes, stallion, ability, mare = game_documents()
    stallion['stallions'][0]['header_badge'] = {'asset_key': 'list_icn_cat_05.png'}
    mare['broodmares'][0]['broodmare_grade'] = {'mapping_status': 'verified', 'code': 'U'}
    source = PedigreeMasterSource(master, nodes)
    return game.StallionMasterSource(stallion, ability, source), game.BroodmareMasterSource(mare, source)


def test_time_boundaries():
    epoch = game.parse_as_of('2026-10-13T12:00:00+09:00')
    assert epoch == game.parse_iso_epoch('2026-10-13T03:00:00Z')
    assert game.is_eligible(0, epoch) and game.is_eligible(None, epoch)
    assert game.is_eligible(epoch, epoch) and not game.is_eligible(epoch + 1, epoch)
    with pytest.raises(ValueError): game.parse_as_of('2026-10-13T11:30:00')


def test_selection_order_duplicates_and_exclusions():
    stallion, _ = sources()
    template = stallion.find_record('1')
    stallion.records = {}
    for gid, name, start in [('101325', 'ダノンレジェンド-央瓏-', 1791817200),
                              ('1063', 'アドミラルドレイク-瞬闘-', 1791860400),
                              ('101319', 'シーフュリュー-央燕-', 1791298800), ('1', 'ディープインパクト', 0)]:
        stallion.records[gid] = dict(template, game_stallion_id=gid, name=name, node_id=gid, display_start_at_raw=start)
    epoch = game.parse_as_of('2026-10-13T11:30:00+09:00')
    selection = stallion.select_new(epoch, {'1'}, {'101319'})
    assert [i[0] for i in selection.selected] == ['101325']
    assert selection.skipped_future[0][0] == '1063'
    assert selection.excluded[0][0] == '101319'
    assert [i[0] for i in stallion.select_new(epoch + 1800, {'1'}, {'101319'}).selected] == ['101325', '1063']
    stallion.records['2'] = dict(template, game_stallion_id='2', node_id='1')
    assert stallion.select_new(epoch, set(), set()).skipped_duplicate_node[0][0] == '2'


@pytest.mark.parametrize('code,icon', list(game.GRADE_CATEGORY_ICON.items()))
def test_mare_fields_and_hyphen(code, icon):
    _, mare = sources()
    record = mare.find_record('1')
    record['name'] = 'ヨ-クダリア'
    record['broodmare_grade']['code'] = code
    entry = mare.build_entry(record, {})
    assert entry['name'] == 'ヨ-クダリア' and entry['subName'] == ''
    assert entry['categoryIcon'] == icon
    assert entry['rare'] is None and entry['abilityType'] is None
    assert entry['factors'] == ['', '', '']
    assert list(entry) == ['id', 'name', 'ruby', 'subName', 'nature', 'sex', 'rare', 'abilityType',
                           'categoryIcon', 'parentLine', 'parentLineId', 'son', 'sonId', 'factors',
                           'descendants', 'nodeId', 'pedigreeId', 'mares']
    assert len(entry['descendants']) == len(entry['mares']) == 15


def test_mare_dates_and_invalid_grade():
    _, mare = sources()
    record = mare.find_record('1')
    epoch = game.parse_as_of('2030-01-01T00:00:00+09:00')
    assert mare.select_new(epoch, set(), set()).selected
    record['display_start_at'] = '2029-12-31T15:00:00Z'
    assert not mare.select_new(epoch - 1, set(), set()).selected
    assert mare.select_new(epoch, set(), set()).selected
    for grade in [{'code': 'Z', 'mapping_status': 'verified'}, {'code': 'U', 'mapping_status': 'unknown'}]:
        record['broodmare_grade'] = grade
        with pytest.raises(ValueError): mare.build_entry(record, {})


@pytest.mark.parametrize('group,expected', [(99, 'normal'), (98, 'focused'), (97, 'double')])
def test_ability_factor_rules(group, expected):
    stallion, _ = sources()
    record = stallion.find_record('1')
    stallion.abilities['4'] = {'name': '天性', 'effect_group_id_raw': group}
    record.update(nonordinary_ability_id='4', sub_ability_id='4')
    node = stallion.fields.source.node(record['node_id'])
    node['pedigree_effect_ids'] = [2, 4]
    entry = stallion.build_entry(record, {})
    assert entry['abilityType'] == expected and entry['nature'] == '天性'
    assert entry['factors'] == ['', '長', '速']
    node['pedigree_effect_ids'] = [1, 2, 3, 4]
    with pytest.raises(ValueError): stallion.build_entry(record, {})
    node['pedigree_effect_ids'] = []
    stallion.abilities['4']['effect_group_id_raw'] = 1
    with pytest.raises(ValueError): stallion.build_entry(record, {})


def real_sources():
    path = ROOT / 'tmp/masters-20261007'
    if not (path / 'stallion_master.game.json').exists(): pytest.skip('local masters absent')
    def read(name): return json.loads((path / name).read_text(encoding='utf-8'))
    source = PedigreeMasterSource(read('pedigree_master.json'), read('pedigree_master.game.json'))
    stallion = game.StallionMasterSource(read('stallion_master.game.json'), read('ability_master.game.json'), source)
    mare = game.BroodmareMasterSource(read('broodmare_master.v6-20261006.game.json'), source)
    mare.fields = stallion.fields
    entries = json.loads((ROOT / 'json/dabimasFactor.json').read_text(encoding='utf-8'))['horseLists']
    return stallion, mare, entries


def test_real_root_fields_and_ancestors(tmp_path):
    stallion, mare, entries = real_sources()
    hints = game.build_name_hints(entries)
    counts = Counter(e['nodeId'] for e in entries)
    master_counts = Counter(r['node_id'] for r in stallion.records.values())
    by_node = {r['node_id']: r for r in stallion.records.values()}
    mares = {r['node_id']: r for r in mare.records.values()}
    checked = Counter()
    names, nulls, exceptions = [], [], []
    keys = ['name', 'ruby', 'subName', 'nature', 'sex', 'rare', 'abilityType', 'categoryIcon',
            'parentLine', 'parentLineId', 'son', 'sonId', 'factors']
    for old in entries:
        if old['sex'] == '0':
            if counts[old['nodeId']] != 1 or master_counts[old['nodeId']] != 1: continue
            new = stallion.build_entry(by_node[old['nodeId']], hints)
        else:
            new = mare.build_entry(mares[old['nodeId']], hints)
        checked[old['sex']] += 1
        for key in keys:
            if old['name'] == 'ヨ－クダリア' and key in ('name', 'ruby'):
                exceptions.append([key, old[key], new[key]])
            else: assert new[key] == old[key], (old['name'], key, old[key], new[key])
        for prior, current in zip(old['descendants'], new['descendants']):
            if prior['name'] != current['name']: names.append([old['sex'], prior['pedigreeId'], prior['name'], current['name']])
            if prior['nodeId'] is None:
                if current['nodeId'] is not None: nulls.append([old['id'], prior, current])
                continue
            assert {k:v for k,v in current.items() if k != 'name'} == {k:v for k,v in prior.items() if k != 'name'}
    assert checked == {'0': 2377, '1': 500}
    report = {'checked': dict(checked), 'names': names, 'nulls': nulls, 'mare_exceptions': exceptions}
    (ROOT / 'tmp/root-field-comparison.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
