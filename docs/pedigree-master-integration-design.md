# 血統マスタ統合 設計書

- 文書版: v1.0
- 作成日: 2026-08-19
- 対象ブランチ: `feature/dabifaku-unified`
- 目的: ゲーム内血統マスタ (`pedigree_master.json`) を取り込み、インブリード判定・
  配合理論判定・インブリード因子数カウントを `node_id` ベースへ移行し、
  血統表に **5代目までの牝馬** を含める
- 関連仕様: `dabimas_pedigree_editor_algorithm_spec.md`（以下「アルゴリズム仕様書」）

---

## 1. ゴールと非ゴール

### 1.1 ゴール

1. 血統構造（父母のつながり・全兄妹・奇跡グループ）を `pedigree_master.json` から得る
2. 因子・親系統・子系統・天性・レア度は **ダビマス全書を正**とし続ける
3. **5代目までの牝馬を保持・保存し、クロス判定の対象に含める**
4. 判定 3 機能をアルゴリズム仕様書に沿って `node_id` ベースへ移行する
5. 既存の保存済みデータ（作業枠・保存済み配合・自家製馬）を壊さない

### 1.2 非ゴール

- ゲーム UI 文言の完全一致（アルゴリズム仕様書 Phase 3）。`breeding_theories.priority` と
  Word マスタが未入手のため対象外
- UserPedigree 対応（同 Phase 4）
- 利根川系など特殊配合理論

### 1.3 設計の中心的な判断

1. **`nodeId` は「永続化しない派生値」として扱う**（§8.2）。これにより既存保存データの
   一括移行が不要になる
2. **牝馬15枠は `nodeId` の配列としてルートセルに載せる**（§6.4）。表示行を増やさないため
   既存の32行モデル・保存形式・共有形式をそのまま使える

---

## 2. 前提となる実測結果

設計の前提として実データで検証済みの事実。再検証時の基準値でもある。

### 2.1 マスタ突合

| 検証項目 | 結果 |
|---|---|
| 全書 2873 頭の master ノード解決 | 2872 頭が一意に確定（未解決 0） |
| 本馬の親系統 + 子系統の一致 | 2872 / 2872 |
| 祖先（男系15枠）の因子の一致 | 43080 / 43080 |
| 祖先（男系15枠）の親系統略号の一致 | 43080 / 43080 |
| 祖先（男系15枠）の子系統 ID の一致 | 43080 / 43080 |
| 種牡馬一覧ページから取得したレア度 | 2375 / 2375 一致（不一致 0） |
| 牝馬一覧ページの id と現行 summary の id | 498 / 499 一致、現行にあって一覧に無い id は 0 |

確定不能の 1 件はホクトボーイ。`pedigree_id` と父母が同一の重複ノードのため、
どちらを採っても結果は変わらない。

### 2.2 牝馬15枠

| 検証項目 | 結果 |
|---|---|
| 牝馬15枠が全部埋まる馬 | 2429 / 2873（84.5%）。残りも 8〜14 枠 |
| 牝馬枠の延べ出現 | 42247 |
| うち父母 ID を両方持つ（＝全兄妹判定可能） | 39457 = **93.4%** |
| ユニーク牝馬ノード | 5625 |

### 2.3 牝馬を入れたときのクロス増分（サンプル 4000 配合）

| | クロス群の平均数 |
|---|---:|
| 男系16枠のみ（現行相当） | 1.06 |
| 牝馬15枠を追加 | **1.47** |

増分の分布: 増えない 3091 件（77%）、+1 が 582 件、+2 以上が 327 件。
**約 23% の配合で新たなクロスが検出される。** 目に見える挙動変更なので、
リリースは単独で行い変化を確認する（§13）。

---

## 3. データソースと配置

### 3.1 配置

```
json/pedigree_master.json      ビルド専用入力（手動更新・約 5.9MB）
json/pedigreeNodes.json        実行時に読む血統ノード表（新規・約 503KB / gzip 188KB）
json/dabimasFactor.summary.json          既存（nodeId 追加）
json/dabimasFactor-details/*.json        既存（nodeId・mares 追加）
json/dabimasFactor.json                  既存フォールバック（同上）
json/brosData.json                       既存（§6.6 で役割縮小）
```

### 3.2 `json/pedigree_master.json` の扱い（重要）

要望どおり `json/` 配下に置くが、**これはビルド時にしか読まない**。

- フロントエンドから `fetch` しない
- **`service-worker.js` の `urlsToCache` に絶対に追加しない**。追加すると全ユーザーが
  初回訪問で 5.9MB を余分にダウンロードする
- 手動更新のたびに Git 履歴へ約 5.9MB のブロブが積まれる。更新頻度が上がるようなら
  `json/` の外へ移すか Git LFS を検討する（§14 の未決事項）

### 3.3 全書（スクレイピング）から取るもの

因子・親系統・子系統・天性・レア度は全書を正とする。ゲーム更新で因子が変わっても
`pedigree_master.json` を上げ直さずに追従できる。

取得は**一覧ページ 2 枚のみ**で完結し、詳細ページ 2980 件のフェッチは不要になる。

```
https://dabimas.jp/kouryaku/stallions/name.html    約 13.9MB（レア度・因子・系統・URL）
https://dabimas.jp/kouryaku/broodmares/name.html   約 1.4MB（URL・馬名）
```

---

## 4. 名前解決とスロット定義

### 4.1 2 つの名前フィールドの使い分け（取り違え厳禁）

| フィールド | 中身 | 用途 |
|---|---|---|
| `name` | 全書の表示名（年号・非凡込み、繁殖牝馬の表示名も） | **ルート馬の引き当て** |
| `pedigree_name` | 血統レコード名 | **祖先の照合・表示** |

祖先照合に `name` を使うと 2873 頭中 713 頭しか一致しない（`name` に年号が入った
ノードが 454 件あり、血統表の祖先欄では素の名前で出るため）。

### 4.2 ルート馬の解決手順

```python
def resolve_root_node(zensho_name, zensho_sub_name, index):
    # 非凡（漢字2字）は別ノードなのでキーに残す。年号（4桁 / 20XX）はそのまま連結する。
    decorated = f"{zensho_name}-{zensho_sub_name}-" if is_hihon(zensho_sub_name) \
                else zensho_name + (zensho_sub_name or "")
    for key in (decorated, zensho_name):
        for idx in (index.by_name, index.by_pedigree_name):
            hits = idx.get(normalize(key))
            if hits:
                return disambiguate(hits)
    return None
```

`normalize` は NFKC → trim → lower → 空白除去。既存の `normalize_search_text` と同じ規則。

### 4.3 曖昧解消と自己検証

候補が複数のときも 1 件のときも、**男系15祖先の `pedigree_name` を全書の
`descendants[].name` と全件照合**して確定させる。

- 15/15 一致した候補が 1 件だけ → 確定
- 15/15 一致が 0 件 → **結合を破棄**し `nodeId = null` で出力（§6.7 のフォールバックへ）
- 15/15 一致が 2 件以上 → 重複ノード。`node_id` が小さい方を採用し WARN

この照合は master が古くなったときの検出器も兼ねる（§10.3）。

### 4.4 スロット定義

血統表 1 側 = ルート 1 + 男系15 + **牝馬15** = 31 ノード。両側で 62 ノード。

**男系15枠**（現行 `descendants[]` の並び。表示順で確定済み）

