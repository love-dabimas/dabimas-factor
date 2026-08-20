# 作業指示書: 設定画面・エディット種牡馬（登録・編集・削除）

- status: 完了（2026-07-22 検収済み。実機・実画面の操作確認は残（検収記録参照））
- 作成日: 2026-07-22
- 依頼元: Claude Code セッション

## 背景と目的

- **詳細設計は `docs/settings-and-edit-stallion-design.md`（v1.1）を正とする**。全文（特に §1 現状の事実 → §2 設計方針 → §3 データ設計 → §4 設定画面 → §6 マーク → §8 変更ファイル一覧 → §9 決定事項）を読むこと。矛盾は勝手に解釈せず実装を止めて完了報告に書く。
- ただし同設計書は **2026-07-12 時点**のコード照合であり、その後に 3 件の実装（`docs/codex-work-orders/` の検収済み指示書 3 枚: ☆馬保存＋ステータスバー／系統ID・レア度付与／相性ニックス表示）が入っている。**下記「設計書からの差分（必読）」が設計書に優先する**。設計書内の行番号はズレているため、メソッド名で検索して特定すること（設計書 §0 の指示どおり）。

## 設計書からの差分（必読。2026-07-22 時点の実装との整合）

1. **候補リストへの挿入は `refreshCandidateLists()` に統合する**。設計書 §3.2 の「☆馬設計が導入する共通挿入ヘルパー」は `vue/app/methods/horse-loading.js` の `refreshCandidateLists(horseExtras, broodmareExtras)` として実装済みで、`buildHorseLists` / `restoreInputData` / `initializer` / ☆馬の作成・削除ハンドラから呼ばれている。エディット種牡馬の挿入（ベース馬の直下・同一ベース内 `createdAt` 昇順）は、この中で base 配列を展開する純関数ヘルパー（例 `insertEditStallions(baseList)`）として実装し、`horses` と `stallions` の base 部分に適用する。並び順の全体像: **☆保存馬（先頭）→ base 馬（各ベース馬の直下にエディット種牡馬）→ 選択由来 extras（末尾）**。broodmares にはエディット種牡馬を入れない（種牡馬のみ。設計書 §9-6）。
2. **エディット種牡馬 summary にベース馬の `rare` / `sonId` / `parentLineId` を継承させる**（設計書 §3.2 のオブジェクトに 3 フィールド追加）。設計書執筆後に相性ニックス表示（統合版仕様 §25）が実装され、`selected[0].rare` と `sonId` が相性計算の入力になった。エディット種牡馬は「ベース馬の因子違い」なのでレア度・系統はベース馬と同一とする。これによりエディット種牡馬を種牡馬セルに置いても相性文言が出る。`stripHorseForStorage` はこれらを落とさないので snapshot 経由でも保持される。
3. **service worker の定数名は `CACHE_NAME`**（設計書 §0.1 の「CACHE_VERSION」は誤記）。現在 `v20260705-04`。新規 3 ファイルを `urlsToCache` へ追加し、bump は **1 回だけ**（→ `-05`）。
4. `getHorseBaseText()`（`vue/logic/horses/horse-search.js`）の現在形は `natureTag + name + subName`。`[E]` は **natureTag より前**に置く（設計書 §6-1 と同じ）。
5. 画面切替の実装パターン: `workspaceSync` が `window.__debugAppInstance` 経由で `root.currentScreen` を代入している（`vue/logic/workspace-sync.js` の `setScreen`）。設定画面は永続化しない（設計書 §4.1）ため **workspaceSync には触れず**、home-page の歯車ボタンは `this.$root.currentScreen = "settings"`、settings-page の戻るは `this.$root.currentScreen = "home"` を直接代入する（両コンポーネントとも root テンプレート直下なので `$root` で届く）。
6. `dabifaku_unified` の version 1→2 bump に伴い、`unified-db.js` の `DB_VERSION` を単一定義元のまま上げる（利用側は全て `openDB()` 経由なので他ファイルの変更不要）。SW キャッシュの新旧 JS 混在時に旧 JS（v1 指定）が `VersionError` になり得るが、`CACHE_NAME` bump で precache が入れ替わるため許容する（統合版仕様 §5.5 と同じ整理。対策コードは書かない）。

