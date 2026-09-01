# 作業指示書: 血統マスターをビルドへ接続し nodeId / mares / pedigreeNodes.json を出す（段階1）

- status: 完了（2026-09-01 検収済み。実 R2 データでの全件検証まで実施）
- 作成日: 2026-09-01
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 設計資料: `docs/pedigree-master-integration-design.md` §4 / §5 / §12.1
- 前提: `docs/codex-work-orders/2026-09-01-pedigree-master-r2-fetch.md`（段階0）が完了していること
- 稼働影響: **なし。** この段階では出力 JSON にフィールドが増えるだけで、フロントエンドは追加分を無視する

## 背景と目的

現行の PWA は血統表の同一馬判定・全兄妹判定・因子カウントを**馬名の文字列比較**で行っている。ゲーム内部では血統ノード ID による判定なので、同名別馬の誤統合や、variant 違い（シンザン通常版とシンザン神速）の扱いが再現できていない。

これを直すため、R2 上の血統マスター 2 ファイルを正本として `node_id` / `pedigree_id` をビルド成果物へ焼き込む。フロントエンドの判定ロジック差し替えは段階3 以降で、この段階は**データを用意するだけ**。

段階1 の成果物は次の 4 つ。

```text
json/dabimasFactor.summary.json      nodeId / pedigreeId を追加
json/dabimasFactor-details/*.json    descendants[].nodeId / pedigreeId と mares[15] を追加
json/dabimasFactor.json              追加なし（既存フォールバック経路。変更しない）
json/pedigreeNodes.json              新規。血統表 62 枠に登場する pedigree と node の辞書
```

### この作業指示書で確定した設計判断（設計資料からの変更）

設計資料 §3.3 / §5.1 は、全書スクレイピングを「詳細ページ 2980 件」から「一覧ページ 2 枚」へ置き換える `scripts/zensho_list_source.py` を段階1 に含めている。**これは本作業のスコープから外す。** 理由は実測に基づく。

1. **天性が一覧ページに存在しない。** `https://dabimas.jp/kouryaku/stallions/name.html` の全文に文字列「天性」は 0 件。天性を持つ 78 頭（全て ★5 種牡馬）の値が失われる。天性は `displayName` のバッジと `searchText` に入るのでユーザーに見える。
2. **現行の重複スキップ規則を再現できない。** 現行は「馬名 + 非凡な才能名が直前と同じならスキップ」で、非凡な才能"名"は詳細ページにしかない。一覧の非凡アイコンで代用すると 2414 件になり、現行の 2375 件と 63 件ずれる。
3. 一覧ページのパネル数は 2466 で、現行 summary の種牡馬 2375 件に対し **91 件多い**。うち何件が新規馬で何件が重複由来かは切り分けが要る。

つまり一覧ページ化は「ビルド時間の最適化」であって本作業の目的ではなく、しかも**単独で出力差分を生む**。段階1 と混ぜると「nodeId 追加による差分」と「スクレイピング経路変更による差分」が区別できなくなり、受け入れ基準（後述の 5）が成立しない。

**したがって全書側の入力は現行の詳細ページ経路のまま据え置く。** 一覧ページ化は別の作業指示書（段階1b）として、差分 91 件を 1 件ずつ説明できる形で切り出す。

なお、一覧ページから取れることは確認済みなので、段階1b で使える事実を記録しておく:
`.stallion_list_panel` 直下 1 つ目の `<table>` の `tr[0] td[0]` に非凡アイコン、`tr[0] td[1]` に星画像と自馬の因子アイコン（`icn_factor_NN.png` 最大 3 個。詳細ページの `row0_tds[1]` 内 div と同じ構造）、`tr[1]` に `list_icn_cat_*.png` と `span.large` の馬名、`tr[2]` に `div.category` の子系統名がある。`.list_factor` テーブルの 14 個の `factor_value` は**自馬の因子ではない**（同一馬の variant 3 頭で同値になる）ので使ってはならない。

## 実装方針

### 変更対象ファイル

- `scripts/pedigree_master_source.py` — **新規**。索引・名前解決・血統展開・`pedigreeNodes.json` 生成
- `scripts/build_dabimas_stream.py` — CLI 引数追加、entry への `nodeId` 付与、出力 3 種の拡張
- `tests/test_pedigree_master_source.py` — **新規**
- `tests/test_build_dabimas_stream.py` — 新経路のテストを追加（既存テストは変更しない）
- `.github/workflows/build-dabimas-stream.yml` — R2 の env と新 CLI 引数を追加

### 1. `scripts/pedigree_master_source.py`

段階0 の `load_pedigree_master()` が返したパース済み 2 ファイルを受け取り、索引化して問い合わせに答える**純粋なクラス**。HTTP も環境変数も触らない。

```python
class PedigreeMasterSource:
    def __init__(self, master: dict, game: dict) -> None: ...

    def resolve(self, name: str, subname: str, ancestors: list[str] | None = None) -> Resolution: ...
    def representative_node_id(self, pedigree_id: str) -> str | None: ...
    def ancestor_pedigree_id(self, pedigree_id: str, path: str) -> str | None: ...
    def sire_slots(self, pedigree_id: str) -> list[str | None]: ...   # 15 件、代表 node_id
    def mare_slots(self, pedigree_id: str) -> list[str | None]: ...   # 15 件、代表 node_id
    def sire_line(self, pedigree_id: str) -> dict | None: ...
    def build_pedigree_nodes(self, pedigree_ids: set[str]) -> dict: ...
```

