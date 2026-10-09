from copy import deepcopy
import json
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import build_dabimas_stream as build
from verify_dabimas_outputs import load_outputs, verify
from test_game_master_source import sources


def outputs():
    stallion, _ = sources()
    entry = stallion.build_entry(stallion.find_record('1'), {})
    pids = {entry['pedigreeId']}
    pids.update(a['pedigreeId'] for a in entry['descendants'] if a['pedigreeId'])
    pids.update(stallion.fields.source.node_pedigree_id(n) for n in entry['mares'] if n)
    return {'dabimasFactor.json': {'horseLists': [{k:v for k,v in entry.items() if k != 'mares'}]},
            'dabimasFactor.summary.json': {'version': 1, 'chunkSize': 128, 'horseLists': [build.entry_to_summary(entry, 0)]},
            'details': {'dabimasFactor.details.000.json': {'version': 1, 'chunkIndex': 0,
                         'horseDetails': [{'id': entry['id'], 'descendants': entry['descendants'], 'mares': entry['mares']}]}},
            'pedigreeNodes.json': stallion.fields.source.build_pedigree_nodes(pids)}


def test_valid_outputs():
    data = outputs()
    assert verify(data, data) == {}


@pytest.mark.parametrize('code', ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08'])
def test_each_guard(code):
    data = outputs()
    if code == 'C01': data['dabimasFactor.summary.json']['horseLists'].clear()
    if code == 'C02': data['dabimasFactor.json']['horseLists'] *= 2
    if code == 'C03': data['dabimasFactor.summary.json']['horseLists'][0]['detailChunk'] = 2
    if code == 'C04': data['dabimasFactor.json']['horseLists'][0]['nodeId'] = 'absent'
    if code == 'C05': data['dabimasFactor.json']['horseLists'].clear()
    if code == 'C06': data['dabimasFactor.summary.json']['horseLists'][0].pop('ruby')
    if code == 'C07': data['pedigreeNodes.json']['version'] = 1
    if code == 'C08': data['dabimasFactor.json']['horseLists'][0]['id'] = 'bg1'
    assert code in verify(data)


def test_drop_boundary():
    new, old = outputs(), outputs()
    old['dabimasFactor.json']['horseLists'] *= 11
    assert 'C05' not in verify(new, old)
    old['dabimasFactor.json']['horseLists'].append(old['dabimasFactor.json']['horseLists'][0])
    assert 'C05' in verify(new, old)


@pytest.mark.parametrize('change', ['extra', 'gap', 'index', 'alien', 'duplicate'])
def test_chunk_integrity(change):
    data = outputs()
    chunks = data['details']
    chunk = chunks['dabimasFactor.details.000.json']
    if change == 'extra': chunks['dabimasFactor.details.001.json'] = deepcopy(chunk)
    if change == 'gap': chunks['dabimasFactor.details.001.json'] = chunks.pop('dabimasFactor.details.000.json')
    if change == 'index': chunk['chunkIndex'] = 1
    if change == 'alien': chunk['horseDetails'][0]['id'] = 's999'
    if change == 'duplicate': chunk['horseDetails'] *= 2
    assert 'C03' in verify(data)


def test_real_published_passes():
    path = Path(__file__).resolve().parents[1] / 'json'
    data = load_outputs(path)
    assert len(data['dabimasFactor.json']['horseLists']) == 2957
    assert verify(data, data) == {}
