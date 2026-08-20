# 系統ID（親系統・子系統）・レア度付与 仕様書

## 1. 背景・目的

相性（ニックス）診断機能の実装にあたり、馬ごとの系統を**名前文字列ではなく数値IDで**参照できる必要が出てきた。
相性診断の結果データ（`dabimas_nicks_result_bundle`）は、親系統・子系統を下記のID体系で参照しているため、
ダビマス全書（dabimas.jp）からのデータ取得時に、各馬へ **親系統ID** と **子系統ID** を解決してセットする。

- 親系統ID: `sire_line_bases.csv` の `id`（15系統）
- 子系統ID: `sire_lines.csv` の `id`（58系統）

ID表の全量は本書末尾の「付録: IDマスター表」を正とする。

あわせて、**種牡馬のレア度（★1〜★5）** も出力に含める（1〜5 の整数がわかればよい）。

## 2. 用語とID体系

| 用語 | 説明 | 例 | マスター |
|---|---|---|---|
| 親系統 | 大系統。配合理論判定で使う2文字略号（`Ec`, `Ph`, `Ns`, ...）に対応する15分類 | Nasrullah (`Ns`) | `sire_line_bases.csv`（id, name, abbr） |
| 子系統 | ダビマス全書の馬詳細ページに表示される系統名。58分類 | ナスルーラ系 | `sire_lines.csv`（id, name, sire_line_base_id） |

子系統は必ずいずれか1つの親系統に属する（`sire_lines.sire_line_base_id` → `sire_line_bases.id`）。

## 3. 現状

### 3.1 スクレイパー（scripts/build_dabimas_stream.py）

- 馬詳細ページから系統名（子系統名。例: `ナスルーラ系`）を取得し、ALL 行の `HD_PARENT_LINE` に格納している。
- `all_row_to_dabifac_entry()` で JSON 化する際、
  - `parentLine`: `PARENTAL_LINE_DICT`（子系統名 → 2文字略号のハードコード辞書）で解決した**親系統略号**
  - `son`: サイト表示のままの**子系統名文字列**
  を出力している。数値IDは一切持っていない。
- `entry_to_summary()` が summary 用に `parentLine` / `son` をコピーしている。
- **レア度は取得済みだが出力していない**: `parse_stallion()` が★画像の枚数を数えて
  ALL 行の `HD_RARE` に格納している（種牡馬の連続重複スキップ判定にも利用中）。
  しかし `all_row_to_dabifac_entry()` が JSON へ変換する際に捨てている。
  牝馬側も `HD_RARE` にページ上のテキストを格納しているが、内容は未検証。

### 3.2 出力 JSON（現状スキーマ・馬1件抜粋）

```json
{
  "id": "s12345",
  "name": "ノーザンテースト",
  "sex": "0",
  "parentLine": "Ne",
  "son": "ノーザンダンサー系",
  "factors": ["", "速", "底"],
  "descendants": [ ... ]
}
```

### 3.3 アプリ側（vue/app/methods/horse-loading.js）

- `normalizeHorseSummary()` が summary の `parentLine` / `son` をそのまま馬オブジェクトへ写している。IDフィールドは存在しない。

## 4. 変更内容

### 4.1 IDマスターの配置

添付CSV 2ファイルをリポジトリにコミットし、単一のマスターとする。

- `scripts/data/sire_line_bases.csv`
- `scripts/data/sire_lines.csv`

CSVは UTF-8（BOMなし）・ヘッダー行あり。内容は付録の表と同一。

### 4.2 スクレイパーの変更（scripts/build_dabimas_stream.py）

1. **起動時にマスターCSVを読み込み**、以下のルックアップ辞書を構築する。

   ```
   SIRE_LINE_DICT: 子系統名(str) -> {
       "sonId": sire_lines.id (int),
       "parentLineId": sire_lines.sire_line_base_id (int),
       "abbr": base_abbr (str),  # 2文字略号
   }
   ```

   - キーはCSVの `name` を `strip()` したもの。
   - `sire_lines.csv` は `base_abbr` 列を持つため、この1ファイルだけで略号まで解決できる
     （`sire_line_bases.csv` は整合性チェックと相性診断側の参照用に併置する）。

2. **`PARENTAL_LINE_DICT`（ハードコード辞書）を廃止**し、`SIRE_LINE_DICT` の `abbr` で置き換える。
   - 現行のハードコード辞書58件とCSV58件は名前・略号ともに完全一致していることを実装時に確認する
     （確認後にハードコード辞書を削除。系統名→略号の解決結果が1件でも変わってはならない）。
   - 既存のフォールバック `get_parent_line_name()`（先頭2文字化・Nas/Nat 揺れ吸収）は
     descendants 用にそのまま残す。

