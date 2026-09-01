# 作業指示書: 血統マスター 2 ファイルの R2 取得層（段階0）

- status: 完了（2026-09-01 検収済み。検収時に 304 経路の不具合を 1 件修正）
- 作成日: 2026-09-01
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 設計資料: `docs/pedigree-master-integration-design.md` §3.1 / §3.2 / §5.1
- 後続: `docs/codex-work-orders/2026-09-01-pedigree-master-python.md`（段階1）がこのモジュールを呼ぶ

## 背景と目的

ダビマスの血統マスターは、Cloudflare R2 上の次の 2 ファイルを正本とする。

| キー | schema | 主キー | 役割 |
|---|---|---|---|
| `pedigree_master.json` | `dabimas-pedigree-master` | `pedigree_id` | 実馬レイヤー。父母・系統・奇跡グループ・別名 |
| `pedigree_master.game.json` | `dabimas-pedigree-game-nodes` | `node_id` | ゲームノードレイヤー。variant・因子・表示名 |

この 2 ファイルはリポジトリに置かない。**ビルド時に Python が R2 から取得する。** フロントエンドは一切 fetch しない。

段階0 のゴールは、**この取得と検証だけを行う単体モジュールを作ること**である。既存のビルド (`scripts/build_dabimas_stream.py`) には**まだ繋がない**。繋ぐのは段階1 の作業。したがってこの段階では既存の出力 JSON は 1 バイトも変わらない。

### なぜ検証が必須なのか

R2 はオブジェクト単位では強整合だが、2 キーの更新は 1 トランザクションではない。片方だけ新しい状態で取得すると `node_id` と `pedigree_id` の対応が壊れ、血統表が静かに誤った馬を指す。そのため 2 ファイルの `dataset_version` と `source.sha256` の一致検査を**取得直後の必須ゲート**にする。

## 実装方針

### 変更対象ファイル

- `scripts/pedigree_master_fetch.py` — **新規**。R2 取得・検証・キャッシュ
- `tests/test_pedigree_master_fetch.py` — **新規**。fixture ベースの単体テスト
- `tests/fixtures/pedigree-master/pedigree_master.json` — **新規**。ミニ実馬レイヤー
- `tests/fixtures/pedigree-master/pedigree_master.game.json` — **新規**。ミニゲームノードレイヤー
- `scripts/requirements.txt` — `boto3>=1.36.0` を 1 行追加（当初 1.34.0 と指定したが、検収時の修正で 1.36.0 へ引き上げ。理由は検収記録）

### 1. R2 接続

エンドポイントは R2 の **S3 API エンドポイント**であり、公開バケットではない。未認証 GET は次を返すことを確認済みなので、`requests` の素の GET では取得できない。**SigV4 署名が必須**で、`boto3` を使う。

```text
400 <Error><Code>InvalidArgument</Code><Message>Authorization</Message></Error>
```

```python
import boto3
from botocore.config import Config

client = boto3.client(
    "s3",
    endpoint_url=endpoint,
    aws_access_key_id=access_key_id,
    aws_secret_access_key=secret_access_key,
    region_name="auto",
    config=Config(
        signature_version="s3v4",
        retries={"max_attempts": 5, "mode": "standard"},
        # 検収時に追加。既定のままだと R2 の 304 が ClientError にならない（検収記録参照）
        response_checksum_validation="when_required",
    ),
)
```

| 項目 | 値 |
|---|---|
| エンドポイント | `https://28b1c8418991144df39ed91917f7f401.r2.cloudflarestorage.com` |
| バケット | `dabimas-data` |
| リージョン | `auto` |
| オブジェクトキー | `pedigree_master.json` / `pedigree_master.game.json`（**バケットのルート直下。prefix なし**） |

### 2. 認証情報

| 環境変数 | 内容 |
|---|---|
| `R2_ENDPOINT_URL` | 上記エンドポイント。既定値としてコードに持ってよい |
| `R2_BUCKET` | `dabimas-data`。既定値を持ってよい |
| `R2_ACCESS_KEY_ID` | **秘密**。リポジトリに置かない |
| `R2_SECRET_ACCESS_KEY` | **秘密**。リポジトリに置かない |