```
descendants index : 0   1    2    3     4     5    6     7     8   9    10    11    12   13    14
表示スロット      : 1   2    4    8     9     5    10    11    3   6    12    13    7    14    15
path              : F   FF   FFF  FFFF  FFMF  FMF  FMFF  FMMF  MF  MFF  MFFF  MFMF  MMF  MMFF  MMMF
```

**牝馬15枠**（新規。長さ 1〜4 で `M` で終わる path をこの順で固定）

```
mares index : 0   1    2    3     4     5     6     7     8      9      10     11     12     13     14
path        : M   FM   MM   FFM   FMM   MFM   MMM   FFFM  FFMM   FMFM   FMMM   MFFM   MFMM   MMFM   MMMM
```

**世代**（生まれる子を 0 代とする。ルート＝1 代）

```
generation = 1 + path.length
```

牝馬枠も同じ式。`MMMM` は 5 代目。ユーザー要望の
「繁殖牝馬側の5代目牝馬がサドラーズギャル×キングマンボなら、
種牡馬側3代目のエルコンドルパサーとクロス」はこの枠で成立する
（そのノードの `father_node_id`/`mother_node_id` がエルコンドルパサーと一致 → 全兄妹）。
**6代目を展開する必要はない**（アルゴリズム仕様書 §9）。

### 4.5 親系統のフォールバック

対象ノードに `child_sire_line` が無い場合、**父方向へ遡って解決する**
（アルゴリズム仕様書 §24）。これを入れないと親系統が 2733 件ズレる。

```python
def resolve_sire_line(node, nodes):
    seen = set()
    cur = node
    while cur and cur["node_id"] not in seen:
        seen.add(cur["node_id"])
        if cur.get("child_sire_line"):
            return cur
        cur = nodes.get(cur.get("father_node_id"))
    return None
```

---

## 5. Python 側の設計

### 5.1 ファイル構成

```
scripts/
  build_dabimas_stream.py        既存。--pedigree-master 指定時に新経路へ分岐
  pedigree_master_source.py      新規。master 読み込み・名前解決・血統展開（男系+牝馬）
  zensho_list_source.py          新規。一覧ページ2枚 → 因子/系統/レア度/天性/URL
```

既存のスクレイピング経路（`parse_stallion` / `parse_broodmare` / `collect_horse_urls` /
`fill_pedigree_and_factors` / `HD_*` 列定数 / ALL 行）は**退避経路としてそのまま残す**。
新経路はこれらを一切通らない。

`entry_to_summary` / `write_summary` / `write_details` / `normalize_search_text` /
`build_search_text` / `to_hiragana_ruby` / `derive_horse_id` は共通のまま流用する。

`scripts/data/sire_lines.csv` への依存は新経路では不要（系統名と ID が master にある）。
既存経路が使うため削除はしない。

### 5.2 id 体系は変更しない（ハード制約）

**`derive_horse_id(sex, url)` の URL 由来 id を維持する。** 一覧ページの `<a href>` から
現行と同一の URL 数値が取れることを確認済み（種牡馬 2375/2375、牝馬 498/499 一致）。

id が変わると保存済み配合・作業枠・自家製馬の参照がすべて切れる。**この制約が
§9 の「一括移行不要」の土台**なので、実装時に崩さないこと。

### 5.3 出力スキーマ

**summary**（1 フィールド追加）

```jsonc
{
  "id": "s7985491231",      // 変更なし（URL 由来）
  "nodeId": 267812,         // 追加。解決できなければ null
  "detailChunk": 0, "name": "...", "ruby": "...", "subName": "...",
  "nature": "...", "sex": "0", "rare": 4,
  "parentLine": "Ne", "parentLineId": 5, "son": "...", "sonId": 22,
  "factors": ["", "", ""], "displayName": "...", "searchText": "..."
}
```

**details**（`nodeId` と `mares` を追加）

```jsonc
{
  "id": "s7985491231",
  "descendants": [
    { "name": "...", "nodeId": 135523, "parentLine": "Ns", "parentLineId": 3,
      "son": "...", "sonId": 5, "factors": ["", "", ""] }
  ],
  "mares": [4455790, 3028276, null, ...]   // 15要素。§4.4 の順。欠損は null
}
```

`mares` は **`nodeId` の配列のみ**で名前を持たない。理由:

- 牝馬は血統表に表示されないため表示名が不要
- 名前が要る場面（デバッグ・将来の表示）は `pedigreeNodes.json` から引ける
- サイズ差が大きい（実測: nodeId のみ 388KB / gzip **85KB**、name 併記 1.07MB / gzip 219KB）

**pedigreeNodes.json**（新規）

血統表 62 枠に登場しうる全ノード（実測 10060 件、牝馬 5625 件を含む）。

```jsonc
{
  "version": 1,
  "fields": ["name", "father", "mother", "kiseki", "sireLineBaseId", "effects"],
  "nodes": {
    "267812": ["シンボリクリスエス", 135523, 4455790, 147, 3, [2]],
    "135523": ["Roberto", 722524, 6927029, null, 2, []]
  }
}
```

- `name` は `pedigree_name`（血統レコード名）。§4.1 の使い分けに従う
- 配列形式にするのはサイズのため（キー名の反復を避ける）
- 実測 503KB / gzip 188KB

### 5.4 出力される警告と検収基準

ビルドは以下を集計し、`--fail-on-error` 時は終了コード 1 とする。

- `unresolved_node`: master に解決できなかった全書エントリ数（期待値 0〜数件）
- `ancestor_mismatch`: 男系15祖先照合に失敗した数（**期待値 0**。1 件でも出たら master が古い）
- `ambiguous_node`: 候補複数で確定できなかった数
- `missing_rare`: レア度が取れなかった種牡馬数（期待値 13 前後 = 全書未掲載の新規馬）
- `mare_slot_missing`: 牝馬枠の欠損延べ数（期待値 2000 前後。§2.2 の 15.5% 相当）

検収は「新経路の出力と現行 JSON を `nodeId` / `mares` 追加分以外で diff してゼロ」を
合格条件とする。

### 5.5 CLI

```
python scripts/build_dabimas_stream.py \
  --pedigree-master json/pedigree_master.json \
  --summary-output json/dabimasFactor.summary.json \
  --details-output-dir json/dabimasFactor-details \
  --pedigree-nodes-output json/pedigreeNodes.json \
  --output json/dabimasFactor.json \
  --fail-on-error
```

`--pedigree-master` 未指定なら現行のスクレイピング経路で動く（退避）。

---

## 6. フロントエンド側の設計

### 6.1 `pedigreeNodes.json` の読み込み

`vue/app/methods/horse-loading.js` の `dbinitializer()` で読み込む。
`brosData.json` と違い **`c4()`（復元処理）より前に解決している必要がある**ため、
`readyPromise` と同様に await 対象へ含める。

```js
const nodeTablePromise = fetch("./json/pedigreeNodes.json")
  .then((r) => r.json())
  .then((json) => { window.Dabimas.pedigreeNodes = buildNodeTable(json); })
  .catch(() => { window.Dabimas.pedigreeNodes = null; });   // 失敗時は名前ベースへ縮退
```

`buildNodeTable()` が提供するもの:

- `get(nodeId)` → `{ name, father, mother, kiseki, sireLineBaseId, effects }`
- `findByName(name)` → `nodeId[]`（自家製馬の祖先解決用。同名は配列で返す）

**取得失敗しても起動を止めない。** `null` のときは全機能が現行の名前ベース挙動に
縮退し、牝馬枠は判定に参加しない（§6.7）。