3. **`all_row_to_dabifac_entry()` で ID を出力**する。

   ```python
   line = SIRE_LINE_DICT.get(parent_line_raw.strip())
   entry["parentLineId"] = line["parentLineId"] if line else None  # 親系統ID
   entry["sonId"]        = line["sonId"]        if line else None  # 子系統ID
   ```

   - フィールド名は既存の `parentLine` / `son` と対応させ、`parentLineId` / `sonId` とする。

4. **`entry_to_summary()` に `parentLineId` / `sonId` を追加**する（相性診断は一覧・選択時点で
   系統IDを参照するため、summary にも載せる）。

5. **descendants（子孫15件）にも ID を出力**する。
   `all_row_to_dabifac_entry()` の descendants ループで、各子孫の `son`（子系統名）を
   同じ `SIRE_LINE_DICT` で引き、`parentLineId` / `sonId` をセットする。

   ```python
   line = SIRE_LINE_DICT.get(son.strip())
   descendants.append({
       "name": n,
       "parentLine": pl,
       "parentLineId": line["parentLineId"] if line else None,
       "son": son,
       "sonId": line["sonId"] if line else None,
       "factors": [...],
   })
   ```

   - 子孫の `parentLine`（略号）は既存どおり `get_parent_line_name()` 由来のまま変更しない
     （ID はあくまで `son` 名からの解決とし、略号との二重解決はしない）。
   - 現行データでの裏付け: 既存 detail chunk 全件の descendants `son` は延べ 42,960 件・
     58 種類で、すべて `sire_lines.csv` の系統名と完全一致（未知・空値なし）を確認済み。
   - 未知系統名の扱いは自身の系統と同じ（下記 6. を適用。警告・集計・`--fail-on-error` 対象）。

6. **未知の子系統名の扱い**
   - `SIRE_LINE_DICT` に無い系統名が出現した場合:
     - `parentLineId` / `sonId` は `null` とし、その馬の出力自体は継続する。
     - `[warn] unknown sire line: <系統名> (<url>)` を標準出力へ記録し、専用カウンタで集計する。
     - `--fail-on-error` 指定時は、未知系統が1件でもあれば終了コード1とする
       （サイト側に新系統が追加された事故をCIで検知するため）。
   - 空文字（系統表示なし）の場合は警告なしで `null` とする。

7. **種牡馬のレア度（★1〜★5）を出力**する。
   - `all_row_to_dabifac_entry()` で `HD_RARE`（★画像の枚数。取得済み）を整数化し、
     `rare` フィールドとして出力する。

     ```python
     rare = None
     if sex == "0":
         try:
             n = int(row_get(row, HD_RARE))
             rare = n if 1 <= n <= 5 else None
         except ValueError:
             rare = None
     entry["rare"] = rare
     ```

   - 1〜5 の範囲外（0 = ★画像が取れていない等）は `[warn] invalid rare: <値> (<url>)` を
     記録して `null` とする（系統と同様に集計し、`--fail-on-error` の対象とする）。
   - **牝馬は `null` 固定**とする。牝馬ページの `HD_RARE` はテキスト由来で内容が未検証のため、
     本仕様の対象外（必要になった時点で別途仕様化する）。
   - `entry_to_summary()` にも `rare` を追加する（レア度は一覧・選択時点で参照するため）。

### 4.3 出力 JSON（変更後スキーマ・馬1件抜粋）

full JSON / summary JSON ともに以下を追加する。追加のみで既存フィールドの変更・削除はない。

```json
{
  "id": "s12345",
  "name": "ノーザンテースト",
  "sex": "0",
  "rare": 5,
  "parentLine": "Ne",
  "parentLineId": 5,
  "son": "ノーザンダンサー系",
  "sonId": 22,
  "factors": ["", "速", "底"],
  "descendants": [
    {
      "name": "アンバーシャダイ",
      "parentLine": "Ne",
      "parentLineId": 5,
      "son": "ノーザンダンサー系",
      "sonId": 22,
      "factors": ["", "", "底"]
    }
  ]
}
```

- `version` は据え置き（summary `1`、detail chunk `1` のまま）。フィールド追加のみで後方互換のため。
- detail chunk は descendants に `parentLineId` / `sonId` が加わる（1馬あたり整数2個×15件の
  増加であり、サイズ影響は無視できる）。

