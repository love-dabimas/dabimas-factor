# 配合の種牡馬・繁殖牝馬保存／配合ステータスバー（保存導線・相性値）詳細設計書 v1.0

## 0. このドキュメントの位置づけ

`docs/dabifaku_unified_spec_draft.md`（統合版実装仕様書 v2.1、以下「統合版仕様」）の**追補機能**の詳細設計である。対象ブランチは `feature/dabifaku-unified`。統合版（カテゴリ・作業枠・ホーム画面）が実装済みであることを前提とする。

本設計は 2026-07-07 時点の現行コードと照合済みであり、参照している行番号・メソッド名はその時点のものである。実装時にズレていた場合はメソッド名で検索して特定すること。

### 0.1 実装時の原則（統合版仕様 §0.3 を継承）

- 確定事項は本ドキュメントに従う。現行実装と本設計に矛盾を見つけた場合は、勝手に解釈せず報告する。
- 新規ファイルは IIFE + `window.Dabimas` 名前空間、classic script、UTF-8 BOM なし（統合版仕様 §3）。
- Vue 2 / Vuetify 2 を維持。新規ライブラリを追加しない。
- **本設計は本体コードの改修を含む**（統合版仕様 §23 の「本体非改変」は統合版ラッパー導入時のスコープであり、本機能には適用しない）。ただし改修してよい箇所は §8 の変更ファイル一覧に列挙したものに限る。

### 0.2 ユーザーと合意済みの決定事項

| # | 決定 |
|---|---|
| 1 | 保存ダイアログの保存種別は**「種牡馬」「繁殖牝馬」の2択**（「配合のみ」の保存区分は新設しない。配合した仔は牡か牝のどちらかであるため） |
| 2 | 保存した馬の名前は **「☆」+ タイトル**（例: `☆マイスタリオン`）。★は薄め自動生成名と紛らわしいため使わない |
| 3 | ☆馬を深い世代に置いたときの薄め自動生成名は、**先頭の☆を除去**して `★１薄めマイスタリオン` の形にする |
| 4 | 改修前に保存された既存の配合レコードは「配合」バッジ付きで一覧に残す（**復元専用**。選択肢には出ない） |
| 5 | 新規保存は 1 回の保存で「復元用データ」と「選択肢用の馬レコード」の両方を作る（復元機能はこれまでどおり使える） |
| 6 | 保存した☆馬（およびその血統内に含まれる★セル）には**因子を設定できない**（保存時の因子で固定） |
| 7 | ケータイ版の保存導線・相性値表示は**案A: header 内に高さ24px固定の「配合ステータスバー」を常時表示**（タブバー統合の案Bは不採用） |
| 8 | 保存馬の識別は馬名の「☆」のみ。血統表にバッジ列は追加しない |
| 9 | 相性値の計算ロジックは今後実装。今回は**表示エリアと計算の差し込み口（スタブAPI）のみ**を作り、未計算時は「--」を表示する |

---

## 1. 要件サマリ

1. **配合の種牡馬・繁殖牝馬保存（機能①）**
   配合保存ダイアログで、現在の血統表（32セル）から「この配合で生まれる仔」を種牡馬または繁殖牝馬として保存できる。保存した馬は馬選択の候補リストに「☆タイトル」として現れ、通常馬と同様に選択できる。★セルに設定した手動因子は保存時の値で引き継がれ、以後変更できない。
2. **保存ダイアログを開くボタンの導線改善（機能②）**
   現状ケータイ版では、集計ヘッダーを「子系統・メモモード」に切り替えたときにしか馬アイコン（ダイアログを開くセル）が表示されない（`vue/components/header/factor-summary-header.js` のモバイル用 tbody で `dispCategory % 2` により保存セルとリセットセルが入れ替わる構造）。常時表示の保存ボタンを新設する。
3. **相性値の表示エリア（機能③）**
   将来実装する「相性値」を一目で確認できる常設エリアを設ける。今回は表示枠と計算スタブのみ。

機能②③は「配合ステータスバー」1本で同時に満たす（§6）。

---

## 2. 現状の事実（コード照合済み・実装前に必ず読むこと)