### 6.2 `normalizeHorseSummary` への追加（見落とし注意）

`vue/app/methods/horse-loading.js:81` の `normalizeHorseSummary()` は
**ホワイトリスト方式**で、列挙されていないフィールドは捨てられる。
`nodeId` を明示的に追加しないと JSON に入れても消える。

```js
nodeId: typeof horse.nodeId === "number" ? horse.nodeId : null,
```

`createSavedHorseSummary()`（自家製馬）は `nodeId: null` を明示する。

### 6.3 男系 `nodeId` の伝播

`vue/logic/pedigree/pedigree-builder.js` の `setDataForPedigree()` は
`{ ...horseData.descendants[i] }` でスプレッドしているため、
**`descendants` に `nodeId` を足せば `selected[]` の各セルへ自動的に流れる**。
本馬（`retDataForPedigree[0]`）も `{ ...horseData }` なので同様。
このファイルの男系まわりに変更は不要。

### 6.4 牝馬15枠の保持方法

牝馬は血統表の表示行を持たない。**32行モデルを変えず、ルートセルに配列で載せる。**

```js
// setDataForPedigree() 内、retDataForPedigree[0] に 1 行追加
mareNodeIds: Array.isArray(horseData.mares) ? horseData.mares.slice() : null,
```

これで以下がすべて自動的に成立する。

| 恩恵 | 理由 |
|---|---|
| localStorage に保存される | `stripHorseForStorage()` は `descendants` / `searchText` / `displayName` しか落とさない |
| 作業枠 snapshot に入る | snapshot は localStorage 6 キーの写し |
| 保存済み配合に入る | `configData` も同じ 6 キーの写し |
| 共有した config に入る | 同上 |
| リセット・切替で消える | `selected` と一緒にクリアされる |

**表示行を増やす案は採らない。** 32行前提のコードが
`row-configs.js` / `pedigree-indexes.js` / `pedigree-row.js` / `factorCd[32][3]` /
`dispColor[32]` / `isInbreedButtonClicked[32]` / `inbreedList[32]` / `category[32]` /
`inputed[32]` に広く散っており、影響が判定 3 機能に留まらなくなるため。

### 6.5 判定への入力

3 機能すべてに `selected[32]` に加えて `nodeTable` を渡す。
純関数のシグネチャを変えるため、呼び出し元（`inbreed-ui.js` / `pedigree-cells.js`）も併せて直す。

### 6.6 `brosData.json` の役割縮小

master から全兄妹 4076 ペアが自動で取れるのに対し、`brosData.json` は 36 ペアしかない。
一方で **brosData にあって master に無いペアが 10 件**ある。

```
オペラハウス × カイフタラ / ウィルロック × ダイワメジャー / Bull Lea × Dogpatch
チョコドリーム × ホワイトクリーム / サマーバケーション × ジンセイマンザイ
アワテンボクロース × ブッシュドノエール / キャンディクッキー × マシュマロソン
フィナンシェハート × ラブリィカヌレ / ハツコイケール × フジキセキ / エンカオー × レイカオー
```

**対応**: 削除せず「master を補う手動オーバーライド」として残す。
判定は `master の父母一致` OR `brosData` とする。上記 10 件が実際にゲーム内で
全兄妹なのかは実機確認が必要（§14）。

### 6.7 縮退（フォールバック）の統一ルール

`nodeId` が付かないケースは常に存在する。

| ケース | 原因 |
|---|---|
| 自家製馬（☆保存馬）の本人 | ユーザー生成。master に存在しない（祖先と牝馬枠は §8.5 で埋まる） |
| エディット種牡馬 | 同上 |
| master 未収録の新規馬 | `pedigree_master.json` が手動更新のため |
| `pedigreeNodes.json` 取得失敗 | オフライン初回など |
| 牝馬枠の欠損 | master 側に母が居ない（延べ 15.5%） |

**ルール:**

1. 比較する 2 頭のどちらかに `nodeId` が無ければ、**そのペアだけ**現行の名前ベース判定を使う
2. **牝馬枠は `nodeId` が無ければ判定に参加しない**（名前を持たないため代替手段がない）
3. 全体を名前ベースへ落とすことはしない

---

## 7. 判定 3 機能の仕様変更

### 7.1 インブリード判定（`vue/logic/inbreed/inbreed-detector.js`）

#### 現行の課題

- 同一馬判定が `stallion.name === broodmare.name`（アルゴリズム仕様書 §40.1 が禁止）
- 全兄妹が `brosData.json` の 36 ペアのみ
- **牝馬が判定に参加していない**
- **血量計算と危険な配合が未実装**
- 祖先除外ロジック（`addExcludedAncestorPairs`）が仕様書 §11 と別物

#### 新ロジック

```
1. 出現リストを作る
     種牡馬側 = selected[0..15] + selected[0].mareNodeIds[0..14]
     繁殖牝馬側 = selected[16..31] + selected[16].mareNodeIds[0..14]
     各出現 = { nodeId, generation, side, index|marePath, branchParentNodeId }
       generation は男系: 既存 generationMap、牝馬: 1 + path.length（§4.4）
       index は表示行を持つ男系のみ。牝馬は null（色付けの対象外）

2. 交差ペア判定（種牡馬側 × 繁殖牝馬側のみ。片側内の重複は対象外）
     isExactSameNode  : a.nodeId === b.nodeId （両方非 null）
     isFullSibling    : 別ノード かつ father/mother の nodeId が両方一致
                        （nodeTable 経由。5代目も父母 ID を持つので判定可能）
                        OR brosData の手動オーバーライド（§6.6）

3. 同一家系枝の重複除外（仕様書 §11）
     各出現に branchParentNodeId（その祖先へ到達する直前のノード）を持たせ、
     branchA と branchB が完全同一 or 全兄妹ならそのペアを採用しない

4. クロスグループ化（同一馬 + 全兄妹を 1 グループへ）

5. 血量 = Σ BLOOD_VOLUME[generation]（全出現位置を加算）
     BLOOD_VOLUME = {1:50000, 2:25000, 3:12500, 4:6250, 5:3125}

6. 危険な配合 = いずれか 1 グループの血量 >= 50000
     異なるクロス馬の血量を合算しない（仕様書 §13）
```

血量は**整数（1/1000% 単位）で保持**する。浮動小数だと `3.125` の加算で
50.000 の境界判定がぶれる。表示時のみ 1000 で割る。

#### 戻り値の追加

既存キー（`count` / `sameNameGroups` / `siblingGroups` / `sameNameSpecialChecks` /
`sameNameSpecialChecksByIndex` / `inbreedColorIndexes`）は表示側が依存しているため**維持する**。

```js
{
  ...既存,
  crosses: [{ representativeNodeId, occurrences: [{ nodeId, side, generation, index }],
              bloodVolume, generations, hasMareOccurrence }],
  dangerous: false
}
```

#### `count` の意味に注意

現行 `count` は `inbreedColorIndexes.length`（＝色を付けるセル数）であり、
クロス本数ではない。`dispInbreed()` はこれが `> 0` かどうかだけを見ている。

**牝馬のみで成立したクロスは色を付けるセルが無い**ため、素直に実装すると
`count` が 0 のままになり因子カウントが走らない。

対応: `count` を `inbreedColorIndexes.length + (表示行を持たないクロス群の数)` とする。
色付けの挙動は変えない。

#### 牝馬クロスの表示 — 出さない（決定）

