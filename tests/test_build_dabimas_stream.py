from pathlib import Path
from copy import deepcopy
import csv
import importlib.util
import json
import sys


def load_module():
    module_path = Path(__file__).resolve().parents[1] / "scripts" / "build_dabimas_stream.py"
    spec = importlib.util.spec_from_file_location("build_dabimas_stream", module_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _read_csv(path):
    with path.open("r", encoding="utf-8", newline="") as fp:
        return list(csv.DictReader(fp))


def load_pedigree_source():
    repo_root = Path(__file__).resolve().parents[1]
    module_path = repo_root / "scripts" / "pedigree_master_source.py"
    spec = importlib.util.spec_from_file_location("pedigree_master_source_for_build", module_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    fixture_dir = repo_root / "tests" / "fixtures" / "pedigree-master"
    master = json.loads((fixture_dir / "pedigree_master.json").read_text(encoding="utf-8"))
    game = json.loads(
        (fixture_dir / "pedigree_master.game.json").read_text(encoding="utf-8")
    )
    return module.PedigreeMasterSource(master, game)


def test_sire_line_csv_masters_match_public_json():
    repo_root = Path(__file__).resolve().parents[1]
    bases_path = repo_root / "scripts" / "data" / "sire_line_bases.csv"
    lines_path = repo_root / "scripts" / "data" / "sire_lines.csv"
    public_path = repo_root / "data" / "sire_lines_public.json"

    assert not bases_path.read_bytes().startswith(b"\xef\xbb\xbf")
    assert not lines_path.read_bytes().startswith(b"\xef\xbb\xbf")

    bases = _read_csv(bases_path)
    lines = _read_csv(lines_path)
    public_lines = json.loads(public_path.read_text(encoding="utf-8"))["sireLines"]

    assert len(bases) == 15
    assert len(lines) == 58
    assert len({int(row["id"]) for row in bases}) == 15
    assert len({int(row["id"]) for row in lines}) == 58

    bases_by_id = {int(row["id"]): row for row in bases}
    assert all(int(row["sire_line_base_id"]) in bases_by_id for row in lines)
    assert all(
        row["base_abbr"] == bases_by_id[int(row["sire_line_base_id"])]["abbr"]
        for row in lines
    )

    csv_projection = [
        {
            "id": int(row["id"]),
            "name": row["name"],
            "sireLineBaseId": int(row["sire_line_base_id"]),
            "baseName": bases_by_id[int(row["sire_line_base_id"])]["name"],
            "baseAbbr": row["base_abbr"],
        }
        for row in lines
    ]
    assert csv_projection == public_lines


def _make_row(
    stream,
    *,
    sex,
    url,
    name,
    parent_line="ヘイルトゥリーズン系",
    rare="5",
    descendant_line="",
    ability_icon="https://cf.dabimas.jp/kouryaku/images/stallion/icon_ability_00.png",
    category_icon="https://cf.dabimas.jp/kouryaku/images/stallion/list_icn_cat_05.png",
    nature="",
):
    """テスト用の ALL 行を作る。descendants 15 件を埋める。"""
    row = stream.new_row()
    row[stream.HD_GENDER] = sex
    row[stream.HD_HORSE_ID] = url
    row[stream.HD_RARE] = rare
    row[stream.HD_HORSE_NAME] = name
    row[stream.HD_PARENT_LINE] = parent_line
    row[stream.HD_ICON] = category_icon
    row[stream.HD_ABILITY_ICON] = ability_icon
    row[stream.HD_NATURE] = nature
    for i in range(15):
        row[stream.HD_NAME_T + i] = f"先祖{i}"
        row[stream.HD_PARENT_LINE_T + i] = "Nearctic"
        row[stream.HD_SON_T + i] = descendant_line
    return row


def test_spec_section_helpers_extract_ability_and_nature_by_heading():
    stream = load_module()
    fixtures = [
        (
            """
            <div>
              <h4>非凡な才能</h4>
              <a><div class="ability">
                <img class="icon" src="//cf.dabimas.jp/icon_ability_99.png">
                <div class="ability_info"><p class="large">鉄情不羈</p></div>
              </div></a>
            </div>
            """,
            "https://cf.dabimas.jp/icon_ability_99.png",
            "鉄情不羈",
            "",
        ),
        (
            """
            <div>
              <h4>非凡な才能</h4>
              <div class="horse_spec"><div class="ability">
                <img class="icon" src="//cf.dabimas.jp/icon_ability_00.png">
                <div class="ability_info"><p>非凡な才能はありません</p></div>
              </div></div>
            </div>
            """,
            "https://cf.dabimas.jp/icon_ability_00.png",
            "",
            "",
        ),
        (
            """
            <div>
              <h4>非凡な才能</h4>
              <a><div class="ability">
                <img class="icon" src="//cf.dabimas.jp/icon_ability_99.png">
                <div class="ability_info"><p class="large">覇道</p></div>
              </div></a>
              <h4>天性</h4>
              <a><div class="ability">
                <img class="icon" src="//cf.dabimas.jp/icon_ability_95.png">
                <div class="ability_info"><p class="large">颶風</p></div>
              </div></a>
            </div>
            """,
            "https://cf.dabimas.jp/icon_ability_99.png",
            "覇道",
            "颶風",
        ),
        (
            """
            <div>
              <h4>非凡な才能</h4>
              <div class="horse_spec"><div class="ability">
                <img class="icon" src="//cf.dabimas.jp/icon_ability_00.png">
                <div class="ability_info"><p>非凡な才能はありません</p></div>
              </div></div>
              <h4>天性</h4>
              <a><div class="ability">
                <img class="icon" src="//cf.dabimas.jp/icon_ability_95.png">
                <div class="ability_info"><p class="large">飛燕</p></div>
              </div></a>
            </div>
            """,
            "https://cf.dabimas.jp/icon_ability_00.png",
            "",
            "飛燕",
        ),
    ]

    for html, expected_icon, expected_ability, expected_nature in fixtures:
        detail = stream.BeautifulSoup(html, "lxml").select_one("div")
        assert stream.find_spec_section(detail, "非凡な才能") is not None
        assert stream.extract_ability_icon(detail) == expected_icon
        assert stream.extract_spec_name(detail, "非凡な才能") == expected_ability
        assert stream.extract_spec_name(detail, "天性") == expected_nature


def test_parse_ability_type_and_category_icon(capsys):
    stream = load_module()
    stream.reset_conversion_warning_counts()

    expected_types = {
        "00": "none",
        "99": "normal",
        "98": "focused",
        "97": "double",
    }
    for icon_number, expected in expected_types.items():
        icon_url = f"https://cf.dabimas.jp/icon_ability_{icon_number}.png"
        assert stream.parse_ability_type(icon_url, "0", f"stallion-{icon_number}") == expected

    assert stream.parse_ability_type(
        "https://cf.dabimas.jp/icon_ability_96.png", "0", "unknown-stallion"
    ) == "normal"
    assert stream.parse_ability_type("", "0", "missing-stallion") is None
    assert stream.parse_ability_type("", "1", "broodmare") is None

    assert stream.CONVERSION_WARNING_COUNTS["unknown_ability_icon"] == 1
    assert stream.CONVERSION_WARNING_COUNTS["missing_ability_icon"] == 1
    warnings = capsys.readouterr().out
    assert "[warn] unknown ability icon: icon_ability_96.png (unknown-stallion)" in warnings
    assert "[warn] ability icon not found (missing-stallion)" in warnings
    assert "broodmare" not in warnings

    assert stream.parse_category_icon(
        "https://cf.dabimas.jp/kouryaku/images/stallion/list_icn_cat_14.png"
    ) == "14"
    assert stream.parse_category_icon(
        "https://cf.dabimas.jp/kouryaku/images/stallion/list_icn_cat_collabo_1017.png"
    ) == "collabo_1017"
    assert stream.parse_category_icon("") is None


def test_entry_and_summary_include_ability_badges_and_search_aliases():
    stream = load_module()
    row = _make_row(
        stream,
        sex="0",
        url="https://dabimas.jp/kouryaku/stallions/2614531278.html",
        name="アイスカペイド-極走-",
        nature="颶風",
        ability_icon="https://cf.dabimas.jp/kouryaku/images/stallion/icon_ability_00.png",
        category_icon="https://cf.dabimas.jp/kouryaku/images/stallion/list_icn_cat_14.png",
    )

    entry = stream.all_row_to_dabifac_entry(row)
    summary = stream.entry_to_summary(entry, detail_chunk=7)

    assert entry["abilityType"] == "none"
    assert entry["categoryIcon"] == "14"
    assert summary["abilityType"] == "none"
    assert summary["categoryIcon"] == "14"
    assert summary["displayName"] == "[颶][凡][祭]アイスカペイド極走"
    for search_term in ("颶", "凡", "非凡なし", "ひぼんなし", "祭", "因名祭", "いんめいさい"):
        assert stream.normalize_search_text(search_term) in summary["searchText"]

    low_rare = dict(entry, rare=4, categoryIcon=None)
    low_rare_summary = stream.entry_to_summary(low_rare, detail_chunk=0)
    assert "[凡]" not in low_rare_summary["displayName"]
    assert "ひぼんなし" not in low_rare_summary["searchText"]

    broodmare = dict(entry, sex="1", rare=None, categoryIcon=None)
    broodmare_summary = stream.entry_to_summary(broodmare, detail_chunk=0)
    assert "[凡]" not in broodmare_summary["displayName"]
    assert "ひぼんなし" not in broodmare_summary["searchText"]

    unknown = dict(entry, abilityType="mystery", categoryIcon=None)
    unknown_summary = stream.entry_to_summary(unknown, detail_chunk=0)
    assert "[凡]" not in unknown_summary["displayName"]
    assert "ひぼんなし" not in unknown_summary["searchText"]


def test_parse_stallion_uses_heading_sections_for_ability_and_nature():
    stream = load_module()
    soup = stream.BeautifulSoup(
        """
        <div id="content"><div>
          <div>
            <h4>非凡な才能</h4>
            <div class="horse_spec"><div class="ability">
              <img class="icon" src="//cf.dabimas.jp/icon_ability_00.png">
              <div class="ability_info"><p>非凡な才能はありません</p></div>
            </div></div>
            <h4>天性</h4>
            <a><div class="ability">
              <img class="icon" src="//cf.dabimas.jp/icon_ability_95.png">
              <div class="ability_info"><p class="large">飛燕</p></div>
            </div></a>
          </div>
          <table>
            <tr><td></td><td><img src="stallion_list_star.png"></td></tr>
            <tr><td><img src="//cf.dabimas.jp/list_icn_cat_14.png"></td><td><span>テスト馬-央天-</span></td></tr>
            <tr><td><div>ヘイルトゥリーズン系</div></td></tr>
          </table>
        </div></div>
        """,
        "lxml",
    )

    row = stream.parse_stallion("https://dabimas.jp/kouryaku/stallions/123.html", 1, soup)

    assert row is not None
    assert row[stream.HD_ABILITY_ICON] == "https://cf.dabimas.jp/icon_ability_00.png"
    assert row[stream.HD_ABILITY] == ""
    assert row[stream.HD_NATURE] == "飛燕"


def test_entry_and_summary_include_sire_line_ids_and_stallion_rare():
    stream = load_module()
    row = _make_row(
        stream,
        sex="0",
        url="https://dabimas.jp/kouryaku/stallions/13579.html",
        name="IDテスト馬",
        parent_line="ノーザンダンサー系",
        descendant_line="ノーザンダンサー系",
        rare="4",
    )

    entry = stream.all_row_to_dabifac_entry(row)

    assert entry["parentLine"] == "Ne"
    assert entry["parentLineId"] == 5
    assert entry["son"] == "ノーザンダンサー系"
    assert entry["sonId"] == 22
    assert entry["rare"] == 4
    assert len(entry["descendants"]) == 15
    assert all(descendant["parentLine"] == "Ne" for descendant in entry["descendants"])
    assert all(descendant["parentLineId"] == 5 for descendant in entry["descendants"])
    assert all(descendant["sonId"] == 22 for descendant in entry["descendants"])

    summary = stream.entry_to_summary(entry, detail_chunk=3)
    assert summary["parentLineId"] == 5
    assert summary["sonId"] == 22
    assert summary["rare"] == 4


def test_unknown_and_empty_sire_lines_have_distinct_warning_behavior(capsys):
    stream = load_module()

    stream.reset_conversion_warning_counts()
    unknown_row = _make_row(
        stream,
        sex="0",
        url="https://dabimas.jp/kouryaku/stallions/8001.html",
        name="未知系統馬",
        parent_line="未知系統",
    )
    unknown_entry = stream.all_row_to_dabifac_entry(unknown_row)

    assert unknown_entry["parentLineId"] is None
    assert unknown_entry["sonId"] is None
    assert stream.CONVERSION_WARNING_COUNTS["unknown_sire_line"] == 1
    assert "[warn] unknown sire line: 未知系統 (https://dabimas.jp/kouryaku/stallions/8001.html)" in capsys.readouterr().out

    stream.reset_conversion_warning_counts()
    descendant_row = _make_row(
        stream,
        sex="0",
        url="https://dabimas.jp/kouryaku/stallions/8002.html",
        name="未知先祖系統馬",
    )
    descendant_row[stream.HD_SON_T] = "未知子系統"
    descendant_entry = stream.all_row_to_dabifac_entry(descendant_row)

    assert descendant_entry["descendants"][0]["parentLineId"] is None
    assert descendant_entry["descendants"][0]["sonId"] is None
    assert stream.CONVERSION_WARNING_COUNTS["unknown_sire_line"] == 1
    assert "[warn] unknown sire line: 未知子系統 (https://dabimas.jp/kouryaku/stallions/8002.html)" in capsys.readouterr().out

    stream.reset_conversion_warning_counts()
    empty_row = _make_row(
        stream,
        sex="0",
        url="https://dabimas.jp/kouryaku/stallions/8003.html",
        name="系統空欄馬",
        parent_line="",
    )
    empty_entry = stream.all_row_to_dabifac_entry(empty_row)

    assert empty_entry["parentLineId"] is None
    assert empty_entry["sonId"] is None
    assert stream.CONVERSION_WARNING_COUNTS["unknown_sire_line"] == 0
    assert "unknown sire line" not in capsys.readouterr().out


def test_rare_is_validated_for_stallions_and_ignored_for_broodmares(capsys):
    stream = load_module()

    stream.reset_conversion_warning_counts()
    for rare in range(1, 6):
        row = _make_row(
            stream,
            sex="0",
            url=f"https://dabimas.jp/kouryaku/stallions/{9000 + rare}.html",
            name=f"レア度{rare}馬",
            rare=str(rare),
        )
        assert stream.all_row_to_dabifac_entry(row)["rare"] == rare
    assert stream.CONVERSION_WARNING_COUNTS["invalid_rare"] == 0

    for index, rare in enumerate(("0", "6", "不明", ""), start=1):
        row = _make_row(
            stream,
            sex="0",
            url=f"https://dabimas.jp/kouryaku/stallions/{9100 + index}.html",
            name=f"不正レア度{index}馬",
            rare=rare,
        )
        assert stream.all_row_to_dabifac_entry(row)["rare"] is None
    assert stream.CONVERSION_WARNING_COUNTS["invalid_rare"] == 4
    assert capsys.readouterr().out.count("[warn] invalid rare:") == 4

    stream.reset_conversion_warning_counts()
    broodmare_row = _make_row(
        stream,
        sex="1",
        url="https://dabimas.jp/kouryaku/broodmares/9200.html",
        name="牝馬レア度無視",
        rare="999",
    )
    assert stream.all_row_to_dabifac_entry(broodmare_row)["rare"] is None
    assert stream.CONVERSION_WARNING_COUNTS["invalid_rare"] == 0
    assert "invalid rare" not in capsys.readouterr().out


def test_to_hiragana_ruby_for_katakana_name():
    stream = load_module()

    assert stream.to_hiragana_ruby("ゴールドシップ") == "ごーるどしっぷ"


def test_to_hiragana_ruby_is_empty_for_ascii_name():
    stream = load_module()

    assert stream.to_hiragana_ruby("Alysheba") == ""


def test_all_row_to_dabifac_entry_adds_top_level_ruby_only():
    stream = load_module()
    row = stream.new_row()
    row[stream.HD_HORSE_NAME] = "ゴールドシップ-2002"
    row[stream.HD_PARENT_LINE] = "ヘイルトゥリーズン系"
    row[stream.HD_NAME_T] = "サンデーサイレンス"

    entry = stream.all_row_to_dabifac_entry(row)

    assert entry["name"] == "ゴールドシップ"
    assert entry["ruby"] == "ごーるどしっぷ"
    assert entry["subName"] == "2002"
    assert "ruby" not in entry["descendants"][0]


def test_derive_horse_id_is_url_based_and_sex_prefixed():
    stream = load_module()

    assert stream.derive_horse_id("0", "https://dabimas.jp/kouryaku/stallions/12345.html") == "s12345"
    assert stream.derive_horse_id("1", "https://dabimas.jp/kouryaku/broodmares/12345.html") == "b12345"
    # 種牡馬と牝馬で URL 数値が同じでも sex 接頭で衝突しない。
    assert stream.derive_horse_id("0", ".../stallions/7.html") != stream.derive_horse_id(
        "1", ".../broodmares/7.html"
    )


def test_derive_horse_id_is_stable_for_same_url():
    stream = load_module()

    url = "https://dabimas.jp/kouryaku/stallions/9999.html"
    assert stream.derive_horse_id("0", url) == stream.derive_horse_id("0", url)


def test_entry_has_url_derived_id():
    stream = load_module()
    row = _make_row(
        stream, sex="0", url="https://dabimas.jp/kouryaku/stallions/24680.html", name="テスト馬"
    )

    entry = stream.all_row_to_dabifac_entry(row)

    assert entry["id"] == "s24680"


def test_split_output_summary_and_details(tmp_path):
    stream = load_module()
    entries = [
        stream.all_row_to_dabifac_entry(
            _make_row(stream, sex="0", url=f".../stallions/{1000 + i}.html", name=f"馬{i}")
        )
        for i in range(5)
    ]

    summary_path = tmp_path / "dabimasFactor.summary.json"
    details_dir = tmp_path / "details"
    stream.write_summary(summary_path, entries, chunk_size=2)
    num_chunks = stream.write_details(details_dir, entries, chunk_size=2)

    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    assert summary["version"] == 1
    assert summary["chunkSize"] == 2
    assert len(summary["horseLists"]) == 5
    assert num_chunks == 3  # 5 件を 2 件刻み → 3 chunk

    # summary に descendants は無い。id / detailChunk / displayName / searchText はある。
    for index, horse in enumerate(summary["horseLists"]):
        assert "descendants" not in horse
        assert horse["id"]
        assert horse["detailChunk"] == index // 2
        assert "displayName" in horse
        assert "searchText" in horse

    # detail と summary が id で 1:1。detailChunk と実ファイル配置が一致。
    summary_ids = {h["id"] for h in summary["horseLists"]}
    detail_ids = set()
    for chunk_index in range(num_chunks):
        detail = json.loads(
            (details_dir / stream.detail_chunk_filename(chunk_index)).read_text(encoding="utf-8")
        )
        assert detail["chunkIndex"] == chunk_index
        for horse in detail["horseDetails"]:
            assert len(horse["descendants"]) == 15
            detail_ids.add(horse["id"])
            # summary 側の detailChunk と一致する chunk に居る。
            match = next(h for h in summary["horseLists"] if h["id"] == horse["id"])
            assert match["detailChunk"] == chunk_index

    assert summary_ids == detail_ids


def test_normalize_search_text_matches_js_rules():
    stream = load_module()

    # カタカナ → ひらがな、空白除去、小文字化。
    assert stream.normalize_search_text("ノーザン ダンサー") == "のーざんだんさー"
    assert stream.normalize_search_text("Alysheba") == "alysheba"


def test_fail_on_error_includes_conversion_warnings(monkeypatch, tmp_path):
    stream = load_module()
    row = _make_row(
        stream,
        sex="0",
        url="https://dabimas.jp/kouryaku/stallions/99901.html",
        name="警告テスト馬",
        parent_line="未知系統",
        rare="0",
    )

    class FakeFetcher:
        def __init__(self, **_kwargs):
            pass

        def fetch_soup(self, _url):
            return object()

        def close(self):
            pass

    monkeypatch.setattr(stream, "Fetcher", FakeFetcher)
    monkeypatch.setattr(stream, "collect_horse_urls", lambda _fetcher: [row[stream.HD_HORSE_ID]])
    monkeypatch.setattr(stream, "parse_stallion", lambda _url, _serial_no, _soup: row)

    fail_output = tmp_path / "fail.json"
    result = stream.main(
        [
            "--output",
            str(fail_output),
            "--workers",
            "1",
            "--delay",
            "0",
            "--progress",
            "0",
            "--fail-on-error",
        ]
    )
    assert result == 1
    saved = json.loads(fail_output.read_text(encoding="utf-8"))["horseLists"][0]
    assert saved["parentLineId"] is None
    assert saved["sonId"] is None
    assert saved["rare"] is None

    continue_output = tmp_path / "continue.json"
    result = stream.main(
        [
            "--output",
            str(continue_output),
            "--workers",
            "1",
            "--delay",
            "0",
            "--progress",
            "0",
        ]
    )
    assert result == 0


def test_fail_on_error_includes_ability_icon_warnings(monkeypatch, tmp_path, capsys):
    stream = load_module()

    class FakeFetcher:
        def __init__(self, **_kwargs):
            pass

        def fetch_soup(self, _url):
            return object()

        def close(self):
            pass

    monkeypatch.setattr(stream, "Fetcher", FakeFetcher)

    for index, ability_icon in enumerate(
        ("", "https://cf.dabimas.jp/icon_ability_96.png"), start=1
    ):
        row = _make_row(
            stream,
            sex="0",
            url=f"https://dabimas.jp/kouryaku/stallions/9991{index}.html",
            name=f"非凡警告馬{index}",
            ability_icon=ability_icon,
        )
        monkeypatch.setattr(
            stream, "collect_horse_urls", lambda _fetcher, url=row[stream.HD_HORSE_ID]: [url]
        )
        monkeypatch.setattr(stream, "parse_stallion", lambda _url, _serial_no, _soup, row=row: row)

        result = stream.main(
            [
                "--output",
                str(tmp_path / f"ability-warning-{index}.json"),
                "--workers",
                "1",
                "--delay",
                "0",
                "--progress",
                "0",
                "--fail-on-error",
            ]
        )
        assert result == 1

    output = capsys.readouterr().out
    assert "missing_ability_icons=1" in output
    assert "unknown_ability_icons=1" in output


def test_legacy_entry_has_no_pedigree_fields():
    stream = load_module()
    row = _make_row(
        stream,
        sex="0",
        url="https://dabimas.jp/kouryaku/stallions/8661.html",
        name="シンザン",
    )

    entry = stream.all_row_to_dabifac_entry(row)

    assert "nodeId" not in entry
    assert "pedigreeId" not in entry
    assert "mares" not in entry


def test_attach_pedigree_ids_only_adds_master_fields():
    stream = load_module()
    source = load_pedigree_source()
    row = _make_row(
        stream,
        sex="0",
        url="https://dabimas.jp/kouryaku/stallions/8661.html",
        name="シンザン",
    )
    legacy = stream.all_row_to_dabifac_entry(row)
    entry = deepcopy(legacy)

    stream.attach_pedigree_ids(entry, source)

    assert entry["nodeId"] == "0000008661-00"
    assert entry["pedigreeId"] == "0000008661"
    without_master = deepcopy(entry)
    without_master.pop("nodeId")
    without_master.pop("pedigreeId")
    without_master.pop("mares")
    for descendant in without_master["descendants"]:
        descendant.pop("nodeId")
        descendant.pop("pedigreeId")
    assert without_master == legacy


def test_summary_conditionally_includes_pedigree_ids():
    stream = load_module()
    source = load_pedigree_source()
    row = _make_row(
        stream,
        sex="0",
        url="https://dabimas.jp/kouryaku/stallions/8661.html",
        name="シンザン",
    )
    legacy_entry = stream.all_row_to_dabifac_entry(row)
    entry = deepcopy(legacy_entry)
    stream.attach_pedigree_ids(entry, source)

    legacy_summary = stream.entry_to_summary(legacy_entry, 0)
    summary = stream.entry_to_summary(entry, 0)

    assert summary["nodeId"] == "0000008661-00"
    assert summary["pedigreeId"] == "0000008661"
    assert {key: value for key, value in summary.items() if key not in {"nodeId", "pedigreeId"}} == legacy_summary


def test_detail_includes_mares_and_descendant_ids(tmp_path):
    stream = load_module()
    source = load_pedigree_source()
    row = _make_row(
        stream,
        sex="0",
        url="https://dabimas.jp/kouryaku/stallions/8661.html",
        name="シンザン",
    )
    entry = stream.all_row_to_dabifac_entry(row)
    stream.attach_pedigree_ids(entry, source)

    stream.write_details(tmp_path, [entry], 1)

    detail = json.loads(
        (tmp_path / stream.detail_chunk_filename(0)).read_text(encoding="utf-8")
    )["horseDetails"][0]
    assert len(detail["mares"]) == 15
    assert all("nodeId" in descendant for descendant in detail["descendants"])
    assert all("pedigreeId" in descendant for descendant in detail["descendants"])


def test_unresolved_entry_has_null_ids_and_mares():
    stream = load_module()
    source = load_pedigree_source()
    stream.reset_conversion_warning_counts()
    row = _make_row(
        stream,
        sex="0",
        url="https://dabimas.jp/kouryaku/stallions/999999.html",
        name="存在しない馬",
    )
    entry = stream.all_row_to_dabifac_entry(row)

    stream.attach_pedigree_ids(entry, source)

    assert entry["nodeId"] is None
    assert entry["pedigreeId"] is None
    assert entry["mares"] is None
    assert stream.CONVERSION_WARNING_COUNTS["unresolved_node"] == 1


def test_offline_master_build_only_adds_pedigree_fields(monkeypatch, tmp_path):
    stream = load_module()
    row = _make_row(
        stream,
        sex="0",
        url="https://dabimas.jp/kouryaku/stallions/8661.html",
        name="シンザン",
    )

    class FakeFetcher:
        def __init__(self, **_kwargs):
            pass

        def fetch_soup(self, _url):
            return object()

        def close(self):
            pass

    monkeypatch.setattr(stream, "Fetcher", FakeFetcher)
    monkeypatch.setattr(stream, "collect_horse_urls", lambda _fetcher: [row[stream.HD_HORSE_ID]])
    monkeypatch.setattr(stream, "parse_stallion", lambda _url, _serial_no, _soup: row)

    legacy_full = tmp_path / "legacy.json"
    legacy_summary = tmp_path / "legacy.summary.json"
    legacy_details = tmp_path / "legacy-details"
    assert stream.main(
        [
            "--output", str(legacy_full),
            "--summary-output", str(legacy_summary),
            "--details-output-dir", str(legacy_details),
            "--workers", "1", "--delay", "0", "--progress", "0",
        ]
    ) == 0

    repo_root = Path(__file__).resolve().parents[1]
    fixture_dir = repo_root / "tests" / "fixtures" / "pedigree-master"
    new_full = tmp_path / "new.json"
    new_summary = tmp_path / "new.summary.json"
    new_details = tmp_path / "new-details"
    pedigree_nodes = tmp_path / "pedigreeNodes.json"
    assert stream.main(
        [
            "--pedigree-master-file", str(fixture_dir / "pedigree_master.json"),
            "--pedigree-game-nodes-file", str(fixture_dir / "pedigree_master.game.json"),
            "--pedigree-nodes-output", str(pedigree_nodes),
            "--output", str(new_full),
            "--summary-output", str(new_summary),
            "--details-output-dir", str(new_details),
            "--workers", "1", "--delay", "0", "--progress", "0",
        ]
    ) == 0

    legacy_entry = json.loads(legacy_full.read_text(encoding="utf-8"))["horseLists"][0]
    new_entry = json.loads(new_full.read_text(encoding="utf-8"))["horseLists"][0]
    assert "nodeId" not in legacy_entry
    expected_legacy_bytes = (
        '{"horseLists":['
        + json.dumps(
            stream.all_row_to_dabifac_entry(row),
            ensure_ascii=False,
            separators=(",", ":"),
        )
        + "]}\n"
    ).encode("utf-8")
    assert legacy_full.read_bytes() == expected_legacy_bytes
    assert "mares" not in new_entry
    comparable_entry = deepcopy(new_entry)
    comparable_entry.pop("nodeId")
    comparable_entry.pop("pedigreeId")
    for descendant in comparable_entry["descendants"]:
        descendant.pop("nodeId")
        descendant.pop("pedigreeId")
    assert comparable_entry == legacy_entry

    legacy_summary_entry = json.loads(legacy_summary.read_text(encoding="utf-8"))["horseLists"][0]
    new_summary_entry = json.loads(new_summary.read_text(encoding="utf-8"))["horseLists"][0]
    assert {key: value for key, value in new_summary_entry.items() if key not in {"nodeId", "pedigreeId"}} == legacy_summary_entry
    detail = json.loads(
        (new_details / stream.detail_chunk_filename(0)).read_text(encoding="utf-8")
    )["horseDetails"][0]
    assert len(detail["mares"]) == 15
    nodes = json.loads(pedigree_nodes.read_text(encoding="utf-8"))
    assert nodes["version"] == 2
    assert nodes["pedigreeFields"] == ["name", "father", "mother", "kiseki", "sireLineBaseId"]
    assert nodes["nodeFields"] == ["pedigreeId", "subname", "effects"]