`Resolution` は `dataclass` とし、`node_id` / `pedigree_id` / `stage`（どの段で当たったか）/ `candidates`（曖昧だった場合の候補）/ `ancestor_mismatch`（男系照合で不一致だった枠数）を持つ。解決できなければ `node_id = None`。

#### 1.1 正規化

`normalize` は **NFKC → strip → lower → 空白除去**。`build_dabimas_stream.normalize_search_text()` の前半と同じだが、**カタカナ→ひらがな変換は行わない**（あちらは検索用、こちらは同一性判定用）。`pedigree_master_source.py` 側に独立した `normalize_name()` を持つこと。

#### 1.2 名前解決の優先順位（§4.2・固定）

全書の `(name, subName)` から game node を引く。**この順に試し、最初に当たった段で止める。**

| 段 | キー | 引く先 | 実測ヒット数 |
|---:|---|---|---:|
| 1 | `node_id` | game node | 0（将来の ID 直指定用の入口） |
| 2 | `dabimas_master_id` | game node | 0（同上） |
| 3 | `normalize(name + subName)` | game node の `normalize(name + subname)` | **2587** |
| 4 | `canonical_name` | pedigree → その全 variant | 0 |
| 5 | `pedigree_name` | pedigree → その全 variant | 0 |
| 6 | `aliases[]` | pedigree → その全 variant | **1** |
| 7 | `source_names[]` | game node | **285** |
| 8 | `source_pedigree_names[]` | game node | 0 |

段 1・2 は全書からは引けないので、入口だけ用意して常に空振りでよい。

**段 7 の `source_names` は必須条件である。** 特殊牝馬 498 頭のうち 277〜285 頭はここでしか引けない（全書の表示名がそのまま入っている）。R2 の中間版でこのフィールドが欠落したとき、特殊牝馬の半数以上が解決不能になった実績がある。

`source_names` の値は**全書の生の表示名**で、named variant では `"シンザン-神速-"` のようにハイフンで囲まれている。全書側の `name` / `subName` は `all_row_to_dabifac_entry()` が `SUB_NAME_RE` で分割したあとの値なので、**段 7 の突き合わせでは `normalize(name + subName)` ではなく分割前の生の馬名でも引けるようにしておくこと**（実装上は `source_names` 側も `normalize(s)` して索引に入れ、キーとして `normalize(name + subName)` と `normalize(生の馬名)` の両方を試すのが簡単）。

#### 1.3 年号 subName のフォールバック（§4.3・唯一の例外）

`subName` が **4 桁数字**または `20XX` のときに限り、`name` だけで再検索し、`is_base_equivalent == true` の variant へフォールバックしてよい。

- **`is_base_equivalent == false`（named variant）へは絶対にフォールバックしない。**
- 現行データセットではこの経路のヒットは 0 件（全ての年号馬が段 3 か段 7 で解決する）。将来マスターに年号 variant が無い馬が来たときの保険なので、**テストで挙動を固定すること**。

#### 1.4 曖昧解消（§4.4・自動で先頭を採らない）

どの段でも候補が複数になり得る。**先頭を自動採用してはならない。** 次の順で絞る。

1. `normalized_subname == normalize(subName)` で絞る。全書の `subName` が空なら `variant_code == "00"`、無ければ `is_base_equivalent == true` を優先する。
2. **男系 15 祖先の照合スコア**（下記 1.5）が最大の候補 1 件を採る。最大値が同点で複数残ったら **unresolved**（`node_id = None`）。

設計資料 §4.4 は 3.（種牡馬/特殊牝馬の区別）と 4.（`dabimas_master_id`）も挙げているが、**現行データセットの game node に `horse_type` フィールドは存在せず、全書側にも `dabimas_master_id` は無いので、この 2 段は実装しない。** 判断根拠として実装にコメントを残すこと。

実測で候補 2 になるのは 1 件だけで、祖先照合が決着させる。

```text
全書「ジョード」(id=b8315438266) の候補
  0000435414                                      祖先照合  4/15
  game:beda838a-0013-5c37-8317-ec586213230a       祖先照合 15/15  ← こちらを採る
```

#### 1.5 男系 15 祖先の照合

全書 detail の `descendants[i].name` と、マスターを `SIRE_PATHS[i]` で辿った祖先の名前集合を突き合わせ、一致した枠数を数える。

**祖先の名前集合は次の和集合とする。狭めると誤検出が出る。**

- pedigree レイヤー: `canonical_name` / `pedigree_name` / `name_kana` / `aliases[]`
- その pedigree の全 variant node: `name` / `name + subname` / `name_kana` / `source_names[]` / `source_pedigree_names[]`

全て `normalize_name()` を通してから比較し、空文字は集合から除く。全書側の名前が空、またはマスター側に祖先が居ない枠は「不一致」に数えない。