牝馬は表示行を持たないため、クロスが成立してもセルを着色できない。
**牝馬クロスは画面に出さない。** 判定と因子カウントの内部でのみ効かせる。

具体的には:

- `inbreedColorIndexes` に牝馬の出現を入れない（着色対象は男系セルのみ）
- `sameNameGroups` / `siblingGroups` にも牝馬ノードを入れない。
  これらは表示用の配列であり、`inbreed-ui.js` がハートボタンの非活性化
  （`isInbreedButtonClicked`）に使っているため、行を持たない要素を混ぜると壊れる
- 牝馬の出現は新設の `crosses[].occurrences` にのみ保持する。
  血量・危険な配合・因子カウント・至高判定はこちらを見る

この結果、**画面には出ないが因子数だけが増える**ケースが生じる
（牝馬の全兄妹が男系ノードを引き込んだとき）。仕様として許容する。

`count` の扱いは前項のとおり、表示行を持たないクロス群も数に含める。
含めないと因子カウントが走らない。

#### 例外ルールとの関係

`json/inbreed-exceptions.json` は馬名ベースのルール。**形式は変更しない。**
node ベース判定の後段に現行どおり適用する。将来 nodeId 指定に対応する場合は
`trigger.nodeId` を任意フィールドとして追加し、名前指定と併存させる。

#### UI 表示（コメント種別）

`getCommentedCross()` / `getCrossCommentType()`（仕様書 §14・§15）は
Word マスタ未入手のため**本設計では実装しない**。

### 7.2 配合理論判定（`vue/logic/theory/compatibility.js`）

#### 位置の取得は現行のまま

`vue/app/methods/pedigree-cells.js:39` の `dispTheory()` が組む S / D は
アルゴリズム仕様書 §25 と完全一致していることを確認済み。**変更しない。**
理論判定は男系の親系統だけを見るので、牝馬追加の影響を受けない。

```
S[1] = parentLines[9,11,13,15]  = FFMF, FMMF, MFMF, MMMF   （A系）
S[0] = parentLines[1,3,5,7]     = F, MF, FMF, MMF           （B系）
D[0] = parentLines[17,19,21,23] = 繁殖牝馬側の B系
```

#### 判定式の変更

| 理論 | 現行 | 新（仕様書） | 対応 |
|---|---|---|---|
| 面白 | `unique(S[0] ∪ D[0]) >= 7` | 同じ | 変更なし |
| 見事 | `common(S[1], D[0]) == 4` | `set(A) == set(B)` かつ非空 | **変更する** |
| よくでき | `common(S[1], D[0]) == 3` | `A\B >= 3 かつ B\A >= 3` | **保留（下記）** |
| 完璧 | 面白 かつ common==4 | 見事 かつ 面白 | 変更する |
| 超完璧 | 完璧 かつ unique==8 | 見事 かつ unique==8 | 変更する |
| 奇跡 | 完璧 かつ 母父名一致数==1 | 完璧 かつ 一致数==1（node/kiseki） | **照合方法を変更** |
| 至高 | `sameNameSpecialChecks.length > 0` | §7.2.3 | **変更する** |

#### 7.2.2 「よくできた配合」— 現行式で確定（アルゴリズム仕様書 §26 は採用しない）

2 つの式は**同時に成立しえない**。片方が真なら他方は必ず偽になる。

##### 定義

```
A = 種牡馬の A系4枠 = parentLines[9, 11, 13, 15]   （FFMF, FMMF, MFMF, MMMF）
B = 繁殖牝馬の B系4枠 = parentLines[17, 19, 21, 23] （F, MF, FMF, MMF）

A差 = A のうち B に無い要素数    damOnly / sireOnly の sireOnly
B差 = B のうち A に無い要素数    同 damOnly

現行式   : countCommonElements(A, B) == 3
仕様書式 : A差 >= 3 かつ B差 >= 3
```

##### 恒等式（4枠×4枠の全 390625 通りで検証済み）

```
countCommonElements(A, B) == 4 - max(A差, B差)
```

これを代入すると、2 つの式は次のように書き換えられる。

| 式 | 等価な表現 | 意味 |
|---|---|---|
| 現行式 | `max(A差, B差) == 1` | **どちらの側から見ても 3 つ一致**している |
| 仕様書式 | `min(A差, B差) >= 3` | **どちらの側から見ても 3 つ以上食い違う**（＝共通は最大 1） |

`max(x) == 1` と `min(x) >= 3` は同時に真になれない。実際、全 390625 通りのうち
**両方 true になる組み合わせは 0 通り**だった。

##### 具体例

| A（種牡馬 A系） | B（繁殖牝馬 B系） | common | A差 | B差 | 現行 | 仕様書 |
|---|---|---:|---:|---:|---|---|
| `Ph Ns Ne Ro` | `Ph Ns Ne St` | 3 | 1 | 1 | **成立** | 不成立 |
| `Ph Ph Ns Ne` | `Ph Ns Ne Ro` | 3 | 1 | 1 | **成立** | 不成立 |
| `Ph Ns Ne Ro` | `St He Ha Te` | 0 | 4 | 4 | 不成立 | **成立** |
| `Ph Ns Ne Ro` | `Ph He Ha Te` | 1 | 3 | 3 | 不成立 | **成立** |
| `Ph Ns Ne Ro` | `Ph Ns Ha Te` | 2 | 2 | 2 | 不成立 | 不成立 |
| `Ph Ns Ne Ro` | `Ph Ns Ne Ro` | 4 | 0 | 0 | 不成立 | 不成立 |

##### 実データでの発火率（種牡馬 × 繁殖牝馬 20 万組をランダム抽出）

| | 組数 | 割合 |
|---|---:|---:|
| 現行のみ成立 | 5451 | **2.73%** |
| 仕様書のみ成立 | 137287 | **68.64%** |
| どちらも不成立 | 57262 | 28.63% |
| 両方成立 | 0 | 0.00% |

仕様書式を採ると **7 割弱の配合が「よくできた配合」になる**。
ゲームの体感（よくできたは珍しくないが 7 割は明らかに多すぎる）とも、
「よくできた＝3 系統一致」という通説とも合わない。

参考: 現行の判定軸である `common` の分布は
`0: 39.74% / 1: 40.90% / 2: 16.47% / 3: 2.73% / 4: 0.16%`。
現行式は最も稀な帯（2.73%）を拾っており、「見事（0.16%）の一歩手前」という
位置づけと整合する。

##### 結論

仕様書 §26 は逆アセンブルで**否定条件を拾った**可能性が高い。
`filter(x => !B.includes(x))` を数えているコードは、実際には
「一致数 = 4 - 不一致数」を求める途中式だったと考えるのが自然。

##### 決定: 現行式を採用する（確定）

**「よくできた配合」は現行式 `countCommonElements(A, B) === 3` のままとする。
アルゴリズム仕様書 §26 は採用しない。**

切り替えフラグは設けない。実装者が迷わないよう、判定関数は現行式をそのまま持ち、
仕様書式を採らない理由をコード上のコメントに残す。

```js
// vue/logic/theory/compatibility.js
// よくできた配合。アルゴリズム仕様書 §26 は「A差>=3 かつ B差>=3」としているが、
// これは common == 4 - max(A差, B差) の恒等式より「共通が最大1つ」を意味し、
// 実データで 68.6% の配合が成立してしまう（現行式は 2.73%）。
// 逆アセンブルが否定条件を拾ったものと判断し、現行式を採用する。
// 詳細: docs/pedigree-master-integration-design.md §7.2.2
function isWellBreeding(sireA, damB) {
  return countCommonElements(sireA, damB) === 3;
}
```