## 実装方針

設計書 §8 の変更ファイル一覧に従う。実装順の推奨:

1. `vue/logic/storage/unified-db.js` — DB_VERSION 2、`editStallions` ストア（keyPath `id`、index `createdAt`）。既存 store 作成は `contains` ガード済みなので追記のみ。
2. `vue/logic/storage/edit-stallion-repository.js` — 新規。`category-repository.js` と同じ流儀で `loadAll()` / `save(record)` / `remove(id)`（設計書 §5）。id 採番は `"es_" + unified-db の generateUuid()`。
3. `vue/app/methods/horse-loading.js` — エディット summary 構築（設計書 §3.2 ＋ 差分 2 の 3 フィールド）・`insertEditStallions()` ヘルパー・`refreshCandidateLists()` への組み込み・`loadEditStallions()`（起動時ロード。`dbinitializer()` で ☆馬ロードと同様に並行実行し、候補合成前に反映）・`ensureHorseDetail()` のエディット分岐（設計書 §3.4: descendants 同梱判定の後・custom 判定の前。`fetchHorseDetailChunk(horse.detailChunk)` → `baseHorseId` で hydrate → 失敗時 `findSummaryHorse` で 1 回再解決 → だめなら既存 `notifyHorseDetailError` 経路）。
4. `vue/logic/horses/horse-search.js` — `getHorseBaseText` に `source === "edit"` の `[E]` 接頭辞。
5. `vue/app/app-state.js` — `editStallions: []`（レコード一覧）等の state 追加。
6. `vue/components/settings/settings-page.js` / `edit-stallion-manager.js` — 新規（設計書 §4.2〜4.5。メニュー一覧＋管理ビュー切替は `activeMenu` ローカル state、登録・編集ダイアログのバリデーション §4.4、削除確認文言 §4.3、100 件上限 §4.4-(0)、ベース馬不明レコードの扱い §3.1）。因名候補は設計書 §3.5。
7. `vue/components/home/home-page.js` — app-bar 右端に歯車（`mdi-cog`、`aria-label="設定"`）。
8. `index.html` — `<settings-page v-if="currentScreen === 'settings'">`（home-page と同じ排他パターン）＋ script タグ 3 本（統合版ブロックの `workspace-sync.js` の後）。
9. `css/unified.css` — 設定画面・「E」チップのスタイル追記。
10. `service-worker.js` — precache 3 件追加＋ `CACHE_NAME` bump（差分 3）。

## 制約

- `AGENTS.md` の Safety Rules に従うこと（`index.html` は apply_patch 限定・編集前 backup・編集後 verify・BOM 禁止）。
- 新規 JS は classic script（IIFE + `window.Dabimas`）、UTF-8 BOM なし。Vuetify 2 の既存コンポーネントの流儀（home-page.js 等）に合わせる。
- **`name` フィールドを一切改変しない**（クロス判定が `name` 完全一致のため。マークは `source: "edit"` からの表示時付与のみ。設計書 §2-3 / §6）。
- 設計書 §8「変更しないもの」を厳守: `combination-storage.js`・`vue/logic/inbreed/*`・`vue/factor-dialog.js`・`vue/logic/pedigree/*`。加えて `vue/logic/nicks/*`・`vue/logic/theory/affinity.js`・`vue/CombinationDialog.js`・スクレイパー・`json/` 配下・`data/`・`assets/` にも触れない。
- `workspaceSync` の appMeta 永続化経路（`resolvedInitialScreen`）に `"settings"` を乗せない（差分 5）。
- 因名バリデーション 6 項目（設計書 §4.4）を省略しない。
- git の commit / branch / restore / stash 操作を一切行わない。`tmp/json-backup-20260718/` に触れない。

## スコープ外（やらないこと）

