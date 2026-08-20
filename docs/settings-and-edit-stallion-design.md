# 設定画面・エディット種牡馬（登録・編集・削除）詳細設計書 v1.1

改訂履歴: v1.0 初版 → v1.1 未決事項7件をユーザー確認のうえ確定（§9）、因名3文字・直下挿入・上限100件を本文へ反映（2026-07-12）。

## 0. このドキュメントの位置づけ

`docs/dabifaku_unified_spec_draft.md`（統合版実装仕様書、以下「統合版仕様」）の**追補機能**の詳細設計である。対象ブランチは `feature/dabifaku-unified`。統合版（カテゴリ・作業枠・ホーム画面）が実装済みであることを前提とする。

本設計は 2026-07-12 時点の現行コードと照合済みであり、参照している行番号・メソッド名はその時点のものである。実装時にズレていた場合はメソッド名で検索して特定すること。

### 0.1 実装時の原則（統合版仕様 §0.3 を継承）

- 確定事項は本ドキュメントに従う。現行実装と本設計に矛盾を見つけた場合は、勝手に解釈せず報告する。
- 新規ファイルは IIFE + `window.Dabimas` 名前空間、classic script、UTF-8 BOM なし。
- Vue 2 / Vuetify 2 を維持。新規ライブラリを追加しない。
- 新規ファイルは `index.html` の script タグと `service-worker.js` の precache リストの両方へ追加し、service worker の CACHE_VERSION を上げる。

### 0.2 要件（ユーザー指示の原文サマリ）

1. 設定画面を追加する。
2. 設定メニューのひとつとして「エディット種牡馬」の登録・編集・削除機能を設ける。
3. エディット種牡馬は既存種牡馬をベースに、自身の因子を**最大3つまで**設定できる（例: エルコンドルパサー速速強）。
4. 馬名＋因名（例: 剛健）を付けて保存できる。
5. 馬名（ベース馬）は**既存種牡馬からしか選べない**。
6. 因名は自由入力可能。ただし候補として既存の因名も選択できる（＝自由入力できるドロップダウン）。
7. エディット種牡馬であることを示すマークを付ける。

---

## 1. 現状の事実（コード照合済み・実装前に必ず読むこと）

