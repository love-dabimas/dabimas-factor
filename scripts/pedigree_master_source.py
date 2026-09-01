"""血統マスターを索引化し、名前解決と血統展開を提供する。"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import re
import unicodedata


SIRE_PATHS = [
    "F", "FF", "FFF", "FFFF", "FFMF", "FMF", "FMFF", "FMMF",
    "MF", "MFF", "MFFF", "MFMF", "MMF", "MMFF", "MMMF",
]
MARE_PATHS = [
    "M", "FM", "MM", "FFM", "FMM", "MFM", "MMM", "FFFM",
    "FFMM", "FMFM", "FMMM", "MFFM", "MFMM", "MMFM", "MMMM",
]
YEAR_SUBNAME_RE = re.compile(r"^(?:\d{4}|20XX)$", re.IGNORECASE)


def normalize_name(value: object) -> str:
    """名前を NFKC・小文字・空白なしへ正規化する。"""
    normalized = unicodedata.normalize("NFKC", "" if value is None else str(value))
    return "".join(normalized.strip().lower().split())


@dataclass(frozen=True)
class Resolution:
    """名前解決の結果と曖昧性・祖先照合情報を保持する。"""

    node_id: str | None
    pedigree_id: str | None
    stage: str
    candidates: tuple[str, ...] = ()
    ancestor_mismatch: int = 0


class PedigreeMasterSource:
    """検証済み血統マスターに対する純粋な問い合わせ層。"""

    def __init__(self, master: dict, game: dict) -> None:
        self.dataset_version = master["dataset_version"]
        self._pedigrees = {
            pedigree["pedigree_id"]: pedigree for pedigree in master["pedigrees"]
        }
        self._nodes = {node["node_id"]: node for node in game["nodes"]}
        self._nodes_by_pedigree: dict[str, list[dict]] = defaultdict(list)
        self._name_subname_index: dict[str, list[dict]] = defaultdict(list)
        self._dabimas_id_index: dict[str, list[dict]] = defaultdict(list)
        self._pedigree_name_indexes: dict[str, dict[str, list[dict]]] = {
            stage: defaultdict(list)
            for stage in ("canonical_name", "pedigree_name", "aliases")
        }
        self._source_name_indexes: dict[str, dict[str, list[dict]]] = {
            stage: defaultdict(list)
            for stage in ("source_names", "source_pedigree_names")
        }
        for node in game["nodes"]:
            self._nodes_by_pedigree[node["pedigree_id"]].append(node)
            key = normalize_name(f"{node.get('name', '')}{node.get('subname') or ''}")
            self._name_subname_index[key].append(node)
            dabimas_id = node.get("dabimas_master_id")
            if dabimas_id:
                self._dabimas_id_index[str(dabimas_id)].append(node)
            for stage in ("source_names", "source_pedigree_names"):
                for source_name in node.get(stage, []):
                    normalized = normalize_name(source_name)
                    if normalized:
                        self._source_name_indexes[stage][normalized].append(node)

        for pedigree_id, pedigree in self._pedigrees.items():
            variants = self._nodes_by_pedigree.get(pedigree_id, [])
            for stage in ("canonical_name", "pedigree_name"):
                normalized = normalize_name(pedigree.get(stage))
                if normalized:
                    self._pedigree_name_indexes[stage][normalized].extend(variants)
            for alias in pedigree.get("aliases", []):
                normalized = normalize_name(alias)
                if normalized:
                    self._pedigree_name_indexes["aliases"][normalized].extend(variants)

    def resolve(
        self,
        name: str,
        subname: str,
        ancestors: list[str] | None = None,
    ) -> Resolution:
        """全書の馬名と subName から game node を解決する。"""
        direct_keys = [name]
        if subname:
            direct_keys.append(name + subname)
        for key in direct_keys:
            node = self._nodes.get(key)
            if node is not None:
                return self._resolution_for_node(node, "node_id", ancestors)

        for key in direct_keys:
            candidates = self._dabimas_id_index.get(key, [])
            if candidates:
                return self._resolve_candidates(candidates, "dabimas_master_id", subname, ancestors)

        combined_key = normalize_name(name + subname)
        stages = [
            ("name+subname", self._name_subname_index, [combined_key]),
            ("canonical_name", self._pedigree_name_indexes["canonical_name"], [normalize_name(name)]),
            ("pedigree_name", self._pedigree_name_indexes["pedigree_name"], [normalize_name(name)]),
            ("aliases", self._pedigree_name_indexes["aliases"], [normalize_name(name)]),
        ]
        source_keys = [combined_key, normalize_name(name)]
        if subname:
            source_keys.append(normalize_name(f"{name}-{subname}-"))
        stages.extend(
            [
                ("source_names", self._source_name_indexes["source_names"], source_keys),
                (
                    "source_pedigree_names",
                    self._source_name_indexes["source_pedigree_names"],
                    source_keys,
                ),
            ]
        )
        for stage, index, keys in stages:
            candidates = self._index_candidates(index, keys)
            if candidates:
                resolution = self._resolve_candidates(candidates, stage, subname, ancestors)
                if resolution.node_id is not None or not YEAR_SUBNAME_RE.fullmatch(subname):
                    return resolution

        if YEAR_SUBNAME_RE.fullmatch(subname):
            candidates = self._year_fallback_candidates(name)
            if candidates:
                return self._resolve_candidates(
                    candidates, "year-fallback", "", ancestors, prefer_lowest=True
                )
        return Resolution(None, None, "unresolved")

    @staticmethod
    def _index_candidates(index: dict[str, list[dict]], keys: list[str]) -> list[dict]:
        """複数キーの索引結果を node_id で重複排除する。"""
        result: dict[str, dict] = {}
        for key in keys:
            for node in index.get(key, []):
                result[node["node_id"]] = node
        return list(result.values())

    def _resolve_candidates(
        self,
        candidates: list[dict],
        stage: str,
        subname: str,
        ancestors: list[str] | None,
        *,
        prefer_lowest: bool = False,
    ) -> Resolution:
        """subName と男系祖先を使い、候補が一意な場合だけ確定する。"""
        unique = {node["node_id"]: node for node in candidates}
        narrowed = list(unique.values())
        normalized_subname = normalize_name(subname)
        if normalized_subname:
            matching_subname = [
                node
                for node in narrowed
                if normalize_name(node.get("normalized_subname")) == normalized_subname
            ]
            if not matching_subname:
                return Resolution(None, None, stage)
            narrowed = matching_subname
        else:
            base_nodes = [node for node in narrowed if node.get("variant_code") == "00"]
            if base_nodes:
                narrowed = base_nodes
            else:
                equivalent_nodes = [node for node in narrowed if node.get("is_base_equivalent") is True]
                if equivalent_nodes:
                    narrowed = equivalent_nodes

        if prefer_lowest and narrowed:
            narrowed = [min(narrowed, key=lambda node: str(node.get("variant_code", "")))]
        if len(narrowed) == 1:
            return self._resolution_for_node(narrowed[0], stage, ancestors)

        if ancestors:
            scored = [
                (self._ancestor_score(node["pedigree_id"], ancestors), node)
                for node in narrowed
            ]
            best_matches = max(score[0][0] for score in scored)
            best = [item for item in scored if item[0][0] == best_matches]
            if len(best) == 1:
                (matches, mismatches), node = best[0]
                del matches
                return Resolution(
                    node["node_id"], node["pedigree_id"], stage,
                    tuple(sorted(unique)), mismatches,
                )

        # horse_type と全書側 dabimas_master_id は現行データに存在しないため、
        # 仕様どおり追加の自動採用条件には使わない。同点なら未解決にする。
        return Resolution(None, None, stage, tuple(sorted(unique)))

    def _resolution_for_node(
        self,
        node: dict,
        stage: str,
        ancestors: list[str] | None,
    ) -> Resolution:
        """単一 node を Resolution へ変換する。"""
        mismatches = self._ancestor_score(node["pedigree_id"], ancestors)[1] if ancestors else 0
        return Resolution(node["node_id"], node["pedigree_id"], stage, (), mismatches)

    def _year_fallback_candidates(self, name: str) -> list[dict]:
        """年号 variant 欠落時に限り base-equivalent 候補を返す。"""
        key = normalize_name(name)
        candidates: list[dict] = []
        for index in (
            self._pedigree_name_indexes["canonical_name"],
            self._pedigree_name_indexes["pedigree_name"],
            self._pedigree_name_indexes["aliases"],
            self._source_name_indexes["source_names"],
            self._source_name_indexes["source_pedigree_names"],
        ):
            candidates.extend(index.get(key, []))
        return list(
            {
                node["node_id"]: node
                for node in candidates
                if node.get("is_base_equivalent") is True
            }.values()
        )

    def _ancestor_score(
        self,
        pedigree_id: str,
        ancestors: list[str],
    ) -> tuple[int, int]:
        """男系15枠の一致数と不一致数を返す。空欄・欠落は数えない。"""
        matches = 0
        mismatches = 0
        for path, ancestor_name in zip(SIRE_PATHS, ancestors):
            normalized = normalize_name(ancestor_name)
            ancestor_id = self.ancestor_pedigree_id(pedigree_id, path)
            if not normalized or ancestor_id is None:
                continue
            if normalized in self._pedigree_names(ancestor_id):
                matches += 1
            else:
                mismatches += 1
        return matches, mismatches

    def _pedigree_names(self, pedigree_id: str) -> set[str]:
        """pedigree と全 variant が持つ名前の正規化済み和集合を返す。"""
        pedigree = self._pedigrees.get(pedigree_id)
        if pedigree is None:
            return set()
        values: list[object] = [
            pedigree.get("canonical_name"),
            pedigree.get("pedigree_name"),
            pedigree.get("name_kana"),
            *pedigree.get("aliases", []),
        ]
        for node in self._nodes_by_pedigree.get(pedigree_id, []):
            name = node.get("name")
            subname = node.get("subname")
            values.extend(
                [
                    name,
                    f"{name or ''}{subname or ''}",
                    node.get("name_kana"),
                    *node.get("source_names", []),
                    *node.get("source_pedigree_names", []),
                ]
            )
        return {normalized for value in values if (normalized := normalize_name(value))}

    def representative_rule(self, pedigree_id: str) -> int | None:
        """代表 node の選択規則番号を返す。"""
        nodes = self._nodes_by_pedigree.get(pedigree_id, [])
        if not nodes:
            return None
        if any(node.get("variant_code") == "00" for node in nodes):
            return 1
        if any(node.get("is_base_equivalent") is True for node in nodes):
            return 2
        return 3

    def representative_rule_counts(self) -> dict[int, int]:
        """マスター全体の代表 node 選択規則別 pedigree 件数を返す。"""
        counts = {1: 0, 2: 0, 3: 0}
        for pedigree_id in self._pedigrees:
            rule = self.representative_rule(pedigree_id)
            if rule is not None:
                counts[rule] += 1
        return counts

    def representative_node_id(self, pedigree_id: str) -> str | None:
        """表示用代表 node_id を固定優先順位で返す。"""
        nodes = self._nodes_by_pedigree.get(pedigree_id, [])
        if not nodes:
            return None
        base_nodes = [node for node in nodes if node.get("variant_code") == "00"]
        candidates = base_nodes
        if not candidates:
            candidates = [node for node in nodes if node.get("is_base_equivalent") is True]
        if not candidates:
            candidates = nodes
        return min(candidates, key=lambda node: str(node.get("variant_code", "")))["node_id"]

    def node_pedigree_id(self, node_id: str | None) -> str | None:
        """node レコードに格納された pedigree_id をそのまま返す。"""
        node = self._nodes.get(node_id) if node_id is not None else None
        return node.get("pedigree_id") if node is not None else None

    def ancestor_pedigree_id(self, pedigree_id: str, path: str) -> str | None:
        """F/M path を父母参照として辿り、到達 pedigree_id を返す。"""
        current_id: str | None = pedigree_id
        for step in path:
            pedigree = self._pedigrees.get(current_id) if current_id is not None else None
            if pedigree is None:
                return None
            if step == "F":
                current_id = pedigree.get("father_pedigree_id")
            elif step == "M":
                current_id = pedigree.get("mother_pedigree_id")
            else:
                raise ValueError(f"不正な血統 path: {path}")
        return current_id if current_id in self._pedigrees else None

    def sire_slots(self, pedigree_id: str) -> list[str | None]:
        """固定 SIRE_PATHS の15枠を代表 node_id として返す。"""
        return [
            self.representative_node_id(ancestor_id) if ancestor_id is not None else None
            for path in SIRE_PATHS
            for ancestor_id in [self.ancestor_pedigree_id(pedigree_id, path)]
        ]

    def mare_slots(self, pedigree_id: str) -> list[str | None]:
        """固定 MARE_PATHS の15枠を代表 node_id として返す。"""
        return [
            self.representative_node_id(ancestor_id) if ancestor_id is not None else None
            for path in MARE_PATHS
            for ancestor_id in [self.ancestor_pedigree_id(pedigree_id, path)]
        ]

    def sire_line(self, pedigree_id: str) -> dict | None:
        """child_sire_line を父方向へ循環安全に探索する。"""
        seen: set[str] = set()
        current_id: str | None = pedigree_id
        while current_id and current_id not in seen:
            seen.add(current_id)
            pedigree = self._pedigrees.get(current_id)
            if pedigree is None:
                return None
            sire_line = pedigree.get("child_sire_line")
            if sire_line:
                return sire_line
            current_id = pedigree.get("father_pedigree_id")
        return None

    def build_pedigree_nodes(self, pedigree_ids: set[str]) -> dict:
        """指定 pedigree とその全 variant を決定的な辞書形式へ変換する。"""
        pedigree_output = {}
        node_output = {}
        for pedigree_id in sorted(pedigree_ids):
            pedigree = self._pedigrees.get(pedigree_id)
            if pedigree is None:
                continue
            sire_line = self.sire_line(pedigree_id)
            kiseki = pedigree.get("kiseki_group_id")
            if isinstance(kiseki, str) and kiseki.isdigit():
                kiseki = int(kiseki)
            pedigree_output[pedigree_id] = [
                pedigree.get("canonical_name"),
                pedigree.get("father_pedigree_id"),
                pedigree.get("mother_pedigree_id"),
                kiseki,
                sire_line.get("sire_line_base_id", 0) if sire_line else 0,
            ]
            for node in sorted(
                self._nodes_by_pedigree.get(pedigree_id, []),
                key=lambda item: item["node_id"],
            ):
                node_output[node["node_id"]] = [
                    node["pedigree_id"],
                    node.get("subname"),
                    node.get("pedigree_effect_ids", []),
                ]
        return {
            "version": 2,
            "datasetVersion": self.dataset_version,
            "pedigreeFields": ["name", "father", "mother", "kiseki", "sireLineBaseId"],
            "nodeFields": ["pedigreeId", "subname", "effects"],
            "pedigrees": pedigree_output,
            "nodes": node_output,
        }
