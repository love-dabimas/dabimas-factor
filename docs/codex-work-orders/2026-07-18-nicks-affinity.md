# 作業指示書: 相性（ニックス）表示 — WASM 組み込みと文言表示（統合版仕様 §25）

- status: 完了（2026-07-18 検収済み。実機・実画面の操作確認は残（検収記録参照））
- 作成日: 2026-07-18
- 依頼元: Claude Code セッション

## 背景と目的

- **仕様は `docs/dabifaku_unified_spec_draft.md` §25（追補 2026-07-17）を正とする**。§24.2・§25.1〜25.7 を全文読むこと。矛盾を見つけたら勝手に解釈せず実装を止めて完了報告に書く。
- 本件は連続する 3 件の指示書の最終回。前提はすべて完了済み:
  - 1 件目（検収済み）: 配合ステータスバーが `<header>` 内に常時表示され、`vue/logic/theory/affinity.js` の `calculateAffinity(context)` スタブ（null 返し）と `vue/app/app-computed.js` の `affinityScore` / `affinityDisplayText` が差し込み口として存在する。
  - 2 件目（検収済み・データ再生成済み）: `json/` 配下の馬データ全件（2,873頭）に `sonId` / `parentLineId` / `rare`（種牡馬 1〜5）が付与済み。`normalizeHorseSummary()` もパススルー済み。
  - WASM 一式は配置済み: `assets/nicks.43c73869f1a2.wasm`（sha256 は `assets/wasm-asset.json` に記録）、`vue/logic/nicks/nicksCalculator.js`（ES Module・**無改変で使う**）、`data/sire_lines_public.json`（子系統 id 1–58 マスター）。
- ゴール: 血統表 32 セルが揃ったとき、ステータスバーの相性枠に **文言（完璧／優れた／良い／程々）または `--`** が表示される。数値は画面に出さない。

## 実装方針

### 1. 新規 `vue/logic/nicks/nicks-boot.js`（ES Module。`<script type="module">` で読み込む）

仕様 §25.5 のとおり。classic script 規約（IIFE）の**例外**として ES Module を許可する（`nicksCalculator.js` が ES Module のため）。

- `import { LocalNicksCalculator } from "./nicksCalculator.js";`（API 確認済み: `new LocalNicksCalculator(wasmUrl)` → `await initialize()` → 以後 `calculate(input)` は**同期**で `commentId` を返す。未初期化・入力範囲外は throw）。
- wasm URL は `"./assets/nicks.43c73869f1a2.wasm"`（fetch はドキュメント基準で解決されるためこの相対でよい）。
- `fetch("./data/sire_lines_public.json")` を読み、`sireLines[]` から「子系統名（trim 済み）→ id」の再解決表と有効 id 集合（1–58）を作る。
- `window.Dabimas.logic.nicks` として公開（`window.Dabimas` 系の名前空間は自前でガード生成）:
  - `isReady()` — WASM 初期化とマスター読込の両方が完了していれば true
  - `calculate(input)` — `LocalNicksCalculator#calculate` への薄い委譲（同期）
  - `resolveLineId(sonId, sonName)` — `sonId` が 1〜58 の整数ならそのまま返す。そうでなければ `sonName` を trim して再解決表を引き、見つからなければ `null`
- 初期化は起動をブロックしない（async で走らせる）。成功時: ready フラグを立て `window.dispatchEvent(new CustomEvent("dabimas:nicks-ready"))`。失敗時: `console.warn` のみで、アプリ本体には影響させない（相性は `--` のまま。リトライ不要）。

### 2. root app への reactive フラグ配線

- `vue/app/app-state.js`: `nicksReady: false` を追加（初期値は `window.Dabimas.logic?.nicks?.isReady?.() === true` でもよいが、module は deferred なので通常 false スタートになる）。
- `vue/app/app-lifecycle.js`: `mounted` で `dabimas:nicks-ready` のリスナを登録して `this.nicksReady = true` にする（登録直前に `isReady()` が既に true なら即座に反映。イベントとの取りこぼし競合をなくすため**リスナ登録→isReady() チェック**の順にする）。`beforeDestroy` でリスナを解除（既存リスナ後始末の流儀に合わせる）。

### 3. `vue/logic/theory/affinity.js` — スタブを実装に置き換え

`calculateAffinity(context)` のシグネチャ・「唯一の差し込み口」構造は維持。参照するのは `context.selected` のみ。戻り値は `commentId`（number 0–4）または `null`（計算不能）。

計算可能条件（仕様 §25.4。1 つでも欠ければ **WASM を呼ばず** null）:

1. `window.Dabimas.logic.nicks` が存在し `isReady()`
2. `selected` が長さ 32 で全セル truthy（`selected.every((e) => e)`）
3. `rarity = selected[0].rare` が 1〜5 の整数（`rare` を持たない自家製馬・☆馬は null）
4. 5 頭の子系統 id がすべて解決できる: `resolveLineId(horse.sonId, horse.son)` を `selected[0]`（sireLineId）と `selected[17]` → `selected[19]` → `selected[23]` → `selected[31]`（partnerLineIds、**この順**）に適用し、1 つでも null なら計算不能

miracle 判定（仕様 §25.3。**独立実装**）:

- `selected[19].name`（繁殖牝馬の母父）と、種牡馬側 `selected[4]` / `[5]` / `[6]` / `[7]` の `name` を**完全一致**で照合し、一致が**ちょうど 1 か所**のときだけ `miracle = true`（0 か所・2 か所以上は false）。
- `compatibility.js`（theory_06）を呼ばない・`styleThoeryClass` を参照しない。前提条件（面白・完璧・至高）は一切見ない。

呼び出しは try/catch で包み、throw（RangeError 等）はすべて null 扱い。

### 4. `vue/app/app-computed.js`

- `affinityScore()`: 冒頭に `if (!this.nicksReady) return null;` を追加（これが reactive 依存になり、WASM 初期化完了時に再評価される）。以降は既存どおり `calculateAffinity(context)` を try/catch で呼ぶ（context の形は変えない）。
- `affinityDisplayText()`: 「数値の文字列化」から文言マップへ変更 — `1:"完璧"`, `2:"優れた"`, `3:"良い"`, `4:"程々"`、`0`・`null`・それ以外はすべて `"--"`。

### 5. `index.html` と `service-worker.js`

- `index.html`: `<script type="module" src="./vue/logic/nicks/nicks-boot.js"></script>` を既存 script 群の末尾（`./vue/app/main.js` の後）に追加。module は deferred なので実行順は保証される。
- `service-worker.js`: `urlsToCache` に 4 件追加 — `vue/logic/nicks/nicks-boot.js`・`vue/logic/nicks/nicksCalculator.js`・`assets/nicks.43c73869f1a2.wasm`・`data/sire_lines_public.json` — し、`CACHE_NAME` を 1 回 bump。fetch ハンドラは変更不要（`/json/` 以外は cache-first なので precache だけでオフライン要件 §25.7-7 を満たす）。

### 変更対象ファイル

- `vue/logic/nicks/nicks-boot.js` — 新規（上記 1）
- `vue/logic/theory/affinity.js` — スタブ→実装（上記 3）
- `vue/app/app-state.js` — `nicksReady: false` 追加
- `vue/app/app-lifecycle.js` — ready イベント購読・解除
- `vue/app/app-computed.js` — `affinityScore` ガード・`affinityDisplayText` 文言化
- `index.html` — module script タグ 1 本追加
- `service-worker.js` — precache 4 件追加＋ `CACHE_NAME` bump（1 回だけ）

## 制約

- `AGENTS.md` の Safety Rules に従うこと（`index.html` は apply_patch 限定・編集前 backup・編集後 verify・BOM 禁止）。
- `nicksCalculator.js`・`.wasm`・`data/sire_lines_public.json` は**無改変**（仕様 §25.6。検証スクリプトから読み込むのは可）。
- 相性の内部値（`totalPoint` / `basePoint`）を UI に出さない。`calculateDebug()` を本番コード（配信される JS）から呼ばない（Node 検証スクリプトからは可）。
- 統合版コード・配合ステータスバーコンポーネント・`applyMobileViewportLayout`・localStorage 6 キー・`DabifacCombinationDB` に触れない（仕様 §24.2 の不変条件）。
- ES Module を使ってよいのは `nicks-boot.js` のみ。他の新規・変更コードは既存の流儀（classic script / IIFE）。
- git の commit / branch / restore / stash 操作を一切行わない。`json/` 配下・`tmp/json-backup-20260718/` に触れない。スクレイパーを実行しない。

## スコープ外（やらないこと）

- `docs/settings-and-edit-stallion-design.md` の実装。
- 相性値の数値表示・履歴・キャッシュなどの拡張機能。
- 旧保存データへの `sonId` / `rare` の焼き込みマイグレーション（名前フォールバックで吸収する設計）。
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