- **アクセスキーとシークレットをコード・テスト・ドキュメントに一切書かないこと。** 既定値を持ってよいのはエンドポイントとバケット名だけ。
- どちらかが未設定・空文字なら、**空文字で署名して 400 を食う前に**、不足している変数名を挙げて `RuntimeError` で即座に失敗する。
- `.env` の読み込み機能は作らない。呼び出し側の環境変数だけを見る。

### 3. 公開 API

```python
@dataclass(frozen=True)
class PedigreeMasterBundle:
    master: dict            # pedigree_master.json をパースしたもの
    game: dict              # pedigree_master.game.json をパースしたもの
    dataset_version: str
    source_sha256: str
    from_cache: bool        # 2 ファイルとも 304 / キャッシュ由来なら True


def load_pedigree_master(
    *,
    endpoint: str | None = None,
    bucket: str | None = None,
    master_key: str = "pedigree_master.json",
    game_nodes_key: str = "pedigree_master.game.json",
    cache_dir: str | Path | None = ".cache/pedigree",
    expected_dataset_version: str | None = None,
    client=None,                       # テスト用の注入口。None なら boto3 を組み立てる
) -> PedigreeMasterBundle:
```

- `client` を引数で受け取れるようにすること。**テストはこの注入口だけを使い、boto3 も requests もモンキーパッチしない。**
- `endpoint` / `bucket` が `None` のときだけ環境変数を見る（引数が優先）。
- 戻り値のパース済み dict は加工しない。索引付けは段階1 の責務。

### 4. 取得手順

1. `cache_dir` から各キーの `ETag` を読む（あれば）。
2. `client.get_object(Bucket=..., Key=..., IfNoneMatch=etag)` で条件付き取得する。
3. HTTP 304 が返ったらキャッシュ本体を読む。boto3 は 304 を例外で返すので、`botocore.exceptions.ClientError` を捕まえ、`exc.response["ResponseMetadata"]["HTTPStatusCode"] == 304` のときだけキャッシュへフォールバックする。それ以外の `ClientError` は再送出する。
4. 200 のときは本文を `cache_dir` へ保存し、`ETag` をメタファイルへ保存する。
5. **取得に失敗したときはキャッシュへフォールバックし、`[warn]` を出す。キャッシュも無ければ失敗する。**

キャッシュのレイアウト（キー名の `/` は `_` へ置換してファイル名にする）:

```text
.cache/pedigree/pedigree_master.json
.cache/pedigree/pedigree_master.json.meta.json      {"etag": "\"...\""}
.cache/pedigree/pedigree_master.game.json
.cache/pedigree/pedigree_master.game.json.meta.json
```

`cache_dir=None` のときはキャッシュを読み書きせず、常に無条件取得する。

### 5. 検証（`validate_bundle(master, game, expected_dataset_version=None)`）

取得経路と独立した**純粋関数**として実装し、ローカルファイルからも呼べるようにすること。1 件でも違反があれば `PedigreeMasterError`（このモジュールで定義する `RuntimeError` の派生）を送出する。

| # | 検査 | 失敗時 |
|---|---|---|
| V01 | `master["schema"] == "dabimas-pedigree-master"` かつ `schema_version == 1` | エラー |
| V02 | `game["schema"] == "dabimas-pedigree-game-nodes"` かつ `schema_version == 1` | エラー |
| V03 | 2 ファイルの `dataset_version` が一致 | エラー |
| V04 | 2 ファイルの `source.sha256` が一致 | エラー |
| V05 | `expected_dataset_version` 指定時、その値と一致 | エラー |
| V06 | `pedigree_count == len(pedigrees)`、`node_count == len(nodes)` | エラー |
| V07 | `pedigree_id` の重複が 0 | エラー |
| V08 | `node_id` の重複が 0 | エラー |
| V09 | 全 node の `node_id == pedigree_id + "-" + variant_code` | エラー |
| V10 | 全 node の `pedigree_id` が実馬レイヤーに存在 | エラー |
| V11 | `father_pedigree_id` / `mother_pedigree_id` が非 null なら実馬レイヤーに存在（dangling 0） | エラー |

