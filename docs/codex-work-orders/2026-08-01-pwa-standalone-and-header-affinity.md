# 作業指示書: PWA スタンドアロン対応 ＋ 配合ステータスバー廃止（相性・保存を集計ヘッダーへ集約）

- status: 依頼中
- 作成日: 2026-08-01
- 依頼元: Claude Code セッション

## 背景と目的

このアプリ（ダビふぁく）は iPhone Safari で使われる縦画面前提のツールで、画面の縦方向は常に足りていない。血統表はモバイルで **32 行**（種牡馬 16 行＋繁殖牝馬 16 行）を 1 画面に収めるため、1 行あたりの高さが 18px 前後しかなく、誤タップが起きやすい。

本件は「ヘッダーの縦幅を削って、その分を血統表の行高に回す」ことが目的の変更 2 件である。

### ① PWA（ホーム画面に追加）でのスタンドアロン起動を正しく効かせる

依頼者の元の問いは「PWA にすると画面上部の時刻とかその辺のも消える？」だが、**事実は次のとおり**なので、実装方針もそれに従うこと。

- iOS のステータスバー（時刻・電波・バッテリー）は standalone PWA でも **消えない**。消せる API もない。
- standalone で消えるのは **Safari の URL バー（上）とツールバー（下）** で、iPhone 実機で合計 100px 前後。これがそのまま `main` の高さ、つまり血統表 32 行の行高に回る。ここが本件の実利。
- 現状 `index.html` の head には `mobile-web-app-capable` しか無く、`apple-mobile-web-app-capable` 系・`theme-color` が無い。`manifest.json` も `theme_color` / `scope` が無く、`start_url` が本番の絶対 URL 固定になっている（LAN の開発サーバからインストールすると本番 URL が起動してしまい、ローカル変更を PWA で検証できない）。

したがって ① の作業は「ステータスバーを消す」ではなく、**standalone 起動が確実に効く head / manifest の整備**である。

### ② 配合ステータスバー（相性・保存）を廃止し、集計ヘッダーへ寄せる

現在 `<header>` の最下段に高さ 24px の `<combination-status-bar>` が常時表示されており（左「相性 --」／右「保存」ボタン）、横方向はほぼ空白で縦 24px を専有している。この 24px も血統表に回す。

移設先は **子系統モード（`dispCategory % 2 === 1`）の集計ヘッダー右端**。子系統モードの右端列は現在「子系統数」ラベル＋件数、その下に馬アイコン（`mdi-horse-variant`）の配合ダイアログ起動セルがある。ここを

- 「子系統数」ラベル＋件数 → **「相性」ラベル＋相性文言**
- 馬アイコンのセル → **保存アイコン（`mdi-content-save`）**

に差し替える。

**依頼者に確認済みの仕様判断（勝手に変えないこと）**:

- 通常モード（因子ボタン側／`dispCategory % 2 === 0`）の右上「理論」欄は **現状のまま**。通常モードに相性は表示しない。
- 子系統数の件数表示は画面から消える（相性に置き換わる）。
- 保存導線は子系統モード側だけになる。通常モードのモバイル画面からは配合保存ダイアログへ到達できなくなる（仕様 §24.2 がモバイル向けに解消していた点が元に戻る）が、**これは依頼者が承知のうえで選択した仕様**である。通常モードに保存ボタンを足したりリロードボタンを置き換えたりしないこと。

## 実装方針

### ①-1 `index.html` の head（`apply_patch` 限定・AGENTS.md 準拠）

既存の `<meta name="mobile-web-app-capable" content="yes" />` の直後に以下を追加する。

```html
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="ダビふぁく" />
<meta name="theme-color" content="#ffffff" />
```

