#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_dabimas_stream.py

Excel 依存なしで `dabimasFactor.json` を生成するスクリプト。

このスクリプトは、次の VBA パイプラインを再現する:
`getHorseData -> writeDabifacSheet -> DabifacSheetToFile`

処理の流れ:
- 一覧ページ（または `--urls-file`）から馬詳細 URL を集める。
- 各詳細ページを VBA の ALL 行レイアウト互換でパースする。
- ALL 行 1 件を dabimasFactor の JSON 1 件へ変換する。
- 必要なら確認用に sparse ALL 行を NDJSON で出力する。

出力:
- `--output`: 最終 `{"horseLists":[...]}` JSON
- `--all-output`: 任意の sparse ALL 行 NDJSON
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from bs4.element import Tag
from pykakasi import kakasi


# スクレイピング対象 URL。
BASE_URL = "https://dabimas.jp"
STALLION_LIST_URL = f"{BASE_URL}/kouryaku/stallions/name.html"
BROODMARE_LIST_URL = f"{BASE_URL}/kouryaku/broodmares/name.html"


# VBA の ALL シート列番号（1-based）。
# 既存 JSON 互換のため、この番号は固定。
HD_GENDER = 1
HD_SERIAL_NUMBER = 2
HD_HORSE_ID = 3
HD_RARE = 4
HD_HORSE_NAME = 5
HD_PARENT_LINE = 6
HD_FACTOR_NAME1 = 7
HD_FACTOR_NAME2 = 8
HD_FACTOR_NAME3 = 9
HD_ICON = 10
HD_DISTANCE_MIN = 11
HD_DISTANCE_MAX = 12
HD_GROWTH = 13
HD_DIRT = 14
HD_HEALTH = 15
HD_CLEMENCY = 16
HD_RUNNING_STYLE = 17
HD_ACHIEVEMENT = 18
HD_POTENTIAL = 19
HD_STABLE = 20
HD_ABILITY = 21
HD_NATURE = 22
HD_NAME_T = 23
HD_PARENT_LINE_T = 38
HD_SON_T = 53
HD_FACTOR_T1 = 68
HD_ABILITY_ICON = 113

ROW_SIZE = 113

ABILITY_TYPE_BY_ICON = {
    "icon_ability_00.png": "none",
    "icon_ability_99.png": "normal",
    "icon_ability_98.png": "focused",
    "icon_ability_97.png": "double",
}
INMEISAI_CATEGORY_ICON = "14"
CATEGORY_ICON_RE = re.compile(r"list_icn_cat_(.+)\.png$")
ABILITY_BADGE_CHAR = {
    "none": "凡",
    "normal": "非",
    "double": "弐",
    "focused": "特",
}
ABILITY_ALIASES = {
    "none": ("非凡なし", "ひぼんなし"),
    "normal": ("非凡あり", "ひぼんあり"),
    "double": ("非凡あり", "ひぼんあり", "弐重非凡", "にじゅうひぼん"),
    "focused": ("非凡あり", "ひぼんあり", "特化非凡", "とっかひぼん"),
}
INMEISAI_ALIASES = ("因名祭", "いんめいさい")


# 因子番号 -> 1文字略称（出力 JSON で使用）。
FACTOR_SHORT_DICT = {
    1: "短",
    2: "速",
    3: "底",
    4: "長",
    5: "適",
    6: "丈",
    7: "早",
    8: "晩",
    9: "堅",
    10: "難",
    11: "走",
    12: "中",
    13: "強",
    14: "雷",
}

SIRE_LINES_CSV_PATH = Path(__file__).resolve().parent / "data" / "sire_lines.csv"


def load_sire_line_dict(path: Path = SIRE_LINES_CSV_PATH) -> dict[str, dict[str, object]]:
    """子系統CSVを、系統名からIDと親系統略号を引ける辞書へ変換する。"""
    with path.open("r", encoding="utf-8", newline="") as fp:
        rows = csv.DictReader(fp)
        return {
            row["name"].strip(): {
                "sonId": int(row["id"]),
                "parentLineId": int(row["sire_line_base_id"]),
                "abbr": row["base_abbr"].strip(),
            }
            for row in rows
        }


SIRE_LINE_DICT = load_sire_line_dict()
CONVERSION_WARNING_COUNTS = {
    "unknown_sire_line": 0,
    "invalid_rare": 0,
    "missing_ability_icon": 0,
    "unknown_ability_icon": 0,
}

# 旧実装で使っていた「特殊アイコン除外」対象。
# 実測するとこの除外は VBA 実出力（2712件）と一致しないため、
# デフォルトでは無効化し、参照用にのみ残しておく。
STALLION_SKIP_ICONS_LEGACY = {
    "https://cf.dabimas.jp/kouryaku/images/stallion/list_icn_cat_13.png",
    "https://cf.dabimas.jp/kouryaku/images/stallion/list_icn_cat_whiteday_01.png",
    "https://cf.dabimas.jp/kouryaku/images/stallion/list_icn_cat_whiteday_02.png",
    "https://cf.dabimas.jp/kouryaku/images/stallion/list_icn_cat_valentine_01.png",
    "https://cf.dabimas.jp/kouryaku/images/stallion/list_icn_cat_valentine_02.png",
}
STALLION_SKIP_ICONS: set[str] = set()