エラーメッセージには**違反件数と最初の 5 件のサンプル**を含めること。14780 件のうちどれが壊れているか分からないメッセージは役に立たない。

#### V09 に関する必読事項

`pedigree_id` は**ハイフンを含み得る**。現行データでは 14780 件のうち **379 件**が `game:baf5c72f-3f2f-5bc9-b05b-32ee2b71d5d6` 形式の UUID である。したがって:

- `node_id.split("-")[0]` は**禁止**。`node_id.rsplit("-", 1)` を使うか、レコードの `pedigree_id` フィールドをそのまま使うこと。
- V09 は `node["node_id"] == node["pedigree_id"] + "-" + node["variant_code"]` の等式で検査する。分解して比較しない。

### 6. CLI

手動確認用のエントリポイントを付ける。段階1 のビルドはこの CLI ではなく `load_pedigree_master()` を直接呼ぶ。

```text
python scripts/pedigree_master_fetch.py [options]

--r2-endpoint <URL>              既定 $R2_ENDPOINT_URL
--r2-bucket <NAME>               既定 $R2_BUCKET（dabimas-data）
--pedigree-master-key <KEY>      既定 pedigree_master.json
--pedigree-game-nodes-key <KEY>  既定 pedigree_master.game.json
--pedigree-cache-dir <DIR>       既定 .cache/pedigree
--pedigree-dataset-version <VER> 期待する dataset_version（省略時は検証スキップ）
--master-file <PATH>             R2 を使わずローカル JSON を読む（検証だけ実行）
--game-nodes-file <PATH>         同上
```

`--master-file` / `--game-nodes-file` が両方指定されたときは R2 へ接続せず、ファイルを読んで `validate_bundle()` だけを走らせる。**これは認証情報なしで検証ロジックを動かすための経路で、段階1 のオフラインビルドでも使う。**

成功時の標準出力（この 5 行を必ず出す）:

```text
dataset_version: 2026-09-01T052756Z+raw.f7018232c481
source.sha256:   0316e8411db34e8c56c8ac8ec9db3c53987cab0cba11aa3d6ae6ab019aa4f83b
pedigrees:       14780
nodes:           16187
from_cache:      False
```

終了コードは成功 0 / 検証失敗・取得失敗 1。

### 7. テストフィクスチャ

`tests/fixtures/pedigree-master/` に**手書きのミニデータセット**を作る。実データの構造を縮めたもので、下表のレコードを持つこと。トップレベルは実データと同じキー構成（`schema` / `schema_version` / `dataset_version` / `generated_at` / `source` / `pedigree_count` または `node_count` / `pedigrees` または `nodes`）とし、`dataset_version` は両ファイルとも `"2026-01-01T000000Z+raw.testfixture"`、`source` は `{"file": "fixture.json", "sha256": "<64桁の0>", "node_count": 7}` で揃える。

`pedigree_master.json` の `pedigrees`（5 件）:

| `pedigree_id` | `canonical_name` | `father_pedigree_id` | `mother_pedigree_id` | `kiseki_group_id` | `child_sire_line` | 目的 |
|---|---|---|---|---|---|---|
| `0000008661` | シンザン | `0000333190` | `0000000858` | `265` | `{"id":48,"name":"ボワルセル系","sire_line_base_id":13}` | variant 複数・奇跡グループあり |
| `0000333190` | ヒンドスタン | `null` | `null` | `null` | 同上 | 父方の終端 |
| `0000000858` | ハヤノボリ | `0000333190` | `null` | `null` | `null` | **`child_sire_line` なし → §4.7 の父方向フォールバック検証用** |
| `0000333914` | アルサイド | `null` | `null` | `null` | `null` | base variant を持たず year variant だけ |
| `game:0000-uuid-0001` | ゲームオリジナル | `0000008661` | `0000000858` | `null` | `null` | **ハイフン入り `pedigree_id`**。`aliases` に `["Game Original"]` |