- `apple-mobile-web-app-status-bar-style` は **`default` を使う**。`black-translucent` にすると Web コンテンツがステータスバーの下に潜り込み、作業枠タブバーが時刻・バッテリーと重なる。重なりを避けるには `padding-top: env(safe-area-inset-top)` で同じ高さを戻すことになり、得られる高さは差し引きゼロなので採用しない。
- `theme-color` の `#ffffff` は、ホーム画面（`.dabimas-home` の `background-color: #ffffff`）とカテゴリ画面上端の地色に合わせた値。`default` スタイルのステータスバーは暗い文字なので白地で問題ない。
- **`viewport` の `content` は変更しない**（`viewport-fit=cover` を足さない）。足すとホームインジケータ帯と切り欠き帯までコンテンツ領域になるが、タップ可能要素を守るために結局 `env(safe-area-inset-*)` で戻すことになり、縦の実利がないうえ既存のモバイルレイアウト計算（`applyMobileViewportLayout`）の回帰リスクだけが増える。

### ①-2 `manifest.json`

```json
{
    "short_name": "ダビふぁく",
    "name": "ダビふぁく",
    "display": "standalone",
    "start_url": "./index.html",
    "scope": "./",
    "theme_color": "#ffffff",
    "background_color": "#4169e1",
    "icons": [...変更なし...]
}
```

- `start_url` を相対にする。マニフェスト URL が `https://dabimastools.github.io/dabimasFactor/manifest.json` なので `./index.html` の解決結果は現行の絶対値と**完全に同一**であり、本番でのアプリ ID（= 解決後 start_url）は変わらない＝既存インストールが別アプリ扱いになる事故は起きない。同時に LAN 開発サーバからインストールしたときはローカルの `index.html` が起動するようになる。
- `scope` の `./` も本番では既定値（start_url のディレクトリ）と同一で、LAN でだけ正しく効く。
- `background_color`（スプラッシュ用）は既存の `#4169e1` のまま触らない。
- JSON のインデントは既存の 4 スペースに合わせる。`id` フィールドは追加しない。

### ②-1 `vue/components/header/factor-summary-header.js`

props に相性文言を追加する。既存 props の書式に合わせること。

```js
affinityText: { type: String, default: "--" },
```

テンプレートの変更は 3 箇所＋アイコン置換。

**(a) デスクトップ子系統モード（`tbody.sire-line-summary--desktop`）**

- 1 行目の `<th rowspan="2" class="table_footer_TH_theory">子系統数</th>` → ラベルを `相性` にする（`rowspan` / class はそのまま）。
- 3 行目（出現数の行）末尾の `<td>{{ categoryNum }}</td>` → `<td class="sire-line-affinity-value">{{ affinityText }}</td>`。

**(b) モバイル子系統モード（`tbody.sire-line-summary--mobile`）**

- 1 行目の `<th class="f00_theory">子系統</th>` → ラベルを `相性` にする（class はそのまま）。
- 2 行目（系統数の行）末尾の `<td class="mobile-nitro-rowspan" align="center">{{ categoryNum }}</td>` → `<td class="mobile-nitro-rowspan sire-line-affinity-value" align="center">{{ affinityText }}</td>`。

**(c) 馬アイコン → 保存アイコン**

このファイル内の `mdi-horse-variant` は **4 箇所**（デスクトップ通常モード / デスクトップ子系統モード / モバイル通常モードの `v-else` 分岐 / モバイル子系統モード）。**4 箇所すべて** を `mdi-content-save` に置換する。`size` 属性・`color="white"`・`:style="combinationCellStyle"`・`@click="$emit('combination-open')"` は変更しない。
※ モバイル通常モードの `v-else` 分岐は `dispCategory % 2 === 0` の tbody 内にあるため実際には描画されない死にコードだが、`mdi-horse-variant` を grep したときに漏れが無い状態にするため一緒に置換する。この死にコード自体の削除はスコープ外。

あわせて、`combination-open` を emit する **描画される 3 セル**（デスクトップ通常・デスクトップ子系統・モバイル子系統）に `aria-label="保存"` と `title="保存"` を追加する。

**`categoryNum` prop は削除しない**。通常モードの死にコード分岐がまだ参照しているため、prop 定義と `index.html` の `:category-num` バインドはそのまま残す。