| 事実 | 根拠 |
|---|---|
| 配合保存は IndexedDB `DabifacCombinationDB`（version 2）の `configs` ストア。レコードは `{ id: autoIncrement, title, savedAt, configData }`。`configData` は localStorage 6キーの生文字列＋参照する自家製馬レコードの同梱（`customHorses` 配列） | `vue/CombinationDialog.js` `saveConfig()`、`vue/logic/storage/combination-storage.js` |
| 同 DB に `customHorses` ストア（keyPath `id`、index `createdAt`）が存在し、`saveCustomHorse` / `loadCustomHorses` / `getCustomHorse` / `deleteCustomHorse` ヘルパーが**実装済み・現状ほぼ未使用**（唯一の書き込みは配合復元時の同梱レコード書き戻し `writeCustomHorses`） | `vue/logic/storage/combination-storage.js:150-235`、`vue/CombinationDialog.js:236-257` |
| 馬オブジェクトが `source: "custom"` または `customHorseId` を持つ場合、選択時の詳細解決（`ensureHorseDetail`）は `customHorses` ストアから `descendants`（**15件必須**）を読む経路が**実装済み** | `vue/app/methods/horse-loading.js:137-152` |
| 候補リストは `horsesBase` / `stallionsBase` / `broodmaresBase`（freeze済み）から `horses` / `stallions` / `broodmares` を作り、`horseDataLists = [horses, stallions, broodmares]` として全セルへ渡る。リセット（`initializer`）と復元（`restoreInputData`）で base から作り直される | `vue/app/methods/horse-loading.js` `buildHorseLists()`、`vue/app/methods/bootstrap.js:96-108, 166-169` |
| ★で始まる名前の馬（自家製馬）は、選択セルで「因子」ボタン→因子選択ダイアログ（短速底長堅難から最大2個）を開ける。判定は `selectedHorseName.startsWith("★")` | `vue/components/pedigree/pedigree-row.js:228-241`、`vue/factor-dialog.js` |
| 手動因子は `applyManualFactors` が `selected[row].factors[1..2]` に反映し、`persistSelectedToStorage()` で localStorage `dabimasFactor` に永続化される（＝保存ダイアログが読む configData に手動因子が含まれる） | `vue/app/methods/pedigree-cells.js:86-137` |
| ★馬はクロス（インブリード）判定から除外される | `vue/logic/inbreed/inbreed-detector.js:27-33` |
| 深い世代で種牡馬を選ぶと、根に向かって `★${N}薄め${name}${subName}` の自家製馬が自動生成される（牝馬側の根は「ワタシノヒンバ」） | `vue/app/methods/pedigree-cells.js:362-439` |
| モバイルの血統表行高は `applyMobileViewportLayout()` が `rowHeight = (mainHeight - 固定分) / 32` で自動計算する。`mainHeight = ロック済みビューポート高 - <header ref="appHeader"> の実測高`。**header 内に要素を足せば高さ計算は自動追従する** | `vue/app/methods/ui-viewport.js:272-396` |
| 検索は `getHorseSearchIndexText()` が馬オブジェクトの `name` / `subName` / `ruby` / `nature` から検索文字列を都度構築・WeakMapキャッシュする。候補側に事前計算フィールドは不要 | `vue/logic/horses/horse-search.js:71-92` |
| `descendants` の並び順とセル配置の対応は §4.3 の表のとおり（`setDataForPedigree` の詰め替えを逐一照合済み） | `vue/logic/pedigree/pedigree-builder.js:95-455` |
| `generateUuid()`（フォールバック付き UUID v4）が pedigree-builder.js 内に定義済みだが**未エクスポート** | `vue/logic/pedigree/pedigree-builder.js:29-59` |

---

## 3. データ設計

### 3.1 customHorses レコード（新規保存分の形式）

`DabifacCombinationDB.customHorses` に保存する。**既存ストアのスキーマ変更・version bump はしない**（keyPath `id` の JSON オブジェクトなのでフィールド追加は自由）。

```ts
type SavedHorseRecord = {
  id: string                 // "ch_" + generateUuid()
  kind: "stallion" | "broodmare"
  name: string               // "☆" + タイトル（10文字以内）
  sex: "0" | "1"             // stallion → "0", broodmare → "1"
  subName: ""
  ruby: ""
  nature: ""
  parentLine: string         // 保存時の selected[0].parentLine（父から継承）
  son: string                // 保存時の selected[0].son（子系統も父から継承）
  factors: ["", "", ""]      // 仔自身の因子は持たない（§3.4）
  factorLocked: true
  descendants: SavedHorseDescendant[]   // 必ず15件（§4.3）
  createdAt: string          // saveCustomHorse() が自動付与
  updatedAt: string          // 同上
}

type SavedHorseDescendant = {
  name: string
  subName: string            // 保存元セルの subName（なければ ""）
  parentLine: string
  factors: [string, string, string]  // 保存元セルの factors をコピー（★の手動因子を含む）
  factorLocked: true
}
```