1. `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp index.html` が `[verify] OK`。
2. **WASM 実機検証（Node）**: `assets/nicks.43c73869f1a2.wasm` の sha256 が `assets/wasm-asset.json` の値と一致し、Node で `WebAssembly.instantiate`（fs バイト読込）→ `LocalNicksCalculator` インスタンスに exports を注入（例: `calc.wasmExports = instance.exports`。ファイルは無改変のまま）→ 有効入力で `calculate()` が 0〜4 の整数を返す。`calculateDebug()` で `miracle: true/false` の差が `miracleBonusApplied` または `totalPoint` に現れる入力例を 1 つ以上記録する。
3. **affinity ロジック検証（Node、モック nicks で）**: 次を機械確認 — (a) 31 セル以下 → null、(b) `rare` なし → null、(c) `sonId` null でも `son` 名から解決されて計算に進む、(d) 5 頭のうち 1 頭でも id 解決不能 → null、(e) partnerLineIds が 17→19→23→31 の順、(f) miracle が 0 一致→false / 1 一致→true / 2 一致→true にならない（false）、(g) `compatibility.js` を読み込まずに動作する（theory_06 非依存の構造確認）。
4. 受入条件（仕様 §25.7 の 1〜7）**全項目**について、完了報告に「実装箇所」「確認方法と結果」を 1 行ずつ記録。ヘッドレスで再現できない項目（実画面での 32 セル選択・オフライン実機など）は「未検証（検収時に確認）」と明記 — 無言のスキップ不可。
5. `service-worker.js` に 4 件追加・`CACHE_NAME` が 1 回 bump されている。
6. ローカル配信＋`dump-dom`（390×844、VirtualTimeBudget 30000。**空出力・マウント前 DOM のときは再試行**）で、マウント済み DOM にステータスバーの相性値 `--`（初期状態）が表示され、ReferenceError / TypeError がないこと。

## 検証コマンド