- エディット繁殖牝馬（設計書 §9-6）。
- 設定画面への他メニュー追加（骨格だけ用意）。
- 既存エディット類似機能（★手動因子・☆保存馬）の仕様変更。
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

1. `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp index.html` が `[verify] OK`。
2. **挿入ヘルパーの Node 検証**（`tmp/edit-stallion-verify/` にスクリプトを置く）: ダミー base 配列＋エディット summary 群で (a) 各エディット種牡馬がベース馬の**直後**に入る、(b) 同一ベース馬内は `createdAt` 昇順、(c) ベース馬不明レコードは挿入されず警告される、(d) エディット summary が `rare` / `sonId` / `parentLineId` をベース馬から継承している、(e) broodmares 側に混入しない、を機械確認。
3. **バリデーションの Node 検証**: 因名の 6 ルール（必須／3 文字以内／★☆開始禁止／`(…)` 形式禁止／同一ベース＋同一因名の重複禁止／既存馬の name+subName との衝突禁止）と 100 件上限が、それぞれ正しく reject されることを機械確認（バリデーション関数を純関数として切り出してテスト可能にすること）。
4. **`getHorseBaseText` / `ensureHorseDetail` の Node 検証**: `source: "edit"` で `[E]` が natureTag より前に付くこと、エディット分岐が `fetchHorseDetailChunk`（モック）→ `baseHorseId` hydrate で descendants を解決し、custom 分岐に落ちないことを機械確認。
5. `python -m pytest -q` が全件成功（回帰）。
6. ローカル配信＋`dump-dom`（390×844、VirtualTimeBudget 30000。**空出力・マウント前 DOM のときは再試行**）で、マウント済み DOM のホーム app-bar に歯車ボタン（`mdi-cog`）が存在し、ReferenceError / TypeError がないこと。※settings-page は `v-if` のため初期 DOM に無くてよい。
7. `service-worker.js` に 3 件追加・`CACHE_NAME` が `v20260705-04` から 1 回だけ bump されている。
8. 設計書 §4（画面仕様）・§4.5（反映範囲）・§7（相互作用表）の各項目について、完了報告に「実装箇所」「確認方法と結果」を記録。ヘッドレスで操作再現できない項目（設定画面の実操作・登録→血統表配置→クロス成立・相性文言・PWA 再起動後の永続化など）は「未検証（検収時に確認）」と明記 — 無言のスキップ不可。

## 検証コマンド

```powershell
# index.html 編集前（必須）
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 backup-index-exp index.html

# index.html 編集後（必須）
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp index.html

# Node 検証（受け入れ基準 2〜4）
node tmp\edit-stallion-verify\insertion-check.mjs
node tmp\edit-stallion-verify\validation-check.mjs
node tmp\edit-stallion-verify\detail-check.mjs

# 既存回帰
python -m pytest -q

# 起動回帰（リポジトリルートで配信してから）
python -m http.server 8080
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 dump-dom http://localhost:8080/index.html 390 844 30000
```

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。

### 変更ファイル一覧

- データ・候補合成
  - `vue/logic/storage/unified-db.js`
  - `vue/logic/storage/edit-stallion-repository.js`（新規）
  - `vue/app/app-state.js`
  - `vue/app/methods/horse-loading.js`
  - `vue/logic/horses/horse-search.js`
- 設定画面・候補表示
  - `vue/components/settings/settings-page.js`（新規）
  - `vue/components/settings/edit-stallion-manager.js`（新規）
  - `vue/components/home/home-page.js`
  - `vue/components/pedigree/desktop-horse-autocomplete.js`
  - `vue/components/pedigree/mobile-horse-picker.js`
  - `css/unified.css`
  - `index.html`
- 配信・検証
  - `service-worker.js`
  - `tmp/edit-stallion-verify/insertion-check.mjs`（新規）
  - `tmp/edit-stallion-verify/validation-check.mjs`（新規）
  - `tmp/edit-stallion-verify/detail-check.mjs`（新規）
  - `tmp/edit-stallion-verify/settings-harness.html`（新規、設定画面マウント確認用）
  - `docs/codex-work-orders/2026-07-22-settings-edit-stallion.md`（本完了報告）