注意:

- `descendants` は `ensureHorseDetail`（`vue/app/methods/horse-loading.js:129-202`）が `length === 15` を要求するため、**必ず15件**。
- 各 descendants エントリは `setDataForPedigree` にスプレッドで渡るので、`factorLocked` はそのままセルの馬オブジェクトへ伝播する（これが因子ロックの伝達経路。§5.1）。
- 既存の配合復元時の書き戻し（`writeCustomHorses`）は `put` の upsert なのでこの形式のレコードもそのまま通る。変更不要。

### 3.2 configs レコードの拡張

既存フィールドはそのまま、新規保存分にのみ 2 フィールドを追加する。

```ts
type ConfigRecord = {
  id: number            // autoIncrement（既存）
  title: string         // 既存
  savedAt: string       // 既存
  configData: {...}     // 既存（localStorage 6キー生文字列 + customHorses 同梱）
  kind?: "stallion" | "broodmare"   // 新規。無ければ旧形式（復元専用の「配合」）
  customHorseId?: string            // 新規。対応する SavedHorseRecord の id
}
```

- 旧レコード（`kind` なし）は一覧で「配合」バッジ・復元専用として扱う。マイグレーションはしない。
- `configData` の構築ロジック（6キー読み取り・自家製馬同梱）は**一切変更しない**。

### 3.3 候補リストに載せるサマリオブジェクト

起動時と保存直後に、`SavedHorseRecord` から次の形のサマリを作って候補配列の**先頭**に置く（§4.5）。

```js
{
  id: record.id,
  customHorseId: record.id,   // ensureHorseDetail の custom 解決キー
  source: "custom",
  name: record.name,           // "☆..."
  ruby: "",
  subName: "",
  nature: "",
  sex: record.sex,
  parentLine: record.parentLine,
  son: record.son,
  factors: ["", "", ""],
  factorLocked: true,
}
```

検索（`filterHorse`）は `name` の部分一致で拾えるため追加フィールドは不要。`disabled` は付けない（付けると候補から除外される。`vue/logic/horses/horse-search.js:115-118`）。

### 3.4 仔自身の因子について

保存した馬（仔）自身の `factors` は空で固定する。決定事項 #6 のとおり、保存済み☆馬に対して因子選択ダイアログは開かせない（因子を後から知っても設定できない。必要なら保存し直す運用）。この制約は §10 の確認事項にも再掲している。

---

## 4. 機能①: 配合の種牡馬・繁殖牝馬保存

### 4.1 保存ダイアログの UI 変更（`vue/CombinationDialog.js`）

画面案は会話で提示済みの「保存ダイアログ修正案（①）」に従う。

- 「新規保存」セクションの先頭に**保存種別トグル**を追加: `v-btn-toggle`（`mandatory dense`）で「種牡馬」「繁殖牝馬」の2択。既定は「種牡馬」。data に `saveKind: "stallion"` を追加。
- タイトル入力（10文字、既存の `newTitle`）はそのまま。
- 入力欄の下に説明文（caption）: 「「☆タイトル」として種牡馬（または繁殖牝馬）の選択肢に追加されます。★に設定した因子ごと保存され、保存後に因子は変更できません。」（選択中の種別に応じて文言切替）
- 保存ボタンのラベルを「配合を保存」→「保存する」に変更。活性条件は既存どおり `allHorsesSet`（32セル全部入力済み）。
- 保存済み一覧の各行に種別バッジを追加: `kind === "stallion"` → 「種牡馬」、`"broodmare"` → 「繁殖牝馬」、`kind` なし → 「配合」。`v-chip x-small` 程度でよい。
- 「復元する」は全種別で従来どおり動作（変更なし）。
- 「削除する」は §4.6。

### 4.2 保存処理フロー（`saveConfig()` の改修）