| 事実 | 根拠 |
|---|---|
| 馬 summary は `{ id, detailChunk, name, ruby, subName, nature, sex, parentLine, son, factors[3] }`。既存の「因名」は **`subName`** に入っている（例: `アイアンリージ` + `巌瓏`、因子 `["強","長","長"]`）。因名でなく生年（`1979` / `20XX`）が入っている馬もいる | `json/dabimasFactor.summary.json`、`vue/app/methods/horse-loading.js:25-40` `normalizeHorseSummary` |
| 因子コードは全14種: 短(01) 速(02) 底(03) 長(04) 適(05) 丈(06) 早(07) 晩(08) 堅(09) 難(10) 走(11) 中(12) 強(13) 雷(14)。因子バッジの色は `f{code}` CSS クラス | `vue/constants/factor-definitions.js:10-26`、`vue/logic/horses/horse-search.js:95-111` `getHorseFactorBadges` |
| ★自作馬の手動因子は「短速底長堅難から最大2個」だが、既存馬データの因子には**同一因子の重複**（例: `["長","長","底"]`）や `強` などの全種が現れる。エディット種牡馬の因子は既存馬データ準拠（全14種・重複可・最大3個）とする | `vue/constants/factor-definitions.js:29`、summary データの実測 |
| 候補リストは `buildHorseLists()` が summary から `horses` / `stallions` / `broodmares` を構築し `horseDataLists` として全セルへ渡す。リセット（`initializer`）と復元（`restoreInputData`）で base 配列から作り直される | `vue/app/methods/horse-loading.js:42-57`、`vue/app/methods/bootstrap.js` |
| 選択時の血統 detail（descendants 15件）は `ensureHorseDetail()` が解決する。分岐は (1) descendants 同梱済み → そのまま (2) `source: "custom"` / `customHorseId` → IndexedDB (3) 通常馬 → `detailChunk` + `id` で static JSON chunk から取得 | `vue/app/methods/horse-loading.js:129-202` |
| 表示名は `getHorseBaseText()` = `[nature先頭1文字]` + `name` + `subName` の連結。検索インデックス（`getHorseSearchIndexText`）もこれを含む | `vue/logic/horses/horse-search.js:59-92` |
| クロス（インブリード）判定は **`name` の完全一致**で行う（`stallion.name === broodmare.name`）。`subName` は比較に使われない。★始まりの名前は判定除外。`subName` が `(` で始まり `)` で終わる馬は繁殖牝馬プレースホルダ扱い | `vue/logic/inbreed/inbreed-detector.js:27-41, 280` |
| localStorage `dabimasFactor` へは `descendants` / `searchText` / `displayName` を落とした snapshot が保存される。**それ以外のフィールド（`source` や後述の `baseHorseId` 等）は snapshot に残る** | `vue/app/methods/horse-loading.js:309-338` `stripHorseForStorage` / `persistSelectedToStorage` |
| 統合版 DB は `dabifaku_unified` version 1、ストアは `categories` / `workspaces` / `appMeta` の3つ。`openDB()` は接続キャッシュ付き。`generateUuid()` 公開済み | `vue/logic/storage/unified-db.js:25-147` |
| 画面切替は root の `currentScreen`（`"home"` / `"category"`）による排他表示。ホーム画面は `<home-page v-if="currentScreen === 'home'">`、本体は `v-show="currentScreen === 'category'"`。切替 API は `workspaceSync.switchToCategory()` / `goHome()` | `index.html:53-95`、`vue/logic/workspace-sync.js:85, 356-390` |
| ホーム画面上部は `v-app-bar`（タイトル「ダビふぁく」＋編集モードボタン） | `vue/components/home/home-page.js:113-122` |
| ★始まりの馬だけがセルの「因子」ボタン（手動因子ダイアログ）を出せる | `vue/components/pedigree/pedigree-row.js:228-241` |
| 「配合の種牡馬・繁殖牝馬保存」機能（☆馬）の設計が既にあり、候補リストへの挿入ポイント（buildHorseLists 後・リセット/復元後）を定義している。本機能はその挿入ポイントに相乗りする | `docs/save-as-horse-and-status-bar-design.md` §4.5 |

---

## 2. 設計方針（先に結論）

1. **エディット種牡馬は「ベース馬への参照 + 因名 + 因子3つ」だけを保存する。** 血統（descendants）はコピーしない。選択時はベース馬の detail chunk（static JSON）をそのまま読む。→ IndexedDB には小さなレコード1件で済み、ベース馬データが更新されても血統が古くならない。
2. **`name` はベース馬と同一のまま、因名を `subName` に入れる。** クロス判定は `name` 完全一致なので、エディット種牡馬「エルコンドルパサー剛健」は本家エルコンドルパサーと正しくクロスが成立する。既存の凄馬（アイアンリージ巌瓏 等）と同じ扱いになり、本体ロジックの改修が最小で済む。
3. **エディット種牡馬マークは `name` に埋め込まない。** `source: "edit"` フラグから表示時に付与する（§6）。`name` に記号を足すとクロス判定が壊れるため禁止。
4. **削除してもデータが壊れない。** 配置済みセル・保存済み配合の snapshot に `baseHorseId` / `detailChunk` が残るため、エディット種牡馬レコードを削除しても復元・血統解決は動き続ける。削除の効果は「候補リストから消える」だけ。
5. 保存先は統合版 DB `dabifaku_unified` に新ストア `editStallions` を追加（version 2）。既存 DB `DabifacCombinationDB` には触れない。

---

## 3. データ設計

### 3.1 editStallions レコード（IndexedDB）

