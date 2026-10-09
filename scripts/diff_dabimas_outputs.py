"""公開成果物を比較し、X の更新画像用に短い変更一覧を作る。"""
import argparse
from copy import deepcopy
import json
import os
from pathlib import Path
import sys

from verify_dabimas_outputs import load_outputs

LABELS = dict(name='馬名', ruby='ふりがな', subName='副題', nature='天性', rare='レア度',
              abilityType='非凡', categoryIcon='カテゴリ', parentLine='系統', parentLineId='系統',
              son='系統', sonId='系統', factors='因子')


def display(entry):
    if entry['sex'] == '1': return '牝 ' + entry['name']
    suffix = f'-{entry["subName"]}-' if entry['subName'] else ''
    return f'★{entry["rare"]} {entry["name"]}{suffix}'


def comparable(outputs):
    result = deepcopy(outputs)
    result['pedigreeNodes.json'].pop('datasetVersion', None)
    return result


def mare_index(outputs):
    return {e['id']: e.get('mares') for chunk in outputs['details'].values() for e in chunk['horseDetails']}


def compare(staging, published):
    changed = comparable(staging) != comparable(published)
    old = {e['id']: e for e in published['dabimasFactor.json']['horseLists']}
    new = {e['id']: e for e in staging['dabimasFactor.json']['horseLists']}
    old_mares, new_mares = mare_index(published), mare_index(staging)
    added, modified, pedigree, removed = [], [], [], []
    for hid, entry in new.items():
        if hid not in old:
            added.append(display(entry))
            continue
        fields = [key for key in LABELS if old[hid].get(key) != entry.get(key)]
        if fields:
            labels = []
            for key in fields:
                label = LABELS[key]
                if key in ('name', 'subName'):
                    label += f' {old[hid][key]} → {entry[key]}'
                if label not in labels: labels.append(label)
            modified.append(display(entry) + ': ' + '・'.join(labels))
        elif (any(old[hid].get(key) != entry.get(key) for key in ('nodeId', 'pedigreeId', 'descendants'))
              or old_mares.get(hid) != new_mares.get(hid)):
            pedigree.append(hid)
    removed = [display(entry) for hid, entry in old.items() if hid not in new]
    dictionary = 0
    for key in ('pedigrees', 'nodes'):
        a, b = published['pedigreeNodes.json'][key], staging['pedigreeNodes.json'][key]
        dictionary += sum(k not in a or k not in b or a[k] != b[k] for k in a.keys() | b.keys())
    stats = dict(content_changed=changed, added=len(added), changed=len(modified),
                 pedigree=len(pedigree), dictionary=dictionary, removed=len(removed))
    sections = []
    for label, rows, limit in [('追加', added, 20), ('変更', modified, 10)]:
        if rows: sections.append((f'【{label} {len(rows)}頭】', rows, limit))
    if pedigree: sections.append((f'【血統表の更新 {len(pedigree)}頭】', [], 0))
    if dictionary: sections.append((f'【血統辞書の更新 {dictionary}件】', [], 0))
    if removed: sections.append((f'【削除 {len(removed)}頭】', removed, 20))
    lines = []
    for index, (heading, rows, limit) in enumerate(sections):
        # 後続見出しと、その省略行に最低限の場所を残す。
        reserved = sum(1 + bool(r) for _, r, _ in sections[index + 1:])
        lines.append(heading)
        capacity = max(0, 40 - len(lines) - reserved)
        count = min(limit, len(rows), capacity)
        if count < len(rows): count = min(count, max(0, capacity - 1))
        lines.extend(rows[:count])
        if count < len(rows): lines.append(f'ほか {len(rows) - count}頭')
    if changed and not lines: lines = ['データを更新しました']
    return stats, lines if changed else []


def write_text(path, text):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8', newline='\n')


def main(argv=None):
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--staging', type=Path, required=True)
    parser.add_argument('--published', type=Path, required=True)
    parser.add_argument('--text-out', type=Path, required=True)
    parser.add_argument('--json-out', type=Path)
    args = parser.parse_args(argv)
    stats, lines = compare(load_outputs(args.staging), load_outputs(args.published))
    write_text(args.text_out, '\n'.join(lines) + ('\n' if lines else ''))
    if args.json_out: write_text(args.json_out, json.dumps(stats, ensure_ascii=False, indent=2) + '\n')
    changed = str(stats['content_changed']).lower()
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8', newline='\n') as fp:
            fp.write(f'content_changed={changed}\n')
    print(f'content_changed={changed} ' + ' '.join(f'{key}={value}' for key, value in stats.items() if key != 'content_changed'))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