各レコードは実データと同じフィールドを持たせる（`pedigree_source` / `pedigree_name` / `name_kana` / `aliases` / `sire_line_id` / `parent_sire_line` / `pedigree_effect_ids` / `standard_effect_source` / `mapping_status` / `external_ids`）。値は妥当なら何でもよい。

`pedigree_master.game.json` の `nodes`（7 件）:

| `node_id` | `pedigree_id` | `subname` | `variant_code` | `variant_type` | `is_base_equivalent` | `pedigree_effect_ids` | `source_names` |
|---|---|---|---|---|---|---|---|
| `0000008661-00` | `0000008661` | `null` | `00` | `base` | `true` | `[]` | `["シンザン"]` |
| `0000008661-10` | `0000008661` | `神速` | `10` | `named` | `false` | `[2,2,2]` | `["シンザン-神速-"]` |
| `0000333190-00` | `0000333190` | `null` | `00` | `base` | `true` | `[4]` | `["ヒンドスタン"]` |
| `0000000858-00` | `0000000858` | `null` | `00` | `base` | `true` | `[]` | `["ハヤノボリ"]` |
| `0000333914-01` | `0000333914` | `1958` | `01` | `year` | `true` | `[]` | `["アルサイド-1958-"]` |
| `0000333914-02` | `0000333914` | `1959` | `02` | `year` | `true` | `[]` | `["アルサイド-1959-"]` |
| `game:0000-uuid-0001-00` | `game:0000-uuid-0001` | `null` | `00` | `base` | `true` | `[]` | `["ゲームオリジナル"]` |

`name` は対応する `canonical_name`、`normalized_subname` は `subname` と同値、`source_pedigree_names` は `source_names` と同値でよい。他に `dabimas_master_id`（全件でユニークな文字列）・`sub_ability_id: 0`・`name_kana: ""`・`registration_source`・`mapping_status`・`active: true`・`first_seen_at` / `last_seen_at` を持たせる。

**このフィクスチャは段階1 でもそのまま使うので、上表どおりに作ること。**

### 8. テスト（`tests/test_pedigree_master_fetch.py`）

既存 `tests/test_build_dabimas_stream.py` の `load_module()` と同じ `importlib` 方式でモジュールを読み込む。R2 へは一切接続しない。

`client` 注入口へ渡すスタブは、`get_object(Bucket, Key, IfNoneMatch=None)` を持ち、`{"Body": <read() を持つオブジェクト>, "ETag": "..."}` を返すだけの最小実装でよい。

| ID | 内容 | 期待 |
|---|---|---|
| T-F01 | フィクスチャ 2 ファイルを `validate_bundle()` に通す | 例外なし |
| T-F02 | game 側の `dataset_version` を書き換える | `PedigreeMasterError`、メッセージに両方の値 |
| T-F03 | game 側の `source.sha256` を書き換える | `PedigreeMasterError` |
| T-F04 | `expected_dataset_version` に別の値を渡す | `PedigreeMasterError` |
| T-F05 | ある node の `variant_code` だけ書き換えて等式を崩す | V09 で `PedigreeMasterError`、違反 `node_id` がメッセージに出る |
| T-F06 | `game:0000-uuid-0001-00` を素通りさせる | **V09 を通過する**（`split("-")[0]` 実装なら落ちる回帰テスト） |
| T-F07 | ある node の `pedigree_id` を存在しない値へ書き換える | V10 で `PedigreeMasterError` |
| T-F08 | `father_pedigree_id` を存在しない値へ書き換える | V11 で `PedigreeMasterError` |
| T-F09 | `node_id` を重複させる | V08 で `PedigreeMasterError` |
| T-F10 | スタブ client + 空 `cache_dir`(tmp_path) で `load_pedigree_master()` | 2 ファイルが読め、キャッシュ本体とメタが書かれ、`from_cache is False` |
| T-F11 | T-F10 のあと、304 を返すスタブで再取得 | キャッシュから読め、`from_cache is True`、`IfNoneMatch` に前回 ETag が渡っている |
| T-F12 | `get_object` が常に例外を投げるスタブ + キャッシュあり | キャッシュへフォールバックして成功する |
| T-F13 | 同上 + キャッシュなし | 例外を送出する |
| T-F14 | `R2_ACCESS_KEY_ID` を空にして `client=None` で呼ぶ | `RuntimeError`、メッセージに不足変数名。**boto3 の呼び出しに到達しない** |