この決定により §7.2.4 の定数ファイルは `PRIORITY` のみを持つ。

```js
window.Dabimas.constants.breedingTheories = {
  PRIORITY: [ /* §7.2.4 */ ]
};
```

#### 7.2.3 至高の判定

現行は `inbreed-detector.js` の `evaluateSameNameSpecialCheck()` が
「世代 3・4・5 を含む」かつ「因子 6 種類以上」だけを見ている。仕様書 §32 に合わせて追加する。

```
至高 = 以下すべて
  a. 世代集合が {3,4,5} を含む（重複世代は許容。3×4×5×5 も 3×3×4×5 も可）   ← 現行あり
  b. クロス候補の因子が 6 種類以上（個数ではなく種類）                        ← 現行あり
  c. 基準馬が牡馬かつ master 由来（自家製馬・エディット馬・牝馬は基準にしない） ← 追加
  d. 候補内の別ノードが 基準馬と完全同一 or 同じ kisekiGroupId                 ← 追加
  e. 血統全体の因子延べ数 >= 30                                               ← 追加
       種牡馬側表示祖先の因子延べ数 + 種牡馬自身の因子数 + 繁殖牝馬側表示祖先の因子延べ数
       （繁殖牝馬ルート自身は加算しない非対称実装。仕様書 §32.6）
```

`e` は**種類数ではなく延べ数**。`b` は**種類数**。取り違えやすいので注意。

`c` により、牝馬枠は至高の**基準馬**にはならない。ただし候補（クロス相手）には
なりうるので、`hasMareOccurrence` なクロス群も至高候補の収集対象には含める。

`e` の「表示祖先」は男系15枠を指す（牝馬は因子を持たないため実質同じだが、
定義として男系に固定する）。

#### 7.2.4 成立判定と表示判定の分離

現行 `compatibility()` は理論を 1 つの文字列で返し、優先順位がコードに埋まっている。
仕様書 §33〜§35 に合わせて分離する。

```js
detectMatchedTheories(S, D, context)          // → ["WONDERFUL","INTERESTING","PERFECT",...]
selectDisplayedTheory(matched, priorityTable) // → 1件
```

`priorityTable` は `vue/constants/breeding-theories.js` に置く。
`breeding_theories` マスタが未入手のため**暫定値を置くが、ロジック内にハードコードしない**
（仕様書 §40.8）。危険な配合は通常理論より後方へ回す（同 §35）。

戻り値の `styleThoeryClass`（`"theory_01"`〜`"theory_07"`）は CSS が依存しているため
**文字列の対応関係を変えない**。

#### 7.2.5 奇跡の照合方法

現行は `selected[19].name` と `selected[4..7].name` の**文字列比較**。

```js
const isMiracleMatch = (a, b) =>
  (a.nodeId != null && a.nodeId === b.nodeId) ||
  (a.kisekiGroupId != null && a.kisekiGroupId === b.kisekiGroupId);
```

`kisekiGroupId` は `pedigreeNodes.json` から引く。一致数がちょうど 1 のときのみ成立
（現行と同じ）。どちらかに `nodeId` が無ければ名前比較へ縮退する。

### 7.3 インブリード因子数カウント（`vue/logic/inbreed/inbreed-counts.js`）

#### 現行の課題

重複除去キーが `name + subName`。`subName` は空・数字・`(...)` を `"dummy"` に
正規化しているため、**同名別馬が 1 頭に統合される**。

#### 新ロジック

```
1. 全クロスノードを集める（牝馬枠の出現も含む）
2. 完全同一ノードのみ重複除去   key = nodeId ?? `${name}|${subName}`
3. 全兄妹は別ノードなので統合しない（仕様書 §19・§40.6）
4. 各ノードの因子を数える
     nodeId があれば pedigreeNodes.effects、無ければセルの factors
```

同一馬が 3 代と 5 代にいても 1 頭分（仕様書 §17.2）。

牝馬ノードは実測で `pedigree_effect_ids` が空のため、因子数への寄与は基本的にゼロ。
ただし**全兄妹クロスの相手として男系ノードを引き込む**ので、
その男系ノードの因子は新たに数えられる。ここが牝馬追加による因子数の増分になる。

`masterPedigreeOnly` 相当のフラグ（仕様書 §20）は引数に持たせるが、
**既定は `false`（自家製馬・エディット馬も数える）**。現行 UI の挙動を維持するため。

表示側の `factorCd`（32×3 の `"00"`〜`"14"` 行列）の形式は変更しない。
ただし牝馬クロスで引き込まれたノードは表示行を持たないため、
`factorCd` の行に対応しない。行インデックスに依存せず「一意ノードの列挙順」で
詰める現行実装（`inbreedArraySimple` の順で `factorCd[index]` へ）はそのまま使える。

---

## 8. 保存データの仕様変更

### 8.1 保存されている場所の一覧

| 保存先 | キー / ストア | 中身 | 影響 |
|---|---|---|---|
| localStorage | `dabimasFactor` | `selected[32]`（`descendants` / `searchText` / `displayName` を除去） | セルに `nodeId`、ルートセルに `mareNodeIds` が増える |
| localStorage | `dabimasFactorCategory` | `category[32]` | なし |
| localStorage | `dabimasMemo` / `dabimasMemoStallion` / `dabimasMemoBroodmare` | メモ | なし |
| localStorage | `dabimasManualInbreed` | 手動クロス指定 index 配列 | なし |
| IndexedDB `dabifaku_unified` | `workspaces[].snapshot` | 上記 6 キーの写し | 同上 |
| IndexedDB `dabifaku_unified` | `editStallions` | 因子オーバーライド | なし |
| IndexedDB `dabifaku_unified` | `appMeta` | schemaVersion 等 | キー 1 つ追加 |
| IndexedDB `DabifacCombinationDB` | `configs[].configData` | 保存済み配合（6 キーの写し） | 同上 |
| IndexedDB `DabifacCombinationDB` | `customHorses` | 自家製馬（`descendants[15]`） | `nodeId` / `mares` を持たない |

### 8.2 `nodeId` と `mareNodeIds` は永続化に依存しない

`persistSelectedToStorage()` は `selected` をそのまま直列化するため、
`nodeId` と `mareNodeIds` は自動的に保存される。
**しかし復元時は必ず再計算して上書きする。** 保存値は参考情報でしかない。

理由:

1. ルートセル（index 0 / 16）は `id` を持ち、`id` 体系は変更しない（§5.2）
2. 男系祖先セル（index 1-15 / 17-31）はルートの `id` から `details` を引けば位置で確定する
3. 牝馬15枠も同じ `details` の `mares` から取れる

この方針により **既存保存データの一括移行が不要**になる。

サイズ増: `mareNodeIds` は 1 側 15 個の整数で約 120 バイト、両側で 240 バイト。
localStorage / snapshot への影響は無視できる。

### 8.3 スキーマ版数

`appMeta` に 1 キー追加する。DB のバージョンは上げない（ストア構成を変えないため）。

```
key: "pedigreeSchemaVersion"   value: 2
```

「どの世代のロジックで動いているか」の記録用。将来 §9.4 の contingency が
必要になったときの判定材料として先に入れておく。

### 8.4 保存済み配合の共有互換

`CombinationDialog.js` の `configData` は localStorage 6 キーの文字列をそのまま持つ。