### 設計判断

- `refreshCandidateLists()` 内で base 配列を `insertEditStallions()` に通し、`☆保存馬 → base馬（直下にE馬）→ 選択由来extras` を維持した。broodmares は base のままとし、E馬を挿入しない。
- E馬 summary は `name` を一切変えず、`source: "edit"` と `subName` で表示を分けた。`rare` / `sonId` / `parentLineId` はベース馬から継承する。
- detail は descendants 同梱判定の直後・custom 判定の前に E馬分岐を置いた。`detailChunk + baseHorseId` で取得し、失敗時は summary のベース馬を再解決して1回だけ再試行する。
- バリデーションは `edit-stallion-manager.js` の純関数 `validateEditStallionInput()` として公開し、UIとNode検証で同じ実装を使用した。
- 通常経路の `stallionsBase` は `source: "base"` だが、full JSON フォールバックでは `source` がないため、候補判定は `custom` / `edit` を明示除外する形にした。
- 現行のPC候補コンポーネントは `getHorseBaseText()` を使わず独自に表示名を組み立てていたため、§6を満たす目的でPC・モバイル候補行にもEチップを追加し、PC表示名を共通関数へ統合した。
- 設定画面の切替は `$root.currentScreen` の直接代入だけとし、`workspaceSync` と appMeta の永続化経路は変更していない。
- `CACHE_NAME` は `v20260705-04` から `v20260705-05` へ1回だけ上げた。
- `code-review` の Standards / Spec 2軸でセルフレビューした（サブエージェントは明示依頼がないため未使用）。候補一覧のE表示漏れをレビュー中に検出・修正し、修正後は追加指摘なし。

### 実行した検証と結果

- `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 backup-index-exp index.html`
  - 成功。`index.bak.20260722-101901.html` を作成。
- `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp index.html`
  - `[verify] OK`（編集直後と最終コードで確認）。
- `node tmp\edit-stallion-verify\insertion-check.mjs`
  - `[insertion-check] OK`。直下挿入、createdAt昇順、不明ベース警告、3フィールド継承、broodmares非混入、`name` 非改変、freeze を確認。
- `node tmp\edit-stallion-verify\validation-check.mjs`
  - `[validation-check] OK`。因名6ルール、100件上限、編集時の自レコード除外を確認。
- `node tmp\edit-stallion-verify\detail-check.mjs`
  - `[detail-check] OK`。`[E]` が natureTag より前、E馬分岐が custom より先、古いchunkから `baseHorseId` で再解決できることを確認。
- 変更JSの `node --check`
  - 全件成功。
- scoped `git diff --check` と新規ファイルの末尾空白・UTF-8 BOM確認
  - 対象変更は問題なし。新規JS/MJS/HTMLはすべてBOMなし。
- `python -m pytest -q`
  - `13 passed in 2.14s`。
- ローカル配信 + `dump-dom`（390×844、VirtualTimeBudget 30000）
  - 既存8080オリジンは旧SW静的キャッシュが残っていたため、配信内容が新コードであることをHTTPで確認後、fresh origin の8081で最終確認した。
  - ホーム: DOM length 61461、`mdi-cog=1`、`aria-label="設定"=1`、ReferenceError 0、TypeError 0。
  - 設定ハーネス: メニューを開いて管理ビュー・登録ダイアログまでマウント。`SETTINGS_DIALOG_OK=1`、ベース種牡馬／因名／因子1〜3を確認、ReferenceError 0、TypeError 0。
- `service-worker.js` 静的確認
  - 新規3ファイルを precache に追加済み。`CACHE_NAME` は `v20260705-05`。

### 設計書 §4 / §4.5 / §7 チェックリスト

#### §4 設定画面

