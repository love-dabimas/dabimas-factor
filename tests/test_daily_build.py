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
    docs = game_documents()
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


@pytest.mark.parametrize('as_of,expected,mares', [
    ('2026-10-07T22:00:00+09:00', 3, False), ('2026-10-13T11:30:00+09:00', 6, False),
    ('2026-10-13T12:00:00+09:00', 9, False), ('2026-10-08T11:30:00+09:00', 0, True),
    ('2029-12-31T23:59:59+09:00', 0, True), ('2030-01-01T00:00:00+09:00', 7, True)])
def test_real_daily_boundaries(tmp_path, monkeypatch, as_of, expected, mares):
    masters = ROOT / 'tmp/masters-20261007'
    if not masters.exists(): pytest.skip('local masters absent')
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
    assert len(added) == expected
    if mares and expected:
        assert {e['id'] for e in added} == {'bg283', 'bg285', 'bg287', 'bg329', 'bg343', 'bg345', 'bg346'}
    if not mares:
        assert any(e['game_id'] == '300011' for e in audit['excluded'])
    old = json.loads((ROOT / 'json/dabimasFactor.json').read_text(encoding='utf-8'))['horseLists']
    new = json.loads((tmp_path / 'dabimasFactor.json').read_text(encoding='utf-8'))['horseLists']
    for a, b in zip(old, new):
        assert {k:v for k,v in a.items() if k not in ('descendants', 'nodeId', 'pedigreeId')} == {
            k:v for k,v in b.items() if k not in ('descendants', 'nodeId', 'pedigreeId')}