`dabifaku_unified` を **version 2** に上げ、ストア `editStallions`（keyPath `id`、index `createdAt`）を追加する。既存3ストアの `onupgradeneeded` は `objectStoreNames.contains` ガード済みなので追記のみでよい。

```ts
type EditStallionRecord = {
  id: string                 // "es_" + generateUuid()
  baseHorseId: string        // ベース種牡馬の summary id（例 "s7985491231"）
  factorName: string         // 因名（例 "剛健"）。表示上は subName になる
  factors: [string, string, string]  // 全14種から重複可で0〜3個。空欄は ""
  createdAt: string          // ISO 8601
  updatedAt: string
}
```

- ベース馬の `name` / `ruby` / `nature` / `parentLine` / `son` / `detailChunk` は**レコードに複製しない**。候補リスト構築時に `horsesBase` から `baseHorseId` で毎回解決する（§3.2）。馬データ JSON が更新されても追従する。
- `baseHorseId` が summary に存在しなくなった場合（データ更新で馬が消えた等）、そのレコードは候補リストに載せず `console.warn` する。設定画面の一覧には「ベース馬不明」として表示し、削除だけ可能にする。

### 3.2 候補リストに載せるサマリオブジェクト

起動時（summary ロード後）と登録・編集直後に、レコードとベース馬 summary から次の形を作って `stallions`（および `horses`）へ挿入する。

```js
{
  id: record.id,                    // "es_..."（v-for キー・snapshot 突き合わせ用）
  source: "edit",                   // エディット種牡馬フラグ（マーク表示・detail解決の分岐キー）
  baseHorseId: record.baseHorseId,  // detail 解決キー
  detailChunk: base.detailChunk,    // ベース馬の chunk 番号
  name: base.name,                  // ベース馬と同一（クロス判定のため改変禁止）
  ruby: base.ruby,
  subName: record.factorName,       // 因名
  nature: base.nature,
  sex: "0",
  parentLine: base.parentLine,
  son: base.son,
  factors: record.factors,          // エディット因子（因子集計・バッジ表示に自動反映）
}
```

- 挿入位置は **ベース馬の直下**（決定事項3）。例: エルコンドルパサーの直後にエルコンドルパサー剛健が並ぶ。実装は `Map<baseHorseId, editSummary[]>`（同一ベース馬内は `createdAt` 昇順）を作り、`stallionsBase` から `stallions` を構築する際に各ベース馬の直後へ splice する。`horses`（牡牝混合リスト）にも同じ規則で挿入する。
- `Object.freeze` して挿入する（既存 summary と同じ扱い。検索インデックスの WeakMap キャッシュが効く）。
- リセット（`initializer`）・復元（`restoreInputData`）で `stallionsBase` から候補を作り直す箇所でも同じ挿入を行う。☆馬設計が導入する共通挿入ヘルパー（root app 側）にエディット分も乗せる。

### 3.3 localStorage snapshot と復元

`stripHorseForStorage` は `descendants` / `searchText` / `displayName` しか落とさないため、`source: "edit"` / `baseHorseId` / `detailChunk` / `factors` は snapshot にそのまま残る。**復元・detail 解決にエディット種牡馬レコード自体は不要**（§2-4 の削除耐性はこれによる）。

### 3.4 detail（descendants）解決

`ensureHorseDetail()`（`vue/app/methods/horse-loading.js:129`）に分岐を1つ追加する。位置は「(2) 自家製馬」の**前**（custom 判定より先。ただし descendants 同梱済み判定 (1) より後）:

```
(1.5) エディット種牡馬: horse.source === "edit" && horse.baseHorseId
      → fetchHorseDetailChunk(horse.detailChunk)
      → detailMap.get(horse.baseHorseId) の descendants で hydrate
      → 見つからなければ findSummaryHorse を name+sex で再解決して1回だけリトライ
        （通常馬経路 (3) の再解決と同じ考え方。detailChunk 欠落した旧 snapshot 対策）
```