### ②-2 `index.html`（`apply_patch` 限定）

- `<factor-summary-header ...>` に `:affinity-text="affinityDisplayText"` を追加する（既存の props バインド行の並びに合わせる）。
- `<combination-status-bar ... ></combination-status-bar>` の要素（72〜75 行目付近）を丸ごと削除する。
- `<script src="./vue/components/header/combination-status-bar.js"></script>`（171 行目付近）を削除する。

### ②-3 ファイル削除

- `vue/components/header/combination-status-bar.js` を削除する。

### ②-4 `css/unified.css`

- `/* ===== 配合ステータスバー ===== */` 見出しと、その配下の `.combination-status-bar` / `-label` / `-value` / `-spacer` / `-save` の 5 ルールをまとめて削除する。前後のセクション（`.dabimas-tab-btn-close` と `/* ===== 設定・エディット種牡馬 ===== */`）には触らない。

### ②-5 `css/mobile.css`

**(a) 相性文言の字詰め**

モバイルの右端列は `.table_footer_TH_theory { width: 48px }`、値セルは `.mobile-nitro-rowspan { font-size: 16px !important; overflow: hidden }` である。相性文言は最長 3 文字（「優れた」）で 16px では 48px に収まらず切れるため、既存の `.mobile-nitro-rowspan` / `.mobile-cross-rowspan` ルール（179 行目付近）の直後に以下を追加する。

```css
/* 子系統モードの相性文言（最長3文字「優れた」）が 48px 幅に収まるようにする */
.exp-mobile-layout header .mobile-nitro-rowspan.sire-line-affinity-value {
  font-size: 11px !important;
  white-space: nowrap;
}
```

**(b) JS 実行前フォールバックの更新**

`:root` の `--exp-mobile-main-height: calc(100svh - 116px)` の `116px` を **`92px`** にする（116 = 作業枠タブバー 32 + 集計テーブル約 60 + ステータスバー 24。バー廃止で 24px 減る）。この変数は `applyMobileViewportLayout()` が走る前の初期描画にしか使われないが、実測値とずれたままにしない。

### ②-6 `service-worker.js`

- `urlsToCache` から `BASE_PATH + 'vue/components/header/combination-status-bar.js',` の行を削除する。
- `CACHE_NAME` を **1 回だけ** bump する（`dabimas-factor-v20260801-01` → `dabimas-factor-v20260801-02`）。

### ②-7 血統表の行高について（コードを触らないこと）

`vue/app/methods/ui-viewport.js` の `applyMobileViewportLayout()` は
`headerHeight = $refs.appHeader.getBoundingClientRect().height` を**実測**し、
`mainHeight = viewportHeight - headerHeight`、`rowHeight = (mainHeight - fixedHeight) / 32`
で行高を出している。ステータスバー 24px を DOM から消せば行高は自動的に約 +0.75px/行 になる。
**`ui-viewport.js` の計算式・定数（`safetyPerCard` / `layoutSafety` / `/ 32` など）は一切変更しないこと。**

### 変更対象ファイル

- `index.html` — PWA meta 追加、`:affinity-text` バインド追加、`<combination-status-bar>` 要素と script タグ削除
- `manifest.json` — `start_url` 相対化、`scope` / `theme_color` 追加
- `vue/components/header/factor-summary-header.js` — `affinityText` prop 追加、子系統モード右端の相性化、`mdi-horse-variant` → `mdi-content-save`（4 箇所）、`aria-label` / `title` 追加
- `vue/components/header/combination-status-bar.js` — **削除**
- `css/unified.css` — `.combination-status-bar` 系 5 ルール削除
- `css/mobile.css` — `.sire-line-affinity-value` の字詰めルール追加、`--exp-mobile-main-height` フォールバックを 92px に
- `service-worker.js` — `combination-status-bar.js` を `urlsToCache` から削除、`CACHE_NAME` を 1 回 bump
- `docs/dabifaku_unified_spec_draft.md` — §26 追補を追記（下記）

