"""ゲームマスターの公開開始判定と、既存形式への変換。ネットワークには触れない。"""
from __future__ import annotations

from collections import Counter, defaultdict
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
import unicodedata

# CLI と importlib で同じ変換規則・警告カウンタを共有する。
try:
    import build_dabimas_stream as conversion
except ModuleNotFoundError:
    import importlib.util
    spec = importlib.util.spec_from_file_location('build_dabimas_stream', Path(__file__).with_name('build_dabimas_stream.py'))
    conversion = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = conversion
    spec.loader.exec_module(conversion)

JST = timezone(timedelta(hours=9))
STALLION_ID_PREFIX = 'sg'
BROODMARE_ID_PREFIX = 'bg'
GRADE_CATEGORY_ICON = {'U': 'sale_08', 'V': 'sale_07', 'W': 'sale_06', 'X': 'sale_05', 'Y': 'sale_09'}


def parse_iso_epoch(text: str) -> int:
    stamp = datetime.fromisoformat(text.replace('Z', '+00:00'))
    if stamp.utcoffset() is None:
        raise ValueError('timezone is required')
    return int(stamp.timestamp())


def parse_as_of(text: str) -> int:
    return parse_iso_epoch(text)


def is_eligible(start: int | None, as_of: int) -> bool:
    return not start or start <= as_of


def load_exclusions(path: Path) -> tuple[set[str], set[str]]:
    data = json.loads(path.read_text(encoding='utf-8'))
    return set(map(str, data['game_stallion_ids'])), set(map(str, data['game_broodmare_ids']))


def split_name(name):
    match = conversion.SUB_NAME_RE.search(name)
    subname = match.group(0) if match else ''
    return (name.replace(subname, '').replace('-', '') if match else name), subname


def ability_type(record, abilities):
    ability_id = str(record['nonordinary_ability_id'])
    if ability_id == '0':
        return 'none'
    group = abilities[ability_id]['effect_group_id_raw']
    if group not in (99, 98, 97):
        raise ValueError(f'unknown effect_group_id_raw: {group}')
    return {99: 'normal', 98: 'focused', 97: 'double'}[group]


def nature_name(record, abilities):
    nature_id = str(record['sub_ability_id'])
    return '' if nature_id == '0' else abilities[nature_id]['name']


def build_name_hints(entries) -> dict[str, str]:
    counts = defaultdict(Counter)
    for entry in entries:
        for ancestor in entry['descendants']:
            if ancestor.get('pedigreeId') and ancestor.get('name'):
                counts[ancestor['pedigreeId']][ancestor['name']] += 1
    return {pid: values.most_common(1)[0][0] for pid, values in counts.items()}


@dataclass
class Selection:
    selected: list = field(default_factory=list)
    skipped_future: list = field(default_factory=list)
    skipped_duplicate_node: list = field(default_factory=list)
    excluded: list = field(default_factory=list)
    skipped_inactive: list = field(default_factory=list)


def _select(records, id_key, start_epoch, as_of, known, exclusions, stallions=False):
    selection = Selection()
    groups = {}
    for record in sorted(records, key=lambda r: int(r[id_key])):
        item = (str(record[id_key]), record['name'], record.get('display_start_at'))
        if not record['active']:
            selection.skipped_inactive.append(item)
        elif not is_eligible(start_epoch(record), as_of):
            selection.skipped_future.append(item)
        elif str(record[id_key]) in exclusions:
            selection.excluded.append(item)
        elif record['node_id'] not in known:
            key = (record['node_id'],)
            if stallions:
                key += (record['rarity'], record['nonordinary_ability_id'], record['sub_ability_id'])
            if key in groups:
                selection.skipped_duplicate_node.append(item)
            else:
                groups[key] = record
    selected = sorted(groups.values(), key=lambda r: (start_epoch(r) or 0, int(r[id_key])))
    selection.selected = [(str(r[id_key]), r['name'], r.get('display_start_at')) for r in selected]
    return selection


def empty_ancestor():
    return dict(name='', parentLine='', parentLineId=None, son='', sonId=None,
                factors=['', '', ''], nodeId=None, pedigreeId=None)