`monkeypatch.setenv` / `delenv` で環境変数を操作すること。テストが実行環境の `R2_*` を拾って挙動を変えてはならない。

## 制約

- `AGENTS.md` の Safety Rules に従うこと。
- `scripts/build_dabimas_stream.py` は**この段階では 1 行も変更しない**。
- 新規ファイルは UTF-8（BOM なし）・改行 LF。既存 `scripts/*.py` と同じく、docstring とコメントは日本語で書く。
- 型注釈は既存スクリプトと同じ粒度（`from __future__ import annotations` + 引数と戻り値に注釈）。
- 例外の握りつぶし禁止。`except Exception: pass` を書かない。
- 秘密情報をログ・エラーメッセージ・テストに出さない。エンドポイントとバケット名は出してよい。

## スコープ外（やらないこと）

- `scripts/build_dabimas_stream.py` への接続（段階1 でやる）
- 名前解決・血統展開・`pedigreeNodes.json` 生成（段階1 でやる）
- R2 への書き込み・アップロード。**このモジュールは読み取り専用**
- `.github/workflows/build-dabimas-stream.yml` への secrets 追加（ユーザーが手で行う）
- 既存のスクレイピング経路（`parse_stallion` / `parse_broodmare` / `collect_horse_urls` など）への変更
- `json/` 配下の出力ファイルの変更
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

1. `python -m pytest tests/ -q` が全件成功する。
2. `python -m pytest tests/test_pedigree_master_fetch.py -q` で T-F01〜T-F14 の 14 ケースが成功する。
3. `python scripts/pedigree_master_fetch.py --master-file tests/fixtures/pedigree-master/pedigree_master.json --game-nodes-file tests/fixtures/pedigree-master/pedigree_master.game.json` が終了コード 0 で、§6 の 5 行（`dataset_version: 2026-01-01T000000Z+raw.testfixture` / `pedigrees: 5` / `nodes: 7`）を出力する。
4. 同コマンドに `--pedigree-dataset-version 9999-99-99T000000Z+raw.nope` を足すと、終了コード 1 と `dataset_version` 不一致を示すエラーメッセージが出る。
5. 認証情報の環境変数を外して R2 経路を叩いたとき、boto3 の 400 ではなく「`R2_ACCESS_KEY_ID` が無い」と読める日本語エラーで終了コード 1 になる。
6. `grep -n 'split("-")\[0\]' scripts/pedigree_master_fetch.py` が 0 件（§5 の必読事項）。
7. `scripts/requirements.txt` に `boto3>=1.36.0` があり、他の行が変わっていない。
8. `git status` で変更されているのが §「変更対象ファイル」の 5 ファイルだけである。

**実データ（R2）に対する疎通確認は認証情報が必要なため、この作業の受け入れ基準に含めない。** 依頼者側で実行し、`dataset_version` / `pedigrees: 14780` / `nodes: 16187` を確認する。

## 検証コマンド

```bash
python -m pytest tests/ -q
python -m pytest tests/test_pedigree_master_fetch.py -q

python scripts/pedigree_master_fetch.py \
  --master-file tests/fixtures/pedigree-master/pedigree_master.json \
  --game-nodes-file tests/fixtures/pedigree-master/pedigree_master.game.json

python scripts/pedigree_master_fetch.py \
  --master-file tests/fixtures/pedigree-master/pedigree_master.json \
  --game-nodes-file tests/fixtures/pedigree-master/pedigree_master.game.json \
  --pedigree-dataset-version 9999-99-99T000000Z+raw.nope

grep -n 'split("-")\[0\]' scripts/pedigree_master_fetch.py
git status --short
```

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。