```text
(1) タイトル必須チェック（既存）
(2) configData を構築（既存ロジックそのまま: 6キー + customHorses 同梱）
(3) localStorage "dabimasFactor" を JSON.parse し、32セル配列 cells を得る
(4) horseRecord = window.Dabimas.logic.horses.buildSavedHorseRecord(saveKind, newTitle, cells)
      ├─ cells の必要セル（§4.3 の15箇所 + selected[0]）が null → throw（(1)の allHorsesSet ガードで通常は起きない）
      └─ 成功 → SavedHorseRecord
(5) combinationStorage.saveCustomHorse(db, horseRecord)   ← 先に馬レコード
(6) configs へ add（既存の add に kind / customHorseId を足したレコード）
      └─ 失敗したら deleteCustomHorse(db, horseRecord.id) で(5)を取り消してエラートースト
(7) 成功トースト「「☆タイトル」を保存しました」
(8) this.$emit("saved-horse-created", horseRecord)   ← root app が候補リストへ反映（§4.5）
(9) 一覧を再読込（既存 loadSavedConfigs）
```

### 4.3 仔の descendants 構築（本設計の核心。必ずこの表に従うこと）

新規ファイル `vue/logic/horses/saved-horse-builder.js` に純関数 `buildSavedHorseRecord(kind, title, cells)` を置く（`cells` = `dabimasFactor` の32要素配列）。

血統表のセル意味論: 各サイド16セルは「0 = 本馬、セル k の父 = セル 2k（k≧1、セル0 の父はセル1）、牝馬は現れず母は『母父』のセルで代表される」という圧縮5代表である。この配合で生まれる仔の血統は「父 = 種牡馬側セル0、母父 = 繁殖牝馬側セル17（= 繁殖牝馬の父）」として組み上がる。

`descendants[i]`（i = 0..14）に詰めるセルは次のとおり。**この対応は `setDataForPedigree` の詰め替え（`vue/logic/pedigree/pedigree-builder.js:113-455`、descendants index → 配置セルの対応が [0→1, 1→2, 2→4, 3→8, 4→9, 5→5, 6→10, 7→11, 8→3, 9→6, 10→12, 11→13, 12→7, 13→14, 14→15]）から逆算したもので、実在馬の血統データ（例: `s7985491231` の descendants と実血統の照合）でも検証済み。**

| descendants[i] | 取得元 `cells[j]` | 仔を選択したとき配置されるセル | 意味（仔から見て） |
|---:|---:|---:|---|
| 0 | 0 | 1 | 父（= 保存時の種牡馬） |
| 1 | 1 | 2 | 父父 |
| 2 | 2 | 4 | 父父父 |
| 3 | 4 | 8 | 父父父父 |
| 4 | 5 | 9 | 父父父の母父 |
| 5 | 3 | 5 | 父父の母父 |
| 6 | 6 | 10 | 父母父の父 |
| 7 | 7 | 11 | 父の母母父 |
| 8 | 17 | 3 | 母父（= 繁殖牝馬の父） |
| 9 | 18 | 6 | 母父父 |
| 10 | 20 | 12 | 母父父父 |
| 11 | 21 | 13 | 母父父の母父 |
| 12 | 19 | 7 | 母母父（= 繁殖牝馬の母父） |
| 13 | 22 | 14 | 母父の母父の父 ほか |
| 14 | 23 | 15 | 母の母母父 |

- 種牡馬側のセル 8〜15 と繁殖牝馬側のセル 24〜31 は仔から見て6代目以降になるため**保存対象外**（表の15件で完結）。繁殖牝馬本体（セル16）は牝馬なので血統表に現れず、その父（セル17）が母父として引き継がれる。
- 各エントリは `cells[j]` から `{ name, subName: cells[j].subName || "", parentLine: cells[j].parentLine || "", factors: [...(cells[j].factors || ["","",""])], factorLocked: true }` を作る。`cells[j].factors` には★セルに設定した手動因子（[1], [2]）が入っている（§2 の事実）。
- `id` は `"ch_" + generateUuid()`。`generateUuid` は `vue/logic/pedigree/pedigree-builder.js` でエクスポート追加する（`window.Dabimas.logic.pedigree.generateUuid = generateUuid;` の1行。既存定義をそのまま公開）。

**実装時の検証（受入条件 §11 の A-3）**: 全32セルを埋めて種牡馬として保存 → リセット → 保存した☆馬を種牡馬セル（セル0）で選択したとき、上表「配置されるセル」に保存元のセルの馬名・因子が正確に再現されること。1件でもズレたらこの表と `setDataForPedigree` を突き合わせて報告すること（勝手にマッピングを変えない）。