この集合を **`canonical_name` と `pedigree_name` だけに狭めると 32 件の不一致が出る**（`ジャイアンツコーズウェイ` と `Giant's Causeway` のようなカナ/英字の揺れ）。上記の和集合なら、正しく解決できた馬の不一致は **0 件**になる。

#### 1.6 スロット定義（§4.6・順序厳守）

```python
SIRE_PATHS = ["F","FF","FFF","FFFF","FFMF","FMF","FMFF","FMMF",
              "MF","MFF","MFFF","MFMF","MMF","MMFF","MMMF"]
MARE_PATHS = ["M","FM","MM","FFM","FMM","MFM","MMM","FFFM",
              "FFMM","FMFM","FMMM","MFFM","MFMM","MMFM","MMMM"]
```

`SIRE_PATHS` の並びは現行 `descendants[]` の並びと一致していなければならない（既存出力との突き合わせで検証できる）。`MARE_PATHS` は新規で、`M` で終わる長さ 1〜4 の path をこの順に固定する。**順序を間違えると世代がずれ、インブリード判定が静かに壊れる。**

path の走査は `father_pedigree_id` / `mother_pedigree_id` を順に辿るだけ。途中が `null` またはマスターに無ければその枠は `None`。

#### 1.7 代表 variant の決定（§4.5）

祖先セルへ載せる `nodeId` は「ゲーム内で実際に親として指定されている variant」ではなく、表示用の代表ノードである。次の順で選ぶ。

```text
1. variant_code == "00"
2. is_base_equivalent == true のうち variant_code 最小
3. 全 variant の variant_code 最小
4. node が 1 件も無ければ None（V10 を通っているので通常起きない）
```

実測（全 14780 pedigree）: rule1 が **14541**、rule2 が **169**、rule3 が **70**、失敗 0。

#### 1.8 親系統の父方向フォールバック（§4.7）

`child_sire_line` を持つ pedigree は 3337 件しかない。持たない pedigree は**父方向へ遡って**最初に見つかったものを使う。循環に備えて `seen` 集合で打ち切ること。

```python
def sire_line(self, pedigree_id):
    seen = set()
    cur = pedigree_id
    while cur and cur not in seen:
        seen.add(cur)
        p = self._pedigrees.get(cur)
        if p is None:
            return None
        if p.get("child_sire_line"):
            return p["child_sire_line"]
        cur = p["father_pedigree_id"]
    return None
```

#### 1.9 `build_pedigree_nodes()`

収録範囲は「血統表 62 枠に登場した pedigree」と「**その全 variant**」。一部 variant だけ載せると全兄妹判定と因子カウントが壊れる。

```jsonc
{
  "version": 2,
  "datasetVersion": "2026-09-01T052756Z+raw.f7018232c481",
  "pedigreeFields": ["name", "father", "mother", "kiseki", "sireLineBaseId"],
  "nodeFields": ["pedigreeId", "subname", "effects"],
  "pedigrees": {
    "0000008661": ["シンザン", "0000333190", "0000000858", 265, 13]
  },
  "nodes": {
    "0000008661-00": ["0000008661", null, []],
    "0000008661-10": ["0000008661", "神速", [2, 2, 2]]
  }
}
```

- `name` は `canonical_name`
- `father` / `mother` は `pedigree_id`（祖先ツリーの展開はこちらだけを使う）
- `kiseki` は `kiseki_group_id`。null なら奇跡グループ無し。**奇跡・至高の同一判定はこの値の一致で行う**（`pedigree_id` の一致では代用不可。別々の実馬をまとめているグループが 4 件ある）
- `sireLineBaseId` は §1.8 で解決した `child_sire_line.sire_line_base_id`。解決できなければ `0`
- `effects` は node 側の `pedigree_effect_ids`（variant ごとに違う）
- キー順は `sorted()` で決定的にすること。ビルドごとに順序が揺れると diff がノイズになる

実測サイズ: pedigree 8855 件 / node 10261 件、raw 約 1.0MB、gzip 約 232KB。

### 2. `scripts/build_dabimas_stream.py` の変更

#### 2.1 追加する CLI 引数

```text
--r2-endpoint <URL>               既定 $R2_ENDPOINT_URL
--r2-bucket <NAME>                既定 $R2_BUCKET（dabimas-data）
--pedigree-master-key <KEY>       既定 pedigree_master.json
--pedigree-game-nodes-key <KEY>   既定 pedigree_master.game.json
--pedigree-cache-dir <DIR>        既定 .cache/pedigree
--pedigree-dataset-version <VER>  期待する dataset_version
--pedigree-master-file <PATH>     R2 の代わりにローカル JSON を読む（オフライン用）
--pedigree-game-nodes-file <PATH> 同上
--pedigree-nodes-output <PATH>    pedigreeNodes.json の出力先
```

`--pedigree-master-file` / `--pedigree-game-nodes-file` は設計資料には無いが、CI とテストが認証情報なしで新経路を通せるようにするため**追加する**。両方指定されたときは R2 へ接続しない。

#### 2.2 分岐（退避経路の維持）

マスターが有効なのは次のいずれか。

- `--pedigree-master-file` と `--pedigree-game-nodes-file` の両方が指定された
- `--r2-endpoint` が指定された、または環境変数 `R2_ENDPOINT_URL` がある