失敗時は既存の `notifyHorseDetailError` に乗る（セルは保持・再選択可能）。

### 3.5 因名候補リスト

因名ドロップダウンの候補は、summary ロード済みの `stallionsBase` から次の条件で抽出して重複排除・昇順ソートしたもの:

- `subName` が空でない
- `/^[0-9]{4}$/`（生年）と `20XX` に一致しない
- `(` で始まり `)` で終わらない（繁殖牝馬プレースホルダ形式の除外）

登録済みエディット種牡馬の `factorName` も候補に加える（自分が過去に作った因名を再利用できる）。

---

## 4. 設定画面

### 4.1 画面遷移

- `currentScreen` に新しい値 **`"settings"`** を追加する。`index.html` に `<settings-page v-if="currentScreen === 'settings'">` を追加（home-page と同じ排他パターン）。
- **入口: ホーム画面の app-bar 右端に歯車アイコン**（`mdi-cog`、`aria-label="設定"`）。クリックで `currentScreen = "settings"` へ。
- 設定画面の app-bar 左端に戻るボタン（`mdi-arrow-left`）。クリックで `currentScreen = "home"` へ戻る。
- **`"settings"` は起動画面として永続化しない。** `workspaceSync` の appMeta 保存経路（`resolvedInitialScreen`）には乗せず、root の `currentScreen` を直接切り替えるだけにする。リロード時は従来どおり home / category に復帰する。

### 4.2 画面構成

```
┌──────────────────────────────┐
│ ← 設定                        │  app-bar
├──────────────────────────────┤
│ ▸ エディット種牡馬             │  v-list（設定メニュー）
│   登録・編集・削除              │
│ （将来のメニューはここに追加）    │
└──────────────────────────────┘
```

- 設定画面本体は**メニュー一覧**（`v-list`）。今回はメニュー項目1つだが、後続の設定項目を足せる骨格にする。
- メニュー「エディット種牡馬」をタップすると、同画面内でエディット種牡馬管理ビューへ切り替える（`settings-page` 内のローカル state `activeMenu` で切替。画面遷移階層は増やさない）。管理ビューの app-bar 戻るはメニュー一覧へ戻る。

### 4.3 エディット種牡馬管理ビュー

```
┌──────────────────────────────┐
│ ← エディット種牡馬       [＋登録] │
├──────────────────────────────┤
│ [E] エルコンドルパサー剛健        │
│     速 速 強          [編集][削除]│
│ [E] キングカメハメハ闘魂         │
│     底 底             [編集][削除]│
│ （0件時: 空状態メッセージ＋登録ボタン）│
└──────────────────────────────┘
```

- 一覧は `createdAt` 昇順。各行: エディットマーク（§6）＋ ベース馬名＋因名 ＋ 因子バッジ（既存の `getHorseFactorBadges` / `f{code}` クラスを流用）＋ 編集・削除ボタン。
- ベース馬不明レコード（§3.1）は打ち消し表示＋「ベース馬が見つかりません」で、削除のみ可能。
- 削除は確認ダイアログを挟む: 「「エルコンドルパサー剛健」を削除しますか？ 血統表や保存済みの配合に配置済みのものはそのまま残ります。」

### 4.4 登録・編集ダイアログ

| 項目 | UI | 仕様 |
|---|---|---|
| ベース種牡馬 | `v-autocomplete` | 候補は `stallionsBase`（`source: "base"` のみ）。☆保存馬・他のエディット種牡馬は選べない（要件5）。表示・検索は既存の `filterHorse` / `getHorseBaseText` を流用。**編集時は変更不可**（変更したい場合は削除して作り直す） |
| 因名 | `v-combobox` | 自由入力＋候補選択（§3.5 のリスト）。バリデーションは下記 |
| 因子1〜3 | `v-select` ×3 | 各ドロップダウンに「なし」＋全14因子（短速底長適丈早晩堅難走中強雷）。**同じ因子を複数のドロップダウンで選択可**（速速強を実現）。選択済み因子は `f{code}` 色チップで表示 |