- **旧 config を新版で読む**: `nodeId` / `mareNodeIds` が無い → 復元時に再計算 → 正常動作
- **新 config を旧版で読む**: 余分なフィールドが入っている → 旧版は無視 → 正常動作

したがって**前方・後方とも互換**。エクスポート形式の版数は上げない。

### 8.5 自家製馬（`customHorses`）

自家製馬は「現在の盤面から生まれる子」として保存される。`buildSavedHorseRecord()` が
`DESCENDANT_CELL_IDS = [0,1,2,4,5,3,6,7,17,18,20,21,19,22,23]` でセルから
男系15枠を組み立てている。

**牝馬15枠も同じ方法で欠損なく作れる。** 子から見た path `p`（`M` で終わる）は、
`p[0] === "F"` なら種牡馬側（cell 0）起点の `p[1:]`、`"M"` なら繁殖牝馬側（cell 16）起点の
`p[1:]` に翻訳できる。`p === "M"` だけが繁殖牝馬本人を指す。

```js
// saved-horse-builder.js に追加する定数（§4.4 の MARE 順）
// [どちら側, その側の mareNodeIds のインデックス]  null は「その側のルート自身」
var MARE_SOURCE_IDS = [
  ["dam",  null], ["sire", 0], ["dam",  0], ["sire", 1], ["sire", 2],
  ["dam",  1],    ["dam",  2], ["sire", 3], ["sire", 4], ["sire", 5],
  ["sire", 6],    ["dam",  3], ["dam",  4], ["dam",  5], ["dam",  6],
];
```

```
mares[ 0] M     <- cells[16].nodeId          （繁殖牝馬本人）
mares[ 1] FM    <- cells[0].mareNodeIds[0]   （種牡馬の M）
mares[ 2] MM    <- cells[16].mareNodeIds[0]  （繁殖牝馬の M）
mares[ 3] FFM   <- cells[0].mareNodeIds[1]
mares[ 4] FMM   <- cells[0].mareNodeIds[2]
mares[ 5] MFM   <- cells[16].mareNodeIds[1]
mares[ 6] MMM   <- cells[16].mareNodeIds[2]
mares[ 7] FFFM  <- cells[0].mareNodeIds[3]
mares[ 8] FFMM  <- cells[0].mareNodeIds[4]
mares[ 9] FMFM  <- cells[0].mareNodeIds[5]
mares[10] FMMM  <- cells[0].mareNodeIds[6]
mares[11] MFFM  <- cells[16].mareNodeIds[3]
mares[12] MFMM  <- cells[16].mareNodeIds[4]
mares[13] MMFM  <- cells[16].mareNodeIds[5]
mares[14] MMMM  <- cells[16].mareNodeIds[6]
```

**この導出の検算**: 同じ翻訳規則を男系15枠へ適用すると、既存の
`DESCENDANT_CELL_IDS` が 1 要素の狂いもなく再現される。規則が正しいことの裏付けとする。

`buildSavedHorseRecord()` は `cells = JSON.parse(localStorage.dabimasFactor)` を
受け取っており、`mareNodeIds` は `stripHorseForStorage()` で落とされないため、
**呼び出し側の変更なしに参照できる**。

#### 男系の `nodeId`

`descendants[]` にも `nodeId` を焼き込む。セル（`cells[n].nodeId`）から取れるため
名前解決に頼らなくてよい。

```js
return {
  name: cell.name, subName: cell.subName || "",
  nodeId: typeof cell.nodeId === "number" ? cell.nodeId : null,   // 追加
  parentLine: cell.parentLine || "", factors: [...], factorLocked: true,
};
```

#### 入れ子の自家製馬

盤面のルート（cell 0 / 16）自体が自家製馬である場合も、その自家製馬が
`mares` を持っていれば同じ規則で伝播する。再帰的に成立する。

#### 欠損時の扱い

`cells[0].mareNodeIds` が `null`（master 未収録・旧データ）の場合、
その位置は `null` のまま保存する。牝馬15枠のうち埋まった分だけが判定に参加する。

#### 既存の自家製馬の扱い（§9.3 で backfill）

この変更より前に保存された自家製馬は `mares` も `nodeId` も持たない。
ただし `customHorses` と `configs` は**必ず対で作成・削除される**
（`CombinationDialog.js` の `saveConfig()` / `deleteConfig()`）ため、
`config.customHorseId` から紐づく `configData.dabimasFactor` を辿れば
保存時の盤面が復元できる。そこから再構成する（§9.3）。

---

## 9. 移行設計

### 9.1 結論: 一括移行は行わない

§8.2 の理由により、既存の作業枠・保存済み配合・自家製馬に対するデータ書き換えは不要。
**「移行中です」の画面も出さない。**

その代わり、復元経路に「補完」を入れる。

```
restoreInputData()                          （vue/app/methods/bootstrap.js:91）
  ↓ selected を localStorage から読む（現行どおり）
  ↓ backfillPedigreeIds(selected)           ← 追加
  ↓ 因子・親系統を詰める（現行どおり）
  ↓ dispInbreed() / dispTheory()（現行どおり）
```

```
backfillPedigreeIds(selected):
  for side in (0, 16):
      root = selected[side]
      if !root: continue
      detail = await ensureHorseDetail(root.id)   // 既存メソッド。詳細 chunk を取得
      if !detail: continue                         // 取得失敗時は付けない（縮退）
      selected[side].nodeId       = summaryOf(root.id).nodeId
      selected[side].mareNodeIds  = detail.mares ?? null
      for i, d in enumerate(detail.descendants):
          cell = selected[side + slotOf(i)]
          if cell && cell.name === d.name:         // 名前が一致するときだけ付ける
              cell.nodeId = d.nodeId
```

**「名前が一致するときだけ付ける」が肝。** 祖先セルの因子は
`applyManualFactors()` でユーザーが上書きできるため、セルを作り直してはいけない。
`nodeId` を足すだけの加算的な操作に限定する。

`mareNodeIds` は表示にも編集にも使われないので、無条件に上書きしてよい。

### 9.2 初回起動時に増えるコスト

一括移行は無いが、以下は初回のみ発生する。

| 項目 | コスト | 対応 |
|---|---|---|
| `pedigreeNodes.json` の取得 | 188KB（gzip） | 既存ローダーの表示時間内。失敗しても起動は止めない |
| `details` のサイズ増（`mares`） | +85KB（gzip、全 chunk 合計） | 既存の chunk 分割・先読みに乗る |
| 復元時の detail chunk 取得 | 2 chunk | `prefetchHorseDetails()` が先読み済み。多くはキャッシュヒット |
| SW キャッシュの再構築 | 全アセット再取得 | `CACHE_NAME` 更新に伴う通常の挙動 |

ローダー（`index.html:47` の `#loader`）へ文言を出すかどうかだが、
**現状の所要時間なら不要**と判断する。体感で問題になる場合のみ、
既存 `#loader` へテキストノードを 1 つ足す（Vue のマウント前に動くため
`document.getElementById("loader")` への直接操作でよい）。

### 9.3 既存の自家製馬への backfill

自家製馬だけは「再導出のもとになる `id`」を持たないため、復元時の再計算では埋まらない。
`loadCustomHorseDetails()` の読み込み後に 1 度だけ補完する。