### 4.4 選択時の挙動（既存経路をそのまま使う。原則改修不要）

- サマリ（§3.3）は `source: "custom"` なので、選択時に `ensureHorseDetail` が `customHorses` ストアから descendants を解決する（既存実装）。
- セル0以外の深い世代に☆種牡馬を置いた場合も通常馬と同じ（部分配置＋★薄め自動生成）。自動生成された★薄め馬は**新規の自家製馬なので因子設定可**（factorLocked は付かない。正しい仕様）。
- ☆繁殖牝馬は繁殖牝馬セル（セル16）で選択でき、`sex === "1" && id === 0` の既存分岐で descendants が展開される。

### 4.5 候補リストへの統合

root app 側の改修:

1. `vue/app/app-state.js`: `savedHorseSummaries: []` を追加。
2. `vue/app/methods/horse-loading.js` に追加:
   - `loadSavedHorseSummaries()`: `combinationStorage.loadCustomHorses(db)` → `kind` を持つレコードのみ対象 → `createdAt` 降順で §3.3 のサマリ配列を作り `this.savedHorseSummaries` へ。同時に `this.customHorseDetails[record.id] = record` にキャッシュ（`ensureHorseDetail` の即時解決用）。
   - 呼び出しタイミング: `dbinitializer()` 内で summary fetch と並行に開始し、**`c4()`（復元）の後**に候補合成（下記3）を実行する。
3. 候補配列の合成箇所（3箇所）を改修し、保存馬サマリを**先頭**に含める:
   - `buildHorseLists()`: `this.stallions = [...savedStallions, ...this.stallionsBase]` / `this.broodmares = [...savedBroodmares, ...this.broodmaresBase]` / `this.horses = [...savedAll, ...]`（savedStallions = `savedHorseSummaries.filter(h => h.sex === "0")` など）
   - `restoreInputData()`（`vue/app/methods/bootstrap.js:96-108`）: 同様に先頭へ
   - `initializer()`（同 :166-169）: 同様に先頭へ
   - 最後の `this.horseDataLists = [this.horses, this.stallions, this.broodmares]` 再代入は既存どおり。
4. `index.html` の `<combination-dialog>` に `@saved-horse-created` / `@saved-horse-removed` を追加し、root app のハンドラで `savedHorseSummaries` を更新 → 上記合成を再適用（専用メソッド `refreshCandidateLists()` を作って3箇所のロジックと共用してよい。ただし既存3箇所の挙動——復元時に selected 由来エントリを push する等——は変えないこと）。

### 4.6 削除

- 「削除する」押下時、選択レコードが `kind` を持つ場合は確認文言を出す（`confirm()` か `v-dialog`）:
  「☆〇〇 を削除しますか？ 種牡馬（繁殖牝馬）の選択肢からも外れます。血統表で使用中の作業枠では、次回選択し直すことができなくなります。」
- 処理: `deleteConfig`（既存）→ `customHorseId` があれば `deleteCustomHorse` → `$emit("saved-horse-removed", customHorseId)` → root app が `savedHorseSummaries` から除去して候補合成を再適用。
- 血統表に配置済みのセルはそのまま残る（セルは軽量コピーを保持しており即座には壊れない）。作業枠 snapshot から復元される際に detail 解決が失敗した場合は既存の `notifyHorseDetailError` 経路に乗る（新規対応不要）。
- 逆に、削除済み☆馬を含む配合レコードを「復元する」と、同梱された customHorses が `writeCustomHorses` で書き戻される（既存挙動）。このとき候補リストにも復活させる必要はない（次回起動時に `loadSavedHorseSummaries` が拾う。気になる場合のみ restore ハンドラで再ロードしてよい）。

---

## 5. ☆馬まわりの本体改修（3箇所）

### 5.1 因子ロック（決定事項 #6）

- `vue/logic/pedigree/pedigree-selection.js` の `buildRowStates`: rowState に `factorLocked: !!(selected[index] && selected[index].factorLocked)` を追加。
- `vue/components/pedigree/pedigree-row.js`: computed `isStarSelection` を
  `name.startsWith("★") && !this.rowState.factorLocked` に変更（因子ボタン表示・因子セルクリック・factor-dialog 描画のすべてがこの computed 経由なので変更は1箇所で済む）。
