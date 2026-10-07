"""ゲームマスターの公開開始判定と、既存形式への変換。ネットワークには触れない。"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys

# CLI と importlib で同じ変換規則・警告カウンタを共有する。
import build_dabimas_stream as conversion

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
    def __init__(self, source):
        self.source = source
        self.names_by_node = defaultdict(Counter)
        self.names_by_pedigree = defaultdict(Counter)

    def set_stallions(self, records):
        for r in records:
            name = split_name(r['name'])[0]
            self.names_by_node[r['node_id']][name] += 1
            self.names_by_pedigree[r['pedigree_id']][name] += 1

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

    def entry(self, record, identifier, name, subname, sex, rare, ability, nature, category, factors, hints):
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
        self.fields = PedigreeFields(pedigree_source)
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
        nature_id, ability_id = str(record['sub_ability_id']), str(record['nonordinary_ability_id'])
        nature = '' if nature_id == '0' else self.abilities[nature_id]['name']
        ability = 'none'
        if ability_id != '0':
            group = self.abilities[ability_id]['effect_group_id_raw']
            if group not in (99, 98, 97):
                raise ValueError(f'unknown effect_group_id_raw: {group}')
            ability = {99: 'normal', 98: 'focused', 97: 'double'}[group]
        asset = (record.get('header_badge') or {}).get('asset_key')
        if not asset:
            print(f'[warn] categoryIcon missing: sg{record["game_stallion_id"]}', file=sys.stderr)
        return self.fields.entry(record, 'sg' + str(record['game_stallion_id']), name, subname, '0',
                                 record['rarity'], ability, nature, conversion.parse_category_icon(asset or ''),
                                 self.fields.factors(self.fields.source.node(record['node_id'])), name_hints)


class BroodmareMasterSource:
    def __init__(self, broodmare_master, pedigree_source):
        self.master = broodmare_master
        self.records = {str(r['game_broodmare_id']): r for r in broodmare_master['broodmares']}
        self.fields = PedigreeFields(pedigree_source)

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
        return self.fields.entry(record, 'bg' + str(record['game_broodmare_id']), record['name'], '', '1',
                                 None, None, '', GRADE_CATEGORY_ICON[grade['code']], ['', '', ''], name_hints)