### ②-8 仕様書への追補

`docs/dabifaku_unified_spec_draft.md` の末尾（現在の最終節は §25）に `## 26. 追補（2026-08-01）: PWA スタンドアロン対応と配合ステータスバー廃止` を追加し、既存の §24 / §25 の本文は**書き換えずに残す**（このリポジトリは追補で上書きしていく形式）。追補には最低限これらを書く:

- §24.2 の「配合ステータスバー（高さ 24px・PC/モバイル共通・常時表示）」は本節で**廃止**。相性の表示先は子系統モード集計ヘッダー右端（旧「子系統数」欄）に移り、保存導線は同ヘッダーの配合ダイアログ起動セル（旧・馬アイコン、以後は保存アイコン）に一本化される。
- §25 の「表示コンポーネントは配合ステータスバー」という記述は本節で置き換わる。相性文言（完璧／優れた／良い／程々／`--`）の算出仕様そのものは §25 のまま変更なし。
- 通常モード（`dispCategory % 2 === 0`）には相性を表示しない。子系統数の件数表示は画面から無くなる。
- §24.2 が挙げていた「モバイルで `dispCategory` の切替なしに保存ダイアログへ到達できる」利点は本節で失われる（依頼者了承済み）。
- PWA: `apple-mobile-web-app-capable` / `apple-mobile-web-app-status-bar-style=default` / `theme-color=#ffffff` を追加、manifest の `start_url` 相対化と `scope` / `theme_color` 追加。`viewport-fit=cover` は採用しない（採否理由も 1 行書く）。

## 制約

- `AGENTS.md` の Safety Rules に従うこと（`index.html` は `apply_patch` 限定、編集前 `backup-index-exp`、編集後 `verify-index-exp`、UTF-8 BOM 禁止）。
- `factor-summary-header.js` は classic script（IIFE + `window.Dabimas` 名前空間）のまま。ES Modules 化しない。UTF-8 BOM を付けない。
- 既存の props / emit の名前（`combination-open`・`toggle-category`・`reset`・`capture-screenshot`）は変更しない。`handleCombinationCellClick` が配合ダイアログ起動の唯一のハンドラである点も変えない。
- `combinationCellStyle`（紫グラデーション）はそのまま使う。保存セルの見た目の地色を変えない。
- git の commit / branch / restore / stash 操作を一切行わない。作業ツリーの既存未コミット変更（`feature/dabifaku-unified` の統合版実装一式）に触れない・巻き戻さない・再フォーマットしない。

## スコープ外（やらないこと）

- `vue/app/methods/ui-viewport.js` の変更（`applyMobileViewportLayout` の計算式・定数・`markPedigreeStairEdges`）。
- `vue/app/app-computed.js` の `affinityScore` / `affinityDisplayText` の変更。相性の計算ロジック（`vue/logic/theory/affinity.js`・`vue/logic/nicks/`・`assets/`・`data/`）には一切触らない。
- 通常モードの集計ヘッダー（理論欄・リロードボタン・カメラボタン）のレイアウト変更、および通常モードへの保存ボタン追加。
- `factor-summary-header.js` に残っている死にコード（`dispCategory % 2 === 0` の tbody 内にある `v-else` 分岐）の削除・整理。
- `css/style.css`・`vue/CombinationDialog.js`・`vue/components/pedigree/`・`mobile-horse-picker.js` の変更。
- `manifest.json` への `id` / `orientation` / `display_override` / `shortcuts` の追加、`background_color` の変更、アイコン画像の差し替え。
- `note-article/`・`skills/`・`README.md`・他の `docs/codex-work-orders/*.md` の変更。
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