```powershell
# index.html 編集前（必須）
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 backup-index-exp index.html

# index.html 編集後（必須）
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp index.html

# Node 検証（受け入れ基準 2・3。スクリプトは tmp/ 配下に置く）
node tmp\nicks-verify\wasm-check.mjs
node tmp\nicks-verify\affinity-check.mjs

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

- `vue/logic/nicks/nicks-boot.js`（新規）: WASM・子系統マスターの非同期初期化と同期 API 公開
- `vue/logic/theory/affinity.js`: 計算可能条件、系統 ID 解決、相性用 miracle 判定、WASM 呼び出しを実装
- `vue/app/app-state.js`: `nicksReady` と ready イベントハンドラ保持欄を追加
- `vue/app/app-lifecycle.js`: ready イベントの購読・取りこぼし防止チェック・解除を追加
- `vue/app/app-computed.js`: ready ガードと commentId→文言変換を追加
- `index.html`: `nicks-boot.js` の module script を追加
- `service-worker.js`: ニックス関連 4 配布物の precache と `CACHE_NAME` の 1 回 bump
- `tmp/nicks-verify/wasm-check.mjs` / `tmp/nicks-verify/affinity-check.mjs`: 受入確認用 Node スクリプト
- 本作業指示書: status と完了報告を更新

### 設計判断

- `window.Dabimas.logic.nicks` は module 評価時に先に公開し、WASM 初期化と子系統マスター読込の双方が完了した後だけ `isReady()` を true にする。失敗時は `console.warn` のみで ready を false に保つ。
- `resolveLineId()` は 1〜58 の整数 ID を優先し、それ以外だけ trim 済み子系統名で再解決する。miracle の馬名比較には trim 等を入れず、仕様どおり完全一致・1 箇所だけを成立条件にした。
- Vue 側はイベントリスナ登録後に `isReady()` を確認する順序とし、module 初期化完了との競合を避けた。`affinityScore` は reactive な `nicksReady` を最初に参照する。
- 本番コードは `calculate()` の commentId だけを扱い、`calculateDebug()`、`totalPoint`、`basePoint`、`compatibility.js`、配合理論状態を参照しない。

### 実行した検証と結果

- `verify-index-exp index.html`: `[verify] OK`（編集直後および最終確認）。
- `node tmp\nicks-verify\wasm-check.mjs`: OK。sha256 `43c73869f1a24a56732cd44976f3726636e9760f58d25434b7d6c268d0bded54` 一致、`calculate()` は commentId `0`。miracle 差分例は rarity=1 / sireLineId=8 / partnerLineIds=[32,39,51,11] で、false は totalPoint=6・適用なし、true は totalPoint=9・`miracleBonusApplied=true`。
- `node tmp\nicks-verify\affinity-check.mjs`: OK。31 セル、rare 欠落、名前フォールバック、解決不能、partner 順序、miracle 0/1/2 一致、`compatibility.js` 非依存、数値以外を含む文言変換を確認。
- `python -m pytest -q`（`PYTHONDONTWRITEBYTECODE=1`）: `13 passed in 1.65s`。
- JS 構文確認（変更した配信 JS 5 本と service worker）: 全件 OK。対象差分の空白チェックも OK。
- ローカル配信＋`dump-dom`（390×844、VirtualTimeBudget 30000）: 60,998 文字のマウント済み DOM、相性値 `--`、ReferenceError / TypeError なしを確認。
- 最終 Standards / Spec レビュー: 指摘なし。AGENTS の index バックアップ・apply_patch・verify・BOM 禁止を遵守し、§25 および本指示書との欠落・スコープ逸脱を認めなかった。

### 受入条件チェックリスト（仕様 §25.7 全 7 項目）

1. `affinity.js` / `app-computed.js` — Node で 31 セル時 null・WASM 未呼出しと 1〜4 の文言変換、dump-dom で初期 `--` を確認。実画面での 32 セル選択は未検証（検収時に確認）。
2. `affinity.js` — Node モックで index 19 × index 4〜7 の 0一致=false・1一致=true・2一致=false、実 WASM の `calculateDebug()` で上記 true/false 差分例を確認。
3. `affinity.js` — `compatibility.js` をロードせず、配合理論状態を一切与えない Node 環境でも位置一致だけで miracle=true になることを確認。実画面の面白不成立配合での操作は未検証（検収時に確認）。
4. `nicks-boot.js` / `affinity.js` — `sonId=null`・前後空白付き `son` を名前マップで ID 44 に再解決し計算へ進むことを Node で確認。
5. `affinity.js` — rare 欠落および 5 頭中 1 頭の系統解決不能で null、WASM 未呼出しを Node で確認。dump-dom ではアプリ全体が正常マウント。
6. `nicks-boot.js` — 初期化全体を try/catch し、失敗時は warn のみ・ready=false の実装を確認。WASM 取得失敗の実ブラウザ注入試験は未検証（検収時に確認）。
7. `service-worker.js` — boot、calculator、WASM、公開子系統 JSON の 4 件を precache し、`CACHE_NAME` を `v20260705-04` へ 1 回 bump したことを静的確認。オフライン実機は未検証（検収時に確認）。

### 残課題・気づき

- 検収時に、実画面で 32 セルを選択した文言表示、面白不成立でも成立する miracle、WASM 取得失敗、service worker キャッシュ済みオフラインの 4 点を確認する。
- Node で ES Module の `nicksCalculator.js` を直接 import した際に package type 未指定の性能警告が出るが、ブラウザでは module script として読み込むため本機能への影響はない。指示どおり `package.json` と配布済みラッパーは変更していない。

---

## 検収記録（Claude、2026-07-18）

- 受け入れ基準 1: `verify-index-exp index.html` 再実行 → `[verify] OK`。
- 受け入れ基準 2・3: Codex の `tmp/nicks-verify/wasm-check.mjs` / `affinity-check.mjs` を内容レビューのうえ再実行 → 両方 OK（sha256・サイズの manifest 一致、miracle 差分例の総当たり探索、affinity の 8 観点すべて assert あり）。
- 受け入れ基準 4: §25.7 全 7 項目のチェックリスト記入・未検証項目の明示を確認。
- 受け入れ基準 5: `CACHE_NAME` v20260705-03 → -04（1 回）、ニックス 4 配布物の precache 追加を diff で確認。
- 受け入れ基準 6: `dump-dom 390×844` 再実行 → Vue マウント済み DOM に相性値 `--`・module script タグを確認、ReferenceError / TypeError なし。
- **実データ・実 WASM のエンドツーエンド検証（検収側の独自追加）**: 再生成済み `json/dabimasFactor.summary.json` の実在種牡馬と実 WASM・実マスターで `calculateAffinity` を駆動し、commentId 2/3/4（優れた／良い／程々）と 0（`--`）の実出力を確認。miracle の 1 一致／2 一致の分岐、`rare` なし種牡馬 → null も実データで確認。
- コードレビュー: `nicks-boot.js` / `affinity.js` とも仕様 §25.2〜25.5 に忠実（partner 順序 17→19→23→31、miracle はちょうど 1 一致のみ true・theory_06 非依存、失敗系はすべて null で本体無影響）。変更ファイルは指示書の一覧と一致し、禁止事項への抵触なし。pytest 13 件成功。差し戻し事項なし。
- 残（実機・実画面のみ）: 32 セル選択で文言が出る操作確認、面白不成立配合での miracle 成立、WASM 取得失敗時の `--` 継続、オフライン（SW キャッシュ済み）での相性計算。
