"""公開用4成果物の件数・ID・血統参照を公開前に検証する。"""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import re
import sys

SUMMARY_FIELDS = set('id detailChunk name ruby subName nature sex rare abilityType categoryIcon parentLine parentLineId son sonId factors displayName searchText nodeId pedigreeId'.split())


def read_json(path):
    return Path(path).read_text(encoding='utf-8')


def load_outputs(directory):
    directory = Path(directory)
    return {**{name: json.loads(read_json(directory / name)) for name in
               ('dabimasFactor.json', 'dabimasFactor.summary.json', 'pedigreeNodes.json')},
            'details': {p.name: json.loads(read_json(p)) for p in sorted(
                (directory / 'dabimasFactor-details').glob('dabimasFactor.details.*.json'))}}


def verify(staging, published=None, max_drop=10):
    """違反コードごとの例を返す。空辞書なら公開可能。"""
    errors = defaultdict(list)
    full = staging['dabimasFactor.json']['horseLists']
    summary_doc = staging['dabimasFactor.summary.json']
    summary = summary_doc['horseLists']
    chunks = staging['details']
    details = [e for chunk in chunks.values() for e in chunk['horseDetails']]
    nodes_doc = staging['pedigreeNodes.json']
    nodes, pedigrees = nodes_doc['nodes'], nodes_doc['pedigrees']
    if len(full) != len(summary) or len(full) != len(details):
        errors['C01'].append(f'full={len(full)}, summary={len(summary)}, details={len(details)}')
    ids = [e['id'] for e in full]
    for label, records in [('full', full), ('summary', summary), ('details', details)]:
        counts = Counter(e['id'] for e in records)
        errors['C02'].extend(f'{label} duplicate {hid}' for hid, count in counts.items() if count > 1)
    if ids != [e['id'] for e in summary]: errors['C02'].append('summary ID order differs')
    size = summary_doc.get('chunkSize')
    if type(size) is not int or size < 1:
        errors['C03'].append('invalid chunkSize')
    else:
        expected = {f'dabimasFactor.details.{i:03d}.json' for i in range((len(full) + size - 1) // size)}
        if set(chunks) != expected: errors['C03'].append('chunk files are not consecutive or count differs')
    locations = defaultdict(list)
    for filename, chunk in chunks.items():
        match = re.fullmatch(r'dabimasFactor.details.(\d+)\.json', filename)
        index = int(match[1]) if match else None
        if chunk.get('chunkIndex') != index: errors['C03'].append(f'{filename} chunkIndex differs')
        for entry in chunk['horseDetails']: locations[entry['id']].append(index)
    for entry in summary:
        if locations[entry['id']] != [entry.get('detailChunk')]:
            errors['C03'].append(f'{entry["id"]} wrong detailChunk')
    errors['C03'].extend(f'unexpected detail {hid}' for hid in set(locations) - {e['id'] for e in summary})
    for entry in full:
        nid, pid = entry.get('nodeId'), entry.get('pedigreeId')
        if nid is None or pid is None or nid not in nodes or pid not in pedigrees or nodes[nid][0] != pid:
            errors['C04'].append(f'{entry["id"]} root reference')
        descendants = entry.get('descendants')
        if not isinstance(descendants, list) or len(descendants) != 15:
            errors['C04'].append(f'{entry["id"]} descendants length')
        else:
            errors['C04'].extend(f'{entry["id"]} descendant {a.get("nodeId")}' for a in descendants
                                 if a.get('nodeId') is not None and a['nodeId'] not in nodes)
    for entry in details:
        mares = entry.get('mares')
        if not isinstance(mares, list) or len(mares) != 15:
            errors['C04'].append(f'{entry["id"]} mares length')
        else:
            errors['C04'].extend(f'{entry["id"]} mare {nid}' for nid in mares if nid is not None and nid not in nodes)
    if not full: errors['C05'].append('no horses')
    if published:
        old = Counter(e['sex'] for e in published['dabimasFactor.json']['horseLists'])
        new = Counter(e['sex'] for e in full)
        errors['C05'].extend(f'sex={sex} dropped {count - new[sex]}' for sex, count in old.items() if count - new[sex] > max_drop)
    for entry in summary:
        missing = SUMMARY_FIELDS - entry.keys()
        if missing: errors['C06'].append(f'{entry.get("id")} missing {sorted(missing)}')
    if nodes_doc.get('version') != 2 or not isinstance(nodes_doc.get('datasetVersion'), str) or not nodes_doc['datasetVersion']:
        errors['C07'].append('invalid version/datasetVersion')
    errors['C07'].extend(f'{nid} unknown pedigree' for nid, value in nodes.items() if not value or value[0] not in pedigrees)
    for entry in full:
        hid, sex = entry['id'], entry['sex']
        if (sex not in ('0', '1') or not hid.startswith('s' if sex == '0' else 'b')
            or (hid.startswith(('sg', 'bg')) and not re.fullmatch(r'(sg|bg)\d+', hid))):
            errors['C08'].append(f'{hid} sex={sex}')
    return {code: values for code, values in errors.items() if values}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--staging', type=Path, required=True)
    parser.add_argument('--published', type=Path)
    parser.add_argument('--max-drop', type=int, default=10)
    args = parser.parse_args(argv)
    try:
        staging = load_outputs(args.staging)
        published = load_outputs(args.published) if args.published and args.published.exists() else None
        errors = verify(staging, published, args.max_drop)
        for code, values in errors.items():
            print(f'[verify] NG {code}: {len(values)} violations; {values[:5]}')
        if errors: return 1
        print(f'[verify] OK ({len(staging["dabimasFactor.json"]["horseLists"])} horses)')
        return 0
    except (OSError, ValueError, KeyError, TypeError, IndexError) as exc:
        print(f'[verify] NG C01: unreadable outputs: {exc}')
        return 1


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