- §4.1 画面遷移
  - 実装箇所: `home-page.js`、`settings-page.js`、`index.html`、`app-state.js`。
  - 確認: fresh origin のホームDOMで歯車を確認。ハーネスで `currentScreen="settings"` へ切替後に設定メニューをマウント。戻る処理と非永続化はコード確認。リロード時にホームへ戻ることはfresh originの初期DOMで確認。
- §4.2 画面構成
  - 実装箇所: `settings-page.js` の `activeMenu` と `v-list`。
  - 確認: ハーネスでメニュー項目をクリックし、エディット種牡馬管理ビューへ切替成功。
- §4.3 管理ビュー
  - 実装箇所: `edit-stallion-manager.js` の一覧、空状態、ベース馬不明行、編集・削除、削除確認ダイアログ。
  - 確認: 空状態と登録ボタンはDOM確認。createdAt昇順・不明ベース判定はNode/コード確認。
  - 未検証（検収時に確認）: 実データ行の表示、編集ボタン、削除確認文言、削除実行の一連の実操作。
- §4.4 登録・編集ダイアログ
  - 実装箇所: `edit-stallion-manager.js`。ベース馬autocomplete、自由入力combobox、全14因子×3、因子重複可、純関数バリデーション、100件上限。
  - 確認: ダイアログと全入力欄をDOM確認。6バリデーション＋100件上限をNode確認。
  - 未検証（検収時に確認）: 実ブラウザでのautocomplete検索、因子色チップ操作、IndexedDBへの登録・編集成功トースト。

#### §4.5 編集・削除の反映範囲

- 実装箇所: root の `saveEditStallion()` / `removeEditStallion()` が保存後に `refreshCandidateListsFromSelection()` を呼ぶ。配置済みセルは選択由来extrasのsnapshotをそのまま残す。削除時も配置済みsnapshotには触れない。
- 確認: 挿入Node検証で候補再構築を確認。`stripHorseForStorage()` が `source` / `baseHorseId` / `detailChunk` / `factors` を保持することをコード確認。
- 未検証（検収時に確認）: 登録・編集・削除→候補リスト即時反映、既配置セルの因子不変、保存済み配合・作業枠snapshot不変、削除後の既配置セルdetail再解決の実操作。

#### §7 既存機能との相互作用

- クロス判定
  - 実装箇所: E馬 summary の `name: baseHorse.name`。クロスロジック自体は未変更。
  - 確認: 挿入Node検証で `name` 非改変を確認。
  - 未検証（検収時に確認）: E馬を血統表へ配置して本家・他バリエーションとのクロス成立を実画面確認。
- 因子集計
  - 実装箇所: E馬 summary の `factors`。既存集計ロジックは未変更。
  - 確認: summaryへの因子反映と因子バッジ経路をNode/コード確認。
  - 未検証（検収時に確認）: 配置後の因子集計数を実画面確認。
- 手動因子ダイアログ
  - 実装箇所: `name` を★始まりにせず、既存表示条件を維持。
  - 確認: `name` 非改変をNode確認。
  - 未検証（検収時に確認）: E馬セルに因子ボタンが出ないことを実画面確認。
- 深い世代への配置
  - 実装箇所: `name + subName` の既存経路を維持。対象ロジックは未変更。
  - 未検証（検収時に確認）: `★N薄め...` 表示を実画面確認。
- ☆保存
  - 実装箇所: E馬の hydrated snapshot に因子・descendantsを保持。☆保存処理は未変更。
  - 未検証（検収時に確認）: E馬を配置して☆保存し、因子込みで再選択できることを実画面確認。
- 検索
  - 実装箇所: `getHorseBaseText()` の `[E]`、PC/モバイル候補のEチップ、既存 `filterHorse()` 経路。
  - 確認: Nodeで `[E][nature]name+subName` を確認。候補コンポーネントのマウント時に例外なし。
  - 未検証（検収時に確認）: 登録後に馬名・因名・「E」で絞り込む実操作。