**どちらでもないときは現行の挙動を完全に維持する。** `nodeId` / `pedigreeId` / `mares` は付けず、`pedigreeNodes.json` も書かない。既存の出力とバイト単位で一致すること。

#### 2.3 entry への付与

`all_row_to_dabifac_entry()` は現状シグネチャのまま残し、**マスター由来の付与は別関数**で行う（`attach_pedigree_ids(entry, source)` など）。既存のテストが `all_row_to_dabifac_entry()` を直接呼んでいるので、そこに必須引数を足さないこと。

付与するもの:

| 出力 | フィールド | 値 |
|---|---|---|
| full entry / summary | `nodeId` | 解決した node の `node_id`。未解決なら `null` |
| full entry / summary | `pedigreeId` | 同 node の `pedigree_id`。未解決なら `null` |
| detail `descendants[i]` | `nodeId` / `pedigreeId` | `sire_slots()[i]` の代表 node と その pedigree。空枠は `null` |
| detail | `mares` | `mare_slots()` の 15 要素。空枠は `null` |

- `nodeId` は**文字列**。数値化・整数化しない。
- `pedigreeId` は `nodeId` から切り出さず、レコードの値をそのまま入れる。`pedigree_id` にはハイフンを含むもの（`game:<uuid>` 形式）が 379 件ある。
- `descendants[i].name` などの既存フィールドは**上書きしない**。因子・親系統・子系統・レア度・天性は全書が正。マスターの値で置き換えないこと。
- **`json/dabimasFactor.json`（full 出力）には `mares` を入れない。** フォールバック経路のサイズを増やさない。`nodeId` / `pedigreeId` は入れてよい。

`mares` を `nodeId` だけの配列にする理由: 牝馬は血統表に表示行を持たないので名前が要らない。名前を併記すると gzip 219KB、nodeId のみなら gzip 約 66KB。

#### 2.4 `pedigreeNodes.json` の出力

`--pedigree-nodes-output` 指定時のみ書く。62 枠の走査で触れた `pedigree_id` を集め、`build_pedigree_nodes()` へ渡す。書式は既存の `write_summary()` と揃える（`ensure_ascii=False`、`separators=(",", ":")`、`newline="\n"`、末尾改行 1 つ）。

#### 2.5 追加する警告カウンタ（§5.4）

`CONVERSION_WARNING_COUNTS` と同じ流儀で集計し、`done:` 行に出す。`reset_conversion_warning_counts()` でリセットされる形を保つこと。

| キー | 意味 | 現行データでの期待値 | `--fail-on-error` の対象 |
|---|---|---:|---|
| `unresolved_node` | マスターに解決できなかった全書エントリ数 | **0** | はい |
| `ambiguous_node` | 候補複数のまま確定できなかった数 | **0** | はい |
| `ancestor_mismatch` | 男系 15 祖先の名前照合に失敗した延べ枠数 | **0** | はい |
| `sire_line_mismatch` | 祖先の親系統が全書と食い違った数 | **0** | **いいえ（WARN のみ）** |
| `mare_slot_missing` | 牝馬枠の欠損延べ数 | 847 前後（参考値） | いいえ |
| `representative_fallback_rule2` | 代表 variant が rule2 で決まった数 | 169 前後（参考値） | いいえ |
| `representative_fallback_rule3` | 同 rule3 | 70 前後（参考値） | いいえ |

`sire_line_mismatch` を失敗にしない理由: 出力に使うのは全書の値なので実害が無く、マスター側のデータ誤りを検出するための計測枠である。

**参考値の 3 つはログに出すだけで、テストで固定値を assert しないこと。** マスターの更新で普通に動く。0 を期待する 4 つだけが回帰の砦になる。

#### 2.6 期待値の出典についての注意

設計資料 §1.4 / §2.2 / §4.2 / §4.5 の数値には版ずれがある（§1.4 は 14772 pedigree / 16009 node、§2.1 は 14780 / 16187）。**本作業指示書の数値は 2026-09-01 時点の R2 配置版 `2026-09-01T052756Z+raw.f7018232c481`（pedigree 14780 / node 16187）で実測したもの**で、こちらを正とする。設計資料と食い違う場合は本書を優先すること。

### 3. ワークフロー

`.github/workflows/build-dabimas-stream.yml` に次を足す。

