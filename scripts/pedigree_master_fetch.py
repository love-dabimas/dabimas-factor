"""R2 上の血統マスターを取得し、2 ファイル間の整合性を検証する。"""

from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass
import json
import os
from pathlib import Path
import sys
from typing import Any

from botocore.exceptions import ClientError


DEFAULT_R2_ENDPOINT = "https://28b1c8418991144df39ed91917f7f401.r2.cloudflarestorage.com"
DEFAULT_R2_BUCKET = "dabimas-data"


class PedigreeMasterError(RuntimeError):
    """血統マスターの検証に失敗したことを表す。"""


@dataclass(frozen=True)
class PedigreeMasterBundle:
    """検証済みの血統マスター 2 ファイルを保持する。"""

    master: dict
    game: dict
    dataset_version: str
    source_sha256: str
    from_cache: bool


def _raise_violations(label: str, violations: list[str]) -> None:
    """違反件数と先頭サンプルを含む検証例外を送出する。"""
    if violations:
        samples = ", ".join(violations[:5])
        raise PedigreeMasterError(
            f"{label}: 違反 {len(violations)} 件（先頭最大5件: {samples}）"
        )


def _duplicate_values(values: list[Any]) -> list[Any]:
    """2 回以上現れる値を最初の出現順で返す。"""
    counts = Counter(values)
    return list(dict.fromkeys(value for value in values if counts[value] > 1))


def validate_bundle(
    master: dict,
    game: dict,
    expected_dataset_version: str | None = None,
) -> None:
    """血統マスター 2 ファイルのスキーマと参照整合性を検証する。"""
    _raise_violations(
        "V01 master schema",
        [
            f"schema={master.get('schema')!r}, schema_version={master.get('schema_version')!r}"
        ]
        if master.get("schema") != "dabimas-pedigree-master"
        or master.get("schema_version") != 1
        else [],
    )
    _raise_violations(
        "V02 game schema",
        [f"schema={game.get('schema')!r}, schema_version={game.get('schema_version')!r}"]
        if game.get("schema") != "dabimas-pedigree-game-nodes"
        or game.get("schema_version") != 1
        else [],
    )

    master_version = master.get("dataset_version")
    game_version = game.get("dataset_version")
    dataset_version_invalid = (
        not isinstance(master_version, str)
        or not master_version
        or not isinstance(game_version, str)
        or not game_version
        or master_version != game_version
    )
    _raise_violations(
        "V03 dataset_version 不一致または欠落",
        [f"master={master_version!r}, game={game_version!r}"]
        if dataset_version_invalid
        else [],
    )
    master_sha256 = master.get("source", {}).get("sha256")
    game_sha256 = game.get("source", {}).get("sha256")
    source_sha256_invalid = (
        not isinstance(master_sha256, str)
        or not master_sha256
        or not isinstance(game_sha256, str)
        or not game_sha256
        or master_sha256 != game_sha256
    )
    _raise_violations(
        "V04 source.sha256 不一致または欠落",
        [f"master={master_sha256!r}, game={game_sha256!r}"]
        if source_sha256_invalid
        else [],
    )
    _raise_violations(
        "V05 dataset_version 不一致",
        [f"expected={expected_dataset_version!r}, actual={master_version!r}"]
        if expected_dataset_version is not None
        and master_version != expected_dataset_version
        else [],
    )

    pedigrees = master.get("pedigrees", [])
    nodes = game.get("nodes", [])
    count_violations = []
    if master.get("pedigree_count") != len(pedigrees):
        count_violations.append(
            f"pedigree_count={master.get('pedigree_count')!r}, actual={len(pedigrees)}"
        )
    if game.get("node_count") != len(nodes):
        count_violations.append(
            f"node_count={game.get('node_count')!r}, actual={len(nodes)}"
        )
    _raise_violations("V06 count 不一致", count_violations)

    pedigree_ids = [record.get("pedigree_id") for record in pedigrees]
    duplicate_pedigree_ids = _duplicate_values(pedigree_ids)
    _raise_violations(
        "V07 pedigree_id 重複",
        [repr(value) for value in duplicate_pedigree_ids],
    )

    node_ids = [node.get("node_id") for node in nodes]
    duplicate_node_ids = _duplicate_values(node_ids)
    _raise_violations(
        "V08 node_id 重複", [repr(value) for value in duplicate_node_ids]
    )

    pedigree_id_set = set(pedigree_ids)
    missing_node_pedigrees = [
        f"{node.get('node_id')} -> {node.get('pedigree_id')}"
        for node in nodes
        if node.get("pedigree_id") not in pedigree_id_set
    ]
    _raise_violations("V10 node の pedigree_id 不明", missing_node_pedigrees)

    invalid_node_ids = [
        str(node.get("node_id"))
        for node in nodes
        if node.get("node_id")
        != f"{node.get('pedigree_id')}-{node.get('variant_code')}"
    ]
    _raise_violations("V09 node_id 等式違反", invalid_node_ids)

    dangling_parents = []
    for pedigree in pedigrees:
        for field in ("father_pedigree_id", "mother_pedigree_id"):
            parent_id = pedigree.get(field)
            if parent_id is not None and parent_id not in pedigree_id_set:
                dangling_parents.append(
                    f"{pedigree.get('pedigree_id')}.{field} -> {parent_id}"
                )
    _raise_violations("V11 親 pedigree_id 不明", dangling_parents)