SUB_NAME_RE = re.compile(r"[0-9]...|[一-龠].")
NUM_RE = re.compile(r"\D")
JAPANESE_TEXT_RE = re.compile(r"[ぁ-ゖァ-ヺ一-龯々ー]")
KAKASI_CONVERTER = kakasi()


def safe_str(v: object) -> str:
    """None を空文字にし、前後空白を除去して返す。"""
    if v is None:
        return ""
    return str(v).strip()


def reset_conversion_warning_counts() -> None:
    """変換警告の集計を、新しい実行単位向けにリセットする。"""
    for key in CONVERSION_WARNING_COUNTS:
        CONVERSION_WARNING_COUNTS[key] = 0


def resolve_sire_line(value: object, identifier: str) -> Optional[dict[str, object]]:
    """子系統名を解決し、未知の非空値は警告・集計する。"""
    name = safe_str(value)
    if not name:
        return None
    sire_line = SIRE_LINE_DICT.get(name)
    if sire_line is None:
        CONVERSION_WARNING_COUNTS["unknown_sire_line"] += 1
        print(f"[warn] unknown sire line: {name} ({identifier})")
    return sire_line


def parse_stallion_rare(value: object, identifier: str) -> Optional[int]:
    """種牡馬レア度を1〜5へ正規化し、不正値は警告・集計する。"""
    raw_value = safe_str(value)
    try:
        rare = int(raw_value)
    except ValueError:
        rare = None
    if rare is not None and 1 <= rare <= 5:
        return rare
    CONVERSION_WARNING_COUNTS["invalid_rare"] += 1
    print(f"[warn] invalid rare: {raw_value} ({identifier})")
    return None


def parse_ability_type(icon_url: str, sex: str, identifier: str) -> Optional[str]:
    """非凡アイコン URL から種別を判定する。牝馬・判定不能は None。"""
    if sex != "0":
        return None
    icon = safe_str(icon_url)
    if not icon:
        CONVERSION_WARNING_COUNTS["missing_ability_icon"] += 1
        print(f"[warn] ability icon not found ({identifier})")
        return None
    icon_name = icon.rsplit("/", 1)[-1]
    ability_type = ABILITY_TYPE_BY_ICON.get(icon_name)
    if ability_type is None:
        CONVERSION_WARNING_COUNTS["unknown_ability_icon"] += 1
        print(f"[warn] unknown ability icon: {icon_name} ({identifier})")
        return "normal"
    return ability_type


def parse_category_icon(icon_url: str) -> Optional[str]:
    """カテゴリアイコン URL から生の識別子を取り出す。"""
    match = CATEGORY_ICON_RE.search(safe_str(icon_url))
    return match.group(1) if match else None


def extract_numbers(text: str) -> str:
    """文字列から数字だけを抽出する。"""
    if not text:
        return ""
    return NUM_RE.sub("", text)


def normalize_src(src: str) -> str:
    """画像/リンク src を絶対 URL に正規化する。"""
    src = safe_str(src)
    if not src:
        return ""
    if src.startswith("//"):
        return "https:" + src
    if src.startswith("/"):
        return urljoin(BASE_URL, src)
    return src


def find_spec_section(detail: Optional[Tag], heading: str) -> Optional[Tag]:
    """一致する仕様見出しの直後にある兄弟要素を返す。"""
    if detail is None:
        return None
    for h4 in detail.find_all("h4"):
        if safe_str(h4.get_text()) == heading:
            return h4.find_next_sibling()
    return None


def extract_ability_icon(detail: Optional[Tag]) -> str:
    """「非凡な才能」セクションのアイコン URL を返す。"""
    section = find_spec_section(detail, "非凡な才能")
    if section is None:
        return ""
    img = section.select_one("div.ability img.icon")
    return normalize_src(img.get("src", "")) if img else ""


def extract_spec_name(detail: Optional[Tag], heading: str) -> str:
    """対象仕様セクションの能力名を返す。能力なし・未検出なら空文字。"""
    section = find_spec_section(detail, heading)
    if section is None:
        return ""
    name = section.select_one(".ability_info p.large")
    return safe_str(name.get_text()) if name else ""


def to_hiragana_ruby(text: str) -> str:
    """日本語を含む文字列をひらがなのルビへ変換する。"""
    s = safe_str(text)
    if not s or not JAPANESE_TEXT_RE.search(s):
        return ""
    return "".join(part["hira"] for part in KAKASI_CONVERTER.convert(s))


def new_row() -> list[str]:
    """ALL 行バッファを作る（index 0 は未使用）。"""
    return [""] * (ROW_SIZE + 1)


def row_get(row: list[str], idx: int) -> str:
    """範囲チェック付きの安全な行アクセス。"""
    if 0 <= idx < len(row):
        return row[idx]
    return ""