因名バリデーション:

- 必須（エディット種牡馬は必ず因名を持つ。本家馬との表示上の区別・重複回避のため）
- 最大3文字（決定事項2）
- `★` / `☆` で始まらない（自作馬・保存馬の判定記号と衝突するため）
- `(` で始まり `)` で終わる形式は不可（繁殖牝馬プレースホルダ判定と衝突するため）
- 同一ベース馬＋同一因名の登録済みエディット種牡馬と重複しない
- ベース馬の既存バリエーションと `name`＋`subName` が一致しない（例: アイアンリージに因名「巌瓏」は不可。`findSummaryHorse` の name+subName フォールバック解決の誤爆防止）

因子は0個でも保存可（因子なしのエディット種牡馬を許す。ドロップダウン初期値は「なし」）。

保存時の動き:

```
(0) 新規登録時のみ: 登録済み件数が100件に達していたらエラー
    「エディット種牡馬は100件まで登録できます」（決定事項4。編集・削除は件数に関係なく可能）
(1) バリデーション（上記）
(2) editStallionRepository.save(record)   // 新規は "es_" id 採番、編集は updatedAt 更新
(3) 候補リスト再構築（§3.2 の挿入をやり直す）
(4) トースト「「エルコンドルパサー剛健」を保存しました」
```

### 4.5 編集・削除の反映範囲（重要・ユーザー向け文言にも反映する）

- 登録・編集・削除は**候補リストに即時反映**される。
- **配置済みセル・保存済み配合・作業枠内の snapshot は選択時の内容のまま**（因子を編集しても、既に血統表に置いた馬の因子は変わらない。反映したければ選択し直す）。これは☆保存馬（保存時の因子で固定）と同じポリシー。
- 削除してもそれらの snapshot は壊れない（§3.3）。

---

## 5. 新規リポジトリ `vue/logic/storage/edit-stallion-repository.js`

`category-repository.js` / `workspace-repository.js` と同じ流儀（`unifiedDb.openDB()` を使い、Promise を返す薄い CRUD）。

```
loadAll()            → Promise<EditStallionRecord[]>   // createdAt 昇順
save(record)         → Promise<EditStallionRecord>     // put（新規/更新兼用）。id 未設定なら採番
remove(id)           → Promise<void>
```

Vue state への反映・候補リスト再構築は呼び出し側（settings コンポーネント → root app のメソッド）の責務。IndexedDB 操作はこのファイルに閉じる。

---

## 6. エディット種牡馬マーク（要件7）

判定キーは `horse.source === "edit"`。`name` フィールドは一切改変しない（§2-3）。

1. **表示名**: `getHorseBaseText()`（`vue/logic/horses/horse-search.js:59`）で `source === "edit"` のとき先頭に `[E]` を付ける（凄馬の `[情]` 等の natureTag と同じ流儀。natureTag と併存する場合は `[E]` を先頭に置く）。これで候補リスト・セル表示・検索インデックス（「E」で検索してエディット種牡馬を絞り込める）に一括反映される。
2. **候補リスト・管理ビューの行**: `x-small` の `v-chip`（例: label「E」、独自色）を併記する。チップの CSS は `css/unified.css` に追加。

注意: `getHorseBaseText` は WeakMap キャッシュ（検索インデックス側）を通るが、候補オブジェクトは freeze 済みで内容不変のためキャッシュ整合性の問題はない。

---

## 7. 既存機能との相互作用（確認済み事項）

