from copy import deepcopy
import json
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import build_dabimas_stream as build
import game_master_source as game
from pedigree_master_fetch import validate_game_masters
from pedigree_master_source import PedigreeMasterSource
from test_game_master_source import ROOT, sources
from test_pedigree_master_fetch import game_documents


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')


def local_args(tmp_path):
    fixture = ROOT / 'tests/fixtures/daily-update'
    docs = [json.loads((fixture / name).read_text(encoding='utf-8')) for name in
            ['pedigree_master.json', 'pedigree_master.game.json', 'stallion_master.game.json',
             'ability_master.game.json', 'broodmare_master.game.json']]
    args = []
    for flag, doc in zip(['pedigree-master', 'pedigree-game-nodes', 'stallion-master', 'ability-master', 'broodmare-master'], docs):
        path = tmp_path / f'{flag}.json'
        write(path, doc)
        args += [f'--{flag}-file', str(path)]
    stallion, _ = sources()
    entry = stallion.build_entry(stallion.find_record('1'), {})
    write(tmp_path / 'previous/dabimasFactor.json', {'horseLists': [entry]})
    return args + ['--previous-json-dir', str(tmp_path / 'previous'), '--output', str(tmp_path / 'out/dabimasFactor.json'),
                   '--as-of', '2026-10-13T11:30:00+09:00']


def test_daily_never_constructs_fetcher(tmp_path, monkeypatch):
    args = local_args(tmp_path)
    # v5 disables the unconfigured fixture mare without affecting stallions.
    path = tmp_path / 'broodmare-master.json'
    doc = json.loads(path.read_text(encoding='utf-8'))
    doc['schema_version'] = 5
    write(path, doc)
    def forbidden(*a, **kw): pytest.fail('daily touched Fetcher')
    monkeypatch.setattr(build, 'Fetcher', forbidden)
    assert build.main(args + ['--mode', 'daily']) == 0


@pytest.mark.parametrize('extra', [['--urls-file', 'none'], ['--limit', '1'], ['--as-of', '2026-01-01T00:00:00'],
                                  ['--previous-json-dir', 'absent'], ['--r2-endpoint', 'https://invalid', '--allow-mixed-master-versions']])
def test_daily_invalid_arguments(tmp_path, extra):
    assert build.main(local_args(tmp_path) + ['--mode', 'daily'] + extra) == 1


def test_weekly_adopts_and_carries_stable_ids():
    docs = game_documents()
    docs[4]['broodmares'][0]['broodmare_grade'] = {'mapping_status': 'verified', 'code': 'U'}
    source = PedigreeMasterSource(docs[0], docs[1])
    bundle = validate_game_masters(*docs)
    stallion = game.StallionMasterSource(docs[2], docs[3], source)
    mare = game.BroodmareMasterSource(docs[4], source)
    old_s = stallion.build_entry(stallion.find_record('1'), {})
    old_b = mare.build_entry(mare.find_record('1'), {})
    update = game.GameUpdate(bundle, source, [old_s, old_b], 'weekly', 2000000000, (set(), set()))
    current = dict(old_b, id='b123', name='different spelling')
    update.weekly_entry(current)
    assert current['id'] == 'bg1'
    assert [e['id'] for e in update.carried_entries()] == ['sg1']
    current = dict(old_s, id='s123')
    update.weekly_entry(current)
    assert current['id'] == 'sg1' and not update.carried_entries()


@pytest.mark.parametrize('reason', ['missing', 'future', 'inactive', 'excluded'])
def test_weekly_drops_ineligible_carry(reason):
    docs = game_documents()
    source = PedigreeMasterSource(docs[0], docs[1])
    bundle = validate_game_masters(*docs)
    stallion = game.StallionMasterSource(docs[2], docs[3], source)
    old = stallion.build_entry(stallion.find_record('1'), {})
    update = game.GameUpdate(bundle, source, [old], 'weekly', 10, ({'1'} if reason == 'excluded' else set(), set()))
    if reason == 'missing': update.stallions.records.clear()
    if reason == 'future': update.stallions.find_record('1')['display_start_at_raw'] = 11
    if reason == 'inactive': update.stallions.find_record('1')['active'] = False
    assert not update.carried_entries()
    assert update.audit['dropped'][0]['id'] == 'sg1'


# その時刻までに公開開始となる馬（ゲーム ID）。週次が先に拾うと公開済みになるので、
# 頭数は固定せず「候補のうち、まだ公開されていないものだけが足される」ことを見る。
CANDIDATES = {
    '2026-10-07T22:00:00+09:00': ['101319', '101320', '101321'],
    '2026-10-13T11:30:00+09:00': ['101319', '101320', '101321', '101324', '101325', '101326'],
    '2026-10-13T12:00:00+09:00': ['101319', '101320', '101321', '101324', '101325', '101326',
                                  '1062', '1063', '1064'],
    '2026-10-08T11:30:00+09:00': [],
    '2029-12-31T23:59:59+09:00': [],
    '2030-01-01T00:00:00+09:00': ['283', '285', '287', '329', '343', '345', '346'],
}


def expected_added(as_of, mares, masters):
    """候補のうち、公開済み（同じ node が公開データにいる）でないものを返す。"""
    published = {e['nodeId'] for e in json.loads(
        (ROOT / 'json/dabimasFactor.summary.json').read_text(encoding='utf-8'))['horseLists']}
    name = 'broodmare_master.v6-20261006.game.json' if mares else 'stallion_master.game.json'
    key = 'game_broodmare_id' if mares else 'game_stallion_id'
    records = json.loads((masters / name).read_text(encoding='utf-8'))
    rows = records if isinstance(records, list) else next(v for v in records.values() if isinstance(v, list))
    node_of = {str(r[key]): str(r['node_id']) for r in rows if key in r}
    prefix = 'bg' if mares else 'sg'
    return {prefix + gid for gid in CANDIDATES[as_of] if node_of.get(gid) not in published}