1. `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp index.html` が `[verify] OK` を返す。`index.html` に UTF-8 BOM が無い。
2. `index.html` の head に `apple-mobile-web-app-capable` / `apple-mobile-web-app-status-bar-style="default"` / `apple-mobile-web-app-title` / `theme-color="#ffffff"` の 4 meta が存在し、`viewport` の `content` が変更前と 1 文字も違わない。
3. `manifest.json` が JSON として妥当（`node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))"` が成功）で、`start_url === "./index.html"`・`scope === "./"`・`theme_color === "#ffffff"`・`display === "standalone"`・`background_color === "#4169e1"`・`icons` が 2 件のまま。
4. リポジトリ全体の grep で `combination-status-bar` の参照が `docs/` 配下（過去の指示書・設計書・新規 §26 追補）以外に 1 件も残っていない。`vue/components/header/combination-status-bar.js` が存在しない。
5. リポジトリ全体の grep で、`vue/components/header/factor-summary-header.js` 内に `mdi-horse-variant` が 0 件、`mdi-content-save` が 4 件。
6. `factor-summary-header.js` のテンプレート文字列に対する機械チェックが通る（方法は問わない。Node でファイルを読んで文字列検査するのが簡単）:
   - `sire-line-summary--desktop` の tbody 内に `相性` と `{{ affinityText }}` があり、`子系統数` と `{{ categoryNum }}` が無い
   - `sire-line-summary--mobile` の tbody 内に `相性` と `{{ affinityText }}` があり、`{{ categoryNum }}` が無い
   - `affinityText` が props に定義されている
7. `python -m http.server 8080` で配信し、`dump-dom http://localhost:8080/index.html 390 844` の出力（**VirtualTimeBudget は 30000 を指定すること**。既定の 12000 だと Vue マウント前の DOM しか取れないことがある）で:
   - `.combination-status-bar` の DOM が存在しない
   - `<v-app id="app">` がマウント済みで、コンソールに `TypeError` / `ReferenceError` / Vue warn が出ていない
   - head に受け入れ基準 2 の 4 meta が含まれる
8. `screenshot http://localhost:8080/index.html tmp/pwa-header-home.png 390 844` が成功し、ホーム画面がエラー表示なく描画される。
9. `service-worker.js` の `CACHE_NAME` が `dabimas-factor-v20260801-02` になっており（bump は 1 回だけ）、`urlsToCache` から `combination-status-bar.js` が消えている。`urlsToCache` に載っている `vue/**/*.js` のうち実在しないファイルが 0 件であること（`node` で `urlsToCache` を舐めて `fs.existsSync` する等、機械的に確認する）。
10. `node --check` が `vue/components/header/factor-summary-header.js` と `service-worker.js` で成功する。`python -m pytest` が既存どおり全件成功する。
11. 実機・実画面でしか確認できない項目（iPhone でのホーム画面追加→standalone 起動、子系統モードでの相性表示と保存ボタンのタップ、血統表 32 行の行高が伸びていること）は、完了報告に「未検証（検収時に確認）」と**明記**する。無言のスキップは不可。

## 検証コマンド

```powershell
# index.html 編集前（必須）
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 backup-index-exp index.html

# index.html 編集後（必須）
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp index.html

# ローカル配信（リポジトリルートで。service worker 込みで動かすため file:// は使わない）
python -m http.server 8080

# DOM 確認（受け入れ基準 7。VirtualTimeBudget 30000）
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 dump-dom http://localhost:8080/index.html 390 844

# スクリーンショット（受け入れ基準 8）
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 screenshot http://localhost:8080/index.html tmp/pwa-header-home.png 390 844

# 構文チェック
node --check vue/components/header/factor-summary-header.js
node --check service-worker.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))"
python -m pytest
```

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。

### 変更ファイル一覧