### 変更ファイル一覧

- `scripts/pedigree_master_fetch.py` — SigV4 による R2 取得、ETag 条件付き取得、キャッシュ退避、2ファイル検証、ローカル検証 CLI を追加。
- `tests/test_pedigree_master_fetch.py` — T-F01〜T-F14 と実 R2 の 304 回帰テストを追加。
- `tests/fixtures/pedigree-master/pedigree_master.json` — 5 pedigree の手書き実馬レイヤー fixture を追加。
- `tests/fixtures/pedigree-master/pedigree_master.game.json` — 7 node の手書きゲームノードレイヤー fixture を追加。
- `scripts/requirements.txt` — `boto3>=1.36.0` を追加。

### 設計判断

- T-F07 が `pedigree_id` だけを書き換えて V10 を検出できるよう、参照存在検査 V10 を node 等式検査 V09 より先に実行した。各検査内容自体は仕様どおり。
- 実 R2 の 304 応答を botocore がチェックサム本文として誤解釈しないよう、S3 Config の `response_checksum_validation` を `when_required` にした。
- `.gitignore` の既存 `tests` ルールで新規テストが隠れるため、テストと fixture は `git add -f` で追跡対象にした。

### 実行した検証と結果

- 基準1: `python -m pytest tests/ -q` — 段階0検収時 **33 passed**、段階1実装後 **52 passed**。
- 基準2: `python -m pytest tests/test_pedigree_master_fetch.py -q` — T-F01〜T-F14 と追加回帰テストを含め **15 passed**。
- 基準3: fixture 2ファイルを指定した CLI — 終了コード0。指定の5行と `pedigrees: 5` / `nodes: 7` を確認。
- 基準4: 不一致 dataset_version を指定 — 終了コード1、期待値と実値を含む V05 エラーを確認。
- 基準5: R2認証環境変数なし — 終了コード1、不足変数名を示す日本語エラーを確認。
- 基準6: 禁止文字列 `split("-")[0]` — 0件。
- 基準7: `scripts/requirements.txt` は boto3 の1行だけを追加。実 R2 304 対応のため下限は1.36.0。
- 基準8: 段階0の実装対象は指定の5ファイル。既存の別作業変更は保持した。
- 実 R2: 14780 pedigree / 16187 node、初回 `from_cache=False`、304再取得 `from_cache=True` を検収時に確認。

### 残課題・気づき

なし。実 R2 304 経路で見つかった不具合も検収時に修正・再確認済み。

---

## 検収記録（2026-09-01・Claude Code）

### 判定

**合格。** 受け入れ基準 1〜8 をすべて実機で再実行して確認した。検収中に 1 件の不具合を見つけ、その場で修正した（下記）。

**完了報告の節が未記入のまま提出された。** 次回以降は埋めること。設計判断（下記の V09/V10 順序入れ替え）が本来はそこに書かれているべきだった。

### 受け入れ基準の検証結果

| # | 内容 | 結果 |
|---|---|---|
| 1 | `python -m pytest tests/ -q` | 合格（修正前 32 passed / 修正後 33 passed） |
| 2 | `pytest tests/test_pedigree_master_fetch.py -q` で 14 ケース | 合格（T-F01〜T-F14 に 1:1 対応する 14 関数を確認） |
| 3 | フィクスチャで CLI 実行 | 合格。`dataset_version: 2026-01-01T000000Z+raw.testfixture` / `pedigrees: 5` / `nodes: 7` / exit 0 |
| 4 | 不一致な `--pedigree-dataset-version` | 合格。`V05 dataset_version 不一致` を出して exit 1 |
| 5 | 認証情報なしで R2 経路 | 合格。`R2 認証情報が不足しています: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY` で exit 1。boto3 の 400 には到達しない |
| 6 | `split("-")[0]` の不在 | 合格（0 件）。等式は文字列連結で検査しており、`game:0000-uuid-0001-00` が V09 を通ることも T-F06 で固定されている |
| 7 | `scripts/requirements.txt` | 合格（他行の変更なし）。ただし下記修正でバージョン下限を引き上げた |
| 8 | `git status` が対象 5 ファイルのみ | 合格 |