- 配合保存/復元（旧configData）・PWA再起動後の永続化
  - 実装箇所: 既存snapshot経路を維持し、IndexedDB version 2の `editStallions` を起動時ロード。
  - 確認: DBスキーマ、repository、起動時並列ロード、snapshot保持フィールドをコード確認。
  - 未検証（検収時に確認）: 登録→PWA再起動→候補復元、E馬レコード削除後の旧snapshot復元を実機確認。

### 残課題・気づき

- 上記で「未検証（検収時に確認）」とした実ブラウザ／実機の一連操作は検収時に確認が必要。
- リポジトリ全体の `git diff --check` は、今回のスコープ外で既存変更の `scripts/build_dabimas_stream.py` にある末尾空白を検出する。今回の変更ファイルに限定したチェックは成功しており、同ファイルは指示どおり変更していない。
- 既存8080オリジンのヘッドレスプロファイルには旧Service Workerの静的キャッシュが残っていた。fresh origin では新SW・新UIの起動を確認済み。実機検収時は通常のSW更新（新 `CACHE_NAME` のactivate）後に確認する。
- 指示書の制約に従い、commit / branch / restore / stash は実行していない。

---

## 検収記録（Claude、2026-07-22）

- 受け入れ基準 1: `verify-index-exp index.html` 再実行 → `[verify] OK`。
- 受け入れ基準 2〜4: `tmp/edit-stallion-verify/` の Node 検証 3 本を再実行 → すべて OK（assert 数 11/11/5。直下挿入・createdAt 昇順・不明ベース警告・rare/sonId 継承・broodmares 非混入・freeze・バリデーション 6 ルール＋100 件上限＋編集時自レコード除外・`[E]` 位置・edit 分岐の custom 先行を実 assert で確認）。
- 受け入れ基準 5: `python -m pytest -q` → 13 passed。
- 受け入れ基準 6: fresh origin でローカル配信＋`dump-dom 390×844 30000` 再実行 → Vue マウント済み DOM のホーム app-bar に歯車（`mdi-cog`・`aria-label="設定"`）を確認、ReferenceError / TypeError なし。
- 受け入れ基準 7: `CACHE_NAME` v20260705-04 → -05（1 回）、新規 3 ファイルの precache 追加を diff で確認。
- 受け入れ基準 8: チェックリスト記入・未検証項目の明示を確認。
- コードレビュー: unified-db v2（guarded 追記のみ）、repository（`es_` 採番・createdAt 昇順）、`insertEditStallions()`（純関数・ベース直下・昇順）、`refreshCandidateLists()` への統合（☆先頭 → base＋直下E → extras 末尾、broodmares 非混入）、edit summary の `rare`/`sonId`/`parentLineId` 継承、`ensureHorseDetail` の edit 分岐（chunk 欠落時の再解決・1 回リトライ付き）、バリデーション純関数、`$root.currentScreen` 直接代入（workspaceSync 非接触）— すべて指示書・設計書どおり。差し戻し事項なし。
- **スコープ外ファイルの変更（申告あり・妥当と判断）**: `desktop-horse-autocomplete.js` / `mobile-horse-picker.js` に E チップ追加。PC 候補が `getHorseBaseText()` を使っておらず §6 の一括反映が効かないための最小改修で、表示テンプレートのみ。**モバイルの IME・検索入力処理には非接触**（+5 行のチップ追加のみ）を diff で確認。
- 気づき:
  - `.gitignore` が `tests/*`→`tests`＋`tmp` 追加に変わっている（完了報告に記載なし。ユーザー自身の変更の可能性が高い。内容は無害で、`tests/test_build_dabimas_stream.py` のコミットに `git add -f` が必要な点は変わらず）。
  - `refreshCandidateLists()` の `horses` はフィルタ前の `horsesBase` から構築される（☆馬保存実装から継承した挙動）。現データは sex が 0/1 のみで実害なし。
- 残（実機・実画面のみ）: 設定画面での登録→候補リスト反映→血統表配置→クロス成立・因子集計・相性文言、編集・削除の反映範囲（§4.5）、PWA 再起動後の永続化、E チップの実表示。
