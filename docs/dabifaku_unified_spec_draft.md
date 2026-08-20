# ダビふぁく統合版 実装仕様書（v2.1 コード再照合済み）

## 0. このドキュメントの位置づけ

本ドキュメントは「ダビふぁく統合版」の実装仕様である。

v1 ドラフトの「未確定」「要コード確認」事項を現行コードと照合して解消し、実装者がそのまま着手できるレベルまで具体化した。v2.1 で現行コード（2026-07-03 時点: `index.html` 4,611 行、`vue/CombinationDialog.js`、`vue/constants/` / `vue/logic/` / `vue/components/` 配下、`service-worker.js`）に対して再照合した。旧 `vue/combinationDB.js` は削除済みである。

**実装着手の前提（必須）**: 本仕様は `docs/index-split-completion-plan.md`（以下「分割完了計画」）の**全 Phase が完了した状態**を起点に実装する。分割完了計画 §3.8 が、本仕様の依存する不変条件（localStorage 6 キー・保存メソッド名とシグネチャ・復元経路・`<header ref="appHeader">` 構造・既存 IndexedDB スキーマ）を分割作業を通して保証している。

### 0.1 v1 ドラフトからの主な変更

| 項目 | v1 ドラフト | 本版（v2） | 理由 |
|---|---|---|---|
| 作業枠の保存対象 | 種牡馬・繁殖牝馬の 2 頭 | 血統表 32 セル＋子系統＋メモ 3 種＋手動クロス（= snapshot 6 キー） | 現行の選択状態は 32 セル個別選択。2 頭の ID だけでは途中セルの手動選択・メモが失われる（§4.2） |
| 本体への状態注入 | props / events を想定 | localStorage を「アクティブ作業枠バッファ」とし、既存の復元経路を転用 | 本体は props 注入できる構造ではない。配合復元経路が既に同じことをしている（§5） |
| Workspace 型 | `stallionId` / `broodmareId` | `snapshot`（6 キーの生文字列） | 上記に伴う変更（§13.4） |
| Vue Router | 要確認 | 不使用（確定）。state 切替で画面遷移 | `new Vue({ el: "#app" })` のみ。Router / Vuex とも不使用（§4.1） |
| IndexedDB | 新 DB `dabifaku_unified` | 新 DB `dabifaku_unified`（既存 `DabifacCombinationDB` には触れない） | 既存 DB のスキーマ・version に触れないことで既存機能への回帰リスクを避ける（理由の詳細は §5.5。v2.1 で更新） |
| カテゴリ削除 | 未確定 | 許可（確認ダイアログ付き・配下全削除）として仕様化。§22 の要承認リストに記載 | 実装可能レベルに落とすため本版で決定 |

### 0.2 v2 からの主な変更（v2.1 再照合）

| 項目 | v2 | 本版（v2.1） | 理由 |
|---|---|---|---|
| 実装着手の前提 | 分割計画 Phase 1 と `logic/storage/` 外部化の完了を推奨 | 分割完了計画（`index-split-completion-plan.md`）の**全 Phase 完了を必須前提**とする | 分割完了計画 §3.8 が本仕様の不変条件を明文化して保証しており、完了後は dirty 通知の挿入先が §12.4 の対応表どおりに確定するため |
| 既存 DB version=2 の重複ハードコード | 3 箇所に重複（新 DB を分ける根拠） | 解消済み。`vue/logic/storage/combination-storage.js` が単一の定義元 | コード再照合。`vue/combinationDB.js` は削除され、`CombinationDialog.js` と `ensureCustomHorseDb()` は combination-storage.js へ委譲済み。新 DB を分ける結論は維持し、理由を §5.5 で差し替え |
| ID 生成 | `crypto.randomUUID()` を直接使用 | フォールバック付き `generateUuid()` 方式（§13.6） | `crypto.randomUUID` は secure context（HTTPS / localhost）限定で、LAN IP への素の HTTP アクセス（実機検証）では存在しない。現行コードも同理由でフォールバック実装済み（`vue/logic/pedigree/pedigree-builder.js`） |
| 配合復元経路の記述 | `applySavedCombination()` が配合復元の現行経路 | `applySavedCombination()` は定義済みだが**現在未使用**。現行の配合復元は CombinationDialog 内の localStorage 直書き→`onCombinationRestore()` 経路（§4.5） | コード再照合。未使用であることは統合版に好都合（作業枠切替が競合なくそのまま転用できる） |
| §5.3 切替シーケンスの更新対象 | `appMeta.lastOpenedWorkspaceId` を更新 | `category.lastActiveWorkspaceId` のみ更新 | §13.5（`lastOpenedWorkspaceId` は appMeta に置かない）との内部矛盾を解消 |

### 0.3 実装時の原則

- 確定事項は本ドキュメントに従う。
- 現行実装と本仕様に矛盾を見つけた場合は、勝手に解釈せず報告する。
- 既存のダビふぁく本体 UI は改変しない。本体側コードへの変更は §12.4 に列挙した「dirty 通知 1 行の追加」と、画面切替用の `v-show` ラップのみ許可する。分割完了計画完了後、dirty 通知の挿入先は index.html ではなく `vue/app/methods/` 配下のファイルになる（§12.4 の対応表参照）。
- 新規ファイルは `docs/index-component-logic-split-plan.md`（以下「分割計画」）および分割完了計画の規約に従う：IIFE + `window.Dabimas` 名前空間、classic script 読み込み、UTF-8 BOM なし。
- 本仕様の実装は、**分割完了計画の全 Phase 完了後に着手する（必須前提。§20）**。着手時は分割完了計画 §10 の対応表（実績列）で各メソッドの所在を確認する。

---

## 1. 背景

iPhone のホーム画面 PWA では、同じ URL でも複数インストールされた各 PWA の保存領域が分離される。そのため「複数 PWA のままローカルデータを自動共有する」設計は成立しない。

```text
複数PWA間で配合データを共有したい
  ↓
iPhoneでは各PWAの保存領域が分離される
  ↓
複数PWAのままローカル共有するのは困難
  ↓
制約対応として、1つのPWA内でカテゴリ・作業枠を管理する
```

統合は目的ではなく、**同一端末内で複数の配合作業を扱うための制約対応**である。

---

## 2. 目的

### 2.1 達成すること

- ホーム画面でカテゴリを管理する（ユーザーが自由に作成）
- カテゴリごとに複数の作業枠を持てる
- 作業枠はダビふぁく本体画面上部のタブで切り替える
- 作業枠ごとに配合作業の状態（§12.2）を保存・復元する
- ダビふぁく本体 UI は改変せず、外側のラッパーで管理する
- PC 版に左メニューを設けない／スマホ版にハンバーガーメニューを設けない
- Vue 2・Vuetify を維持する
- 作業枠データの保存先は IndexedDB とする

### 2.2 達成しないこと

- 複数 PWA 間の完全ローカル自動共有
- サーバー同期・ログイン機能・端末 ID 共有・QR コード連携
- Vue 3 への移行・Vuetify の撤去
- ダビふぁく本体 UI の全面改修
- 複数の旧 PWA に分散したデータの自動統合

---

## 3. 技術前提

| 項目 | 仕様 | 根拠（現行コード） |
|---|---|---|
| フレームワーク | Vue 2 を継続 | `vue/vue.min.js`（classic script） |
| UI ライブラリ | Vuetify 2 を継続 | `vue/vuetify.js`、`css/vuetify_compact.min.css` |
| ルーティング | Vue Router 不使用（確定） | `new Vue({ el: "#app" })` のみ。router オプションなし |
| 状態管理 | Vuex 不使用（確定） | 全状態が root app の `data()` |
| 作業枠データ保存先 | IndexedDB（新 DB `dabifaku_unified`） | §13 |
| アクティブ作業枠バッファ | localStorage（現行キーをそのまま利用） | §5.1 |
| ID 生成 | フォールバック付き `generateUuid()` 方式（§13.6） | `vue/logic/pedigree/pedigree-builder.js` に同方式の実装あり。`crypto.randomUUID` は secure context 限定のため直接依存しない |
| モジュール形式 | IIFE + `window.Dabimas` 名前空間 | 分割計画に準拠。ES module は使わない |
| ダークモード | 無視（常にライト） | `<meta name="color-scheme" content="light only">` |
| 既存データ移行 | 同じ保存領域（localStorage）の旧データ 1 件のみ | §15 |

---

## 4. 現行実装の調査結果（照合済み）

本章は実装者が前提とすべき「現状の事実」である（2026-07-03 再照合）。行数・メソッドの所在は分割完了計画の進行で変わるが、メソッド名・キー名・経路は同計画 §3.8 の不変条件として維持される。分割完了後の各メソッドの所在は同計画 §10 の対応表を参照すること。

