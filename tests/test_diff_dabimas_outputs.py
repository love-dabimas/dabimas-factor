from copy import deepcopy
import json
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from diff_dabimas_outputs import compare, main
from test_verify_dabimas_outputs import outputs


def test_version_only_is_ignored():
    old, new = outputs(), outputs()
    new['pedigreeNodes.json']['datasetVersion'] = 'another'
    assert compare(new, old)[0]['content_changed'] is False


@pytest.mark.parametrize('kind,heading', [('added', '追加'), ('changed', '変更'), ('pedigree', '血統表の更新'),
                                       ('dictionary', '血統辞書の更新'), ('removed', '削除')])
def test_change_classification(kind, heading):
    old, new = outputs(), outputs()
    entry = new['dabimasFactor.json']['horseLists'][0]
    if kind == 'added': new['dabimasFactor.json']['horseLists'].append(dict(entry, id='sg2'))
    if kind == 'changed': entry['name'] = '新馬名'
    if kind == 'pedigree': entry['descendants'][0]['name'] = '祖先名'
    if kind == 'dictionary': new['pedigreeNodes.json']['nodes']['new'] = ['new']
    if kind == 'removed': new['dabimasFactor.json']['horseLists'].clear()
    stats, lines = compare(new, old)
    assert stats['content_changed'] and stats[kind] == 1
    assert lines[0] == f'【{heading} 1{"件" if kind == "dictionary" else "頭"}】'
    if kind == 'changed': assert '旧' not in lines[1] and ' → 新馬名' in lines[1]


def test_root_change_takes_precedence_and_mares_change_counts():
    old, new = outputs(), outputs()
    new['details']['dabimasFactor.details.000.json']['horseDetails'][0]['mares'][0] = 'other'
    assert compare(new, old)[0]['pedigree'] == 1
    new['dabimasFactor.json']['horseLists'][0]['nature'] = '変更'
    stats, _ = compare(new, old)
    assert stats['changed'] == 1 and stats['pedigree'] == 0


def test_line_limits_and_fallback():
    old, new = outputs(), outputs()
    template = deepcopy(new['dabimasFactor.json']['horseLists'][0])
    old['dabimasFactor.json']['horseLists'] = [dict(template, id=f's{i}') for i in range(100)]
    new['dabimasFactor.json']['horseLists'] = [dict(template, id=f's{i}', name='更新') for i in range(50, 150)]
    _, lines = compare(new, old)
    assert len(lines) <= 40
    assert any(line.startswith('ほか ') for line in lines)
    new = deepcopy(old)
    new['dabimasFactor.summary.json']['version'] = 99
    assert compare(new, old)[1] == ['データを更新しました']


def test_cli_writes_github_output(tmp_path, monkeypatch):
    data = outputs()
    for dirname in ['old', 'new']:
        root = tmp_path / dirname
        root.mkdir()
        for name, value in data.items():
            if name == 'details':
                (root / 'dabimasFactor-details').mkdir()
                for chunk, doc in value.items(): (root / 'dabimasFactor-details' / chunk).write_text(json.dumps(doc), encoding='utf-8')
            else: (root / name).write_text(json.dumps(value), encoding='utf-8')
    monkeypatch.setenv('GITHUB_OUTPUT', str(tmp_path / 'github-output'))
    assert main(['--staging', str(tmp_path / 'new'), '--published', str(tmp_path / 'old'), '--text-out', str(tmp_path / 'nested/lines.txt')]) == 0
    assert (tmp_path / 'github-output').read_text() == 'content_changed=false\n'