def _cache_paths(cache_dir: Path, key: str) -> tuple[Path, Path]:
    """R2 キーに対応するキャッシュ本体とメタ情報のパスを返す。"""
    filename = key.replace("/", "_")
    body_path = cache_dir / filename
    return body_path, cache_dir / f"{filename}.meta.json"


def _read_cached_etag(meta_path: Path) -> str | None:
    """存在するキャッシュメタ情報から ETag を読む。"""
    if not meta_path.is_file():
        return None
    metadata = json.loads(meta_path.read_text(encoding="utf-8"))
    etag = metadata.get("etag")
    return etag if isinstance(etag, str) and etag else None


def _read_cache(body_path: Path) -> bytes | None:
    """キャッシュ本体があればバイト列として返す。"""
    return body_path.read_bytes() if body_path.is_file() else None


def _warn_cache_fallback(key: str, error: Exception) -> None:
    """取得失敗時のキャッシュ利用を標準エラーへ通知する。"""
    print(
        f"[warn] R2 の {key} 取得に失敗したためキャッシュを使用します: "
        f"{type(error).__name__}: {error}",
        file=sys.stderr,
    )


def _fetch_object(
    *,
    client: Any,
    bucket: str,
    key: str,
    cache_dir: Path | None,
) -> tuple[bytes, bool]:
    """単一オブジェクトを条件付き取得し、本文とキャッシュ由来かを返す。"""
    body_path = None
    meta_path = None
    etag = None
    if cache_dir is not None:
        body_path, meta_path = _cache_paths(cache_dir, key)
        etag = _read_cached_etag(meta_path)

    request = {"Bucket": bucket, "Key": key}
    if etag is not None:
        request["IfNoneMatch"] = etag

    try:
        response = client.get_object(**request)
        payload = response["Body"].read()
    except ClientError as exc:
        status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        cached = _read_cache(body_path) if body_path is not None else None
        if status == 304:
            if cached is not None:
                return cached, True
            raise
        if cached is not None:
            _warn_cache_fallback(key, exc)
            return cached, True
        raise
    except Exception as exc:
        cached = _read_cache(body_path) if body_path is not None else None
        if cached is not None:
            _warn_cache_fallback(key, exc)
            return cached, True
        raise

    if isinstance(payload, str):
        payload = payload.encode("utf-8")
    if not isinstance(payload, bytes):
        raise TypeError(f"R2 の {key} 本文が bytes ではありません")

    if cache_dir is not None and body_path is not None and meta_path is not None:
        cache_dir.mkdir(parents=True, exist_ok=True)
        body_path.write_bytes(payload)
        meta_path.write_text(
            json.dumps({"etag": response.get("ETag")}, ensure_ascii=False) + "\n",
            encoding="utf-8",
            newline="\n",
        )
    return payload, False


def _build_r2_client(endpoint: str) -> Any:
    """環境変数の認証情報を検査して SigV4 対応 R2 client を作る。"""
    missing = [
        name
        for name in ("R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")
        if not os.environ.get(name, "").strip()
    ]
    if missing:
        raise RuntimeError(
            "R2 認証情報が不足しています: " + ", ".join(missing)
        )

    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
        config=Config(
            signature_version="s3v4",
            retries={"max_attempts": 5, "mode": "standard"},
            # 既定の応答チェックサム検証を切る。有効なままだと R2 が返す 304 を
            # botocore が解釈できず、ClientError ではなく
            # `TypeError: a bytes-like object is required, not 'StreamingChecksumBody'`
            # になる（304 の本文を XML エラーとしてパースしようとして落ちる）。
            # その結果 IfNoneMatch の条件付き取得が常に「取得失敗」に見え、
            # 本当の通信障害と区別できなくなる。
            response_checksum_validation="when_required",
        ),
    )