def get_parent_line_name(parent_line: str) -> str:
    """親系統コード2文字を返す（Nas/Nat の揺れは吸収）。"""
    s = safe_str(parent_line)
    if not s:
        return ""
    s = s.replace("Nas", "Ns").replace("Nat", "Na")
    return s[:2]


def get_factor(url1: str, url2: str, url3: str) -> tuple[str, str, str]:
    """
    因子画像 URL を最大3件受け取り、VBA 互換の (f1, f2, f3) に並べ替える。
    ルール:
    - 1件: f3
    - 2件: f2/f3
    - 3件: f1/f2/f3
    """
    f1 = ""
    f2 = ""
    f3 = ""
    if url3:
        f1 = extract_numbers(url1)
        f2 = extract_numbers(url2)
        f3 = extract_numbers(url3)
    elif url2:
        f2 = extract_numbers(url1)
        f3 = extract_numbers(url2)
    elif url1:
        f3 = extract_numbers(url1)
    return f1, f2, f3


def get_factor_short(factor_no: str) -> str:
    """因子番号文字列を1文字略称へ変換する。"""
    if not factor_no:
        return ""
    try:
        return FACTOR_SHORT_DICT.get(int(factor_no), "")
    except ValueError:
        return ""


# 詳細ページ URL から末尾の数値（例: /kouryaku/stallions/12345.html → 12345）を拾う。
HORSE_URL_NUM_RE = re.compile(r"/(\d+)\.html")
# JS 側 normalizeSearchText と同じく、半角/全角スペース類を畳む。
SEARCH_SPACE_RE = re.compile(r"[　\s]+")


def derive_horse_id(sex: str, url: str) -> str:
    """
    安定 `id` を導出する（指摘 A）。

    出力連番ではなく、詳細ページ URL 内の数値から導出するので、元サイトの
    並び替え・増減で再生成しても同じ馬には同じ id が付く。`sex` 接頭で
    種牡馬(s)/牝馬(b) の URL 数値が衝突しないようにする。

    URL から数値が取れない異常系では URL 全体の SHA-1 先頭でフォールバックする
    （連番には絶対にしない）。
    """
    prefix = "s" if sex == "0" else "b" if sex == "1" else "x"
    m = HORSE_URL_NUM_RE.search(url or "")
    if m:
        return f"{prefix}{m.group(1)}"
    digest = hashlib.sha1((url or "").encode("utf-8")).hexdigest()[:12]
    return f"{prefix}h{digest}"


def normalize_search_text(text: str) -> str:
    """
    index.html の `normalizeSearchText` と同じ正規化を Python で再現する。

    NFKC 正規化 → trim → 小文字化 → 空白除去 → カタカナをひらがな化。
    summary に焼き込む `searchText` を、アプリ実行時の検索インデックスと
    一致させるために使う。
    """
    if not isinstance(text, str):
        return ""
    s = unicodedata.normalize("NFKC", text).strip().lower()
    s = SEARCH_SPACE_RE.sub("", s)
    out = []
    for ch in s:
        code = ord(ch)
        # U+30A1..U+30F6（カタカナ）をひらがなへ。JS 実装と同じ範囲。
        if 0x30A1 <= code <= 0x30F6:
            out.append(chr(code - 0x60))
        else:
            out.append(ch)
    return "".join(out)


def get_entry_ability_type(entry: dict) -> str:
    """表示対象になる既知の非凡種別だけを返す。"""
    if entry.get("sex") != "0" or entry.get("rare") != 5:
        return ""
    ability_type = entry.get("abilityType")
    return ability_type if ability_type in ABILITY_BADGE_CHAR else ""


def build_badge_text(entry: dict) -> str:
    """JS の getHorseBadges と同じ順序の1文字バッジ列を返す。"""
    parts = []
    nature = safe_str(entry.get("nature"))
    if nature:
        parts.append(nature[0])
    ability_type = get_entry_ability_type(entry)
    if ability_type:
        parts.append(ABILITY_BADGE_CHAR[ability_type])
    if entry.get("categoryIcon") == INMEISAI_CATEGORY_ICON:
        parts.append("祭")
    return "".join(parts)


def build_display_name(entry: dict) -> str:
    """JS の `getHorseBaseText` と同じタグ付き表示名を生成する。"""
    badge_tags = "".join(f"[{char}]" for char in build_badge_text(entry))
    return "".join((badge_tags, entry.get("name") or "", entry.get("subName") or ""))


def build_search_text(entry: dict, display_name: str) -> str:
    """JS の `getHorseSearchIndexText` と同じ検索テキストを生成する。"""
    ability_type = get_entry_ability_type(entry)
    aliases = list(ABILITY_ALIASES[ability_type]) if ability_type else []
    if entry.get("categoryIcon") == INMEISAI_CATEGORY_ICON:
        aliases.extend(INMEISAI_ALIASES)
    raw = "|".join(
        part
        for part in (
            display_name,
            entry.get("name") or "",
            entry.get("subName") or "",
            entry.get("ruby") or "",
            entry.get("nature") or "",
            build_badge_text(entry),
            *aliases,
        )
        if part
    )
    return normalize_search_text(raw)


