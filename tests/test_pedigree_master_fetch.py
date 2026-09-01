from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import sys

import pytest
from botocore.exceptions import ClientError


FIXTURE_DIR = Path(__file__).parent / "fixtures" / "pedigree-master"


def load_module():
    module_path = Path(__file__).resolve().parents[1] / "scripts" / "pedigree_master_fetch.py"
    spec = importlib.util.spec_from_file_location("pedigree_master_fetch", module_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load_fixture(name):
    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))


def test_fixture_bundle_is_valid():
    fetch = load_module()
    master = load_fixture("pedigree_master.json")
    game = load_fixture("pedigree_master.game.json")

    fetch.validate_bundle(master, game)


def test_dataset_versions_must_match():
    fetch = load_module()
    master = load_fixture("pedigree_master.json")
    game = load_fixture("pedigree_master.game.json")
    game["dataset_version"] = "different-version"

    with pytest.raises(fetch.PedigreeMasterError) as exc_info:
        fetch.validate_bundle(master, game)

    message = str(exc_info.value)
    assert master["dataset_version"] in message
    assert game["dataset_version"] in message

    master.pop("dataset_version")
    game.pop("dataset_version")
    with pytest.raises(fetch.PedigreeMasterError, match="dataset_version"):
        fetch.validate_bundle(master, game)


def test_source_hashes_must_match():
    fetch = load_module()
    master = load_fixture("pedigree_master.json")
    game = load_fixture("pedigree_master.game.json")
    game["source"]["sha256"] = "f" * 64

    with pytest.raises(fetch.PedigreeMasterError, match="source.sha256"):
        fetch.validate_bundle(master, game)

    master["source"].pop("sha256")
    game["source"].pop("sha256")
    with pytest.raises(fetch.PedigreeMasterError, match="source.sha256"):
        fetch.validate_bundle(master, game)


def test_expected_dataset_version_must_match():
    fetch = load_module()
    master = load_fixture("pedigree_master.json")
    game = load_fixture("pedigree_master.game.json")

    with pytest.raises(fetch.PedigreeMasterError, match="dataset_version"):
        fetch.validate_bundle(master, game, "different-version")


def test_node_id_must_match_pedigree_id_and_variant_code():
    fetch = load_module()
    master = load_fixture("pedigree_master.json")
    game = load_fixture("pedigree_master.game.json")
    game["nodes"][1]["variant_code"] = "99"

    with pytest.raises(fetch.PedigreeMasterError) as exc_info:
        fetch.validate_bundle(master, game)

    assert "V09" in str(exc_info.value)
    assert "0000008661-10" in str(exc_info.value)


def test_hyphenated_pedigree_id_is_valid():
    fetch = load_module()
    master = load_fixture("pedigree_master.json")
    game = load_fixture("pedigree_master.game.json")

    assert game["nodes"][-1]["node_id"] == "game:0000-uuid-0001-00"
    fetch.validate_bundle(master, game)


def test_node_pedigree_id_must_exist():
    fetch = load_module()
    master = load_fixture("pedigree_master.json")
    game = load_fixture("pedigree_master.game.json")
    node = game["nodes"][0]
    node["pedigree_id"] = "missing"

    with pytest.raises(fetch.PedigreeMasterError, match="V10"):
        fetch.validate_bundle(master, game)


def test_parent_pedigree_id_must_exist():
    fetch = load_module()
    master = load_fixture("pedigree_master.json")
    game = load_fixture("pedigree_master.game.json")
    master["pedigrees"][0]["father_pedigree_id"] = "missing"

    with pytest.raises(fetch.PedigreeMasterError, match="V11"):
        fetch.validate_bundle(master, game)


def test_node_ids_must_be_unique():
    fetch = load_module()
    master = load_fixture("pedigree_master.json")
    game = load_fixture("pedigree_master.game.json")
    game["nodes"][1] = deepcopy(game["nodes"][0])

    with pytest.raises(fetch.PedigreeMasterError, match="V08"):
        fetch.validate_bundle(master, game)


class Body:
    def __init__(self, payload):
        self.payload = payload

    def read(self):
        return self.payload


class SuccessClient:
    def __init__(self, payloads):
        self.payloads = payloads
        self.calls = []

    def get_object(self, Bucket, Key, IfNoneMatch=None):
        self.calls.append((Bucket, Key, IfNoneMatch))
        return {"Body": Body(self.payloads[Key]), "ETag": f'"etag-{Key}"'}