class PedigreeFields:
    """両性で共通の血統展開。表示名索引は種牡馬から一度だけ設定する。"""
    def __init__(self, source, abilities=None):
        self.source = source
        self.abilities = abilities if abilities is not None else {}
        self.names_by_node = defaultdict(Counter)
        self.names_by_pedigree = defaultdict(Counter)
        self.game_records = {'0': defaultdict(list), '1': defaultdict(list)}

    def set_stallions(self, records):
        for r in records:
            self.game_records['0'][r['node_id']].append(r)
            name = split_name(r['name'])[0]
            self.names_by_node[r['node_id']][name] += 1
            self.names_by_pedigree[r['pedigree_id']][name] += 1

    def set_broodmares(self, records):
        for record in records:
            self.game_records['1'][record['node_id']].append(record)

    def game_id(self, entry):
        """ゲームID既知なら維持。同一nodeの別能力版は根の属性で絞る。"""
        sex = entry['sex']
        records = self.game_records[sex].get(entry.get('nodeId'), [])
        key = 'game_stallion_id' if sex == '0' else 'game_broodmare_id'
        prefix = STALLION_ID_PREFIX if sex == '0' else BROODMARE_ID_PREFIX
        prior = entry['id'][2:] if entry['id'].startswith(prefix) else entry.get('gameId')
        if prior is not None and any(str(r[key]) == str(prior) for r in records):
            return str(prior)
        if sex == '0' and len(records) > 1:
            target_name = tuple(unicodedata.normalize('NFKC', s) for s in (entry['name'], entry['subName']))
            records = [r for r in records if tuple(unicodedata.normalize('NFKC', s) for s in split_name(r['name'])) == target_name
                       and r['rarity'] == entry['rare']
                       and ability_type(r, self.abilities) == entry['abilityType']
                       and nature_name(r, self.abilities) == entry['nature']]
            # 公開項目では非凡名までは分からない。別能力の候補を推測しない。
            signatures = {(r['rarity'], str(r['nonordinary_ability_id']), str(r['sub_ability_id'])) for r in records}
            if len(signatures) > 1:
                return None
        return str(min(records, key=lambda r: int(r[key]))[key]) if records else None

    def attach_game_id(self, entry):
        game_id = self.game_id(entry)
        # dict の順序を保ち、gameId だけを nodeId の直前に差し込む。
        ordered = {}
        for key, value in entry.items():
            if key == 'gameId':
                continue
            if key == 'nodeId':
                ordered['gameId'] = game_id
            ordered[key] = value
        entry.clear()
        entry.update(ordered)

    def ancestor_name(self, node, hints):
        pid = node['pedigree_id']
        for names in (self.names_by_node[node['node_id']], self.names_by_node[f'{pid}-00'],
                      self.names_by_pedigree[pid]):
            if names:
                return names.most_common(1)[0][0]
        return hints.get(pid) or self.source.pedigree(pid).get('canonical_name', '')

    def line(self, pid, identifier):
        line = self.source.sire_line(pid)
        name = line.get('name', '') if line else ''
        resolved = conversion.resolve_sire_line(name, identifier)
        return dict(parentLine=resolved['abbr'] if resolved else '',
                    parentLineId=resolved['parentLineId'] if resolved else None,
                    son=name if resolved else '', sonId=resolved['sonId'] if resolved else None)

    def factors(self, node):
        effects = node.get('pedigree_effect_ids', [])
        if not effects and node.get('variant_type') == 'year':
            base = self.source.base_node(node['pedigree_id'])
            effects = base.get('pedigree_effect_ids', []) if base else []
        if len(effects) > 3:
            raise ValueError(f'{node["node_id"]}: more than 3 pedigree_effect_ids')
        values = [conversion.FACTOR_SHORT_DICT[int(e)] for e in reversed(effects)]
        return [''] * (3 - len(values)) + values

    def rebuild(self, entry, hints):
        node = self.source.node(entry.get('nodeId'))
        if node is None:
            conversion.attach_pedigree_ids(entry, self.source)
            node = self.source.node(entry.get('nodeId'))
        if node is None:
            self.attach_game_id(entry)
            return
        pid = node['pedigree_id']
        entry['nodeId'], entry['pedigreeId'] = node['node_id'], pid
        entry['mares'] = self.source.mare_slots(pid)
        for old, nid in zip(entry['descendants'], self.source.sire_slots(pid)):
            ancestor = self.source.node(nid)
            if ancestor is None:
                old['nodeId'], old['pedigreeId'] = None, None
                continue
            apid = ancestor['pedigree_id']
            old.update(name=self.ancestor_name(ancestor, hints), **self.line(apid, entry['id']),
                       factors=self.factors(ancestor), nodeId=nid, pedigreeId=apid)
        self.attach_game_id(entry)

    def entry(self, record, *, identifier, name, subname, sex, rare, ability, nature, category, factors, hints):
        entry = dict(id=identifier, name=name, ruby=conversion.to_hiragana_ruby(name), subName=subname,
                     nature=nature, sex=sex, rare=rare, abilityType=ability, categoryIcon=category,
                     **self.line(record['pedigree_id'], identifier), factors=factors,
                     descendants=[empty_ancestor() for _ in range(15)],
                     nodeId=record['node_id'], pedigreeId=record['pedigree_id'], mares=None)
        self.rebuild(entry, hints)
        return entry