def load_pedigree_master(
    *,
    endpoint: str | None = None,
    bucket: str | None = None,
    master_key: str = "pedigree_master.json",
    game_nodes_key: str = "pedigree_master.game.json",
    cache_dir: str | Path | None = ".cache/pedigree",
    expected_dataset_version: str | None = None,
    client: Any = None,
) -> PedigreeMasterBundle:
    """R2 から血統マスターを取得し、検証済み bundle を返す。"""
    resolved_endpoint = (
        endpoint
        if endpoint is not None
        else os.environ.get("R2_ENDPOINT_URL", DEFAULT_R2_ENDPOINT)
    )
    resolved_bucket = (
        bucket
        if bucket is not None
        else os.environ.get("R2_BUCKET", DEFAULT_R2_BUCKET)
    )
    if client is None:
        client = _build_r2_client(resolved_endpoint)

    resolved_cache_dir = Path(cache_dir) if cache_dir is not None else None
    master_payload, master_cached = _fetch_object(
        client=client,
        bucket=resolved_bucket,
        key=master_key,
        cache_dir=resolved_cache_dir,
    )
    game_payload, game_cached = _fetch_object(
        client=client,
        bucket=resolved_bucket,
        key=game_nodes_key,
        cache_dir=resolved_cache_dir,
    )
    return _make_bundle(
        json.loads(master_payload),
        json.loads(game_payload),
        expected_dataset_version,
        from_cache=master_cached and game_cached,
    )


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """手動検証用 CLI の引数を解析する。"""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--r2-endpoint")
    parser.add_argument("--r2-bucket")
    parser.add_argument("--pedigree-master-key", default="pedigree_master.json")
    parser.add_argument(
        "--pedigree-game-nodes-key", default="pedigree_master.game.json"
    )
    parser.add_argument("--pedigree-cache-dir", default=".cache/pedigree")
    parser.add_argument("--pedigree-dataset-version")
    parser.add_argument("--master-file", type=Path)
    parser.add_argument("--game-nodes-file", type=Path)
    return parser.parse_args(argv)


def _load_local_bundle(
    master_path: Path,
    game_path: Path,
    expected_dataset_version: str | None,
) -> PedigreeMasterBundle:
    """ローカルの 2 ファイルを読み、R2 を使わず検証する。"""
    return _make_bundle(
        json.loads(master_path.read_text(encoding="utf-8")),
        json.loads(game_path.read_text(encoding="utf-8")),
        expected_dataset_version,
        from_cache=False,
    )


def _make_bundle(
    master: dict,
    game: dict,
    expected_dataset_version: str | None,
    *,
    from_cache: bool,
) -> PedigreeMasterBundle:
    """2 つの辞書を検証して bundle にまとめる。"""
    validate_bundle(master, game, expected_dataset_version)
    return PedigreeMasterBundle(
        master=master,
        game=game,
        dataset_version=master["dataset_version"],
        source_sha256=master["source"]["sha256"],
        from_cache=from_cache,
    )


def _print_bundle_summary(bundle: PedigreeMasterBundle) -> None:
    """検証結果を機械的に確認できる 5 行で出力する。"""
    print(f"dataset_version: {bundle.dataset_version}")
    print(f"source.sha256:   {bundle.source_sha256}")
    print(f"pedigrees:       {len(bundle.master['pedigrees'])}")
    print(f"nodes:           {len(bundle.game['nodes'])}")
    print(f"from_cache:      {bundle.from_cache}")


def main(argv: list[str] | None = None) -> int:
    """CLI を実行し、成功 0・失敗 1 を返す。"""
    args = _parse_args(argv)
    try:
        local_flags = (args.master_file is not None, args.game_nodes_file is not None)
        if any(local_flags) and not all(local_flags):
            raise RuntimeError(
                "--master-file と --game-nodes-file は両方指定してください"
            )
        if all(local_flags):
            bundle = _load_local_bundle(
                args.master_file,
                args.game_nodes_file,
                args.pedigree_dataset_version,
            )
        else:
            bundle = load_pedigree_master(
                endpoint=args.r2_endpoint,
                bucket=args.r2_bucket,
                master_key=args.pedigree_master_key,
                game_nodes_key=args.pedigree_game_nodes_key,
                cache_dir=args.pedigree_cache_dir,
                expected_dataset_version=args.pedigree_dataset_version,
            )
        _print_bundle_summary(bundle)
        return 0
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