- `index.html`: iOS PWA 用 meta 4 件を追加し、集計ヘッダーへ `affinityDisplayText` を渡した。旧 `<combination-status-bar>` 要素と script 読み込みを削除した。
- `manifest.json`: `start_url` を相対化し、`scope` と `theme_color` を追加した。
- `vue/components/header/factor-summary-header.js`: `affinityText` prop、子系統モードの相性表示、保存アイコンとアクセシビリティ属性を追加した。
- `vue/components/header/combination-status-bar.js`: 削除した。
- `css/unified.css`: 配合ステータスバー用の 5 ルールを削除した。
- `css/mobile.css`: 相性文言の字詰めルールを追加し、初期 main 高さのフォールバックを 92px に更新した。
- `service-worker.js`: 旧コンポーネントのプリキャッシュ参照を削除し、`CACHE_NAME` を `dabimas-factor-v20260801-02` へ 1 回 bump した。
- `docs/dabifaku_unified_spec_draft.md`: 既存 §24 / §25 を保持したまま §26 追補を追加した。
- `docs/codex-work-orders/2026-08-01-pwa-standalone-and-header-affinity.md`: 本完了報告を記入した。
- `index.bak.20260801-222806.html`: `backup-index-exp` が作成した編集前バックアップ。
- `tmp/pwa-header-home.png`: 390×844 のブラウザ検証スクリーンショット。

### 設計判断

なし。

### 実行した検証と結果

1. `verify-index-exp index.html`: `[verify] OK`。先頭バイト検査でも UTF-8 BOM なし。
2. Node の文字列検査: PWA meta 4 件を確認。編集前バックアップとの比較で `viewport` の `content` は完全一致。
3. `JSON.parse` と値検査: 成功。`start_url` / `scope` / `theme_color` / `display` / `background_color` は指定値、`icons` は 2 件。
4. `combination-status-bar` 検査: ライブ実装（`docs/` と `index.bak.*` を除く）は 0 件で、旧コンポーネントファイルも不存在。字義どおりのリポジトリ全体 grep では必須バックアップと既存バックアップ 2 件だけに旧文字列が残る（「残課題・気づき」参照）。
5. アイコン件数検査: `mdi-horse-variant` 0 件、`mdi-content-save` 4 件。
6. テンプレート機械検査: デスクトップ／モバイルの子系統 tbody に `相性` と `{{ affinityText }}` があり、対象範囲に旧件数表示がないこと、prop 定義があることを確認。
7. `dump-dom http://localhost:8080/index.html 390 844 30000`: Vue マウント済み。旧バーなし、PWA meta 4 件あり、出力中に `TypeError` / `ReferenceError` / `[Vue warn]` なし。
8. `screenshot ... tmp/pwa-header-home.png 390 844 30000`: 390×844 の PNG（13,234 bytes）を生成し、ホーム画面がエラー表示なく描画されることを目視確認。補助スクリプトは画像生成後に終了コード 1 を返した（「残課題・気づき」参照）。
9. Service Worker 検査: `CACHE_NAME` は指定値が 1 件、旧値と旧コンポーネント参照は 0 件。プリキャッシュ対象の Vue JS 60 件はすべて実在。
10. `node --check vue/components/header/factor-summary-header.js` / `node --check service-worker.js`: 成功。`python -m pytest`: 13 passed。
11. iPhone 実機でのホーム画面追加後の standalone 起動、子系統モードでの相性表示／保存ボタンのタップ、血統表 32 行の行高増加は未検証（検収時に確認）。

追加レビュー: Standards 軸は指摘 0 件。Spec 軸は受け入れ基準 4 のバックアップ内文字列について低リスク 1 件（下記）で、それ以外の欠落・スコープクリープ・誤実装はなし。

### 残課題・気づき

- 受け入れ基準 4 をバックアップファイルまで含めて字義どおり grep すると、`backup-index-exp` で作成した `index.bak.20260801-222806.html` と既存の `index.bak.20260801-163306.html` / `index.bak.20260722-101901.html` に旧文字列が残る。いずれも実行時に読み込まれない編集前バックアップであり、既存未コミット変更を触らない制約とバックアップ目的を優先して保持した。
- スクリーンショット補助スクリプトは有効な PNG を生成した後に終了コード 1 を返した。生成物のサイズ・解像度・描画内容は検証済み。
- 受け入れ基準 11 の実機項目は未検証（検収時に確認）。