@pytest.mark.parametrize('as_of,mares', [
    ('2026-10-07T22:00:00+09:00', False), ('2026-10-13T11:30:00+09:00', False),
    ('2026-10-13T12:00:00+09:00', False), ('2026-10-08T11:30:00+09:00', True),
    ('2029-12-31T23:59:59+09:00', True), ('2030-01-01T00:00:00+09:00', True)])
def test_real_daily_boundaries(tmp_path, monkeypatch, as_of, mares):
    masters = ROOT / 'tmp/masters-20261007'
    required = ['pedigree_master.json', 'pedigree_master.game.json', 'stallion_master.game.json', 'ability_master.game.json']
    if mares:
        required.append('broodmare_master.v6-20261006.game.json')
    if not all((masters / name).is_file() for name in required): pytest.skip('local masters absent')
    def forbidden(*a, **kw): pytest.fail('daily touched Fetcher')
    monkeypatch.setattr(build, 'Fetcher', forbidden)
    args = ['--mode', 'daily', '--as-of', as_of, '--previous-json-dir', str(ROOT / 'json'), '--fail-on-error']
    for flag, file in [('pedigree-master', 'pedigree_master.json'), ('pedigree-game-nodes', 'pedigree_master.game.json'),
                       ('stallion-master', 'stallion_master.game.json'), ('ability-master', 'ability_master.game.json')]:
        args += [f'--{flag}-file', str(masters / file)]
    if mares:
        args += ['--broodmare-master-file', str(masters / 'broodmare_master.v6-20261006.game.json'), '--allow-mixed-master-versions']
    for flag, name in [('output', 'dabimasFactor.json'), ('summary-output', 'dabimasFactor.summary.json'),
                       ('details-output-dir', 'dabimasFactor-details'), ('pedigree-nodes-output', 'pedigreeNodes.json'),
                       ('audit-output', 'audit.json')]:
        args += ['--' + flag, str(tmp_path / name)]
    assert build.main(args) == 0
    audit = json.loads((tmp_path / 'audit.json').read_text(encoding='utf-8'))
    added = [e for e in audit['added'] if e['kind'] == ('broodmare' if mares else 'stallion')]
    assert {e['id'] for e in added} == expected_added(as_of, mares, masters)
    if not mares:
        assert any(e['game_id'] == '300011' for e in audit['excluded'])
    old = json.loads((ROOT / 'json/dabimasFactor.json').read_text(encoding='utf-8'))['horseLists']
    new = json.loads((tmp_path / 'dabimasFactor.json').read_text(encoding='utf-8'))['horseLists']
    from verify_dabimas_outputs import load_outputs, verify
    assert verify(load_outputs(tmp_path), load_outputs(ROOT / 'json')) == {}
    summaries = json.loads((tmp_path / 'dabimasFactor.summary.json').read_text(encoding='utf-8'))['horseLists']
    assert all('gameId' in e and (e['gameId'] is None or isinstance(e['gameId'], str)) for e in new)
    assert [e['gameId'] for e in new] == [e['gameId'] for e in summaries]
    assert all(e['gameId'] is not None for e in new[len(old):])
    if mares:
        assert all(e['gameId'] is not None for e in new if e['sex'] == '1')
    for a, b in zip(old, new):
        assert {k:v for k,v in a.items() if k not in ('descendants', 'gameId', 'nodeId', 'pedigreeId')} == {
            k:v for k,v in b.items() if k not in ('descendants', 'gameId', 'nodeId', 'pedigreeId')}


def test_weekly_cli_adopts_id_and_rejects_empty_list(tmp_path, monkeypatch):
    from test_build_dabimas_stream import _make_row
    args = local_args(tmp_path)
    master = json.loads((tmp_path / 'stallion-master.json').read_text(encoding='utf-8'))
    master['stallions'][0]['name'] = 'シンザン'
    write(tmp_path / 'stallion-master.json', master)
    prior = json.loads((tmp_path / 'previous/dabimasFactor.json').read_text(encoding='utf-8'))
    prior['horseLists'][0]['name'] = 'シンザン'
    write(tmp_path / 'previous/dabimasFactor.json', prior)
    row = _make_row(build, sex='0', url='https://dabimas.jp/kouryaku/stallions/8661.html', name='シンザン')
    class FakeFetcher:
        def __init__(self, **kwargs): pass
        def fetch_soup(self, url): return object()
        def close(self): pass
    monkeypatch.setattr(build, 'Fetcher', FakeFetcher)
    monkeypatch.setattr(build, 'collect_horse_urls', lambda fetcher: [row[build.HD_HORSE_ID]])
    monkeypatch.setattr(build, 'parse_stallion', lambda *args: row)
    assert build.main(args + ['--mode', 'weekly', '--delay', '0']) == 0
    new = json.loads((tmp_path / 'out/dabimasFactor.json').read_text(encoding='utf-8'))['horseLists']
    assert len(new) == 1 and new[0]['id'] == 'sg1' and new[0]['gameId'] == '1'
    monkeypatch.setattr(build, 'collect_horse_urls', lambda fetcher: [])
    assert build.main(args + ['--mode', 'weekly']) == 1