### 4.1 アプリ構成

- 単一ページ。`new Vue({ el: "#app" })` が root app で、血統表・ヘッダー・検索・ダイアログすべてを持つ。`index.html` は 2026-07-03 時点 4,611 行。分割完了計画の完了後は「HTML shell ＋ script タグ ＋ 最小限の boot スクリプト」の約 300〜350 行になり、root app 本体は `vue/app/` 配下（app-state / app-computed / methods/* / app-lifecycle / app-options / main）へ移る。
- 外部化済み: `vue/CombinationDialog.js`（配合保存ダイアログ）、`vue/factor-dialog.js`（因子選択ダイアログ）、`vue/constants/` / `vue/logic/` / `vue/components/` 配下。いずれも classic script（IIFE + `window.Dabimas`）。
- IndexedDB の open 処理は `vue/logic/storage/combination-storage.js` に集約済み（DB 名・version・store 構成の単一定義元）。CombinationDialog.js の `openDB()` と root app の `ensureCustomHorseDb()` はここへ委譲する。旧 `vue/combinationDB.js`（未使用 ES module）は削除済み。

### 4.2 選択状態のデータ実体

「選択中の種牡馬・繁殖牝馬」は 2 頭の ID ではなく、次の配列群である。

- `selected`: 長さ 32 の配列。index 0〜15 が種牡馬側、16〜31 が繁殖牝馬側の血統表セル。各要素は馬オブジェクトまたは `null`。**ユーザーは途中セルを個別に選択・上書きできる**ため、先頭 2 頭から機械的に復元することはできない。
- `category`: 長さ 32（子系統）。
- `inputed`: 長さ 32（セルごとのメモ）。
- `inputedMemoStallion` / `inputedMemoBroodmare`: 文字列メモ。
- `inbreedList` / `isInbreedButtonClicked`: 手動クロス（ハートボタン）状態。永続化は「手動指定した index の配列」形式。
- 馬オブジェクトには通常馬（`id` + `detailChunk`）と自家製馬（`source: "custom"`、`customHorseId`）がある。自家製馬の詳細は既存 IndexedDB `DabifacCombinationDB.customHorses` から解決される。

### 4.3 localStorage の全キー（現行の永続化実体）

| キー | 形式 | 内容 | 書き込み箇所（メソッド名） |
|---|---|---|---|
| `dabimasFactor` | JSON（長さ 32 配列） | 選択馬（`descendants` / `searchText` / `displayName` を除去した軽量形） | `persistSelectedToStorage()` |
| `dabimasFactorCategory` | JSON（長さ 32 配列） | 子系統 | `persistSelectedToStorage()` |
| `dabimasMemo` | JSON（長さ 32 配列） | セルごとのメモ | `memoChange()` |
| `dabimasMemoStallion` | 生文字列 | 種牡馬側メモ | `memoChangeStallion()` |
| `dabimasMemoBroodmare` | 生文字列 | 繁殖牝馬側メモ | `memoChangeBroodmare()` |
| `dabimasManualInbreed` | JSON（index 配列） | 手動クロス指定した index | `persistManualInbreedState()` / `clearManualInbreedForIndex()` |

保存タイミングは既に「選択時の即時保存」になっている（`onChangeMain()` の末尾で `persistSelectedToStorage()`、メモは入力イベントごと、手動クロスはクリックごと）。

### 4.4 既存 IndexedDB（触れないこと）

| 項目 | 値 |
|---|---|
| DB 名 | `DabifacCombinationDB` |
| version | **2**（定義は `vue/logic/storage/combination-storage.js` の `DB_VERSION` に集約済み。利用側はすべてここへ委譲） |
| store | `configs`（配合保存: `{ id: autoIncrement, title, savedAt, configData }`）、`customHorses`（自家製馬: keyPath `id`） |

`configData` は §4.3 の 6 キーの**生文字列**を束ねたもの（＋参照する自家製馬レコードの同梱）。キー名は localStorage キー名そのまま（`dabimasFactor` 等）で、統合版の snapshot（§12.2、`factor` 等の短縮キー名）とは**キー名が異なる**点に注意。いずれにせよ「配合スナップショット」の形式が既に存在する。

### 4.5 保存・復元の既存経路（統合版が転用するもの）

- 起動時復元: `dbinitializer()` → summary JSON ロード → `c4()` → `refreshLocalDataFromStorage()`。localStorage の 6 キーから全状態（血統表・因子集計・クロス・理論・メモ・手動クロス）を再構築する。
- snapshot 注入: `applySavedCombination(record)` が snapshot（`factor` / `factorCategory` / `memo` / `memoStallion` / `memoBroodmare` / `manualInbreed`）を `setOrRemoveLocalStorage()` で localStorage に書き戻し、`refreshLocalDataFromStorage()` を呼ぶ。**この経路が「任意の snapshot を本体に注入する」機能そのもの**であり、作業枠切替はこれを再利用する。なお本メソッドは定義済みだが**現行コードに呼び出し箇所が無い**（＝統合版が唯一の利用者になれる。分割完了計画 §3.8 で維持が保証されている）。
- 配合復元（現行の実経路）: CombinationDialog が `configData`（キー名は `dabimasFactor` 等の localStorage キー名。§4.4）を localStorage へ直接書き込み、`restore` イベント → root app の `onCombinationRestore()` → `restoreInputData()` で画面を再構築する。統合版から見ると「localStorage が書き換わる」点は snapshot 注入と同じであり、dirty 通知（§12.4）の対象になる。
- リセット: `initializer()` が 6 キー相当を `removeItem` して全 state を初期化する。

### 4.6 JSON 分割ロードと service worker

- 馬データは `json/dabimasFactor.summary.json`（軽量）＋ `json/dabimasFactor-details/*.json`（遅延・idle 先読み）。選択時は `ensureHorseDetail()` が descendants 15 件を確定させてから血統展開する。
- `service-worker.js` は `CACHE_NAME` bump 方式。js/css は cache-first（初回アクセスで runtime cache）、`json/` は network-first。現状の precache（`urlsToCache`）はアプリシェル・json・フォント中心で `vue/` 配下の分割 JS は runtime cache 頼みだが、分割完了計画 Phase 5-1 で `vue/` 配下の全配信 JS が precache に棚卸しされる。**統合版の新規 JS/CSS もこれに合わせて `urlsToCache` へ追加し、`CACHE_NAME` を bump する**（追加しなくてもオンライン初回アクセスで runtime cache されるが、install 時オフライン完全性のため precache に含める）。

### 4.7 モバイル高さ調整

`applyMobileViewportLayout()` は `this.$refs.appHeader`（`<header ref="appHeader">`）の実高さを `getBoundingClientRect()` で測り、血統表の行高さを画面内に収める。**作業枠タブバーをこの `<header>` 要素の内側に置けば、高さ計算に自動的に含まれ、追加対応は不要**（§9.4）。同メソッドは分割完了計画で `vue/app/methods/ui-viewport.js` へ移るが、`appHeader` 実測方式と header 構造は同計画 §3.8 の不変条件である。

---

## 5. アーキテクチャ確定方針

### 5.1 基本原則: localStorage = アクティブ作業枠のバッファ

本体（血統表・因子集計・メモ・手動クロス）は現状どおり localStorage の 6 キーへ読み書きし続ける。**本体のコードは変更しない。**

統合版ラッパーは次の役割だけを持つ。

```text
IndexedDB (dabifaku_unified)          localStorage（現行 6 キー）
  categories                            = アクティブ作業枠の作業バッファ
  workspaces ── snapshot ──[切替時に注入]──▶ 6 キー
       ▲                                     │
       └───────[dirty 時に flush]────────────┘
```

- **切替（switch-in）**: 選択した作業枠の `snapshot` を localStorage の 6 キーへ書き込み（`setOrRemoveLocalStorage()` 相当）、`refreshLocalDataFromStorage()` で本体を再構築する。既存の snapshot 注入経路 `applySavedCombination()`（§4.5）と同一処理。
- **退避（flush / switch-out）**: localStorage の 6 キーを読み取り、アクティブ作業枠の `snapshot` として IndexedDB へ保存する。

### 5.2 不変条件

1. 常に「アクティブ作業枠」がちょうど 1 つ存在する（カテゴリ画面表示中）。
2. localStorage の 6 キーの内容は、常にアクティブ作業枠の snapshot と同一、または flush 待ちの新しい状態である。
3. 作業枠を切り替える前に、必ずアクティブ作業枠の flush を完了させる（flush 失敗時は切替を中断しエラー表示。§18）。
4. 既存 DB `DabifacCombinationDB` のスキーマ・version には触れない。

### 5.3 作業枠切替シーケンス

```text
ユーザーがタブ 2 をタップ
  ↓
(1) 現アクティブ作業枠を flush（localStorage 6 キー → workspaces.snapshot、updatedAt 更新）
  ↓ 失敗したら中断・エラー表示・タブは元のまま
(2) category.lastActiveWorkspaceId を更新（appMeta.lastOpenedCategoryId はカテゴリを開いた時点で更新済み。§13.5）
  ↓
(3) 切替先 workspace.snapshot を localStorage 6 キーへ書き込み
  ↓
(4) refreshLocalDataFromStorage() で本体を再構築
  ↓
(5) タブのアクティブ表示を更新
```

同じタブを再タップした場合は何もしない（再構築コストを払わない。§19）。

### 5.4 dirty 通知と flush タイミング

本体が localStorage を書き換えたことをラッパーが知る必要がある。localStorage の monkey-patch は行わず、**本体側の永続化メソッドの末尾に通知 1 行を追加する**（§12.4 に全箇所を列挙）。

```js
// 例: persistSelectedToStorage() の末尾
window.Dabimas.workspaceSync?.notifyLocalChange();
```

flush 実行タイミング:

| トリガ | 動作 |
|---|---|
| `notifyLocalChange()` | 500ms debounce で flush（メモのキー入力連打で IndexedDB 書き込みが暴れないように） |
| 作業枠切替の直前 | 即時 flush（debounce 待ちをキャンセルして確定） |
| ホームへ戻る直前 | 即時 flush |
| `pagehide` / `visibilitychange: hidden` | 即時 flush（iPhone PWA はバックグラウンドで kill されるため必須。IndexedDB 書き込みは非同期だが、put 発行までは同期的に行う） |

### 5.5 新 DB を分ける理由（既存 DB を拡張しない）

既存 DB の version・store 構成の定義は `vue/logic/storage/combination-storage.js` に集約済み（v2 時点で根拠としていた「3 箇所ハードコード」は解消されている）だが、既存 DB に store を追加するには version bump が避けられず、配合保存・自家製馬という稼働中機能の回帰リスクを統合版が背負うことになる。また service worker が js を cache-first で配信するため、デプロイ直後は新旧 JS が一時的に混在し得るが、既存 DB の version を上げると古いキャッシュの JS（旧 version 指定）が `VersionError` で DB を開けなくなる。統合版は独立した新 DB `dabifaku_unified` を作り、既存 DB・既存コードに一切触れないことで、この両方のリスクを回避する。

- 配合保存（`configs`）と自家製馬（`customHorses`）は**全カテゴリ・全作業枠で共有のグローバル資産**として現状のまま使い続ける。作業枠 snapshot 内の自家製馬参照（`customHorseId`）は従来どおり `DabifacCombinationDB.customHorses` から解決される。
- DB が 2 つになるが、`dabifaku_unified` への接続はラッパー層のみが持ち、本体は今までどおり localStorage しか見ないため、複雑さは増えない。

---

## 6. 用語定義

| 用語 | 意味 |
|---|---|
| 統合版 | 1 つの PWA 内でカテゴリと作業枠を管理する新仕様 |
| カテゴリ | ホーム画面に表示される作業グループ |
| 作業枠 | カテゴリ内に作成される配合作業単位 |
| 作業枠タブ | `1`、`2`、`3` のように表示する切替 UI |
| ダビふぁく本体 | 種牡馬検索・繁殖牝馬検索・血統表・ニトロ・クロス等を含む既存画面（root app の既存部分） |
| snapshot | localStorage 6 キーの生文字列を束ねたオブジェクト（§12.2）。キー名は既存 `applySavedCombination()` の引数と同一（配合保存 `configData` とは「生文字列を束ねる」方針は同じだがキー名が異なる。§4.4） |
| アクティブ作業枠 | localStorage をバッファとして使用中の作業枠 |
| flush | localStorage 6 キー → アクティブ作業枠 snapshot への退避保存 |
| 既存データカテゴリ | 旧データ（現行 localStorage）を検出した場合に自動作成するカテゴリ |
| 表示番号 | ユーザーに見せる作業枠番号（保存しない。`sortOrder` 順に 1 から採番） |
| 内部 ID | フォールバック付き UUID v4 生成（§13.6）で発行する不変 ID |

---

## 7. 確定仕様一覧

| No. | 項目 | 確定内容 |
|---:|---|---|
| 1 | 新規カテゴリ作成時の作業枠数 | 1 件 |
| 2 | 作業枠の追加・削除 | 自由に追加・削除可能 |
| 3 | 作業枠の保存内容 | snapshot（localStorage 6 キー相当。§12.2） |
| 4 | タブ切替時の保存・復元 | 切替前に flush、切替後に snapshot 注入＋`refreshLocalDataFromStorage()` |
| 5 | 旧データ→新形式変換 | 変換不要。現行 localStorage の 6 キーをそのまま snapshot として複製（§15） |
| 6 | Vue 2 → Vue 3 | 移行しない |
| 7 | Vuetify | 外さない |
| 8 | 最後の作業枠 | 削除不可 |
| 9 | 作業枠削除後 | 表示番号を再採番（内部 ID は不変） |
| 10 | 作業枠 1 件時の削除ボタン | 表示しない |
| 11 | 表示中の作業枠を削除した場合 | 削除位置に繰り上がった枠を表示（末尾削除時は新しい末尾） |
| 12 | 作業枠データ保存先 | IndexedDB `dabifaku_unified` |
| 13 | カテゴリ削除 | 許可。配下作業枠も全削除。確認ダイアログ必須（§10.4、要承認） |
| 14 | 起動時の初期画面 | 前回開いていたカテゴリへ直行（`lastOpenedCategoryId`）。移行直後の初回のみホーム（§9.1） |
| 15 | 配合保存・自家製馬 | 全カテゴリ共有のグローバル資産のまま（§5.5） |

---

## 8. 情報設計

```text
ホーム
├─ カテゴリA（lastActiveWorkspaceId: 枠2）
│  ├─ 作業枠1
│  ├─ 作業枠2   ← カテゴリAを開くとこの枠がアクティブ
│  └─ 作業枠3
├─ カテゴリB
│  └─ 作業枠1
└─ ...
```

カテゴリ名・カテゴリ数は固定しない。ユーザーが自由に作成する。

（利用例: スタスタ、調教戦、王座予選秋天、王座予選、スピ試し、オーシャン、肌 — これらは一利用者の例であり、**初期固定値として自動作成してはならない**。）

---

## 9. 画面仕様・デザイン

### 9.1 画面遷移（Router なし）

root app に `currentScreen: "home" | "category"` を追加し、`v-if` / `v-show` で切り替える。分割完了計画完了後、data の追加先は `vue/app/app-state.js` の `createInitialState()`、テンプレート側のラップは index.html の HTML shell に対して行う。

- **ホーム画面**: `v-if` で描画（軽量なので都度生成でよい）。
- **ダビふぁく本体**: 既存の `<header>` と main 部分を `v-show="currentScreen === 'category'"` でラップする。`v-if` にすると DOM 破棄→再構築で `applyMobileViewportLayout()` の再計測や mounted 系処理が再実行されて壊れやすいため、**必ず `v-show`** を使う（本体 UI 非改変の原則にも合致）。
- 起動フロー:

```text
起動
  ↓ IndexedDB 初期化・移行チェック（§15）
  ↓
appMeta.lastOpenedCategoryId が有効（カテゴリが存在）
  ├─ Yes → そのカテゴリを開く（category.lastActiveWorkspaceId の枠をアクティブに）
  └─ No（初回・移行直後・カテゴリ削除後）→ ホームを表示
```

毎日の利用では「アプリを開く＝直前の作業枠に戻る」となり、現行アプリの起動体験（開いたら即作業再開）を維持する。

### 9.2 ホーム画面

#### レイアウト（Vuetify 2 コンポーネント指定）

```text
┌──────────────────────────────────────┐
│ ダビふぁく                 [＋] [編集] │ ← v-app-bar (dense, flat)
├──────────────────────────────────────┤
│  ┌────────┐ ┌────────┐ ┌────────┐    │
│  │  🐴    │ │  🏆    │ │  ⭐    │    │ ← v-card グリッド
│  │ スタスタ │ │ 調教戦  │ │  肌    │    │
│  │ 作業枠 3 │ │ 作業枠 1 │ │ 作業枠 2 │    │
│  └────────┘ └────────┘ └────────┘    │
└──────────────────────────────────────┘
```

- ヘッダー: `v-app-bar`（`dense flat`、背景は白、下ボーダー 1px `#e0e0e0`）。タイトル「ダビふぁく」は既存アプリのフォント（Noto Sans JP Bold）を使用。右端に `＋`（`v-btn icon` + `mdi-plus`）と「編集」（`v-btn text`、編集モード中は「完了」primary 色）。
- カードグリッド: `v-container` > `v-row dense` > `v-col`。列数は `cols="6" sm="4" md="3"`（スマホ 2 列、タブレット 3 列、PC 4 列）。
- カテゴリカード: `v-card outlined`（`min-height: 96px`、`border-radius: 12px`）。内容は縦積みで
  1. アイコン（`v-icon` 32px、primary 色）
  2. カテゴリ名（`font-weight: 600; font-size: 14px;` 1 行、あふれは ellipsis）
  3. 作業枠数（`caption` 灰色、「作業枠 3」）
- タップ領域はカード全体（≥ 88px 四方相当、iOS タッチターゲット 44px を満たす）。`ripple` 有効。
- 並び順: `sortOrder` 昇順。「既存データ」カテゴリは移行時に `sortOrder: 0` で先頭に置く（その後の並び替えは自由）。

#### 編集モード

「編集」タップでトグル。編集モード中は各カードの右上に削除バッジ（`v-btn icon x-small` + `mdi-close-circle`、色 `error`）、右下に並び替え用の `↑` `↓` ボタン（`mdi-chevron-up/down`）を表示する。カードタップは編集ダイアログ（§9.3 と同 UI、名前・アイコン変更）を開く。

> ドラッグ＆ドロップ並び替えは採用しない（vuedraggable 等の新規依存を増やさない方針。↑↓ ボタンで十分）。

#### 空状態

```text
（中央寄せ・上下センター）
  mdi-folder-open-outline  48px  灰色
  まだカテゴリがありません
  [＋ カテゴリを追加]   ← v-btn color="primary" rounded
```

### 9.3 カテゴリ追加・編集ダイアログ

`v-dialog`（`max-width="360"`）。

| 項目 | 仕様 |
|---|---|
| カテゴリ名 | `v-text-field outlined dense`、`maxlength="12"`、`counter="12"`、必須。未入力時は「作成」ボタン disabled ＋ ヘルパーテキスト「カテゴリ名を入力してください」 |
| アイコン | 候補グリッドから 1 つ選択（`v-item-group mandatory`）。選択中は primary 背景・白アイコン |
| ボタン | 「キャンセル」（text）／「作成」または「保存」（primary）。作成成功時はそのカテゴリを開く |

アイコン候補（同梱済み `materialdesignicons.min.css` から。追加アセット不要）:

```text
mdi-horse-variant   mdi-trophy        mdi-flag-checkered  mdi-star
mdi-fire            mdi-heart         mdi-flash           mdi-crown
mdi-flask-outline   mdi-run-fast      mdi-shield          mdi-folder
```

`iconKey` には mdi クラス名文字列（例 `"mdi-trophy"`）をそのまま保存する。既定選択は `mdi-horse-variant`。

### 9.4 カテゴリ画面（作業枠タブバー）

タブバーは**既存の `<header ref="appHeader">` 要素の内側・最上段**に追加する。これにより `applyMobileViewportLayout()` の高さ計算（§4.7）に自動的に含まれ、モバイルの血統表高さ調整に追加対応が不要になる。

```text
┌───────────────────────────────────────────┐
│ ← │ スタスタ │ [1][2*][3][＋]        │ 編集 │  ← 高さ 40px の 1 段バー
├───────────────────────────────────────────┤
│ （既存のニトロ/クロス集計ヘッダー）           │
│ （既存のダビふぁく本体）                     │
└───────────────────────────────────────────┘
```

- 左端: 戻るボタン（`v-btn icon small` + `mdi-arrow-left`）。タップで flush → ホームへ。
- カテゴリ名: `font-size: 13px; font-weight: 600;` 1 行 ellipsis。最大幅を制限しタブ領域を優先。
- タブ列: `v-slide-group`（`show-arrows` は PC のみ、スマホは横スクロール）。各タブは `v-btn small`（最小幅 40px、高さ 32px、タップ領域は上下パディングで 44px 確保）。
  - 非アクティブ: `outlined` 灰色文字
  - アクティブ: `color="primary"` 塗り・白文字
  - 表示番号は `sortOrder` 順に 1 から連番（保存しない）
- `＋` タブ: 末尾固定。タップで作業枠追加（§11.1）。
- 編集: 右端 `v-btn text x-small`。編集モード中は各タブ右上に `×` バッジ、`＋` は非表示、「編集」→「完了」。作業枠 1 件時は `×` を出さない。
- 1 段に収まらない場合もバーの高さは固定（横スクロール）。バー高さが固定であることが本体の高さ計算を安定させる。

### 9.5 確認ダイアログ文言

作業枠削除（`v-dialog max-width="320"`）:

```text
作業枠2を削除しますか？

保存されている配合の状態
（血統表・メモ・クロス指定）も削除されます。

[キャンセル] [削除]   ← 削除は color="error"
```

カテゴリ削除:

```text
カテゴリ「スタスタ」を削除しますか？

このカテゴリの作業枠 3 件と、
保存されている配合の状態もすべて削除されます。
この操作は取り消せません。

[キャンセル] [削除]
```

> どちらも「配合の保存・復元」（IndexedDB `configs`）には影響しない。誤解を招くようなら文言に「※保存済み配合は削除されません」を追記してよい。

### 9.6 デザイントークン

| トークン | 値 | 備考 |
|---|---|---|
| primary | Vuetify 既定 primary（現行テーマのまま） | 新テーマ色は導入しない |
| カード角丸 | 12px | ホームのカテゴリカードのみ |
| 余白基準 | 4px グリッド（Vuetify spacing） | `pa-2` / `ma-1` 系 |
| フォント | Noto Sans JP（同梱済み） | 追加フォントなし |
| タッチターゲット | 最小 44×44px | タブ・カード・削除バッジ |
| セーフエリア | ホーム画面ルートに `padding: env(safe-area-inset-top) ...` | 本体側は現状の挙動を維持 |

---

## 10. カテゴリ仕様

### 10.1 追加

ホーム右上 `＋` → §9.3 ダイアログ → 作成処理:

```text
カテゴリ作成（id = UUID v4（§13.6）, sortOrder = 既存最大 + 1）
  ↓
作業枠 1 件作成（id 発行、snapshot = 全キー null = 空状態）
  ↓
categories / workspaces を同一トランザクションで保存（§13.7）
  ↓
作成したカテゴリを開く（アクティブ作業枠 = 作成した枠、localStorage へ空 snapshot を注入）
```

### 10.2 編集

カテゴリ名変更・アイコン変更（§9.3 と同ダイアログ）、並び順変更（↑↓）、削除。

### 10.3 並び順

`sortOrder` を 0 起点の連番で振り直す（↑↓ 1 回ごとに入れ替えて全件 put）。件数は高々数十なので性能上の考慮は不要。

### 10.4 削除（本版で仕様化・要承認）

- カテゴリ削除を**許可**する。
- 削除時は配下の作業枠レコードも同一トランザクションで全削除する。
- 最後の 1 カテゴリも削除できる（削除後はホームの空状態を表示）。
- 「既存データ」カテゴリも通常カテゴリと同様に削除できる。`appMeta.migrationDone` は true のまま維持し、**再移行はしない**（localStorage に旧データが残っていても二重移行しない）。
- 削除中のカテゴリがアクティブだった場合（カテゴリ画面から遷移してきた直後など）は、`lastOpenedCategoryId` をクリアする。
- 確認文言は §9.5。

---

## 11. 作業枠仕様

### 11.1 追加

タブ列の `＋` をタップ:

```text
(1) 現アクティブ作業枠を即時 flush
(2) 新規 workspace 作成（sortOrder = 同カテゴリ最大 + 1、snapshot = 全 null）
(3) IndexedDB へ保存
(4) 新枠へ切替（空 snapshot 注入 → refreshLocalDataFromStorage() → 本体が初期状態になる）
```

新枠の初期状態は「何も選択されていない」（現行の `initializer()` 直後と同じ見た目）。

### 11.2 削除

編集モードの `×` → 確認ダイアログ（§9.5）→ OK:

```text
(1) workspaces の readwrite トランザクションで対象を delete
(2) 同一カテゴリの残存枠の sortOrder を 0 から連番で振り直し（同一トランザクション）
(3) 削除したのがアクティブ枠なら、削除位置に繰り上がった枠（末尾削除時は新しい末尾）へ切替
    ※ このとき flush は行わない（削除された枠の内容を書き戻さない）
(4) 削除したのが非アクティブ枠なら、タブ表示のみ更新
```

### 11.3 最後の 1 件は削除不可

作業枠 1 件時は `×` を表示しない。編集モードの表示は `[ 1 ] [ 完了 ]`。

### 11.4 表示番号

保存しない。`categoryId` ごとに `sortOrder` 昇順で並べ、画面表示時に 1 から連番を付ける。内部 ID（UUID）は不変。

---

## 12. 保存仕様

### 12.1 保存先

- 作業枠ごとの永続データ: **IndexedDB `dabifaku_unified`**
- アクティブ作業枠のバッファ: **localStorage 現行 6 キー**（本体の読み書き先。変更しない）
- 配合保存・自家製馬: 既存 `DabifacCombinationDB`（変更しない）

### 12.2 snapshot（作業枠の保存対象・確定）

localStorage 6 キーの生文字列をそのまま束ねる。**parse せず文字列のまま持つ**（既存の配合保存 `configData` と同じ方針。形式変更に対して頑健で、変換バグが入り込まない）。

```ts
type WorkspaceSnapshot = {
  factor: string | null          // "dabimasFactor" の生文字列
  factorCategory: string | null  // "dabimasFactorCategory"
  memo: string | null            // "dabimasMemo"
  memoStallion: string | null    // "dabimasMemoStallion"
  memoBroodmare: string | null   // "dabimasMemoBroodmare"
  manualInbreed: string | null   // "dabimasManualInbreed"
}
```

キー名は既存 `applySavedCombination()` が受け取る snapshot と同一にしてあり、切替時の注入処理を共通化できる。同メソッドは現行コードで未使用（§4.5）のため、作業枠切替からそのまま呼び出して（または `workspace-sync.js` 側に同処理を持たせて）よい。

v1 ドラフトで「未確定」だった検索文字列・表示モード・スクロール位置・展開状態は**保存しない**（現行アプリでも永続化しておらず、リロードで消える。作業枠切替もリロードと同じ扱いとする）。

### 12.3 保存タイミング

| タイミング | 処理 |
|---|---|
| 馬選択・メモ入力・手動クロス操作時 | 本体が従来どおり localStorage へ即時保存（変更なし）＋ dirty 通知 → 500ms debounce で flush |
| 作業枠切替の直前 | 即時 flush |
| ホームへ戻る直前 | 即時 flush |
| `pagehide` / `visibilitychange: hidden` | 即時 flush |
| 配合復元（CombinationDialog）実行時 | localStorage が書き換わるので dirty 通知 → flush（復元結果がアクティブ作業枠の内容になる） |
| リセットボタン（`initializer()`） | localStorage がクリアされるので dirty 通知 → flush（アクティブ作業枠が空になる） |

### 12.4 本体側への dirty 通知の挿入箇所（本体改変はこの 1 行×以下のみ）

以下の各メソッドの末尾に `window.Dabimas.workspaceSync?.notifyLocalChange();` を 1 行追加する。オプショナルチェーンにより、ラッパー未ロード時（万一）も無害。

挿入先ファイルは分割完了計画 §10 の対応表に従う（下表の所在は同計画の計画値。**実装時は必ず同計画 §10 の実績列で確認する**）。

| メソッド | 対象キー | 所在（分割完了計画完了後） |
|---|---|---|
| `persistSelectedToStorage()` | factor / factorCategory | `vue/app/methods/horse-loading.js` |
| `memoChange()` | memo | `vue/app/methods/selection.js` |
| `memoChangeStallion()` | memoStallion | `vue/app/methods/selection.js` |
| `memoChangeBroodmare()` | memoBroodmare | `vue/app/methods/selection.js` |
| `persistManualInbreedState()` | manualInbreed | `vue/app/methods/combination.js` |
| `clearManualInbreedForIndex()` | manualInbreed | `vue/app/methods/combination.js` |
| `initializer()` | 全キー（クリア） | `vue/app/methods/bootstrap.js` |
| `onCombinationRestore()` | 全キー（復元） | `vue/app/methods/combination.js` |

### 12.5 flush の実装要件

- flush は「6 キーを `localStorage.getItem()` で読む → `WorkspaceSnapshot` を組む → `workspaces` を put（`updatedAt` 更新）」の 1 トランザクション。
- debounce 中に切替・pagehide が来たら、タイマーをキャンセルして即時実行する。
- 直前の flush と同一内容ならスキップしてよい（文字列比較で十分）。

---

## 13. IndexedDB 詳細設計

### 13.1 データベース

| 項目 | 値 |
|---|---|
| DB 名 | `dabifaku_unified` |
| 初期バージョン | `1` |

### 13.2 Object Store 一覧

| Store 名 | 用途 | keyPath |
|---|---|---|
| `categories` | カテゴリ | `id` |
| `workspaces` | 作業枠（snapshot 含む） | `id` |
| `appMeta` | スキーマ・移行状態・最終表示位置 | `key` |

### 13.3 categories

```ts
type Category = {
  id: string                       // UUID v4（§13.6 のフォールバック付き生成）
  name: string                     // 1〜12 文字
  iconKey: string                  // 例 "mdi-trophy"
  sortOrder: number                // 0 起点連番
  lastActiveWorkspaceId: string | null  // このカテゴリで最後に開いた作業枠
  isSystemGenerated: boolean       // 「既存データ」カテゴリのみ true
  createdAt: string                // ISO 8601
  updatedAt: string
}
```

Index: `sortOrder`（keyPath `sortOrder`、unique: false）

### 13.4 workspaces

```ts
type Workspace = {
  id: string                 // UUID v4（§13.6 のフォールバック付き生成）
  categoryId: string
  sortOrder: number          // カテゴリ内 0 起点連番
  snapshot: WorkspaceSnapshot  // §12.2
  createdAt: string
  updatedAt: string
}
```

Index:

| index 名 | keyPath | unique |
|---|---|---|
| `categoryId` | `categoryId` | false |
| `categoryId_sortOrder` | `["categoryId", "sortOrder"]` | false（※） |

> ※ v1 ドラフトでは unique: true としていたが、再採番トランザクションの途中状態で一時的に重複し得るため unique 制約は付けない。整合性はトランザクション完了条件（§13.7）で担保する。

### 13.5 appMeta

```ts
type AppMeta = { key: string; value: string | number | boolean | null }
```

| key | 用途 |
|---|---|
| `schemaVersion` | `1` |
| `migrationDone` | 旧データ移行済みフラグ（移行対象なしでも初回チェック後 true） |
| `lastOpenedCategoryId` | 起動時直行用（§9.1）。カテゴリ削除時はクリア |

`lastOpenedWorkspaceId` は appMeta には置かず、`Category.lastActiveWorkspaceId` に持つ（カテゴリごとに直前のタブへ戻れるようにするため）。

### 13.6 ID・表示番号

- 内部 ID は UUID v4。ただし `crypto.randomUUID()` は secure context（HTTPS / localhost）限定で、LAN IP への素の HTTP アクセス（実機検証）では存在しないため、**直接は使わない**。`vue/logic/pedigree/pedigree-builder.js` の `generateUuid()`（randomUUID → `crypto.getRandomValues` → `Math.random` の順のフォールバック）と同方式の生成関数を統合版側（`unified-db.js` など）に置く。`generateUuid` は現状エクスポートされていないため、共通ヘルパーとして公開するか同方式を複製する（どちらでもよい）。
- 表示番号は保存しない（§11.4）。

### 13.7 トランザクション

| 操作 | store | 内容 |
|---|---|---|
| カテゴリ作成 | `categories` + `workspaces`（readwrite） | カテゴリ 1 件＋作業枠 1 件を add。失敗時は自動ロールバック |
| カテゴリ削除 | `categories` + `workspaces`（readwrite） | カテゴリ delete ＋ `categoryId` index で配下作業枠を全 delete |
| 作業枠削除＋再採番 | `workspaces`（readwrite） | delete → 残存を取得 → `sortOrder` を 0 から連番 put |
| flush | `workspaces`（readwrite） | 1 件 put |
| カテゴリ並び替え | `categories`（readwrite） | 全件 `sortOrder` put |
| 既存データ移行 | `categories` + `workspaces` + `appMeta`（readwrite） | 「既存データ」カテゴリ＋作業枠 1 件＋`migrationDone=true` を同一トランザクションで保存（§15.2 の「移行が成功するまで migrationDone を true にしない」を担保） |

---

## 14. データアクセス層

分割計画のフォルダ規約（`vue/logic/` 配下、IIFE + `window.Dabimas`）に合わせる。v1 ドラフトの `src/repositories/` は本プロジェクトの構成と合わないため廃止。

```text
vue/
  logic/
    storage/
      unified-db.js          // dabifaku_unified の open / migration（onupgradeneeded）
      category-repository.js
      workspace-repository.js
      app-meta-repository.js
    workspace-sync.js        // アクティブ作業枠バッファ同期（notifyLocalChange / flush / switchTo）
  components/
    home/
      home-page.js           // ホーム画面（カード一覧・空状態・編集モード）
      category-dialog.js     // カテゴリ追加・編集ダイアログ
    workspace/
      workspace-tab-bar.js   // タブバー（appHeader 内に配置）
```

script タグは分割完了計画 §3.5 の読み込み順の考え方に従い、`vue/app/main.js` より**前**に依存順（`unified-db.js` → repositories → `workspace-sync.js` → components）で挿入する。

### 想定 API（Promise ベース）

```js
// window.Dabimas.repositories.categories
getAll()                       // sortOrder 昇順
create({ name, iconKey })      // カテゴリ + 作業枠1 を同一 tx で作成、{ category, workspace } を返す
update(id, patch)              // name / iconKey / lastActiveWorkspaceId
reorder(orderedIds)
remove(id)                     // 配下 workspace も削除

// window.Dabimas.repositories.workspaces
getByCategory(categoryId)      // sortOrder 昇順
create(categoryId)             // 空 snapshot で作成
saveSnapshot(id, snapshot)     // flush 用（updatedAt 更新）
remove(id)                     // 削除 + 同カテゴリ再採番を同一 tx で

// window.Dabimas.repositories.appMeta
get(key)
set(key, value)

// window.Dabimas.workspaceSync
start(workspaceId)             // アクティブ作業枠を設定
notifyLocalChange()            // dirty 通知（debounce flush）
flushNow()                     // 即時 flush（切替・ホーム・pagehide 用）
switchTo(workspaceId)          // §5.3 のシーケンスを実行
```

画面コンポーネントから IndexedDB API を直接呼ばない。

---

## 15. 既存データ移行

### 15.1 方針

同じ保存領域（この PWA インストールの localStorage）から読み取れる旧データ 1 件のみ移行する。複数 PWA に分散したデータは自動収集しない。

**変換処理は不要**。現行 localStorage の 6 キーがそのまま snapshot になる（§12.2）。

### 15.2 初回起動フロー

```text
dabifaku_unified を open（onupgradeneeded で store 作成）
  ↓
appMeta.migrationDone を確認 → true なら通常起動へ
  ↓ false / 未設定
localStorage の 6 キーを読む
  ↓
6 キーすべて null（旧データなし）
  ├─ Yes → migrationDone = true。ホーム（空状態）へ
  └─ No（いずれかが存在）
       ↓
     「既存データ」カテゴリ作成
       { name: "既存データ", iconKey: "mdi-folder", sortOrder: 0, isSystemGenerated: true }
       ↓
     作業枠 1 を作成し snapshot ← 現行 6 キーの生文字列を複製
       ↓
     categories + workspaces + appMeta(migrationDone=true) を保存
       ↓
     ホームを表示（移行直後の初回のみ。新しいホームの存在をユーザーに伝える）
```

- **localStorage は消さない・変更しない**。移行後もアクティブ作業枠のバッファとして使い続けるため、「既存データ」カテゴリの作業枠 1 を開けば localStorage は既にその内容になっており、注入処理すら実質不要（不変条件 §5.2 を最初から満たす）。
- 移行が成功するまで `migrationDone` を true にしない。移行失敗時はエラー表示（§18）のうえ通常起動し、次回起動時に再試行する。

### 15.3 破損データの扱い

snapshot は生文字列コピーなので、移行時に JSON parse はしない（破損判定をしない）。破損した `dabimasFactor` は従来どおり `refreshLocalDataFromStorage()` 側の try/catch で無視される（現行挙動を変えない）。

---

## 16. コンポーネント構成

```text
root app（vue/app/ 配下に分割済み。index.html は HTML shell）
├─ home-page（v-if currentScreen === 'home'）
│  ├─ category-card（home-page 内で v-for。小さいので分離は任意）
│  └─ category-dialog
├─ <header ref="appHeader">（v-show currentScreen === 'category'）
│  ├─ workspace-tab-bar   ← 新規。header 内の最上段
│  └─ 既存のニトロ/クロス集計ヘッダー（無改変）
├─ main（既存本体・無改変、v-show で表示制御）
├─ combination-dialog（既存・無改変）
└─ factor-dialog（既存・無改変）
```

- 既存本体を `DabifakuBody.vue` のような単一コンポーネントに切り出すことは**しない**（それは分割計画の担当領域。統合版は v-show ラップとタブバー挿入のみ）。
- v1 ドラフトの「本体が `selectedStallionId` props / `select-stallion` events を受けられるか」への回答: **その形にはなっておらず、改修も不要**。状態の受け渡しは localStorage バッファ経由（§5）で行う。

---

## 17. PC・スマホ差分

| 項目 | PC | スマホ |
|---|---|---|
| ホームのカード列数 | 4 列（md 以上） | 2 列 |
| タブバー | `v-slide-group` 矢印表示 | 横スクロール（矢印なし） |
| 左メニュー / ハンバーガー | なし（確定） | なし（確定） |
| 本体表示 | 現行維持 | 現行維持（`applyMobileViewportLayout()` がタブバー込みの header 高さで再計算） |
| 操作 | クリック | タップ（ターゲット 44px 以上） |

---

## 18. エラー処理

| 状況 | 表示（`v-snackbar` または既存エラー UI） | 挙動 |
|---|---|---|
| カテゴリ名未入力 | 「カテゴリ名を入力してください」 | 作成ボタン disabled（ダイアログ内ヘルパーテキスト） |
| DB open 失敗 | 「保存領域を初期化できませんでした。ブラウザを再起動して、もう一度お試しください。」 | ホーム・カテゴリ機能を無効化し、本体は従来どおり localStorage 単独で動作させる（フェイルセーフ） |
| flush 失敗 | 「保存に失敗しました。もう一度お試しください。」 | 作業枠切替・ホーム遷移を中断（アクティブ枠を変えない） |
| 読込失敗 | 「データを読み込めませんでした。」 | 再試行ボタンを表示 |
| 移行失敗 | 「既存データの移行に失敗しました。旧データは削除されていません。」 | `migrationDone` を true にせず通常起動。次回再試行 |
| 血統 detail 取得失敗 | 既存の `notifyHorseDetailError()`（無改変） | 現行挙動のまま |

---

## 19. パフォーマンス設計

- **作業枠切替コスト = 配合復元コスト**。切替は既存の「snapshot 注入 → `refreshLocalDataFromStorage()`」であり、血統再構築・クロス判定（`dispInbreed`）が走る。現行の配合復元で許容されている処理時間と同等。追加の最適化は統合版のスコープ外（分割計画の補足参照）。
- 同一タブ再タップは no-op（§5.3）。
- 切替中はタブを一時 disabled にし、二重切替（flush と注入の競合）を防ぐ。
- flush は 500ms debounce（§12.5）。メモ入力のキーストロークごとに IndexedDB へ書かない。
- ホーム画面は `categories.getAll()` ＋ `workspaces.getAll()`（件数取得用）各 1 回。データ量は高々数百件・数 MB 未満で、体感遅延なし。作業枠数表示は workspaces 全件を categoryId で集計すればよい（個別 count クエリ不要）。
- snapshot は `dabimasFactor` 軽量化済み（descendants 除去済み）で 1 枠あたり数十 KB 程度。IndexedDB 容量懸念なし。
- 新規 JS（§14）は `service-worker.js` の `urlsToCache` に追加し、`CACHE_NAME` を bump する（§4.6）。

---

## 20. 実装順序

**前提: 分割完了計画（`index-split-completion-plan.md`）の全 Phase が完了していること（必須）。** 着手時に同計画 §1 のチェックリストが全て完了になっていることと、§10 の対応表（実績列）で dirty 通知の挿入先ファイルが確定していることを確認する。

1. **基盤**: `unified-db.js` + repositories ＋ ユニットレベルの動作確認（tests/ 配下）
2. **移行**: §15 の初回起動フロー（この時点では移行してもホーム UI はまだ無いので、feature flag またはコンソール確認で検証）
3. **ホーム画面**: home-page / category-dialog / 空状態 / 編集モード
4. **画面切替**: `currentScreen` 導入、本体の v-show ラップ、起動時の直行ロジック（§9.1）
5. **タブバーと切替**: workspace-tab-bar / workspace-sync / dirty 通知 8 箇所（§12.4）
6. **作業枠追加・削除・再採番**
7. **service worker 更新**（precache 追加 + CACHE_NAME bump）
8. **検証**: §21 受入条件、PC・スマホ実機（特に iPhone PWA の pagehide flush）。本体側の回帰確認には分割完了計画の回帰ベースライン（`tests/fixtures/split-baseline/`）を流用できる

---

## 21. 受入条件

### 21.1 ホーム

- カテゴリ 0 件時に空状態が表示される
- カテゴリを追加でき、名前とアイコンを設定できる
- カテゴリ追加時に作業枠 1 が自動作成され、そのカテゴリが開く
- 編集モードで名前変更・並び替え・削除ができる
- PC 版に左メニューがない／スマホ版にハンバーガーメニューがない

### 21.2 作業枠

- カテゴリを開くと header 内にタブバーが表示され、スマホで血統表の高さが崩れない（`applyMobileViewportLayout` がタブバー込みで計算）
- 作業枠を追加でき、追加枠は末尾に表示され、追加後にアクティブになる
- 作業枠を削除でき、1 件時は削除ボタンが出ない
- 削除後に表示番号が再採番され、内部 ID は変わらない
- 表示中枠の削除で繰り上がった枠（末尾なら新しい末尾）が表示される

### 21.3 保存・復元

- 作業枠ごとに血統表 32 セル・子系統・メモ 3 種・手動クロスが保存される
- タブ切替で切替先の状態が完全に復元される（因子集計・クロス・理論表示含む）
- タブ切替を挟んでも、配合保存ダイアログ・自家製馬が従来どおり動く
- ホームへ戻って再度開いても復元される
- PWA を閉じて再起動すると、前回のカテゴリ・作業枠が開き、状態が復元される
- 作業中にアプリをバックグラウンドへ→kill→再起動しても直前の状態が残る（pagehide flush）
- リセットボタンはアクティブ作業枠のみを初期化する（他の枠に影響しない）

### 21.4 既存データ移行

- 旧データがある場合のみ「既存データ」カテゴリが先頭に作成され、作業枠 1 に内容が入っている
- 移行後も localStorage の旧データは削除されていない
- 再起動しても重複作成されない（migrationDone）
- 旧データがない新規ユーザーは空のホームから始まる

---

## 22. 本版で新たに仕様化した事項（要承認リスト）

v1 ドラフトで「未確定」だったものを、本版では以下のとおり決定した。実装前に相違があれば指摘すること。

1. **カテゴリ削除を許可**（配下全削除・最後の 1 件も可・「既存データ」も可・確認ダイアログ必須）— §10.4
2. **起動時は前回のカテゴリ・作業枠へ直行**（移行直後の初回のみホーム表示）— §9.1
3. **作業枠の保存対象は snapshot 6 キー**（種牡馬・繁殖牝馬 2 頭ではなく現行永続化対象の全部）— §12.2
4. **検索文字列・表示モード・スクロール位置は保存しない**（現行アプリのリロードと同じ扱い）— §12.2
5. **本体コードへの変更は dirty 通知 8 箇所 + v-show ラップ + タブバー挿入のみ**— §12.4, §16
6. **新 DB `dabifaku_unified` を新設し、既存 `DabifacCombinationDB` には触れない**— §5.5
7. **配合保存・自家製馬はカテゴリ・作業枠をまたぐ共有資産のまま**— §5.5
8. **並び替えは ↑↓ ボタン**（ドラッグ＆ドロップ不採用・新規依存なし）— §9.2

---

## 23. 実装時の禁止事項

- Vue 3 へ移行しない／Vuetify を外さない
- PC 版に左メニュー、スマホ版にハンバーガーメニューを追加しない
- 例示の 7 カテゴリを初期固定値として作らない
- 本体 UI・本体ロジックを §12.4 / §16 に列挙した以外の形で改変しない
- `DabifacCombinationDB` のスキーマ・version を変更しない
- localStorage の 6 キーの形式・キー名を変更しない（バッファとして現行のまま使う）
- 移行時に localStorage の旧データを削除しない
- snapshot を parse して別形式に変換しない（生文字列のまま保存する）
- 新規ライブラリ（vuedraggable 等）を追加しない

---

## 24. 追補（2026-07-07）: 配合の種牡馬・繁殖牝馬保存／配合ステータスバー

統合版の実装完了後の機能拡張。詳細設計は `docs/save-as-horse-and-status-bar-design.md` を正とする（本章はサマリと本仕様との関係の記録のみ）。

### 24.1 追加する機能

1. **配合の種牡馬・繁殖牝馬保存**: 配合保存ダイアログの保存種別を「種牡馬／繁殖牝馬」の2択にし、1回の保存で「復元用 configData（従来どおり）」と「候補リスト用の馬レコード（`DabifacCombinationDB.customHorses`、descendants 15件）」の両方を作る。保存馬は「☆タイトル」として候補リスト先頭に出る。★セルの手動因子は保存時の値で固定され、☆馬の血統内では因子設定不可（`factorLocked`）。旧形式の保存済み配合は「配合」バッジ付きの復元専用として残す。
2. **配合ステータスバー**: `<header ref="appHeader">` 内・集計ヘッダー直下に高さ24px固定のバーを常時表示（PC・モバイル共通）。左に相性値（計算未実装のうちは「--」、`vue/logic/theory/affinity.js` の `calculateAffinity` が差し込み口）、右に保存ダイアログを開く「保存」ボタン。モバイルで `dispCategory` の切替なしに保存ダイアログへ到達できるようになる。

### 24.2 本仕様との関係

- §23 の「本体 UI・本体ロジックを改変しない」は統合版ラッパー導入時のスコープであり、本追補には適用しない。改変してよい箇所は詳細設計 §8 の一覧に限定する。
- 次の不変条件は本追補でも維持する: `DabifacCombinationDB` の version・ストア構成（フィールド追加のみ可）、localStorage 6キーの形式・キー名、`configData` の構築・復元ロジック、`applyMobileViewportLayout` の計算式（バーは header 内に置くため実測に自動で含まれる）、統合版（workspace-sync / repositories / home / tab-bar）のコード。
- 保存馬・配合保存は引き続き**全カテゴリ・全作業枠で共有のグローバル資産**（§5.5 と同方針）。作業枠 snapshot 内の☆馬参照は従来の自家製馬と同じく `customHorses` から解決される。
- 新規 JS/CSS は `service-worker.js` の `urlsToCache` へ追加し `CACHE_NAME` を bump する（§4.6 と同運用）。

---

## 25. 追補（2026-07-17）: 相性（ニックス）表示

配合ステータスバー（§24.2 / `docs/save-as-horse-and-status-bar-design.md`）の相性枠に、**相性を数値ではなく文言で**表示する。計算は配布済みの WASM（nicks v1.3, hash `43c73869f1a2`）に委ね、アプリは入力値の組み立てと戻り値（`commentId`）→文言の変換だけを行う。

§24 時点の「相性値（数値）を表示、未実装のうちは `--`」という記述は本章で置き換える。**表示は常に文言であり、数値は画面に出さない。**

### 25.1 配布物と配置

公開リリース `dabimas_nicks_wasm_public_release_js_v1.3_43c73869f1a2` の内容を以下に配置する。

| リリース内ファイル | 配置先 | 備考 |
|---|---|---|
| `assets/nicks.43c73869f1a2.wasm` | `assets/nicks.43c73869f1a2.wasm` | 4,224 bytes。sha256 は `wasm-asset.json` のとおり |
| `data/sire_lines_public.json` | `data/sire_lines_public.json` | 子系統マスター（id 1–58）。名前→ID 再解決のフォールバック表を兼ねる |
| `src/services/nicks/nicksCalculator.js` | `vue/logic/nicks/nicksCalculator.js` | **無改変で配置**（ES Modules）。バージョン更新時はファイル差し替えのみで済ませる |
| `wasm-asset.json` | `assets/wasm-asset.json` | 整合性確認の記録用。配信・キャッシュ対象にしなくてよい |

- 平文相性マスタ・生成ヘッダー・private manifest・C 生成元は**リポジトリにコミットしない**（リリース README の指示どおり）。
- `nicksCalculator.js` は ES Modules のため、既存の classic `<script>` 群とは別に `<script type="module">` で読み込む（§25.5）。
- WASM・`sire_lines_public.json`・新規 JS は `service-worker.js` の `urlsToCache` へ追加し `CACHE_NAME` を bump する（§4.6 と同運用）。ラッパー側の `fetch(..., { cache: "force-cache" })` と二重キャッシュになるが害はない。

### 25.2 WASM の入出力と表示文言

`LocalNicksCalculator#calculate(input)` を用いる。入力は次のとおり（すべて必須。範囲外はラッパーが例外を投げる）。

| 入力 | 値 | 出どころ |
|---|---|---|
| `rarity` | 1–5 | 種牡馬（`selected[0]`）の `rare`（★数。`docs/sire-line-id-design.md` §4.2-7 で付与） |
| `sireLineId` | 1–58 | 種牡馬（`selected[0]`）の `sonId`（子系統ID） |
| `partnerLineIds` | 長さ4の配列, 各 1–58 | 繁殖牝馬側の牝系ラインの種牡馬4頭の `sonId` を**この順で**: 父（`selected[17]`）→ 母父（`selected[19]`）→ 母母父（`selected[23]`）→ 母母母父（`selected[31]`） |
| `miracle` | boolean | 奇跡の血量ボーナスの照合結果（§25.3） |

戻り値 `commentId`（0–4）を次の文言へ変換して表示する。

| commentId | 表示 |
|---|---|
| 1 | 完璧 |
| 2 | 優れた |
| 3 | 良い |
| 4 | 程々 |
| 0 | `--`（文言なし） |
| 計算不能（§25.4） | `--` |

`calculateDebug()` は調査・検証専用とし、本番コードから呼ばない。

### 25.3 奇跡の血量ボーナス（`miracle`）の照合

**独立した判定である。** 既存の奇跡配合判定（`vue/logic/theory/compatibility.js` の theory_06）の結果を流用してはならない。theory_06 は「面白配合成立（親系統ユニーク数≥7）かつ 共通要素数=4（完璧の条件）かつ 至高不成立」の場合にしか位置照合を行わないため、それ以外の配合では位置が一致していても theory_06 側は奇跡と判定しない。相性用の `miracle` は**配合理論の成立状況（面白・完璧・至高など）に一切左右されず**、以下の位置照合だけで判定する。

照合位置は次のとおり。**馬名の完全一致**で照合する。

- 繁殖牝馬側: `母→父`、つまり繁殖牝馬の**母父**（血統表 index 19）の1か所
- 種牡馬側: 種牡馬の血統表の次の4か所
  - 父父父（index 4）
  - 父母父（index 5）
  - 母父父（index 6）
  - 母母父（index 7）

産駒の血統上では種牡馬側が4代目、繁殖牝馬側が3代目になるため、実質的な **4×3 クロス判定**である。

成立条件: 繁殖牝馬の母父と同名の馬が、種牡馬側4か所のうち**ちょうど1か所**にいるとき `miracle = true`。**同じ奇跡対象が種牡馬側の候補に2頭以上いると成立しない**（`false`）。0か所なら当然 `false`。

既存 theory_06 との対応関係（実装時の指針）:

| 観点 | 既存 theory_06 | 相性用 `miracle` |
|---|---|---|
| 照合位置（index 19 × index 4–7） | 同じ | 同じ |
| 馬名完全一致・ちょうど1か所 | 同じ | 同じ |
| 前提条件 | 面白成立かつ共通要素数4かつ至高不成立のときのみ評価 | **前提条件なし**（位置照合のみ） |

したがって照合ロジックは `affinity.js` 内に独立して実装する（`compatibility()` を呼ばない・`styleThoeryClass` を参照しない）。参照するのは `context.selected` の該当 index の馬名のみ。

なお `miracle = true` を渡しても、ボーナスを実際に適用するかどうかの最終判断は WASM 内部で行われる（デバッグ出力の `miracleBonusApplied` が実適用の有無）。アプリ側は位置照合の結果を渡すだけでよい。

### 25.4 計算可能条件とフォールバック

以下をすべて満たすときだけ WASM を呼ぶ。1つでも欠ければ計算不能として `--` を表示する（WASM は呼ばない）。

1. **血統表32セルすべてが選択済み**であること（`selected.every((e) => e)`。配合理論判定 `dispTheory` と同じトリガー条件）。相性の判定は32個そろってからでよく、それまでは常に `--`
2. 種牡馬の `rare` が 1–5 の整数（自家製馬・☆馬など `rare` を持たない種牡馬は計算不能）
3. 入力に使う5頭（種牡馬 `selected[0]`、繁殖牝馬側 `selected[17]`, `[19]`, `[23]`, `[31]`）すべての子系統IDが解決できること。`sonId` が `null`/undefined の馬（旧保存データ・自家製馬）は、`son`（子系統名）を `data/sire_lines_public.json` の `name` と突き合わせて再解決する（`docs/sire-line-id-design.md` §4.4 で予告済みのフォールバック）。名前でも解決できなければ計算不能

さらに、WASM 未初期化・初期化失敗・ラッパー例外（RangeError 等）もすべて計算不能扱い（`--`）とし、**アプリ本体の動作には影響させない**（相性表示が `--` のままになるだけ）。

### 25.5 実装構成

差し込み口は §24.2 で確定済みの `vue/logic/theory/affinity.js` の `calculateAffinity(context)` を維持する。

- **新規 `vue/logic/nicks/nicks-boot.js`**（ES Module・`<script type="module">` で読み込み）:
  - `nicksCalculator.js` から `LocalNicksCalculator` を import し、`./assets/nicks.43c73869f1a2.wasm` で生成・`initialize()` する（起動をブロックしない）。
  - `data/sire_lines_public.json` を読み込み、子系統名→ID の再解決表を作る。
  - `window.Dabimas.logic.nicks` として同期 API（`isReady()` / `calculate(input)` / `resolveLineId(sonId, sonName)`）を公開する。
  - 初期化完了・失敗を root app へ通知し、完了時に相性の computed が再評価されるようにする（reactive なフラグを1つ立てる）。
- **`vue/logic/theory/affinity.js`**: スタブを実装に置き換える。`context.selected` から §25.2 の入力を組み立て、§25.3 の照合を行い、`calculate()` の戻り値 `commentId`（number）または `null`（計算不能）を返す。
- **`affinityDisplayText`**（`vue/app/app-computed.js`）: 「数値の文字列化」から「§25.2 の commentId→文言マップ」へ変更する。`null`・0 はともに `--`。
- 表示コンポーネント（配合ステータスバー）は変更なし（`affinityText` prop に文言が入るだけ）。

### 25.6 制約・禁止事項

- `nicksCalculator.js`・`.wasm` は改変しない（更新はリリース一式の差し替えで行う）。
- 相性の内部値（`totalPoint` / `basePoint`）を UI に表示しない。表示するのは §25.2 の文言のみ。
- §24.2 の不変条件（`DabifacCombinationDB`・localStorage 6キー・`configData`・`applyMobileViewportLayout`・統合版コード）は本章でも維持する。

### 25.7 受入条件

1. 血統表32セルがすべて選択済みになった時点で、ステータスバーに文言（完璧／優れた／良い／程々）または `--` が表示される。31セル以下の間は常に `--`
2. 繁殖牝馬の母父が種牡馬側4か所のちょうど1か所と同名のとき `miracle=true` で計算され、2か所以上一致のときは `miracle=false` になる（`calculateDebug()` で検証）
3. **配合理論が奇跡（theory_06）に到達しない配合**（例: 面白不成立・共通要素数≠4）でも、§25.3 の位置照合が成立していれば `miracle=true` で計算される（theory_06 非流用の確認）
4. `sonId` を持たない旧保存データ・自家製馬でも、子系統名から ID 再解決できれば相性が表示される
5. `rare` なし・系統解決不能のときは `--` 表示のまま、他機能は正常動作する
6. WASM の取得・初期化に失敗しても（オフライン初回など）アプリは正常動作し、相性は `--` のままになる
7. オフライン時（service worker キャッシュ済み）でも相性が計算できる

---

## 26. 追補（2026-08-01）: PWA スタンドアロン対応と配合ステータスバー廃止

### 26.1 配合ステータスバーの廃止と集計ヘッダーへの集約

- §24.2 の配合ステータスバー（高さ 24px・PC/モバイル共通・常時表示）は本節で廃止する。相性の表示先は子系統モード集計ヘッダー右端の旧「子系統数」欄へ移し、保存導線は同ヘッダーの配合ダイアログ起動セル（旧・馬アイコン）へ一本化する。起動セルには以後、保存アイコンを表示する。
- §25 の「表示コンポーネントは配合ステータスバー」という記述は本節で置き換える。相性文言（完璧／優れた／良い／程々／`--`）の算出仕様そのものは §25 から変更しない。
- 通常モード（`dispCategory % 2 === 0`）には相性を表示しない。子系統数の件数表示は画面から廃止する。
- §24.2 が挙げていた「モバイルで `dispCategory` の切替なしに保存ダイアログへ到達できる」利点は、本節の変更により失われる（依頼者了承済み）。

### 26.2 PWA スタンドアロン対応

- `index.html` に `apple-mobile-web-app-capable`、`apple-mobile-web-app-status-bar-style=default`、`theme-color=#ffffff` を追加する。
- manifest の `start_url` は `./index.html` へ相対化し、`scope=./` と `theme_color=#ffffff` を追加する。これにより本番 URL の解決結果を変えず、LAN 開発サーバからインストールした場合は同サーバのアプリを起動できる。
- `viewport-fit=cover` は採用しない。安全領域へコンテンツを広げてもタップ可能要素を守る余白が必要になり、縦方向の実利がないうえ既存レイアウト計算の回帰リスクが増えるためである。