| 機能 | 挙動 |
|---|---|
| クロス判定 | `name` がベース馬と同一なので本家・他バリエーションと正しくクロス成立。★除外・プレースホルダ判定にも掛からない（因名バリデーションで担保） |
| 因子集計 | 候補オブジェクトの `factors` がそのまま集計に乗る（既存馬と同経路）。追加実装なし |
| 手動因子ダイアログ | `name` が ★ 始まりでないため因子ボタンは出ない＝登録時の因子で固定。仕様どおり |
| 深い世代への配置 | `★N薄め` 自動生成は name+subName ベースで動くため `★１薄めエルコンドルパサー剛健` となる。既存凄馬と同じ挙動 |
| ☆保存（配合の種牡馬・繁殖牝馬保存） | 保存レコードの descendants はセルの factors をコピーするため、エディット因子ごと保存される。自然な挙動 |
| 検索（PC autocomplete / ケータイ検索ダイアログ） | 同じ `filterHorse` を通るため馬名・因名・「E」で検索可能。追加実装なし |
| 配合保存/復元（旧 configData） | snapshot 完結（§3.3）のため復元可能。エディット種牡馬レコード削除後も壊れない |

---

## 8. 変更ファイル一覧

**新規**

| ファイル | 内容 |
|---|---|
| `vue/components/settings/settings-page.js` | 設定画面（メニュー一覧＋画面骨格、`activeMenu` 切替） |
| `vue/components/settings/edit-stallion-manager.js` | エディット種牡馬の一覧・登録編集ダイアログ・削除確認 |
| `vue/logic/storage/edit-stallion-repository.js` | editStallions ストアの CRUD（§5） |

**改修**

| ファイル | 変更点 |
|---|---|
| `vue/logic/storage/unified-db.js` | DB_VERSION 1→2、`editStallions` ストア追加（keyPath `id`、index `createdAt`）、ストア名定数の公開 |
| `vue/app/methods/horse-loading.js` | `ensureHorseDetail` にエディット分岐（§3.4）。エディット候補の構築・挿入ヘルパー（☆馬設計 §4.5 の挿入ポイントと共通化） |
| `vue/logic/horses/horse-search.js` | `getHorseBaseText` に `[E]` マーク（§6-1） |
| `vue/app/app-state.js` | エディット種牡馬一覧の state（`editStallions: []` 等） |
| `vue/components/home/home-page.js` | app-bar に設定（歯車）ボタン |
| `index.html` | `<settings-page v-if="currentScreen === 'settings'">`、新規 script タグ3本（統合版ブロック `vue/logic/workspace-sync.js` の後） |
| `service-worker.js` | precache に新規3ファイル追加、CACHE_VERSION bump |
| `css/unified.css` | 設定画面・エディットマークチップのスタイル |

**変更しないもの**: `vue/logic/storage/combination-storage.js`（既存 DB）、`vue/logic/inbreed/*`、`vue/factor-dialog.js`、`vue/logic/pedigree/*`。

---

## 9. 決定事項（2026-07-12 ユーザー確認済み）

v1.0 時点の未決事項7件はすべてユーザー確認のうえ以下のとおり確定した。本文（§3.2・§4.4・§6）はこの内容を反映済み。

| # | 事項 | 決定 |
|---|---|---|
| 1 | マークの見た目 | **「E」で確定**。表示名接頭辞 `[E]` ＋ 候補リスト・管理ビュー行に「E」チップ（§6） |
| 2 | 因名の最大文字数 | **3文字**（§4.4 バリデーション） |
| 3 | 候補リスト内の並び位置 | **ベース馬の直下に並べる**（エルコンドルパサーの直後にエルコンドルパサー剛健。§3.2） |
| 4 | 登録件数の上限 | **100件**。新規登録時にチェック、編集・削除は制限なし（§4.4 保存フロー(0)） |
| 5 | ベース馬の選択範囲 | **全種牡馬**（`stallionsBase` 全件。凄馬・因名付きバリエーションも選択可） |
| 6 | エディット繁殖牝馬 | **やらない**（種牡馬のみ）。将来必要になればスキーマに `sex` を足すだけで対応可能 |
| 7 | 設定画面の入口 | **ホーム画面の歯車アイコンのみ**（§4.1） |
