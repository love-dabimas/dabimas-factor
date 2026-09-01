import importlib.util
import json
from pathlib import Path
import sys


FIXTURE_DIR = Path(__file__).parent / "fixtures" / "pedigree-master"


def load_module():
    module_path = Path(__file__).resolve().parents[1] / "scripts" / "pedigree_master_source.py"
    spec = importlib.util.spec_from_file_location("pedigree_master_source", module_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load_source():
    source_module = load_module()
    master = json.loads((FIXTURE_DIR / "pedigree_master.json").read_text(encoding="utf-8"))
    game = json.loads(
        (FIXTURE_DIR / "pedigree_master.game.json").read_text(encoding="utf-8")
    )
    return source_module, source_module.PedigreeMasterSource(master, game)


def test_resolve_base_variant_by_name_and_subname():
    _, source = load_source()

    resolution = source.resolve("シンザン", "")

    assert resolution.node_id == "0000008661-00"
    assert resolution.pedigree_id == "0000008661"
    assert resolution.stage == "name+subname"


def test_resolve_named_variant():
    _, source = load_source()

    resolution = source.resolve("シンザン", "神速")

    assert resolution.node_id == "0000008661-10"


def test_resolve_hyphenated_pedigree_id_without_splitting():
    _, source = load_source()

    resolution = source.resolve("ゲームオリジナル", "")

    assert resolution.node_id == "game:0000-uuid-0001-00"
    assert resolution.pedigree_id == "game:0000-uuid-0001"


def test_resolve_pedigree_alias():
    _, source = load_source()

    resolution = source.resolve("Game Original", "")

    assert resolution.node_id == "game:0000-uuid-0001-00"
    assert resolution.stage == "aliases"


def test_resolve_year_variant():
    _, source = load_source()

    assert source.resolve("アルサイド", "1958").node_id == "0000333914-01"


def test_missing_year_variant_falls_back_to_base_equivalent():
    _, source = load_source()

    assert source.resolve("アルサイド", "1960").node_id == "0000333914-01"


def test_missing_year_variant_never_falls_back_to_named_variant():
    _, source = load_source()

    assert source.resolve("シンザン", "9999").node_id == "0000008661-00"


def test_missing_named_variant_does_not_fall_back():
    _, source = load_source()

    resolution = source.resolve("シンザン", "神煌")

    assert resolution.node_id is None
    assert source.resolve("ゲームオリジナル", "神煌").node_id is None


def test_unknown_name_is_unresolved():
    _, source = load_source()

    resolution = source.resolve("存在しない馬", "")

    assert resolution.node_id is None
    assert resolution.stage == "unresolved"


def test_representative_node_uses_first_base_equivalent_variant():
    _, source = load_source()

    assert source.representative_node_id("0000333914") == "0000333914-01"
    assert source.representative_rule_counts() == {1: 4, 2: 1, 3: 0}


def test_sire_slots_follow_fixed_paths():
    source_module, source = load_source()

    assert source_module.SIRE_PATHS == [
        "F", "FF", "FFF", "FFFF", "FFMF", "FMF", "FMFF", "FMMF",
        "MF", "MFF", "MFFF", "MFMF", "MMF", "MMFF", "MMMF",
    ]
    assert source_module.MARE_PATHS == [
        "M", "FM", "MM", "FFM", "FMM", "MFM", "MMM", "FFFM",
        "FFMM", "FMFM", "FMMM", "MFFM", "MFMM", "MMFM", "MMMM",
    ]
    slots = source.sire_slots("0000008661")
    assert len(slots) == 15
    assert slots[0] == "0000333190-00"
    assert slots[8] == "0000333190-00"
    assert slots[1] is None


def test_sire_line_falls_back_toward_father():
    _, source = load_source()

    sire_line = source.sire_line("0000000858")

    assert sire_line is not None
    assert sire_line["name"] == "ボワルセル系"


def test_build_pedigree_nodes_contains_all_variants():
    _, source = load_source()

    result = source.build_pedigree_nodes({"0000008661"})

    assert result["version"] == 2
    assert result["pedigreeFields"] == [
        "name", "father", "mother", "kiseki", "sireLineBaseId"
    ]
    assert result["nodeFields"] == ["pedigreeId", "subname", "effects"]
    assert set(result["nodes"]) == {"0000008661-00", "0000008661-10"}
    assert result["pedigrees"]["0000008661"][3] == 265
    assert result["pedigrees"]["0000008661"][4] == 13