- 伝播経路の確認: SavedHorseRecord の descendants エントリが持つ `factorLocked: true` は、`setDataForPedigree` のスプレッドコピー → `setPedigree` の `$set(this.selected, ...)` → `persistSelectedToStorage`（stripHorseForStorage は `descendants` / `searchText` / `displayName` しか落とさない）→ localStorage → 復元、と**素通しで保持される**。新たな引き回しコードは不要。

### 5.2 クロス判定の除外

`vue/logic/inbreed/inbreed-detector.js:32` の `isInbreedExcludedHorse`: `startsWith("★")` を ★ または ☆ の判定に変更（例: `/^[★☆]/.test(horseName.trimStart())`）。☆馬は一点物の生産馬なので★と同じ扱いにする。

### 5.3 薄め自動生成名の☆除去（決定事項 #3）

`vue/app/methods/pedigree-cells.js:386` 付近の `handMadeName`: `${name.trim()}` を `${name.trim().replace(/^☆/, "")}` に変更。これで `☆マイスタリオン` を深い世代に置くと `★１薄めマイスタリオン` が生成される。

---

## 6. 機能②③: 配合ステータスバー（案A）

### 6.1 コンポーネント

新規 `vue/components/header/combination-status-bar.js`（`combination-status-bar`）。

- 配置: `index.html` の `<header ref="appHeader">` 内、`<factor-summary-header>` の**直後**（ヘッダー最下段）。header 内なので `applyMobileViewportLayout()` の高さ計算に自動的に含まれ、追加の高さ対応は不要（§2 の事実）。モバイルの行高への影響は 24px ÷ 32行 ≒ 0.75px/行。
- PC・モバイル共通で常時表示（`v-show` 等での出し分けはしない）。PC の既存導線（集計ヘッダーの馬アイコンセル）は**そのまま残す**。モバイルの `dispCategory` 切替で現れる馬アイコンセルも**改修しない**（回帰リスク回避。導線が二重になるだけで害はない）。
- テンプレート構造:

```html
<div class="combination-status-bar">
  <span class="combination-status-bar-label">相性</span>
  <span class="combination-status-bar-value">{{ affinityText }}</span>
  <span class="combination-status-bar-spacer"></span>
  <button type="button" class="combination-status-bar-save"
          data-html2canvas-ignore="true"
          @click="$emit('open-save')">
    <i class="mdi mdi-content-save"></i>保存
  </button>
</div>
```

- props: `affinityText: { type: String, required: true }`。emit: `open-save`。
- 保存ボタンには `data-html2canvas-ignore` を付ける（モバイルスクリーンショットに写さない。相性値は写す）。
- root app 側の紐付け（index.html）:

```html
<combination-status-bar
  :affinity-text="affinityDisplayText"
  @open-save="handleCombinationCellClick"
></combination-status-bar>
```

### 6.2 CSS（`css/unified.css` に追記）

- `.combination-status-bar`: `height: 24px; display: flex; align-items: center; gap: 8px; padding: 0 8px; background: #edf4fc; border-bottom: 1px solid #cfe0f5; box-sizing: border-box;`
- ラベル/値: `font-size: 11px; color: #0c447c;`（値は `font-weight: 600; font-size: 13px;`）
- 保存ボタン: 高さ20px、`border: 1px solid #185fa5; border-radius: 5px; background: #fff; color: #0c447c; font-size: 11px; padding: 0 10px;` タップ領域確保のため `margin` ではなく擬似要素や padding 調整はせず、バー全高24pxのままでよい（横幅は十分にある）。
- **高さは 24px 固定**（内容によって変動させない。バー高さが固定であることが行高計算を安定させる）。

### 6.3 相性値スタブ（機能③）

- 新規 `vue/logic/theory/affinity.js`:

```js
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.theory = window.Dabimas.logic.theory || {};

  // 相性値の計算はここに実装する（今回はスタブ）。
  // context: { selected, parentLines, category, inbreedList }
  // 戻り値: number（相性値）または null（未計算・計算不能）
  function calculateAffinity(context) {
    return null;
  }

  window.Dabimas.logic.theory.calculateAffinity = calculateAffinity;
})(window);
```