class NotModifiedClient:
    def __init__(self):
        self.calls = []

    def get_object(self, Bucket, Key, IfNoneMatch=None):
        self.calls.append((Bucket, Key, IfNoneMatch))
        raise ClientError(
            {
                "Error": {"Code": "304", "Message": "Not Modified"},
                "ResponseMetadata": {"HTTPStatusCode": 304},
            },
            "GetObject",
        )


class FailingClient:
    def get_object(self, Bucket, Key, IfNoneMatch=None):
        raise RuntimeError("fixture network failure")


class ReadFailingClient:
    class FailingBody:
        def read(self):
            raise RuntimeError("fixture body read failure")

    def get_object(self, Bucket, Key, IfNoneMatch=None):
        return {"Body": self.FailingBody(), "ETag": '"unused"'}


def fixture_payloads():
    return {
        name: (FIXTURE_DIR / name).read_bytes()
        for name in ("pedigree_master.json", "pedigree_master.game.json")
    }


def test_load_writes_body_and_etag_cache(tmp_path):
    fetch = load_module()
    client = SuccessClient(fixture_payloads())

    bundle = fetch.load_pedigree_master(
        endpoint="https://example.invalid",
        bucket="fixture-bucket",
        cache_dir=tmp_path,
        client=client,
    )

    assert bundle.from_cache is False
    assert bundle.master["pedigree_count"] == 5
    assert bundle.game["node_count"] == 7
    assert (tmp_path / "pedigree_master.json").is_file()
    assert (tmp_path / "pedigree_master.json.meta.json").is_file()
    assert (tmp_path / "pedigree_master.game.json").is_file()
    assert (tmp_path / "pedigree_master.game.json.meta.json").is_file()


def test_not_modified_reads_cache_and_sends_etags(tmp_path):
    fetch = load_module()
    fetch.load_pedigree_master(
        cache_dir=tmp_path,
        client=SuccessClient(fixture_payloads()),
    )
    client = NotModifiedClient()

    bundle = fetch.load_pedigree_master(cache_dir=tmp_path, client=client)

    assert bundle.from_cache is True
    assert all(call[2] == f'"etag-{call[1]}"' for call in client.calls)


def test_fetch_failure_falls_back_to_cache(tmp_path, capsys):
    fetch = load_module()
    fetch.load_pedigree_master(
        cache_dir=tmp_path,
        client=SuccessClient(fixture_payloads()),
    )

    bundle = fetch.load_pedigree_master(cache_dir=tmp_path, client=FailingClient())

    assert bundle.from_cache is True
    assert "[warn]" in capsys.readouterr().err

    bundle = fetch.load_pedigree_master(cache_dir=tmp_path, client=ReadFailingClient())
    assert bundle.from_cache is True
    assert "[warn]" in capsys.readouterr().err


def test_fetch_failure_without_cache_is_raised(tmp_path):
    fetch = load_module()

    with pytest.raises(RuntimeError, match="fixture network failure"):
        fetch.load_pedigree_master(cache_dir=tmp_path, client=FailingClient())


def test_missing_credentials_fail_before_boto3(monkeypatch, tmp_path):
    fetch = load_module()
    monkeypatch.delenv("R2_ACCESS_KEY_ID", raising=False)
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "")
    monkeypatch.delenv("R2_ENDPOINT_URL", raising=False)
    monkeypatch.delenv("R2_BUCKET", raising=False)

    with pytest.raises(RuntimeError) as exc_info:
        fetch.load_pedigree_master(cache_dir=tmp_path, client=None)

    message = str(exc_info.value)
    assert "R2_ACCESS_KEY_ID" in message
    assert "R2_SECRET_ACCESS_KEY" in message


def test_client_disables_response_checksum_validation(monkeypatch):
    """R2 の 304 を botocore が ClientError として返せる設定になっていること。

    既定の応答チェックサム検証が有効だと、304 の本文が StreamingChecksumBody に
    包まれて XML エラーパースが TypeError で落ち、条件付き取得が常に
    「取得失敗」に見えてしまう（本当の通信障害と区別できなくなる）。
    """
    fetch = load_module()
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "dummy-key")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "dummy-secret")

    client = fetch._build_r2_client("https://example.invalid")

    assert client.meta.config.response_checksum_validation == "when_required"
    assert client.meta.config.signature_version == "s3v4"