def get_direct_child_by_tag(parent: Optional[Tag], tag_name: str) -> Optional[Tag]:
    """指定タグの直下子要素の最初の1件を返す。"""
    if parent is None:
        return None
    return parent.find(tag_name, recursive=False)


class Fetcher:
    """リトライ付き HTTP 取得と HTML パースのラッパー。"""
    def __init__(self, timeout: float, retries: int):
        # 接続再利用のため Session を使い回す。
        self.timeout = timeout
        self.retries = retries
        self.session = requests.Session()
        self.session.headers.update(
            {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        )

    def fetch_soup(self, url: str) -> BeautifulSoup:
        """URL を取得し BeautifulSoup(lxml) でパースする。"""
        last_err: Optional[Exception] = None
        for attempt in range(1, self.retries + 1):
            try:
                r = self.session.get(url, timeout=self.timeout)
                r.raise_for_status()
                return BeautifulSoup(r.content, "lxml", from_encoding="utf-8")
            except Exception as e:  # noqa: BLE001
                last_err = e
                if attempt < self.retries:
                    time.sleep(min(0.8 * attempt, 3.0))
        raise RuntimeError(f"failed to fetch: {url}") from last_err

    def close(self) -> None:
        """HTTP セッションを明示的に閉じる。"""
        self.session.close()


def collect_horse_urls(fetcher: Fetcher) -> list[str]:
    """種牡馬/牝馬一覧から詳細 URL を収集し、重複除去して返す。"""
    urls: list[str] = []
    seen: set[str] = set()
    targets = [
        (STALLION_LIST_URL, ".stallion_list_panel > a[href]"),
        (BROODMARE_LIST_URL, ".list_panel.broodmare > a[href]"),
    ]
    valid_re = re.compile(r"^/kouryaku/(stallions|broodmares)/\d+\.html$")

    for list_url, selector in targets:
        soup = fetcher.fetch_soup(list_url)
        for a in soup.select(selector):
            href = safe_str(a.get("href"))
            if not valid_re.match(href):
                continue
            full = urljoin(BASE_URL, href)
            if full not in seen:
                seen.add(full)
                urls.append(full)
    return urls


def load_horse_urls_from_file(urls_file: Path) -> list[str]:
    """
    URL リストファイルを読み込む。
    - 絶対 URL と `/path` 形式をサポート
    - `/path` は `BASE_URL` で補完
    - 行頭の UTF-8 BOM は除去
    - 空行と `#` コメント行は無視
    """
    urls: list[str] = []
    seen: set[str] = set()
    valid_re = re.compile(r"^https?://")

    for raw_line in urls_file.read_text(encoding="utf-8").splitlines():
        line = safe_str(raw_line)
        line = line.lstrip("\ufeff")
        if not line or line.startswith("#"):
            continue
        url = urljoin(BASE_URL, line) if line.startswith("/") else line
        if not valid_re.match(url):
            raise ValueError(f"invalid url in {urls_file}: {line}")
        if url not in seen:
            seen.add(url)
            urls.append(url)

    return urls


def fill_pedigree_and_factors(row: list[str], soup: BeautifulSoup) -> None:
    """血統45件と子孫因子45枠を ALL 行へ格納する。"""
    horse_elements = soup.select(".horse")
    for i in range(min(45, len(horse_elements))):
        row[HD_NATURE + 1 + i] = safe_str(horse_elements[i].get_text())

    factor_elements = soup.select(".factor")
    for i in range(min(45, len(factor_elements))):
        img = factor_elements[i].select_one("img")
        row[HD_FACTOR_T1 + i] = normalize_src(img.get("src", "")) if img else ""


def parse_stallion(url: str, serial_no: int, soup: BeautifulSoup) -> Optional[list[str]]:
    """種牡馬詳細ページを ALL 行 1 件へ変換する。"""
    # 1) VBA と同じ DOM 前提で辿る:
    # content -> wrapper div -> detail div -> main table
    content = soup.select_one("#content")
    wrapper = get_direct_child_by_tag(content, "div")
    detail = get_direct_child_by_tag(wrapper, "div")
    main_table = get_direct_child_by_tag(wrapper, "table")
    if main_table is None:
        return None

    trs = main_table.find_all("tr")
    if len(trs) < 3:
        return None

    row0_tds = trs[0].find_all("td")
    row1_tds = trs[1].find_all("td")
    if len(row0_tds) < 2 or len(row1_tds) < 1:
        return None

    # レア星数とアイコンを取得。
    # 同じ td には因子アイコン（icn_factor_*.png）も並ぶため、星画像だけを数える。
    star_count = len(
        [
            img
            for img in row0_tds[1].find_all("img")
            if "stallion_list_star" in img.get("src", "")
        ]
    )
    icon_img = row1_tds[0].find("img")
    icon_src = normalize_src(icon_img.get("src", "")) if icon_img else ""
    # 特殊アイコンによる除外（現在デフォルト無効）。
    # 必要なら STALLION_SKIP_ICONS に対象URLを入れて有効化できる。
    if star_count != 5 and icon_src in STALLION_SKIP_ICONS:
        return None

    # ALL 行を初期化して基本項目をセット。
    row = new_row()
    row[HD_GENDER] = "0"
    row[HD_SERIAL_NUMBER] = f"{serial_no:05d}"
    row[HD_HORSE_ID] = url
    row[HD_RARE] = str(star_count)
    row[HD_ICON] = icon_src

    name_span = trs[1].find("span")
    row[HD_HORSE_NAME] = safe_str(name_span.get_text()) if name_span else ""
    pl_div = trs[2].find("div")
    row[HD_PARENT_LINE] = safe_str(pl_div.get_text()) if pl_div else ""

    # 画面上部の因子（最大3）をセット。
    factor_div = None
    divs = row0_tds[1].find_all("div")
    if divs:
        factor_div = divs[0]
    if factor_div is not None:
        imgs = factor_div.find_all("img")
        for i, img in enumerate(imgs[:3]):
            row[HD_FACTOR_NAME1 + i] = normalize_src(img.get("src", ""))

    row[HD_ABILITY_ICON] = extract_ability_icon(detail)
    row[HD_ABILITY] = extract_spec_name(detail, "非凡な才能")
    row[HD_NATURE] = extract_spec_name(detail, "天性")

    # 詳細テーブル（距離・成長・各スペック）をパース。
    if detail is not None:
        detail_table = get_direct_child_by_tag(detail, "table")
        if detail_table is not None:
            drows = detail_table.find_all("tr")
            if len(drows) >= 2:
                c0 = drows[0].find_all("td")
                c1 = drows[1].find_all("td")

                if len(c0) > 0:
                    p = c0[0].find("p")
                    row[HD_DISTANCE_MIN] = safe_str(p.get_text()) if p else ""
                if len(c0) > 1:
                    p = c0[1].find("p")
                    row[HD_GROWTH] = safe_str(p.get_text()) if p else ""
                if len(c1) > 0:
                    p = c1[0].find("p")
                    row[HD_RUNNING_STYLE] = safe_str(p.get_text()) if p else ""

                for cell_idx, target_idx in (
                    (2, HD_DIRT),
                    (3, HD_HEALTH),
                    (4, HD_CLEMENCY),
                ):
                    if len(c0) > cell_idx:
                        div_imgs = c0[cell_idx].find_all("div")
                        if len(div_imgs) >= 2:
                            img = div_imgs[1].find("img")
                            row[target_idx] = normalize_src(img.get("src", "")) if img else ""

                for cell_idx, target_idx in (
                    (1, HD_ACHIEVEMENT),
                    (2, HD_POTENTIAL),
                    (3, HD_STABLE),
                ):
                    if len(c1) > cell_idx:
                        div_imgs = c1[cell_idx].find_all("div")
                        if len(div_imgs) >= 2:
                            img = div_imgs[1].find("img")
                            row[target_idx] = normalize_src(img.get("src", "")) if img else ""

    # 血統45件 + 因子45件を埋める。
    fill_pedigree_and_factors(row, soup)
    return row


def parse_broodmare(url: str, serial_no: int, soup: BeautifulSoup) -> Optional[list[str]]:
    """牝馬詳細ページを ALL 行 1 件へ変換する。"""
    # 牝馬ページは種牡馬ページと詳細構造が異なる。
    content = soup.select_one("#content")
    wrapper = get_direct_child_by_tag(content, "div")
    detail = get_direct_child_by_tag(wrapper, "div")
    if detail is None:
        return None

    # 行を初期化し、基本識別子をセット。
    row = new_row()
    row[HD_GENDER] = "1"
    row[HD_SERIAL_NUMBER] = f"{serial_no:05d}"
    row[HD_HORSE_ID] = url

    # レア情報は detail 配下の 4番目の <p>。
    p_tags = detail.find_all("p")
    if len(p_tags) >= 4:
        row[HD_RARE] = safe_str(p_tags[3].get_text())

    bm_table = get_direct_child_by_tag(detail, "table")
    if bm_table is None:
        return None
    trs = bm_table.find_all("tr")
    if not trs:
        return None

    # 馬名とアイコンは先頭行にある。
    tds = trs[0].find_all("td")
    if len(tds) > 1:
        span = tds[1].find("span")
        row[HD_HORSE_NAME] = safe_str(span.get_text()) if span else ""
    if len(tds) > 0:
        img = tds[0].find("img")
        row[HD_ICON] = normalize_src(img.get("src", "")) if img else ""

    detail_div = get_direct_child_by_tag(detail, "div")
    row[HD_PARENT_LINE] = safe_str(detail_div.get_text()) if detail_div else ""

    fill_pedigree_and_factors(row, soup)
    return row


def all_row_to_dabifac_entry(row: list[str]) -> dict:
    """ALL 行1件を dabimasFactor JSON 1件へ変換する。"""
    # 入力は ALL レイアウト互換の配列。
    horse_name = row_get(row, HD_HORSE_NAME)

    # 馬名の接尾情報（年号/因名）を subName に分離。
    sub_name = ""
    pure_name = horse_name
    m = SUB_NAME_RE.search(horse_name)
    if m:
        sub_name = m.group(0)
        pure_name = horse_name.replace(sub_name, "").replace("-", "")

    parent_line_raw = row_get(row, HD_PARENT_LINE)
    identifier = row_get(row, HD_HORSE_ID)
    sire_line = resolve_sire_line(parent_line_raw, identifier)

    f1, f2, f3 = get_factor(
        row_get(row, HD_FACTOR_NAME1),
        row_get(row, HD_FACTOR_NAME2),
        row_get(row, HD_FACTOR_NAME3),
    )

    # 固定オフセット列から子孫15件を構築。
    descendants = []
    for i in range(15):
        n = row_get(row, HD_NAME_T + i)
        pl = get_parent_line_name(row_get(row, HD_PARENT_LINE_T + i))
        son = row_get(row, HD_SON_T + i)
        descendant_line = resolve_sire_line(son, identifier)
        df1, df2, df3 = get_factor(
            row_get(row, HD_FACTOR_T1 + i * 3),
            row_get(row, HD_FACTOR_T1 + i * 3 + 1),
            row_get(row, HD_FACTOR_T1 + i * 3 + 2),
        )
        descendants.append(
            {
                "name": n,
                "parentLine": pl,
                "parentLineId": (
                    descendant_line["parentLineId"] if descendant_line else None
                ),
                "son": son,
                "sonId": descendant_line["sonId"] if descendant_line else None,
                "factors": [
                    get_factor_short(df1),
                    get_factor_short(df2),
                    get_factor_short(df3),
                ],
            }
        )

    sex = row_get(row, HD_GENDER)
    rare = parse_stallion_rare(row_get(row, HD_RARE), identifier) if sex == "0" else None
    ability_type = parse_ability_type(row_get(row, HD_ABILITY_ICON), sex, identifier)
    category_icon = parse_category_icon(row_get(row, HD_ICON))

    # 親系統コードは辞書優先、見つからなければ2文字化で補完。
    return {
        # URL 由来の安定 id（指摘 A）。summary / detail の join key になる。
        "id": derive_horse_id(sex, row_get(row, HD_HORSE_ID)),
        "name": pure_name,
        "ruby": to_hiragana_ruby(pure_name),
        "subName": sub_name,
        "nature": row_get(row, HD_NATURE),
        "sex": sex,
        "rare": rare,
        "abilityType": ability_type,
        "categoryIcon": category_icon,
        "parentLine": sire_line["abbr"] if sire_line else get_parent_line_name(parent_line_raw),
        "parentLineId": sire_line["parentLineId"] if sire_line else None,
        "son": parent_line_raw,
        "sonId": sire_line["sonId"] if sire_line else None,
        "factors": [
            get_factor_short(f1),
            get_factor_short(f2),
            get_factor_short(f3),
        ],
        "descendants": descendants,
    }


def all_row_to_sparse_dict(row: list[str]) -> dict[str, str]:
    """非空列のみを持つ sparse dict に変換する。"""
    return {str(i): row[i] for i in range(1, ROW_SIZE + 1) if row[i] != ""}


def entry_to_summary(entry: dict, detail_chunk: int) -> dict:
    """full entry 1 件を summary 1 件へ変換する（descendants は含めない）。"""
    display_name = build_display_name(entry)
    return {
        "id": entry["id"],
        "detailChunk": detail_chunk,
        "name": entry["name"],
        "ruby": entry["ruby"],
        "subName": entry["subName"],
        "nature": entry["nature"],
        "sex": entry["sex"],
        "rare": entry["rare"],
        "abilityType": entry["abilityType"],
        "categoryIcon": entry["categoryIcon"],
        "parentLine": entry["parentLine"],
        "parentLineId": entry["parentLineId"],
        "son": entry["son"],
        "sonId": entry["sonId"],
        "factors": entry["factors"],
        "displayName": display_name,
        "searchText": build_search_text(entry, display_name),
    }


def write_summary(path: Path, entries: list[dict], chunk_size: int) -> None:
    """summary JSON を書き出す。`detailChunk` は書き出し順 + chunk_size で焼き込む。"""
    horse_lists = [
        entry_to_summary(entry, index // chunk_size) for index, entry in enumerate(entries)
    ]
    obj = {"version": 1, "chunkSize": chunk_size, "horseLists": horse_lists}
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as fp:
        json.dump(obj, fp, ensure_ascii=False, separators=(",", ":"))
        fp.write("\n")


def detail_chunk_filename(chunk_index: int) -> str:
    """detail chunk のファイル名（3桁ゼロ埋め）。"""
    return f"dabimasFactor.details.{chunk_index:03d}.json"


def write_details(dir_path: Path, entries: list[dict], chunk_size: int) -> int:
    """detail chunk 群を書き出し、chunk 数を返す。各 detail は id と descendants のみ。"""
    dir_path.mkdir(parents=True, exist_ok=True)
    num_chunks = (len(entries) + chunk_size - 1) // chunk_size if entries else 0

    # 件数が減って chunk 数が前回より少なくなった場合に、古い chunk ファイルが
    # 残らないよう、生成対象外の dabimasFactor.details.*.json を先に掃除する。
    for stale in dir_path.glob("dabimasFactor.details.*.json"):
        m = re.search(r"dabimasFactor\.details\.(\d+)\.json$", stale.name)
        if m and int(m.group(1)) >= num_chunks:
            stale.unlink()

    for chunk_index in range(num_chunks):
        start = chunk_index * chunk_size
        chunk_entries = entries[start:start + chunk_size]
        horse_details = [
            {"id": entry["id"], "descendants": entry["descendants"]} for entry in chunk_entries
        ]
        obj = {"version": 1, "chunkIndex": chunk_index, "horseDetails": horse_details}
        out_path = dir_path / detail_chunk_filename(chunk_index)
        with out_path.open("w", encoding="utf-8", newline="\n") as fp:
            json.dump(obj, fp, ensure_ascii=False, separators=(",", ":"))
            fp.write("\n")
    return num_chunks


def main(argv: Optional[list[str]] = None) -> int:
    """CLI エントリポイント。成功時0、`--fail-on-error` 条件で1を返す。"""
    # CLI の流れ: 引数解析 -> URL収集 -> ページ解析 -> 出力書き込み。
    # CI でも再現しやすいよう、引数は明示的に定義している。
    parser = argparse.ArgumentParser(
        description="Excel 依存なしで dabimasFactor.json を生成する。"
    )
    parser.add_argument("--output", default="dabimasFactor.json", help="出力 JSON パス。")
    parser.add_argument(
        "--summary-output",
        default=None,
        help="任意: summary JSON（descendants 抜き・id/detailChunk 入り）の出力パス。",
    )
    parser.add_argument(
        "--details-output-dir",
        default=None,
        help="任意: detail chunk（id + descendants）の出力ディレクトリ。",
    )
    parser.add_argument(
        "--detail-chunk-size",
        type=int,
        default=128,
        help="detail chunk 1 ファイルあたりの件数（デフォルト128）。",
    )
    parser.add_argument(
        "--all-output",
        default=None,
        help="任意: ALL 行 sparse NDJSON の出力パス。",
    )
    parser.add_argument(
        "--urls-file",
        default=None,
        help="任意: URL リストファイル（1行1URL、絶対URLまたは /kouryaku/...）。",
    )
    parser.add_argument("--limit", type=int, default=0, help="先頭 N 件のみ処理（0=全件）。")
    parser.add_argument("--workers", type=int, default=8, help="並列フェッチ数（デフォルト8）。")
    parser.add_argument("--delay", type=float, default=0.3, help="馬ごとの待機秒数。")
    parser.add_argument("--timeout", type=float, default=30.0, help="HTTP タイムアウト秒。")
    parser.add_argument("--retries", type=int, default=3, help="HTTP リトライ回数。")
    parser.add_argument("--progress", type=int, default=100, help="進捗表示間隔。")
    parser.add_argument(
        "--fail-on-error",
        action="store_true",
        help=(
            "取得/解析エラー・未知系統・不正レア度・非凡アイコン警告が"
            "1件でもあれば終了コード1にする。"
        ),
    )
    args = parser.parse_args(argv)
    reset_conversion_warning_counts()

    output_path = Path(args.output)
    summary_output_path = Path(args.summary_output) if args.summary_output else None
    details_output_dir = Path(args.details_output_dir) if args.details_output_dir else None
    chunk_size = max(1, args.detail_chunk_size)
    all_output_path = Path(args.all_output) if args.all_output else None
    urls_file = Path(args.urls_file) if args.urls_file else None

    # 出力前に親ディレクトリを作成する。
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if summary_output_path is not None:
        summary_output_path.parent.mkdir(parents=True, exist_ok=True)
    if details_output_dir is not None:
        details_output_dir.mkdir(parents=True, exist_ok=True)
    if all_output_path is not None:
        all_output_path.parent.mkdir(parents=True, exist_ok=True)

    # URL 取得元の優先順位:
    # 1) --urls-file（明示指定）
    # 2) 一覧ページから自動収集
    fetcher = Fetcher(timeout=args.timeout, retries=args.retries)
    if urls_file is not None:
        urls = load_horse_urls_from_file(urls_file)
    else:
        urls = collect_horse_urls(fetcher)
    if args.limit > 0:
        urls = urls[: args.limit]

    workers = max(1, args.workers)

    print(f"target urls: {len(urls)}")
    print(f"output: {output_path}")
    print(f"workers: {workers}")
    if summary_output_path:
        print(f"summary-output: {summary_output_path}")
    if details_output_dir:
        print(f"details-output-dir: {details_output_dir} (chunk-size {chunk_size})")
    if urls_file is not None:
        print(f"urls-file: {urls_file}")
    if all_output_path:
        print(f"all-output: {all_output_path}")

    written = 0
    skipped = 0
    errors = 0
    stallion_last_name = ""
    stallion_last_ability = ""
    # summary / details を後段でまとめて書くため、書き出し順に entry を保持する。
    # （full JSON は従来どおりストリーム書き込み。entry 約 2,800 件はメモリ上問題ない）
    need_split_output = summary_output_path is not None or details_output_dir is not None
    entries: list[dict] = []

    all_fp = all_output_path.open("w", encoding="utf-8", newline="\n") if all_output_path else None

    def _fetch_and_parse(idx: int, url: str) -> tuple[int, str, Optional[list[str]], Optional[str]]:
        """ワーカースレッドで実行: フェッチ＋パースして (idx, url, row, error) を返す。"""
        try:
            soup = fetcher.fetch_soup(url)
            if "/broodmares/" in url:
                row = parse_broodmare(url, idx, soup)
            else:
                row = parse_stallion(url, idx, soup)
            if args.delay > 0:
                time.sleep(args.delay)
            return idx, url, row, None
        except Exception as e:  # noqa: BLE001
            return idx, url, None, str(e)

    try:
        with output_path.open("w", encoding="utf-8", newline="\n") as out:
            out.write('{"horseLists":[')
            first = True

            # バッチ単位で並列フェッチし、元の URL 順で書き出す。
            batch_size = workers * 2
            for batch_start in range(0, len(urls), batch_size):
                batch_urls = urls[batch_start:batch_start + batch_size]
                # バッチ内の結果を idx 順に格納するバッファ。
                results: dict[int, tuple[str, Optional[list[str]], Optional[str]]] = {}

                with ThreadPoolExecutor(max_workers=workers) as pool:
                    futures = {
                        pool.submit(_fetch_and_parse, batch_start + i + 1, url): batch_start + i + 1
                        for i, url in enumerate(batch_urls)
                    }
                    for future in as_completed(futures):
                        idx, url, row, err = future.result()
                        results[idx] = (url, row, err)

                # 元の URL 順で逐次書き出し（重複スキップロジックを維持）。
                for i in range(len(batch_urls)):
                    idx = batch_start + i + 1
                    url, row, err = results[idx]

                    if err is not None:
                        errors += 1
                        print(f"[error] {url}: {err}")
                        continue

                    if row is None:
                        skipped += 1
                        continue

                    # VBA 互換: 種牡馬は「馬名 + 非凡」が連続重複ならスキップ。
                    if row_get(row, HD_GENDER) == "0":
                        current_name = row_get(row, HD_HORSE_NAME)
                        current_ability = row_get(row, HD_ABILITY)
                        if current_name == stallion_last_name and current_ability == stallion_last_ability:
                            skipped += 1
                            continue
                        stallion_last_name = current_name
                        stallion_last_ability = current_ability

                    entry = all_row_to_dabifac_entry(row)
                    serialized = json.dumps(entry, ensure_ascii=False, separators=(",", ":"))
                    if not first:
                        out.write(",")
                    out.write(serialized)
                    first = False

                    if need_split_output:
                        entries.append(entry)

                    if all_fp is not None:
                        all_fp.write(
                            json.dumps(all_row_to_sparse_dict(row), ensure_ascii=False, separators=(",", ":"))
                            + "\n"
                        )

                    written += 1
                    if args.progress > 0 and written % args.progress == 0:
                        print(f"processed: {written} (source index {idx})")

            out.write("]}\n")

    finally:
        if all_fp is not None:
            all_fp.close()
        fetcher.close()

    # summary / details の書き出し（指定時のみ）。
    if need_split_output:
        # id 一意性チェック（指摘 A / テスト計画 E）。重複は致命的なので即エラー終了。
        id_counts: dict[str, int] = {}
        for entry in entries:
            id_counts[entry["id"]] = id_counts.get(entry["id"], 0) + 1
        duplicate_ids = {hid: n for hid, n in id_counts.items() if n > 1}
        if duplicate_ids:
            sample = list(duplicate_ids.items())[:5]
            print(f"[error] duplicate horse ids detected: {sample} (total {len(duplicate_ids)})")
            return 1

        if summary_output_path is not None:
            write_summary(summary_output_path, entries, chunk_size)
            print(f"summary written: {summary_output_path} ({len(entries)} horses)")
        if details_output_dir is not None:
            num_chunks = write_details(details_output_dir, entries, chunk_size)
            print(f"details written: {details_output_dir} ({num_chunks} chunks)")

    unknown_sire_lines = CONVERSION_WARNING_COUNTS["unknown_sire_line"]
    invalid_rares = CONVERSION_WARNING_COUNTS["invalid_rare"]
    missing_ability_icons = CONVERSION_WARNING_COUNTS["missing_ability_icon"]
    unknown_ability_icons = CONVERSION_WARNING_COUNTS["unknown_ability_icon"]
    print(
        f"done: written={written}, skipped={skipped}, errors={errors}, "
        f"unknown_sire_lines={unknown_sire_lines}, invalid_rares={invalid_rares}, "
        f"missing_ability_icons={missing_ability_icons}, "
        f"unknown_ability_icons={unknown_ability_icons}"
    )
    if args.fail_on_error and (
        errors > 0
        or unknown_sire_lines > 0
        or invalid_rares > 0
        or missing_ability_icons > 0
        or unknown_ability_icons > 0
    ):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