フィクスチャは指示書 §7 の表と 1 件ずつ突き合わせ、pedigree 5 件・node 7 件・全フィールドが一致することを確認した。

### 実データ（R2）での疎通確認

依頼者側で行う前提だった確認を検収時に実施した。

```text
1 回目（キャッシュなし）: dataset_version 2026-09-01T052756Z+raw.f7018232c481 /
                          pedigrees 14780 / nodes 16187 / from_cache False
2 回目（同一キャッシュ）: 同上 / from_cache True
3 回目（--pedigree-dataset-version で版を固定）: exit 0
```

### 検収で見つけて修正した不具合: 304 応答が ClientError にならない

**現象**: 2 回目以降の取得（`IfNoneMatch` 付き）が、実際の R2 に対して常に次で失敗していた。

```text
[warn] R2 の pedigree_master.json 取得に失敗したためキャッシュを使用します:
       TypeError: a bytes-like object is required, not 'StreamingChecksumBody'
```

**原因**: boto3/botocore の既定（`response_checksum_validation = "when_supported"`）では応答本文が `StreamingChecksumBody` に包まれる。304 は botocore にとってエラー応答なので `_parse_error_from_body()` が本文を XML としてパースしようとし、`parser.feed()` が bytes ではないオブジェクトを受け取って `TypeError` になる。`ClientError` が送出されないため、実装の `HTTPStatusCode == 304` 分岐に一度も入らない。

**影響**: 結果としてキャッシュへ落ちるので出力は正しくなるが、**条件付き取得が毎回「取得失敗」として扱われる**。つまり「更新なし（304）」と「R2 に届かない」が区別できず、R2 障害時に古いキャッシュが同じ WARN のまま使われる。取得層の警告として最も意味のある区別が失われていた。

単体テストが通っていたのは、スタブが `HTTPStatusCode: 304` を持つ `ClientError` を手で組み立てており、実際の botocore が返す形と違っていたため。

**修正**:

1. `_build_r2_client()` の `Config` に `response_checksum_validation="when_required"` を追加（理由をコメントで明記）。実 R2 に対し、304 が `ClientError` / `HTTPStatusCode: 304` として返ることを確認済み。通常の 200 GET が bytes を返すことも確認した（7201874 bytes）。
2. `scripts/requirements.txt` の下限を `boto3>=1.34.0` → **`boto3>=1.36.0`** へ引き上げ。`response_checksum_validation` は 1.36 で追加された設定で、1.34 では `Config()` が `TypeError` になる。
3. 回帰テスト `test_client_disables_response_checksum_validation` を追加（テスト件数 14 → 15）。

### 受け入れた設計判断（完了報告に書かれるべきだったもの）

- **V10 を V09 より先に検査している。** 指示書の表は V09→V10 の順だが、node の `pedigree_id` を存在しない値へ書き換えると等式（V09）も同時に壊れる。T-F07 が V10 を期待しているため、参照先の欠落を先に報告する順序が正しい。この入れ替えを承認する。

### 残った軽微な指摘（差し戻さない）

- `from botocore.exceptions import ClientError` がモジュール先頭にある一方、`boto3` は `_build_r2_client()` 内で遅延 import している。botocore は boto3 の依存なので実害はないが、遅延 import の意図が打ち消されている。段階1 で触るときに揃えてよい。
- CLI の既定キャッシュ先が `.cache/pedigree` だが `.gitignore` に `.cache/` が無い。既定のまま実行するとリポジトリ直下に未追跡ディレクトリができる。**段階1 の受け入れ基準 8 でカバー済み**なのでここでは直さない。
- `validate_bundle()` の V01〜V05 が「三項演算子で 1 要素リストを作って `_raise_violations()` へ渡す」書き方になっており読みにくい。動作は正しいので今回は変更しない。