- `vue/app/app-computed.js` に computed を追加:
  - `affinityScore()`: try/catch で `calculateAffinity({ selected: this.selected, parentLines: this.parentLines, category: this.category, inbreedList: this.inbreedList })` を呼び、例外時は null。
  - `affinityDisplayText()`: `affinityScore` が有限数なら文字列化、それ以外は `"--"`。
- 将来の計算実装は `affinity.js` の中身を書くだけで画面に反映される、という構造にする。

---

## 7. 表示・検索まわりの補足事項

- ☆馬候補は各候補配列の先頭（新しい順）に置く（§4.5）。グループ見出しは作らない（v-autocomplete / mobile-horse-picker の構造変更を避ける）。
- 検索: `getHorseSearchIndexText` は NFKC 正規化するが「☆」はそのまま残るため、タイトル部分の文字列一致で検索できる。追加実装不要。
- 因子バッジ（候補一覧の短/速/…表示）: ☆馬自身の factors は空なのでバッジなし。仕様どおり。

---

## 8. 変更・新規ファイル一覧

### 新規

| ファイル | 内容 |
|---|---|
| `vue/logic/horses/saved-horse-builder.js` | `buildSavedHorseRecord(kind, title, cells)` 純関数（§4.3） |
| `vue/logic/theory/affinity.js` | 相性値計算スタブ（§6.3） |
| `vue/components/header/combination-status-bar.js` | 配合ステータスバー（§6.1） |

### 変更

| ファイル | 変更内容 |
|---|---|
| `vue/CombinationDialog.js` | 保存種別トグル・保存フロー（§4.1, 4.2）・一覧バッジ・削除連動（§4.6）・`saved-horse-created` / `saved-horse-removed` emit |
| `vue/logic/pedigree/pedigree-builder.js` | `generateUuid` のエクスポート1行追加のみ |
| `vue/logic/pedigree/pedigree-selection.js` | rowState に `factorLocked` 追加（§5.1） |
| `vue/components/pedigree/pedigree-row.js` | `isStarSelection` に factorLocked 条件追加（§5.1） |
| `vue/logic/inbreed/inbreed-detector.js` | ☆をクロス判定除外に追加（§5.2） |
| `vue/app/methods/pedigree-cells.js` | 薄め名生成で先頭☆除去（§5.3） |
| `vue/app/app-state.js` | `savedHorseSummaries: []` 追加 |
| `vue/app/methods/horse-loading.js` | `loadSavedHorseSummaries()` 追加、`buildHorseLists()` への合成（§4.5） |
| `vue/app/methods/bootstrap.js` | `restoreInputData()` / `initializer()` の候補合成に保存馬を追加（§4.5） |
| `vue/app/app-computed.js` | `affinityScore` / `affinityDisplayText` 追加（§6.3） |
| `index.html` | `<combination-status-bar>` 挿入、`<combination-dialog>` へのイベント紐付け、script タグ3本追加 |
| `css/unified.css` | `.combination-status-bar` 系スタイル追記（§6.2） |
| `service-worker.js` | §9 |

### script タグの挿入位置（index.html）

依存順を守ること:

- `./vue/logic/theory/affinity.js` → `compatibility.js` の直後
- `./vue/logic/horses/saved-horse-builder.js` → `pedigree-builder.js` の直後（`generateUuid` を使うため）
- `./vue/components/header/combination-status-bar.js` → `factor-summary-header.js` の直後

### 変更してはいけないもの（禁止事項）

- `DabifacCombinationDB` の version・ストア構成（フィールド追加のみ可）
- localStorage 6キーの形式・キー名
- `configData` の構築・復元ロジック
- `setDataForPedigree` / `getCellIdQue` / `setPedigree` の詰め替えロジック（descendants マッピングは保存側で合わせる。エンジン側を触らない）
- 統合版（workspace-sync / repositories / home / tab-bar）のコード
- `applyMobileViewportLayout` の計算式
- mobile-horse-picker の IME まわり（`docs/index-split-completion-plan.md` §7.0 の不変条件）
- 既存の保存済み配合レコードのマイグレーション（しない）

---

## 9. service worker

`service-worker.js` の `urlsToCache` に新規3ファイル（§8）を追加し、`CACHE_NAME` を bump する（統合版仕様 §4.6 と同じ運用）。

---

## 10. 実装順序