### 4.4 アプリ側の変更（vue/app/methods/horse-loading.js）

`normalizeHorseSummary()` に ID のパススルーを追加する。

```js
rare: typeof horse.rare === "number" ? horse.rare : null,
parentLine: horse.parentLine || "",
parentLineId: typeof horse.parentLineId === "number" ? horse.parentLineId : null,
son: horse.son || "",
sonId: typeof horse.sonId === "number" ? horse.sonId : null,
```

- full JSON フォールバック経路（`buildHorseLists` に生 entry を渡す経路）は entry に
  ID が含まれるため変更不要。
- descendants は `hydrateHorseWithDetail()` が detail chunk の内容をそのまま載せるため、
  アプリ側の変更なしで `parentLineId` / `sonId` が参照可能になる。
- 保存済みデータ（localStorage / IndexedDB に永続化された選択馬・自家製馬）には ID が
  含まれていない場合がある。相性診断側は **ID が `null`/undefined のときは `son`（子系統名）
  から再解決するフォールバック**を持つこと（再解決用の名前→IDテーブルは相性診断実装時に
  アプリへ持ち込む。本仕様の範囲外）。

### 4.5 対象外（本仕様でやらないこと）

- **相性診断ロジックそのもの**（結果データの取り込み・判定UI）。本仕様はその前提となるID付与のみ。
- アプリ側への系統マスター（JSON）の同梱。

## 5. 互換性

| 観点 | 影響 |
|---|---|
| 既存フィールド | 変更なし（追加のみ） |
| 旧 JSON を読む新アプリ | `parentLineId` / `sonId` が undefined → `null` に正規化される。相性診断は名前フォールバックで動作 |
| 新 JSON を読む旧アプリ | 未知フィールドは無視されるため影響なし |
| 保存済みユーザーデータ | ID なしで保存されている可能性あり。相性診断側の名前フォールバックで吸収 |

## 6. 検証

1. **マスター整合性**: 旧 `PARENTAL_LINE_DICT` と `sire_lines.csv` の (名前, 略号) 58件が
   完全一致することを確認してから辞書を削除する。
2. **少量実行**: `--limit 20` で実行し、自身・descendants の全件に `parentLineId` / `sonId` が
   非 `null` でセットされ、`parentLine`（略号）と `parentLineId` がマスター上で対応している
   ことを確認する。
3. **全量実行**: 未知系統警告が 0 件であることを確認する
   （現行データでは自身・descendants とも全系統名がマスターと一致することを確認済み）。
4. **summary / detail 反映**: `--summary-output` の JSON に自身の ID が、
   `--details-output-dir` の各 chunk に descendants の ID が載ることを確認する。
5. **レア度**: 全量実行で、種牡馬全件の `rare` が 1〜5 の整数であること
   （invalid rare 警告 0 件）、牝馬全件が `null` であることを確認する。
   ★5 でない種牡馬（例: ★1〜★4 の通常種牡馬）を数件ピックアップし、
   サイト表示の★数と一致することを目視確認する。
5. **アプリ表示回帰**: 新 summary で候補リスト表示・馬選択・配合理論判定が従来どおり
   動作することを確認する（`parentLine` 略号は生成経路が辞書→CSV に変わるため）。

## 7. 変更対象ファイル一覧

| ファイル | 変更 |
|---|---|
| `scripts/data/sire_line_bases.csv` | 新規（IDマスター） |
| `scripts/data/sire_lines.csv` | 新規（IDマスター） |
| `scripts/build_dabimas_stream.py` | CSV読込・`SIRE_LINE_DICT` 構築、`PARENTAL_LINE_DICT` 廃止、entry（自身・descendants）/summary への `parentLineId`/`sonId` 追加、種牡馬 `rare`（1〜5）の出力、未知系統・不正レア度の警告・集計 |
| `vue/app/methods/horse-loading.js` | `normalizeHorseSummary()` に ID・`rare` パススルー追加 |

## 付録: IDマスター表

### 親系統（sire_line_bases）

| id | name | abbr |
|---|---|---|
| 1 | Eclipse | Ec |
| 2 | Phalaris | Ph |
| 3 | Nasrullah | Ns |
| 4 | Royal Charger | Ro |
| 5 | Nearctic | Ne |
| 6 | Native Dancer | Na |
| 7 | Fairway | Fa |
| 8 | Tom Fool | To |
| 9 | Teddy | Te |
| 10 | Swynford | Sw |
| 11 | Hampton | Ha |
| 12 | Himyar | Hi |
| 13 | St.Simon | St |
| 14 | Matchem | Ma |
| 15 | Herod | He |