- `env:` へ `R2_ENDPOINT_URL` / `R2_BUCKET` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` を `${{ secrets.* }}` から渡す
- ビルドコマンドへ `--r2-endpoint "$R2_ENDPOINT_URL"` `--pedigree-nodes-output artifacts/pedigreeNodes.json` `--pedigree-dataset-version "${{ github.event.inputs.pedigree_dataset_version }}"` を追加
- `workflow_dispatch.inputs` に `pedigree_dataset_version`（既定は空文字＝検証スキップ）を追加

**secrets そのものの登録は行わない。** ワークフローが参照する形だけ作る。

## 制約

- `AGENTS.md` の Safety Rules に従うこと。
- **全書由来の `id` 体系（`derive_horse_id()` の URL 由来 id）を変えない。** 保存済み配合・作業枠・自家製馬の参照が全部切れる。
- **`node_id` で既存の `id` を置き換えない。** 用途が違う（`id` は保存互換、`node_id` は血統・variant 識別）。
- 既存のスクレイピング経路（`parse_stallion` / `parse_broodmare` / `collect_horse_urls` / `fill_pedigree_and_factors` / `HD_*` 定数 / ALL 行）は**退避経路としてそのまま残す**。挙動を変えない。
- 既存の公開関数のシグネチャを変えない（`entry_to_summary` / `write_summary` / `write_details` / `all_row_to_dabifac_entry` / `normalize_search_text` / `build_search_text` / `to_hiragana_ruby` / `derive_horse_id`）。引数を足すならキーワード引数 + 既定値で、既存呼び出しがそのまま通ること。
- `scripts/data/sire_lines.csv` は新経路では不要だが**削除しない**（既存経路が使う）。
- 新規ファイルは UTF-8（BOM なし）・改行 LF。docstring とコメントは既存 `scripts/*.py` と同じく日本語。
- `json/pedigree_master.json` をリポジトリに置かない。`.cache/pedigree/` は `.gitignore` へ追加する。

## スコープ外（やらないこと）

- `scripts/zensho_list_source.py` と一覧ページ 2 枚への切り替え（§背景の理由により段階1b へ分離）
- `vue/` 配下のフロントエンド実装（段階2 以降）
- `service-worker.js` の `CACHE_NAME` 更新と `urlsToCache` への追加（段階2）
- `index.html` の変更
- インブリード判定・配合理論・因子カウントのロジック変更（段階3〜7）
- GitHub secrets の実登録
- `json/` 配下の成果物のコミット（生成コマンドが通ることまでが範囲）
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

段階0 のフィクスチャ (`tests/fixtures/pedigree-master/`) をそのまま使う。実データ（R2）での確認は認証情報が要るため依頼者側で行う。

1. `python -m pytest tests/ -q` が全件成功し、**既存テストの結果が 1 件も変わらない**。
2. `python -m pytest tests/test_pedigree_master_source.py -q` で下表 T-S01〜T-S12（T-S07b 含む） が成功する。
3. フィクスチャを使ったオフラインビルドが成功し、`json/pedigreeNodes.json` 相当のファイルが §1.9 の形（`version: 2` / `pedigreeFields` / `nodeFields` / `pedigrees` / `nodes`）で出力される。
4. `--pedigree-master-file` も `--r2-endpoint` も指定しない実行では、出力 JSON に `nodeId` / `pedigreeId` / `mares` が**現れない**。既存の `tests/fixtures/split-baseline/` 相当の出力形状が変わらないこと。
5. 新経路の出力と現行 `json/` の出力を突き合わせ、**差分が `nodeId` / `pedigreeId` / `mares` の追加だけ**であること（`name` / `factors` / `parentLine` / `son` / `rare` / `searchText` / `displayName` / `id` / `detailChunk` が 1 件も変わらない）。確認用スクリプトを `tests/` 配下に置くか、テストとして書くこと。
6. `grep -n 'split("-")\[0\]' scripts/pedigree_master_source.py scripts/build_dabimas_stream.py` が 0 件。
7. `SIRE_PATHS` / `MARE_PATHS` が §1.6 の並びとリテラルで一致する（テストで固定）。
8. `.gitignore` に `.cache/` が入っている。

### テストケース

`tests/test_pedigree_master_source.py`（フィクスチャの 5 pedigree / 7 node に対して）:

| ID | 内容 | 期待 |
|---|---|---|
| T-S01 | `resolve("シンザン", "")` | `0000008661-00`、stage は `name+subname` |
| T-S02 | `resolve("シンザン", "神速")` | `0000008661-10` |
| T-S03 | `resolve("ゲームオリジナル", "")` | `game:0000-uuid-0001-00`、`pedigree_id` が `game:0000-uuid-0001`（**ハイフン切り出し実装なら落ちる**） |
| T-S04 | `resolve("Game Original", "")` | `aliases` 段で `game:0000-uuid-0001-00` |
| T-S05 | `resolve("アルサイド", "1958")` | `0000333914-01` |
| T-S06 | `resolve("アルサイド", "1960")`（マスターに無い年号） | §1.3 のフォールバックで `is_base_equivalent == true` の `0000333914-01` |
| T-S07 | `resolve("シンザン", "9999")`（マスターに無い年号。シンザンは base と named を持つ） | `0000008661-00`（base）へ落ちること。**`0000008661-10`（named 神速）へは落ちない** |
| T-S07b | `resolve("シンザン", "神煌")`（マスターに無い named subName） | 年号ではないのでフォールバックせず `node_id is None` |
| T-S08 | `resolve("存在しない馬", "")` | `node_id is None`、stage は unresolved |
| T-S09 | `representative_node_id("0000333914")` | rule2 で `0000333914-01`（`00` が無い） |
| T-S10 | `sire_slots("0000008661")` | `[0]` が `0000333190-00`（F）、`[8]` が `0000333190-00`（MF、母ハヤノボリの父）、届かない枠は `None` |
| T-S11 | `sire_line("0000000858")` | `child_sire_line` を持たないので父ヒンドスタン経由で `ボワルセル系` が返る |
| T-S12 | `build_pedigree_nodes({"0000008661"})` | `nodes` にシンザンの **2 variant が両方**入り、`pedigrees["0000008661"][3] == 265`（kiseki）・`[4] == 13`（sireLineBaseId） |

`tests/test_build_dabimas_stream.py` への追加:

| ID | 内容 | 期待 |
|---|---|---|
| T-B01 | マスター無しで既存の ALL 行 → entry 変換 | 現行と完全一致。`nodeId` キーが無い |
| T-B02 | マスター有りで同じ ALL 行 | `nodeId` / `pedigreeId` が付き、他フィールドは T-B01 と一致 |
| T-B03 | summary への反映 | `nodeId` / `pedigreeId` が入り、既存 17 フィールドが変わらない |
| T-B04 | detail への反映 | `mares` が 15 要素、`descendants[i]` に `nodeId` / `pedigreeId` |
| T-B05 | 解決できない馬 | `nodeId is None` / `mares is None`、`unresolved_node` が 1 増える |

## 検証コマンド

```bash
python -m pytest tests/ -q
python -m pytest tests/test_pedigree_master_source.py -q

# 退避経路（マスター無し）: 出力にフィールドが増えないこと
python scripts/build_dabimas_stream.py --limit 5 \
  --output /tmp/legacy.json --summary-output /tmp/legacy.summary.json \
  --details-output-dir /tmp/legacy-details

# 新経路（フィクスチャ）: nodeId / mares / pedigreeNodes.json が出ること
python scripts/build_dabimas_stream.py --limit 5 \
  --pedigree-master-file tests/fixtures/pedigree-master/pedigree_master.json \
  --pedigree-game-nodes-file tests/fixtures/pedigree-master/pedigree_master.game.json \
  --output /tmp/new.json --summary-output /tmp/new.summary.json \
  --details-output-dir /tmp/new-details \
  --pedigree-nodes-output /tmp/pedigreeNodes.json

grep -n 'split("-")\[0\]' scripts/pedigree_master_source.py scripts/build_dabimas_stream.py
git status --short
```

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。

### 変更ファイル一覧

- `scripts/pedigree_master_source.py` — 索引、8段階の名前解決、年号フォールバック、祖先照合、代表variant、父母スロット、系統フォールバック、`pedigreeNodes.json` 辞書生成を追加。
- `scripts/build_dabimas_stream.py` — 血統マスターCLI、entry/summary/detailへのID付与、mares、警告集計、legacy分岐、pedigreeNodes出力を追加。
- `tests/test_pedigree_master_source.py` — T-S01〜T-S12（T-S07b含む）を追加。
- `tests/test_build_dabimas_stream.py` — T-B01〜T-B05、legacyバイト互換、新旧出力差分、オフラインCLI統合テストを追加。
- `.github/workflows/build-dabimas-stream.yml` — R2環境変数、dataset_version入力、新CLI引数とpedigreeNodes成果物を追加。
- `.gitignore` — `.cache/` を追加。
- `docs/codex-work-orders/2026-09-01-pedigree-master-r2-fetch.md` — 前回空欄だった段階0完了報告を記入。
- `docs/codex-work-orders/2026-09-01-pedigree-master-python.md` — 本完了報告を記入。

### 設計判断

- `build_dabimas_stream.py` は通常CLI実行と既存importlibテストの両方から兄弟モジュールを読めるよう、遅延ロード helper を用意した。
- representative rule2/rule3 の参考値は延べスロット数ではなくマスター全体の一意 pedigree 分布として、ビルド開始時に1回だけ集計する。
- full出力では `mares` だけを直前に除外し、entry上の `nodeId` / `pedigreeId` と descendants の追加IDは維持する。これによりdetail用entryを再構築せず、既存full出力の制約を守る。
- 62枠は配合する2頭それぞれの「本人＋父系15＋牝系15」と解釈し、各entryで root + 30 ancestor の pedigree を収集する。

### 実行した検証と結果

- 基準1: `python -m pytest tests/ -q` — **52 passed**。既存テストを含め全件成功。
- 基準2: `python -m pytest tests/test_pedigree_master_source.py -q` — **13 passed**。
- 基準3: fixtureを使うオフライン統合テストで `version: 2`、field定義、pedigree/node辞書を確認。実CLIも終了コード0で所定形状を出力。
- 基準4: マスターなし実CLI（5件）— 終了コード0。`nodeId` / `pedigreeId` / `mares` が無いことを確認。
- 基準5: 同一fixture行の新旧出力を比較し、legacy fullのバイト互換と、差分が `nodeId` / `pedigreeId` / `mares`、descendant IDの追加だけであることを確認。
- 基準6: `scripts/pedigree_master_source.py` / `scripts/build_dabimas_stream.py` の禁止文字列 `split("-")[0]` — 0件。
- 基準7: `SIRE_PATHS` / `MARE_PATHS` のリテラル順をテストで固定し成功。
- 基準8: `.gitignore` の `.cache/` を確認。
- 新規Python/テストは UTF-8 BOMなし・LF。`git diff --check` 成功。
- Standards / Spec の並列レビューを実施し、曖昧件数・代表variant重複集計・legacyバイト検証の指摘を修正した。

### 残課題・気づき

実 R2 全件データでの段階1ビルド（`unresolved_node=0` / `ambiguous_node=0` / `ancestor_mismatch=0`）は認証情報と全件スクレイピング時間が必要なため未実施。依頼者側で確認する。

---

## 検収記録（2026-09-01・Claude Code）

### 判定

**合格。修正なし。** 受け入れ基準 1〜8 をすべて再実行し、加えて完了報告で「未実施」とされていた実 R2 データでの検証を検収側で実施した。結果はすべて期待値どおりだった。

完了報告は今回きちんと記入されており、設計判断 4 件もすべて妥当だった。

### 受け入れ基準の検証結果

| # | 内容 | 結果 |
|---|---|---|
| 1 | `pytest tests/ -q` | 合格（52 passed）。内訳 build 24 / fetch 15 / source 13。既存 18 件は末尾追記のみで無変更 |
| 2 | `pytest tests/test_pedigree_master_source.py -q` | 合格（13 passed = T-S01〜T-S12 + T-S07b） |
| 3 | `pedigreeNodes.json` の形状 | 合格。`version: 2` / `datasetVersion` / 5+3 フィールド定義 / `pedigrees`・`nodes` のキーが `sorted()` 順 |
| 4 | マスターなし実行 | 合格。full / summary / details のどこにも `nodeId` `pedigreeId` `mares` が現れない |
| 5 | 新旧出力の差分 | 合格。同一 5 頭を legacy と新経路で生成し、3 出力すべてが**追加 3 キーを除去すると完全一致**した |
| 6 | `split("-")[0]` の不在 | 合格（両ファイル 0 件） |
| 7 | `SIRE_PATHS` / `MARE_PATHS` のリテラル固定 | 合格（`test_sire_slots_follow_fixed_paths` が両方の全要素を assert） |
| 8 | `.gitignore` の `.cache/` | 合格 |

参考値（169 / 70 / 847 / 14541）がテストへ固定値として書かれていないことも確認した。指示書 §2.5 の意図どおり。

`--fail-on-error` の対象が `unresolved_node` / `ambiguous_node` / `ancestor_mismatch` の 3 つだけで、`sire_line_mismatch` / `mare_slot_missing` / `representative_fallback_*` が含まれていないことも確認した（§2.5 のとおり）。

### 実 R2 データでの全件検証（完了報告で未実施だった項目）

全書スクレイピングを回さずに済むよう、**実 R2 マスター**（`2026-09-01T052756Z+raw.f7018232c481` / pedigree 14780 / node 16187）と**リポジトリ内の現行 `json/dabimasFactor.summary.json` + `dabimasFactor-details/`（2873 頭）**を入力に、出荷されたコードの `PedigreeMasterSource` をそのまま呼んで集計した。

| 指標 | 期待値 | 実測 |
|---|---|---|
| `unresolved_node` | 0 | **0** |
| `ambiguous_node` | 0 | **0** |
| `ancestor_mismatch` | 0 | **0**（延べ 43095 枠） |
| `sire_line_mismatch` | 0 | **0** |
| `mare_slot_missing` | 847 前後 | 847 / 43095 |
| 代表 variant rule1/2/3 | 14541 / 169 / 70 | **14541 / 169 / 70** |

名前解決の段別内訳は次のとおりで、**設計資料 §2.2 の実測表と 1 件も違わなかった**。

```text
name+subname   2587
source_names    277
year-fallback     7
aliases           2
                ----
                2873
```

`pedigreeNodes.json` は pedigree 8854 件 / node 10260 件、raw 1,018,632 bytes・gzip 237,370 bytes。**収録された全 pedigree について variant の欠落が 0 件**であることも確認した（一部だけ載ると全兄妹判定と因子カウントが壊れる箇所）。

### 牝馬15枠の順序を独立に検算

`MARE_PATHS` の順序は実装とテストが同じ定数を見るため自己参照になる。そこで実 R2 マスターの `father_pedigree_id` / `mother_pedigree_id` だけを手で辿った値と、生成された `mares[]` を突き合わせた。

```text
アイアムアカペラオー（root pedigree_id = game:eb5d69e6-...-b19c848a8388）
  M     slot 0  手計算 0000382776 ワンスウェド     出力 0000382776  一致
  FM    slot 1  手計算 0000404690 カラースピン     出力 0000404690  一致
  MM    slot 2  手計算 0000391074 Noura           出力 0000391074  一致
  FFM   slot 3  手計算 0000392264 Fairy Bridge    出力 0000392264  一致
  MMMM  slot14  手計算 0000386295 Blue Canoe      出力 0000386295  一致
```

男系側は `ancestor_mismatch` が延べ 43095 枠で 0 なので、`F`/`M` の歩き方と `SIRE_PATHS` の並びは全書実データで裏が取れている。

なおこの検算対象のルートは `game:` 形式のハイフン入り `pedigree_id` で、そこから 30 枠すべてが正しく展開された。`split("-")` の罠を踏んでいないことの実データでの証明になっている。

### 受け入れた設計判断

完了報告の 4 件はいずれも妥当。特に次の 2 点を承認する。

- **full 出力から `mares` だけを除外し、`nodeId` / `pedigreeId` と descendants の追加 ID は残す。** 指示書 §2.3 の意図どおりで、detail 用に entry を作り直さない実装になっている。実測でも full には `mares` が無く `nodeId` があることを確認した。
- **代表 variant の rule2 / rule3 参考値を、延べスロット数ではなくマスター全体の一意 pedigree 分布として起動時に 1 回だけ集計する。** 指示書の実測値（169 / 70）と同じ母集団になり、`--limit` 実行でも値がぶれない。

### 残った軽微な指摘（差し戻さない）

- **`scripts/build_dabimas_stream.py` の改行コードが混在した。** コミット前は全 1070 行が CRLF、コミット後は 1264 行中 1028 行が CRLF で、追記・編集された行だけ LF になっている。そのため差分に「同じ内容の行が削除＋追加として出る」ノイズが載った（`import argparse` など）。動作には影響しない。`.gitattributes` がこのファイルにだけ `whitespace=...,cr-at-eol` を付けており改行の扱いに意図がありそうなので、**LF 統一と CRLF 統一のどちらへ寄せるかは依頼者の判断**とし、検収では変更しなかった。
- **status を Codex 自身が「完了」にしていた。** 完了への遷移は検収側の操作なので、実装完了時は「依頼中」のままにすること。
- `.gitignore` に `tests` が残ったまま、`tests/test_*.py` が追跡対象になった（`tests/fixtures/split-baseline/` は以前から同じ状態なので新しい問題ではない）。ただし今回テストがコミットされたことで `python-ci.yml` が初めて実際に pytest を回すようになる。今後 `tests/` に足したファイルが `git add` で拾われない点は、いずれ `.gitignore` 側を整理したほうがよい。
- `attach_pedigree_ids()` は候補が複数で確定できなかった馬を `unresolved_node` と `ambiguous_node` の両方で数える。二重計上ではあるが、`--fail-on-error` はどちらでも失敗するので実害はない。仕様として認識しておけばよい。

### 次段階への申し送り

- 実 R2 を入力にしたフルビルド（全書 2980 ページのスクレイピングを含む）は未実施。段階2 の前に GitHub Actions で 1 回通し、`json/` 成果物を実際に生成することを勧める。そのとき GitHub secrets（`R2_ENDPOINT_URL` / `R2_BUCKET` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`）の登録が必要（ワークフロー側の参照は本作業で入っている）。
- `json/pedigreeNodes.json` は gzip 約 232KB。設計資料 §9.2 の見積り 188KB より大きいので、段階2 で初回ロード時間を測るときはこの実測値を使うこと。

### 検収後の追加修正（2026-09-01・Claude Code）: 週次バッチの取りこぼし

**指示書の漏れ。** §「変更対象ファイル」で `.github/workflows/build-dabimas-stream.yml` しか挙げていなかったが、**`json/` をリポジトリへ実際にコミットしているのは `.github/workflows/x_post.yml`（Weekly Dabimas Update）のほう**だった。`build-dabimas-stream.yml` は `artifacts/` へ upload するだけで `json/` を書かない。

`x_post.yml` の build ステップには `--r2-endpoint` も `--pedigree-nodes-output` も無かった。段階1 の実装は「マスター指定が無ければ現行どおり」なので、この経路は**正常終了しつつ `nodeId` / `pedigreeId` / `mares` の無い json を生成して `main` へ push する**。エラーは出ない。本ブランチを `main` へマージすると、次の週次実行（毎週金曜 18:30 JST）で段階1 の追加フィールドが静かに消え、段階2 以降のフロントは名前ベース判定へ縮退したまま気づけない状態になっていた。

修正内容:

1. `weekly-pipeline` ジョブへ `env:` を追加し、R2 の secrets 4 件を渡す。
2. build ステップへ `--pedigree-nodes-output json/pedigreeNodes.json` と `--r2-endpoint "$R2_ENDPOINT_URL"` を追加。
3. commit ステップの `git add` へ `json/pedigreeNodes.json` を追加。

`--pedigree-dataset-version` は**あえて指定しない**。週次の自動実行なので版を固定すると、パイプラインが R2 を更新するたびにバッチが落ちる。2 ファイル間の `dataset_version` / `source.sha256` 一致検査（V03 / V04）は指定の有無に関わらず常に効いている。

X 投稿への影響なし。`Build Dabimas Stream` は `workflow_dispatch` のみで `workflow_run` の連鎖が無く、X 投稿は `x_post.yml` の手動実行と cron だけで起きる。

**申し送り**: この経路は `--fail-on-error` 付きなので、`unresolved_node` / `ambiguous_node` / `ancestor_mismatch` が 1 件でも出ると週次バッチ全体が失敗し、json 更新も X 投稿も止まる。設計資料 §10.3 は `ancestor_mismatch` に閾値（例: 10 件）を設ける想定なので、ゲーム更新でマスターが古くなったときの運用方針は別途決めること。今回は失敗が静かでない（X 投稿が止まるので気づく）ため、現状のゼロ許容のままとした。