class StallionMasterSource:
    def __init__(self, stallion_master, ability_master, pedigree_source):
        self.records = {str(r['game_stallion_id']): r for r in stallion_master['stallions']}
        self.abilities = {str(r['game_ability_id']): r for r in ability_master['abilities']}
        self.fields = PedigreeFields(pedigree_source, self.abilities)
        self.fields.set_stallions(stallion_master['stallions'])

    def find_record(self, game_stallion_id):
        return self.records.get(str(game_stallion_id))

    @staticmethod
    def start_epoch(record):
        return record['display_start_at_raw']

    def select_new(self, as_of, known_node_ids, exclusions):
        return _select(self.records.values(), 'game_stallion_id', self.start_epoch, as_of,
                       known_node_ids, exclusions, stallions=True)

    def rebuild_pedigree_fields(self, entry, name_hints):
        self.fields.rebuild(entry, name_hints)

    def build_entry(self, record, name_hints):
        name, subname = split_name(record['name'])
        nature = nature_name(record, self.abilities)
        ability = ability_type(record, self.abilities)
        asset = (record.get('header_badge') or {}).get('asset_key')
        if not asset:
            print(f'[warn] categoryIcon missing: sg{record["game_stallion_id"]}', file=sys.stderr)
        return self.fields.entry(
            record, identifier=STALLION_ID_PREFIX + str(record['game_stallion_id']),
            name=name, subname=subname, sex='0', rare=record['rarity'], ability=ability,
            nature=nature, category=conversion.parse_category_icon(asset or ''),
            factors=self.fields.factors(self.fields.source.node(record['node_id'])), hints=name_hints)


class BroodmareMasterSource:
    def __init__(self, broodmare_master, pedigree_source):
        self.master = broodmare_master
        self.records = {str(r['game_broodmare_id']): r for r in broodmare_master['broodmares']}
        self.fields = PedigreeFields(pedigree_source)
        self.fields.set_broodmares(broodmare_master['broodmares'])

    def start_dates_available(self):
        return self.master['schema_version'] >= 6 and bool(self.master.get('display_start_at_field_map'))

    def find_record(self, game_broodmare_id):
        return self.records.get(str(game_broodmare_id))

    @staticmethod
    def start_epoch(record):
        return parse_iso_epoch(record['display_start_at']) if 'display_start_at' in record else None

    def select_new(self, as_of, known_node_ids, exclusions):
        if not self.start_dates_available():
            raise ValueError('broodmare start dates unavailable')
        return _select(self.records.values(), 'game_broodmare_id', self.start_epoch, as_of, known_node_ids, exclusions)

    def rebuild_pedigree_fields(self, entry, name_hints):
        self.fields.rebuild(entry, name_hints)

    def build_entry(self, record, name_hints):
        grade = record['broodmare_grade']
        if grade.get('mapping_status') != 'verified' or grade.get('code') not in GRADE_CATEGORY_ICON:
            raise ValueError(f'broodmare_grade unverified or unknown: {grade}')
        return self.fields.entry(
            record, identifier=BROODMARE_ID_PREFIX + str(record['game_broodmare_id']),
            name=record['name'], subname='', sex='1', rare=None, ability=None, nature='',
            category=GRADE_CATEGORY_ICON[grade['code']], factors=['', '', ''], hints=name_hints)