### 子系統（sire_lines）

| id | name | 親系統id | 親系統 |
|---|---|---|---|
| 1 | エクリプス系 | 1 | Eclipse (Ec) |
| 2 | ファラリス系 | 2 | Phalaris (Ph) |
| 3 | ファロス系 | 2 | Phalaris (Ph) |
| 4 | ネアルコ系 | 2 | Phalaris (Ph) |
| 5 | ナスルーラ系 | 3 | Nasrullah (Ns) |
| 6 | グレイソヴリン系 | 3 | Nasrullah (Ns) |
| 7 | ソヴリンパス系 | 3 | Nasrullah (Ns) |
| 8 | フォルティノ系 | 3 | Nasrullah (Ns) |
| 9 | ゼダーン系 | 3 | Nasrullah (Ns) |
| 10 | ネヴァーセイダイ系 | 3 | Nasrullah (Ns) |
| 11 | プリンスリーギフト系 | 3 | Nasrullah (Ns) |
| 12 | ボールドルーラー系 | 3 | Nasrullah (Ns) |
| 13 | レッドゴッド系 | 3 | Nasrullah (Ns) |
| 14 | ネヴァーベンド系 | 3 | Nasrullah (Ns) |
| 15 | ロイヤルチャージャー系 | 4 | Royal Charger (Ro) |
| 16 | ヘイルトゥリーズン系 | 4 | Royal Charger (Ro) |
| 17 | サーゲイロード系 | 4 | Royal Charger (Ro) |
| 18 | ハビタット系 | 4 | Royal Charger (Ro) |
| 19 | ダンテ系 | 2 | Phalaris (Ph) |
| 20 | モスボロー系 | 2 | Phalaris (Ph) |
| 21 | ニアークティック系 | 5 | Nearctic (Ne) |
| 22 | ノーザンダンサー系 | 5 | Nearctic (Ne) |
| 23 | ファリス系 | 2 | Phalaris (Ph) |
| 24 | ネイティヴダンサー系 | 6 | Native Dancer (Na) |
| 25 | エタン系 | 6 | Native Dancer (Na) |
| 26 | レイズアネイティヴ系 | 6 | Native Dancer (Na) |
| 27 | フェアウェイ系 | 7 | Fairway (Fa) |
| 28 | フェアトライアル系 | 7 | Fairway (Fa) |
| 29 | トムフール系 | 8 | Tom Fool (To) |
| 30 | テディ系 | 9 | Teddy (Te) |
| 31 | スインフォード系 | 10 | Swynford (Sw) |
| 32 | ブランドフォード系 | 10 | Swynford (Sw) |
| 33 | ブレニム系 | 10 | Swynford (Sw) |
| 34 | ブラントーム系 | 10 | Swynford (Sw) |
| 35 | ハンプトン系 | 11 | Hampton (Ha) |
| 36 | サンインロー系 | 11 | Hampton (Ha) |
| 37 | ファイントップ系 | 11 | Hampton (Ha) |
| 38 | ハイペリオン系 | 11 | Hampton (Ha) |
| 39 | オーエンテューダー系 | 11 | Hampton (Ha) |
| 40 | ロックフェラ系 | 11 | Hampton (Ha) |
| 41 | カーレッド系 | 11 | Hampton (Ha) |
| 42 | オリオール系 | 11 | Hampton (Ha) |
| 43 | ヒムヤー系 | 12 | Himyar (Hi) |
| 44 | セントサイモン系 | 13 | St.Simon (St) |
| 45 | プリンスローズ系 | 13 | St.Simon (St) |
| 46 | プリンスキロ系 | 13 | St.Simon (St) |
| 47 | プリンスビオ系 | 13 | St.Simon (St) |
| 48 | ボワルセル系 | 13 | St.Simon (St) |
| 49 | リボー系 | 13 | St.Simon (St) |
| 50 | ワイルドリスク系 | 13 | St.Simon (St) |
| 51 | マッチェム系 | 14 | Matchem (Ma) |
| 52 | マンノウォー系 | 14 | Matchem (Ma) |
| 53 | レリック系 | 14 | Matchem (Ma) |
| 54 | インテント系 | 14 | Matchem (Ma) |
| 55 | ヘロド系 | 15 | Herod (He) |
| 56 | トウルビヨン系 | 15 | Herod (He) |
| 57 | クラリオン系 | 15 | Herod (He) |
| 58 | マイバブー系 | 15 | Herod (He) |