1. **builder + エクスポート**: `saved-horse-builder.js`、`generateUuid` エクスポート。マッピング表（§4.3）のユニット確認（tests/ 配下に既存の流儀があれば合わせる。なければ後述 §11 A-3 の手動確認で代替）
2. **保存ダイアログ改修**: 種別トグル・保存フロー・バッジ・削除連動
3. **候補リスト統合**: state / loadSavedHorseSummaries / 合成3箇所 / イベント紐付け
4. **☆馬の本体挙動**: factorLocked（rowState / pedigree-row）、クロス除外、薄め名☆除去
5. **配合ステータスバー**: コンポーネント + CSS + affinity スタブ + index.html 組み込み
6. **service worker 更新**
7. **検証**: §11 全項目（PC + モバイル実機。特にモバイルの行高とタブバー・作業枠切替との共存）

---

## 11. 受入条件

### A. 保存と再現（機能①）

- A-1: 32セル全部埋めた状態で種牡馬として保存 → 種牡馬の候補リスト先頭に「☆タイトル」が出る
- A-2: 繁殖牝馬として保存 → 繁殖牝馬の候補リスト先頭に出る（種牡馬側には出ない）
- A-3: 保存した☆種牡馬をリセット後にセル0で選択 → §4.3 の表どおりに15セルへ馬名・因子（★の手動因子含む）が再現される
- A-4: ☆繁殖牝馬をセル16で選択 → 同様に再現される
- A-5: ☆馬を含む血統でニトロ・クロス・理論・子系統の集計が通常どおり動く（☆馬自身はクロス判定から除外される）
- A-6: ☆馬（およびその血統内の★セル）で因子ボタン・因子セルタップが無反応（因子選択ダイアログが開かない）。通常の★薄め馬（新規自動生成分）では従来どおり開く
- A-7: ☆馬を深い世代に置くと「★１薄めタイトル」（☆なし）の薄め馬が生成される
- A-8: 保存後に「復元する」で血統表全体が従来どおり復元される。旧「配合」レコードの復元も従来どおり
- A-9: ☆馬を削除すると候補リストから消える。削除後もアプリがエラーなく動作する
- A-10: PWA 再起動後も☆馬が候補リストに残っている。作業枠を切り替えても候補リストが維持される
- A-11: ☆馬を使った配合を保存 → 別端末相当（サイトデータ削除後）に復元 → 同梱書き戻しで☆馬セルが再選択可能（既存の自家製馬同梱機構が☆馬にも効くこと）

### B. 配合ステータスバー（機能②③）

- B-1: PC・モバイルとも、集計ヘッダー直下に高さ24pxのバーが常時表示される
- B-2: バーの「保存」ボタンで保存ダイアログが開く（モバイルで `dispCategory` の状態に関係なく開ける）
- B-3: 相性値は現時点で「--」表示。`calculateAffinity` が数値を返すよう差し替えるとその数値が表示される
- B-4: モバイルで血統表32行が画面内に収まり、行高が約0.75px縮む以外のレイアウト崩れがない（`applyMobileViewportLayout` がバー込みの header 高さで再計算していること）
- B-5: モバイルのスクリーンショット機能で、相性値は写り保存ボタンは写らない
- B-6: 作業枠タブバー・ホーム画面遷移・作業枠切替と干渉しない

### C. 回帰

- C-1: 通常馬のみの配合で、選択・削除・メモ・手動クロス・保存・復元・リセットが従来どおり
- C-2: 旧保存データ（kind なし configs）が一覧に「配合」バッジで表示され、復元できる
- C-3: モバイルの馬選択ダイアログ（IME・フリック検索含む）に変化がない

---

## 12. 未確定・実装時の要確認事項

1. **§4.3 のマッピング検証**（A-3）で1件でもズレた場合は、実装を止めて相違内容を報告する（マッピング表か本体エンジンのどちらが正か、人間が判断する）。
2. 保存済み☆馬の因子は後から変更できない仕様（決定事項 #6）。ゲーム内で仔の因子が確定した後に反映したい場合は「保存し直し」になる。この UX で問題ないかはリリース後にユーザー判断（実装時の対応不要。ダイアログの説明文で明示する）。
3. `customHorses` に保存件数の上限は設けない（configs の一覧表示は既存どおり最新15件）。候補リストが増えすぎた場合の整理 UI は将来課題。
4. 相性値の計算仕様は未定。`affinity.js` の `calculateAffinity(context)` が唯一の差し込み口になるよう保つこと。