class GameUpdate:
    """日次の追記と金曜のID引き継ぎ・持ち越しを、監査記録と一緒に扱う。"""
    def __init__(self, bundle, source, previous, mode, as_of, exclusions):
        self.source, self.previous, self.mode, self.as_of = source, previous, mode, as_of
        self.stallions = StallionMasterSource(bundle.stallion, bundle.ability, source)
        self.mares = BroodmareMasterSource(bundle.broodmare, source) if bundle.broodmare else None
        if self.mares:
            self.stallions.fields.set_broodmares(bundle.broodmare['broodmares'])
            self.mares.fields = self.stallions.fields
        self.exclusions = exclusions
        self.hints = build_name_hints(previous)
        reason = ('broodmare master not supplied' if self.mares is None else
                  'broodmare schema lacks verified start dates' if not self.mares.start_dates_available() else None)
        self.mares_enabled = reason is None
        if reason:
            print(f'[warn] mares: {reason}', file=sys.stderr)
        self.audit = dict(mode=mode, as_of_utc=datetime.fromtimestamp(as_of, timezone.utc).isoformat(),
                          as_of_jst=datetime.fromtimestamp(as_of, JST).isoformat(),
                          dataset_version=source.dataset_version, previous_count=len(previous), output_count=0,
                          added=[], skipped_future={'stallion': [], 'broodmare': []},
                          skipped_duplicate_node=[], excluded=[], adopted_ids=[], carried_sg=[], carried_bg=[],
                          dropped=[], mares_disabled_reason=reason, ancestor_name_updates=[])
        self.adopted = set()
        self.id_index = {}
        if mode == 'weekly':
            for entry in previous:
                if entry['id'].startswith(('sg', 'bg')):
                    self.rebuild(entry)
                    key = self.match_key(entry)
                    if entry.get('nodeId'):
                        self.id_index[key] = entry['id']

    @staticmethod
    def match_key(entry):
        return (('1', entry.get('nodeId')) if entry['sex'] == '1' else
                ('0', entry.get('nodeId'), entry['name'], entry['subName']))

    def rebuild(self, entry):
        old = deepcopy(entry['descendants'])
        self.stallions.rebuild_pedigree_fields(entry, self.hints)
        for before, after in zip(old, entry['descendants']):
            if before['name'] != after['name']:
                self.audit['ancestor_name_updates'].append(dict(pedigree_id=after['pedigreeId'],
                                                               old=before['name'], new=after['name']))

    def daily_entries(self):
        entries = deepcopy(self.previous)
        for entry in entries:
            self.rebuild(entry)
        known = {e['nodeId'] for e in entries if e.get('nodeId')}
        for kind, source, excluded in [('stallion', self.stallions, self.exclusions[0]),
                                       ('broodmare', self.mares, self.exclusions[1])]:
            if kind == 'broodmare' and not self.mares_enabled:
                continue
            selection = source.select_new(self.as_of, known, excluded)
            self.audit['skipped_future'][kind] = selection.skipped_future[:50]
            for key in ('skipped_duplicate_node', 'excluded'):
                self.audit[key].extend(dict(kind=kind, game_id=i[0], name=i[1], display_start_at=i[2])
                                       for i in getattr(selection, key))
            for game_id, _, start in selection.selected:
                entry = source.build_entry(source.find_record(game_id), self.hints)
                entries.append(entry)
                known.add(entry['nodeId'])
                self.audit['added'].append(dict(id=entry['id'], kind=kind, name=entry['name'],
                                               subName=entry['subName'], game_id=game_id, display_start_at=start))
        return entries

    def weekly_entry(self, entry):
        self.rebuild(entry)
        identifier = self.id_index.get(self.match_key(entry))
        if identifier and identifier not in self.adopted:
            self.audit['adopted_ids'].append(dict(old=entry['id'], new=identifier))
            entry['id'] = identifier
            self.stallions.fields.attach_game_id(entry)
            self.adopted.add(identifier)

    def carried_entries(self):
        result = []
        for old in self.previous:
            identifier = old['id']
            if not identifier.startswith(('sg', 'bg')) or identifier in self.adopted:
                continue
            is_mare = identifier.startswith('bg')
            source = self.mares if is_mare else self.stallions
            excluded = self.exclusions[int(is_mare)]
            record = source.find_record(identifier[2:]) if source else None
            if is_mare and not self.mares_enabled:
                entry = old
            elif (record is not None and record['active'] and identifier[2:] not in excluded
                  and is_eligible(source.start_epoch(record), self.as_of)):
                entry = source.build_entry(record, self.hints)
            else:
                self.audit['dropped'].append(dict(id=identifier, reason='missing, inactive, future or excluded'))
                continue
            result.append(entry)
            self.audit['carried_bg' if is_mare else 'carried_sg'].append(identifier)
        return result

    def pedigree_ids(self, entries):
        touched = set()
        for entry in entries:
            ids = [entry.get('pedigreeId')] + [a.get('pedigreeId') for a in entry['descendants']]
            ids += [self.source.node_pedigree_id(nid) for nid in (entry.get('mares') or [])]
            touched.update(pid for pid in ids if pid is not None)
        return touched

    def finish(self, entries, audit_path):
        self.audit['output_count'] = len(entries)
        if audit_path:
            path = Path(audit_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(self.audit, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
        print(f'mode={self.mode} as_of={self.audit["as_of_jst"]} ' + ' '.join(
            f'{key}={len(self.audit[key])}' for key in ('added', 'carried_sg', 'carried_bg', 'adopted_ids')))