```
backfillCustomHorse(record):
  if record.mares != null: return                       // 冪等
  config = configs.find(c => c.customHorseId === record.id)
  if !config: return                                    // 紐づく config が無ければ諦める
  cells = JSON.parse(config.configData.dabimasFactor)
  root0  = summaryOf(cells[0].id);  root16 = summaryOf(cells[16].id)
  d0  = await ensureHorseDetail(cells[0].id)            // mares を得る
  d16 = await ensureHorseDetail(cells[16].id)
  record.mares = MARE_SOURCE_IDS.map(([side, idx]) =>
      idx === null ? root16.nodeId
                   : (side === "sire" ? d0.mares : d16.mares)[idx])
  record.descendants[i].nodeId = ...                    // DESCENDANT_CELL_IDS 経由で同様
  save(record)
```

**要件**:

- 冪等（`mares` が既にあれば何もしない）
- `config` が見つからない・`cells[0]` が自家製馬・detail が取れない場合は
  `mares` を `null` のままにして続行する。判定は縮退モードで動く（§6.7）
- **UI は出さない。** 自家製馬は多くて数十件で、`loadCustomHorseDetails()` は
  もともと復元チェーンを待たせない並行処理のため、体感に出ない
- 失敗件数は `console.warn` に出す

これでも埋まらない自家製馬は、ユーザーがその配合を開いて保存し直せば埋まる。

### 9.4 contingency: 本当に一括移行が必要になった場合

`id` 体系を変えざるを得なくなった等で一括移行が必要になったときの設計。実装はしない。

**方式**: `workspace-sync.js` の `boot()` にステップを追加する。
既に `runMigrationCheck()` が同じ位置で動いており、パターンが確立している。

```
boot()
  → openDB()
  → runMigrationCheck()            既存（localStorage → 作業枠）
  → runPedigreeMigration()         追加
  → 画面決定
```

**UI**: `boot()` は Vue マウント前に走るので `#loader` の DOM を直接書き換える。

```
保存データを更新しています… (12 / 40)
```

**要件**:

- 冪等であること（再実行しても同じ結果）
- `pedigreeSchemaVersion` は**全件成功後にのみ**書く。途中失敗なら次回再試行
- オフラインで detail が取れない場合は移行を諦め、版数を更新せずに通常起動する
  （縮退モードで動く）
- 全作業枠のルート `id` を先に集め、必要な detail chunk を**重複排除して一括取得**する。
  作業枠ごとに fetch すると chunk 数 × 作業枠数になる
- 失敗した作業枠はスキップして続行し、件数を `console.warn` に出す

---

## 10. 運用

### 10.1 `pedigree_master.json` 更新フロー

```
1. 新しい pedigree_master.json を json/ へ上書き
2. python scripts/build_dabimas_stream.py --pedigree-master json/pedigree_master.json ... --fail-on-error
3. ancestor_mismatch が 0 であることを確認
4. service-worker.js の CACHE_NAME を更新
5. コミット・デプロイ
```

### 10.2 全書だけ更新する場合

`pedigree_master.json` を触らずに 2 以降を実行する。因子・系統・レア度の変更は
これだけで反映される。

### 10.3 master が古くなったときの挙動

| 状況 | 挙動 |
|---|---|
| 全書にあって master に無い馬 | `nodeId = null`、`mares = null`。そのペアだけ名前ベースへ縮退（§6.7） |
| master にあって全書に無い馬 | 出力しない（全書が正） |
| master の血統が古い | 男系15祖先照合が失敗 → `ancestor_mismatch` として検出・WARN・`nodeId = null` |

`ancestor_mismatch` が閾値（例: 10 件）を超えたらビルドを失敗させ、
「master を更新してください」と出す。

---

## 11. 影響ファイル一覧

### 11.1 Python

| ファイル | 変更 |
|---|---|
| `scripts/build_dabimas_stream.py` | 新経路の分岐・CLI 引数追加。既存経路は温存 |
| `scripts/pedigree_master_source.py` | **新規** |
| `scripts/zensho_list_source.py` | **新規** |
| `tests/test_build_dabimas_stream.py` | 新経路のテスト追加。既存テストは維持 |

### 11.2 データ

| ファイル | 変更 |
|---|---|
| `json/pedigree_master.json` | **新規配置**（ビルド専用・SW キャッシュ禁止） |
| `json/pedigreeNodes.json` | **新規生成** |
| `json/dabimasFactor.summary.json` | `nodeId` 追加 |
| `json/dabimasFactor-details/*.json` | `nodeId` + `mares` 追加 |
| `json/dabimasFactor.json` | 同上（フォールバック経路） |
| `json/brosData.json` | 変更なし（手動オーバーライドとして残す） |
| `json/inbreed-exceptions.json` | 変更なし |

### 11.3 フロントエンド（ロジック）

| ファイル | 変更 |
|---|---|
| `vue/logic/inbreed/inbreed-detector.js` | node ベース判定・牝馬15枠・血量・危険な配合。**最大の変更** |
| `vue/logic/inbreed/inbreed-counts.js` | 重複除去キーを `nodeId` へ |
| `vue/logic/theory/compatibility.js` | 判定式・成立/表示の分離・奇跡の照合方法・至高の条件追加 |
| `vue/constants/breeding-theories.js` | **新規**（理論の priority 表のみ） |
| `vue/logic/pedigree/pedigree-builder.js` | `retDataForPedigree[0]` に `mareNodeIds` を追加（1 行） |
| `vue/logic/horses/saved-horse-builder.js` | `MARE_SOURCE_IDS` 追加・`mares[15]` の組み立て・`descendants[].nodeId` の格納（§8.5） |
| `vue/logic/theory/affinity.js` | 変更不要（`sonId` ベースのまま） |

### 11.4 フロントエンド（アプリ）

| ファイル | 変更 |
|---|---|
| `vue/app/methods/horse-loading.js` | `pedigreeNodes.json` 読み込み・`normalizeHorseSummary` に `nodeId`・`createSavedHorseSummary` に `nodeId: null`・detail の `mares` 保持・`backfillCustomHorse`（§9.3） |
| `vue/app/methods/bootstrap.js` | `restoreInputData()` に `backfillPedigreeIds()` を追加 |
| `vue/app/methods/inbreed-ui.js` | `judgeInbreed` / `buildInbreedFactorCounts` へ `nodeTable` を渡す・`count` の扱い（§7.1） |
| `vue/app/methods/pedigree-cells.js` | `dispTheory()` を `detectMatchedTheories` / `selectDisplayedTheory` 呼び出しへ |
| `vue/app/app-state.js` | 血量・危険フラグの state 追加（表示する場合） |
| `vue/logic/workspace-sync.js` | 変更不要（§9.4 の contingency 時のみ） |

### 11.5 その他

| ファイル | 変更 |
|---|---|
| `index.html` | `vue/constants/breeding-theories.js` の `<script>` 追加。**AGENTS.md の編集手順を厳守**（`apply_patch` のみ・BOM 禁止・前後に backup/verify） |
| `service-worker.js` | `CACHE_NAME` 更新・`json/pedigreeNodes.json` と新規 JS を `urlsToCache` へ追加。**`pedigree_master.json` は追加しない** |
| `docs/dabifaku_unified_spec_draft.md` | appMeta キー追加を追記 |

---

## 12. テスト計画

### 12.1 Python

- 新経路の出力が現行 JSON と `nodeId` / `mares` 以外で一致する（全 2873 頭）
- `ancestor_mismatch` が 0
- `derive_horse_id` が現行と同一 id を返す（種牡馬 2375 / 牝馬 498）
- 非凡サフィックス・年号サフィックスの解決（§4.2 の分岐を個別に）
- 親系統の父方向フォールバック（`child_sire_line` を持たないノード）
- **牝馬15枠の path 順が §4.4 と一致する**（順序を間違えると世代がズレる）
- 牝馬枠の欠損が `null` で埋まる

### 12.2 フロントエンド

アルゴリズム仕様書 §41 のテストケースを移植する。

| ID | 内容 | 期待 |
|---|---|---|
| TC-001 | 片側だけ同一馬重複 | インブリードなし |
| TC-002 | 完全同一 3×4 | 血量 18.750% |
| TC-003 | 全兄妹 3×4 | 同一クロスグループ |
| TC-004 | 半兄弟 | クロスにならない |
| TC-005 | 5 代目全兄妹 | 判定可能 |
| TC-006 | 同一馬 3×5 の因子 | 1 頭分 |
| TC-007 | 全兄妹の因子 | 2 頭分 |
| TC-008 | 2×2 | dangerous=true |
| TC-009 | 28.125% + 25.000% | dangerous=false |
| TC-010/011 | 面白 7 系統 / 6 系統 | true / false |
| TC-012 | 超完璧 | 見事・面白・完璧・超完璧が同時 true |
| TC-013〜016 | 至高の世代条件 | 3×4×5 系 ○ / 3×3×4×4 × |
| TC-017〜019 | 至高の因子条件 | 5 種類 × / 6 種類+29 個 × / 6 種類+30 個 ○ |

牝馬追加分の追加ケース:

| ID | 内容 | 期待 |
|---|---|---|
| TC-M01 | 繁殖牝馬側5代目牝馬（父キングマンボ・母サドラーズギャル）× 種牡馬側3代目エルコンドルパサー | 全兄妹クロス成立・血量 12.500 + 3.125 = 15.625% |
| TC-M02 | 牝馬枠のみで成立したクロス | `count > 0` になり因子カウントが走る（§7.1） |
| TC-M03 | 牝馬枠が `null`（master 欠損） | そのペアは判定に参加せず、他のクロスは通常どおり |
| TC-M04 | 自家製馬を保存 → ルートに置く | `mares[15]` が §8.5 の対応表どおりに埋まり、牝馬クロスが成立する |
| TC-M05 | 牝馬の全兄妹が男系ノードを引き込む | その男系ノードの因子が因子カウントに加算される |
| TC-M06 | 自家製馬を入れ子で保存（ルートが自家製馬） | 牝馬枠が再帰的に伝播する |
| TC-M07 | 旧版で保存した自家製馬 | §9.3 の backfill で `mares` が埋まる。config が無ければ `null` のまま縮退 |

### 12.3 回帰テスト

`tests/fixtures/split-baseline/*.json`（S1 / S2_pressed / S2_released / S4 / S5）は
既存の表示状態スナップショット。

**牝馬追加でクロス数が増える配合が含まれる場合、ベースラインは意図的に更新する。**
差分が「牝馬由来のクロス増分」であることを 1 件ずつ確認してから更新すること。
`nodeId` 追加だけの差分と混ぜない（段階 2 と段階 3 でリリースを分ける理由）。

追加で確認する経路:

- 自家製馬を含む配合でインブリードが従来どおり出る（縮退の確認）
- エディット種牡馬を含む配合
- 旧版で保存した配合をインポートして復元できる
- `pedigreeNodes.json` を 404 にしたときも起動して名前ベースで動く
- 作業枠を切り替えても `nodeId` / `mareNodeIds` が正しく再計算される

---

## 13. 実装順序

各段階でリリース可能な状態を保つ。

| 段階 | 内容 | 挙動変化 |
|---|---|---|
| 1 | Python 新経路。出力は現行 + `nodeId` + `mares` + `pedigreeNodes.json` | なし（フロントは無視） |
| 2 | フロント: `pedigreeNodes.json` 読み込み・`normalizeHorseSummary`・`backfillPedigreeIds` | なし |
| 3 | インブリード判定を node ベースへ（**牝馬はまだ入れない**）。血量・危険な配合を追加 | 全兄妹が 36 → 4076 ペアに増える |
| 4 | **牝馬15枠を判定へ投入** | **クロス群が平均 1.06 → 1.47。23% の配合で増加** |
| 5 | 因子数カウントを `nodeId` キーへ | 同名別馬の誤統合が解消 |
| 6 | 理論判定の式変更・成立/表示の分離・奇跡の照合方法 | 見事/完璧/超完璧の境界が変わる |
| 7 | 至高の条件追加（c/d/e） | 至高が厳しくなる |

段階 3・4・6・7 はそれぞれ単独でリリースし、判定結果の変化を確認する。
特に**段階 4 は影響が最も大きい**ので、段階 3 と必ず分ける。

---

## 14. 未決事項

| # | 内容 | 決め方 |
|---|---|---|
| 1 | `brosData.json` の 10 ペアが実際に全兄妹か（§6.6） | 実機確認。それまで両方有効 |
| 2 | 血量・危険な配合を画面に出すか | UI 設計として別途 |
| 3 | 旧版保存の自家製馬で config が消えている場合の扱い | `mares` を `null` のままにする（縮退）で問題ないか。配合を開いて保存し直せば埋まる |
| 4 | `breeding_theories.priority` の実値 | マスタ dump 待ち。暫定表で運用 |
| 5 | `getCrossCommentType()` の日本語文言 | Word マスタ dump 待ち。本設計では対象外 |
| 6 | `pedigree_master.json` を Git に入れ続けるか（§3.2） | 更新頻度を見て判断 |

---

## 15. 作業指示書への分割

実装は Codex に委譲する。§13 の段階をそのまま指示書 1 本に対応させる。
指示書は `docs/codex-work-orders/YYYY-MM-DD-<slug>.md` に置く（既存の慣例に従う）。

| 段階 | 指示書 slug | 主な対象 | 依存 |
|---|---|---|---|
| 1 | `pedigree-master-python` | `scripts/pedigree_master_source.py` / `zensho_list_source.py` / `build_dabimas_stream.py` / JSON 出力 | なし |
| 2 | `pedigree-nodes-frontend-load` | `horse-loading.js` / `bootstrap.js` / `pedigree-builder.js` / `service-worker.js` | 段階1 |
| 3 | `inbreed-node-based` | `inbreed-detector.js`（男系のみ・血量・危険な配合） | 段階2 |
| 4 | `inbreed-mares` | `inbreed-detector.js`（牝馬15枠の投入）/ `saved-horse-builder.js` | 段階3 |
| 5 | `inbreed-factor-count-node` | `inbreed-counts.js` | 段階3 |
| 6 | `theory-detect-and-display` | `compatibility.js` / `breeding-theories.js` / `pedigree-cells.js` | 段階2 |
| 7 | `theory-supreme` | `compatibility.js`（至高の c/d/e） | 段階6 |

各指示書に必ず含める項目:

- 本設計書の該当節への参照（指示書に仕様を書き写さず、節番号で参照する）
- 検証可能な受け入れ基準（§12 のテストケース ID をそのまま使う）
- スコープ外の明記（特に「表示行を 32 から増やさない」「id 体系を変えない」
  「`pedigree_master.json` を SW キャッシュへ追加しない」の 3 点は毎回書く）
- `AGENTS.md` に従うこと（`index.html` を触る段階 2・6 は特に）

段階 4 と 6 は挙動が目に見えて変わるため、指示書に
「`tests/fixtures/split-baseline/*.json` の差分は意図的な更新であり、
差分の中身を 1 件ずつ説明すること」を受け入れ基準として入れる。
