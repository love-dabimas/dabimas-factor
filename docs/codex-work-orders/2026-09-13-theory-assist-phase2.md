# 作業指示書: 配合理論補助の画面とホームの入口（Phase 2）

- status: 完了（2026-09-13 検収済み。受け入れ基準1〜5をすべて再実行して確認。検収時の修正1件）
- 作成日: 2026-09-13
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 上位仕様: `docs/haigou-theory-assist-design.md` v0.2（以下「設計書」）の §4.6・§7
- 前提: Phase 1（`docs/codex-work-orders/2026-09-13-theory-assist-phase1.md`）は検収済み。
  `window.Dabimas.logic.theory.createTheorySession` と
  `window.Dabimas.logic.plan.createAssistPlan` が使える状態にある
- 枝: **`feature/theory-session`**（Phase 1 と同じ枝の続き）
- **公開しないこと。** 統合版の本番稼働は2026年11月。`main` へのマージも push もしない
- 画面デザインは確定済み。**`docs/haigou-theory-assist/assist-screen-mock.html`**
  をブラウザーで開いて見ること（実データ入りの単体HTML。ネットワーク不要）

---

## 背景と目的

繁殖牝馬を起点に、代ごとに種牡馬を選び、その組み合わせで成立する配合理論を
3代先まで確認する画面を作る。判定ロジックは Phase 1 で完成しているので、
**この指示書は画面と入口だけ**を扱う。

ダビ娘との連携（種牡馬をダビ娘で選ぶ・配合理論で絞り込む）は Phase 4 である。
Phase 2 では**種牡馬・繁殖牝馬とも、本体が既に持っているローカルの候補一覧から選ぶ**
仮組みにする。あとで選択の入口だけ差し替えられるようにしておくこと。

### モックが正である

`docs/haigou-theory-assist/assist-screen-mock.html` は、利用者と何度もやり取りして
確定させた画面である。**配置・状態の出し分け・文言はこれに合わせること。**
モックは素の HTML / CSS / JS で書いてあるが、コードを写すのではなく、
Vue 2 ＋ Vuetify 2 の作法で組み直すこと。

参考: `docs/haigou-theory-assist/picker-card-mock.html` は Phase 3・4 で使う
種牡馬カードのモック。**Phase 2 では触らない**が、最終形の想像には役立つ。

---

## 画面の仕様（設計書 §4.6。モックと合わせて読む）

3世代を縦に並べる。各世代は次の3状態を取る。

| 状態 | 表示 |
|---|---|
| 選択済み | 繁殖牝馬 ＋ 種牡馬 ＋ 判定結果 |
| 未選択 | 繁殖牝馬 ＋「＋ 種牡馬を選ぶ」 |
| 待ち | 「前の代の種牡馬を選ぶと使えるようになります」。操作できない |

- 1代目の繁殖牝馬は利用者が選ぶ。未選択なら1代目も「繁殖牝馬を選ぶ」から始まる。
- 2代目以降の繁殖牝馬は、前の代の産駒が自動で入る（`createAssistPlan` が作る）。
  ラベルは「N代目配合の繁殖牝馬」。
- 各世代に面白・見事の系統を出す。繁殖牝馬は4枠、種牡馬は面白4枠と見事4枠。
- 前の代の種牡馬を変えたら、後ろの代の表示が消える（`selectSire` がそうしてくれる）。

### 判定結果のブロック

**理論だけを実装する。** モックにある「因子」の表と「クロスの詳細」は、
**枠だけ置いて「未計算」と出す**こと（下の「スコープ外」を読むこと）。

- 成立した配合理論を代表1件、バッジで出す。文言は
  `window.Dabimas.constants.breedingTheories.DISPLAY_NAME` から取る。
- 理論が成立しないときは「理論なし」と出す。空欄にしない。

---

## 実装方針

### 変更対象ファイル

- `vue/components/assist/assist-screen.js`（新規）— 画面まるごと
- `vue/components/home/home-page.js` — 「馬を探す」区画にタイルを1枚追加
- `vue/logic/workspace-sync.js` — 画面の記憶に `"assist"` を通す
- `index.html` — script タグと画面の設置
- `css/unified.css` — この画面のスタイル
- `service-worker.js` — `urlsToCache` に新規1本、`CACHE_NAME` を上げる
- `scripts/verify-theory-assist-screen.cjs`（新規）— 検証

### 画面の出し分け

本体は `currentScreen` で画面を切り替えている（`vue/app/app-state.js:41`）。
`index.html:57-58` に `home-page` と `settings-page` が並んでいるので、同じ形で足す。

```html
<assist-screen v-if="currentScreen === 'assist'"></assist-screen>
```

画面キーは **`"assist"`** とする。

`vue/logic/workspace-sync.js:331-332` が起動時の画面を復元しているが、いまは
`lastScreen === "musume"` しか通していない。`"assist"` も通るようにすること。
`musume-host.js` が `currentScreen` を監視して `workspaceSync.rememberScreen()` を
呼んでいるのと同じ仕掛けが要る（`vue/components/musume/musume-host.js` の
`watch: { "$root.currentScreen" }` を見ること）。

### ホームのタイル

`vue/components/home/home-page.js:134-144` に「馬を探す」の小見出しとダビ娘のタイルがある。
**その隣に同じ作りでタイルを1枚足す。** 見出しは「配合を考える」など別区画にせず、
既存の「馬を探す」区画の下に並べてよい（利用者の指示は「ダビ娘の右隣くらい」）。

- タイトル「配合理論補助」、説明「繁殖牝馬から3代先の配合を試す」
- 押すと `this.$root.currentScreen = "assist"`
- 編集モードで削除・並べ替えの対象にしないこと（ダビ娘のタイルと同じ）

### 馬の選び方（Phase 2 の仮組み）

本体は候補一覧を既に持っている（`vue/app/methods/horse-loading.js` の
`refreshCandidateLists`）。`$root` から次が読める。

| 使うもの | 中身 |
|---|---|
| `$root.broodmares` | 繁殖牝馬の候補（自家製馬・マスター馬が混ざった状態） |
| `$root.stallions` | 種牡馬の候補（同上） |
| `$root.ensureHorseDetail(horse)` | `descendants` 15件を揃えた馬を Promise で返す |
| `$root.brosData` | 全兄妹データ。`createAssistPlan` に渡す |

**候補は summary なので `descendants` を持たない。** `createAssistPlan` と
`selectSire` に渡す前に必ず `ensureHorseDetail` で揃えること。
揃わなかった場合はエラーを出して選択を取り消す（画面を壊さない）。

選ぶ UI は Vuetify の `v-autocomplete` か、既存の
`vue/components/pedigree/mobile-horse-picker.js` の作りに寄せた簡易なもので構わない。
**ここは Phase 4 でダビ娘に差し替わる場所なので、凝らないこと。**

### 判定の呼び出し

Phase 1 の API をそのまま使う。判定条件を自分で書き直さないこと。

```js
var plan = window.Dabimas.logic.plan.createAssistPlan({ baseMare: mareDetail, brosData: brosData });
plan.selectSire(1, sireDetail);
plan.steps[0].result.displayed;   // "PERFECT" など
plan.steps[1].mareLines;          // 2代目の母の4枠
```

繁殖牝馬を選び直したら `createAssistPlan` を作り直す。使い回さない。

---

## 制約

- `AGENTS.md` に従うこと。`index.html` の編集は特に手順が決まっている。
- 新規ファイルは IIFE ＋ `window.Dabimas` 名前空間、classic script、UTF-8 BOM なし。
  Vue 2 ＋ Vuetify 2 のまま。**新しいライブラリを足さない。** ビルド工程は無い。
- `assist-screen.js` の script タグは `assist-plan.js` より後に置く。
- スマホ幅（375px）で横スクロールが出ないこと。既存の画面と同じく
  `$vuetify.breakpoint` で出し分けてよい。
- コミットメッセージは日本語。**push はしない。**

---

## スコープ外（やらないこと）

- **因子の表とクロスの詳細を実装しない。** 枠だけ置いて「未計算」と出す。
  クロス判定（`judgeInbreed`）は1組あたり8.5msで速度の問題は無いが、
  任意の工程に対する因子カウントの組み立て方が未確定である。既存の計算は
  `vue/app/methods/inbreed-ui.js:79-96` にあり血統表の状態に結びついているので、
  ここを一般化するかどうかは別途決める。**勝手に作らないこと。**
- **危険・至高・奇跡を出さない。** 上と同じ理由（`judgeInbreed` が要る）。
- **ダビ娘を開かない。** `musume-host.js` や `musume-link.js` に触らない（Phase 4）。
- **配合理論での絞り込みを作らない**（Phase 4）。
- **`picker-card-mock.html` の内容を実装しない**（Phase 3）。
- 血統表の画面（`currentScreen === "category"`）とその周辺に触らない。
- `vue/logic/theory/` と `vue/logic/plan/` の既存ファイルを変更しない。
  Phase 1 で作った2本も含めて、呼ぶだけにする。
- 周辺のリファクタリングをしない。
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

---

## 受け入れ基準

1. `node scripts/verify-theory-assist-screen.cjs` が成功で終了する（終了コード0）。
   DOM を作らずに確認できる範囲として、少なくとも次を含めること。

   a. `index.html` に `assist-screen` の設置と script タグがあり、
      `assist-plan.js` より後に読み込まれている。

   b. `service-worker.js` の `urlsToCache` に `assist-screen.js` が入っていて、
      `CACHE_NAME` の連番が上がっている。

   c. `home-page.js` のテンプレートに配合理論補助のタイルがあり、
      `currentScreen` を `"assist"` にする導線が書かれている。

   d. `workspace-sync.js` が `lastScreen` に `"assist"` を通す
      （`"musume"` だけを特別扱いしていない）。

2. 既存の `scripts/verify-*.cjs`（`verify-p2d-common.cjs` を除く）がすべて通る。
   Phase 1 の `verify-theory-assist.cjs` も含む。

3. `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html`
   が `[verify] OK` を返す。

4. **画面を実際に動かして確認すること。** ローカルサーバーを立てて
   ヘッドレス Chrome で見る（`CLAUDE.md` の「検証」節の手順）。次を満たすこと。

   a. ホームに「配合理論補助」のタイルが出て、押すと画面が開く。

   b. 繁殖牝馬を選ぶと1代目が操作できるようになり、2・3代目は「待ち」になっている。

   c. 1代目に種牡馬を選ぶと理論のバッジが出て、2代目の繁殖牝馬が
      「1代目配合の繁殖牝馬」として自動で入る。

   d. 3代目まで進められる。

   e. 1代目の種牡馬を選び直すと、2・3代目の表示が消える。

   f. 375px 幅で横スクロールが出ない。

   確認したことを完了報告に書くこと（スクリーンショットが撮れるなら添えてよい）。

5. 血統表の画面（既存の本体）が従来どおり動く。ホーム→カテゴリ→血統表と辿って
   壊れていないことを目視で確認する。

---

## 検証コマンド

```
node scripts/verify-theory-assist-screen.cjs
for %f in (scripts\verify-*.cjs) do @node %f
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html
```

画面の確認は `CLAUDE.md` の「検証」節のとおり、
`python scripts/lan_server.py <ポート> --bind 127.0.0.1` で配信してから
`scripts/codex-powershell.ps1 dump-dom <URL> 390 844 300000` を使う。

（`verify-p2d-common.cjs` は他から読まれる共通部品なので単体では実行しない）

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。

### 変更ファイル一覧

- `vue/components/assist/assist-screen.js` — 3世代の選択済み・未選択・待ち表示、ローカル候補の検索ダイアログ、詳細取得、理論バッジ、未計算枠を追加。
- `vue/components/home/home-page.js` — 「馬を探す」に編集対象外の「配合理論補助」タイルを追加。
- `vue/logic/workspace-sync.js` — `assist` の保存と起動時復元を許可。
- `index.html` — 画面の設置とコンポーネントの script タグを追加。
- `css/unified.css` — モックに合わせた世代別の配色・馬の行・系統表示・判定枠と、ホームの2列タイルを追加。
- `service-worker.js` — 新規コンポーネントをキャッシュ対象へ追加。`CACHE_NAME` を `dabimas-factor-v20260913-05` に更新。
- `scripts/verify-theory-assist-screen.cjs` — 配線、実データでの選択・再選択、取得失敗、非同期処理の検証を追加。
- `scripts/verify-theory-assist-ui.html` — 375pxのiframe内で実際の画面を操作するブラウザー検証を追加。
- 本作業指示書 — status と完了報告を更新。

### 設計判断

- `musume-host` は常駐し、既にすべての `currentScreen` 変更を `rememberScreen` に渡していた。重複する監視は追加せず、workspace-sync の保存・復元対象に `assist` を追加した。ダビ娘関連ファイルは変更していない。
- 選択入口は `openPicker`、反映は `confirmSelection` に分け、Phase 4 で入口を差し替えられる形にした。検索の表記ゆれ吸収と馬自身の因子表示は既存の共通関数を利用した。
- 詳細取得中の二重送信を防止し、取得失敗時は候補選択だけを取り消して既存計画を保持する。画面破棄後に返った取得結果も反映しない。
- 繁殖牝馬の面白・見事は Phase 1 API の同じ4枠を表示する。モックの仮値より、指示書の4枠指定とAPIの値を優先した。
- ホームへ戻る操作を追加。画面キーのみを記憶し、試した配合の永続保存は追加していない。
- モックの「画面案」、仮データの注意書き、危険な配合についての案内は実画面には載せず、Phase 2 で確認できる内容に説明文を合わせた。

### 実行した検証と結果

- **基準1:** `node scripts/verify-theory-assist-screen.cjs` → 終了コード0。設置・依存順・キャッシュ・導線・保存復元対象に加えて、スターベガ×スターアルタイル（瓏覇）の「完璧な配合」、3代選択、後続破棄、母の再選択、理論なし、詳細取得失敗、不完全な祖先、二重送信、破棄後の非同期完了を検証。
- **基準2:** PowerShellで `Get-ChildItem scripts/verify-*.cjs` から `verify-p2d-common.cjs` を除き、1本ずつ `node` で実行。**19本すべて終了コード0**。Phase 1 の `verify-theory-assist.cjs` も成功。
- **基準3:** `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html` → `[verify] OK`。編集前のバックアップも同スクリプトで取得済み。
- **基準4・5:** `python scripts/lan_server.py 8794 --bind 127.0.0.1` で配信し、`powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 dump-dom http://127.0.0.1:8794/scripts/verify-theory-assist-ui.html 390 844 300000` を実行。検証HTMLが内部を375px幅に固定し、結果は `status: OK`、`errors: []`。
  - ホームの編集モードでも固定タイルを表示し、クリックで `assist` が開くことを確認。
  - 検索ダイアログの入力・候補行・「選択する」を実際に操作し、スターベガ選択時に2・3代目が待ちになることを確認。
  - スターアルタイル（瓏覇）選択時に「完璧な配合」と「1代目配合の繁殖牝馬」が表示されることを確認。
  - 3代目まで種牡馬を選び、バッジ3件と縦スクロールを確認。
  - 1代目をサンデーサイレンス（1989）に替え、後続の種牡馬・結果・3代目の母・補助表示を破棄することを確認。母の再選択で全体が初期化されることも確認。
  - ホーム、初期状態、1代目選択後、3代目選択後で375pxの横スクロールがないことを寸法で検証。
  - 再読み込みで `assist` を復元し、ホームへ戻れることを確認。
  - ホーム→カテゴリのカード→血統表を辿り、種牡馬を設定して表示されることを確認。
- **目視:** 指定モックをヘッドレスChromeで開いて撮影し、実装後も同じスクリプトの `screenshot` で撮影。3状態の配置・配色・理論バッジ・未計算枠、および既存血統表を画像で確認した。
  - [配合理論補助・375px](../../artifacts/theory-assist-phase2/assist-375.png)
  - [既存血統表・375px](../../artifacts/theory-assist-phase2/category-375.png)
  - [ブラウザー検証のDOM結果](../../artifacts/theory-assist-phase2/verification-dom.html)
  - 画像・DOMはローカルの `artifacts/` に保存（Git管理外）。検証HTMLから再生成可能。
- **レビュー:** 着手前 `ec703d0` を固定点として、code-review スキルの2軸レビューを実施。Standardsは確定違反0件、軽微なテスト保守性の指摘1件（キャッシュ名の日付と連番の比較）を修正し、新規検証を再実行して成功。Specは指摘0件。
- `git diff --check` → 成功。`feature/theory-session` でローカルコミットし、push・mainへのマージは行っていない。

### 残課題・気づき

なし。因子集計・クロス判定・危険／至高／奇跡・ダビ娘ピッカー連携は指定どおり未実装。

---

## 検収メモ（2026-09-13）

受け入れ基準1〜5をすべて再実行して確認した。検証19本と `verify-index-exp` が通り、
`scripts/verify-theory-assist-ui.html` をヘッドレスではなくブラウザーで動かして
status OK・15項目・エラー0 を確認。既存の血統表が従来どおり動くことも画像で確認した。

### 検収時に直した点（1件）

馬名の作り方が本体と揃っていなかった。この画面だけ独自に
`name + "-" + subName + "-"` としており、同じ馬が血統表では「スターアルタイル瓏覇」、
この画面では「スターアルタイル-瓏覇-」と別の名前に見えていた。本体共通の
`logic.horses.getHorseNameText` / `getHorseBaseText` に寄せた（自家製馬の ☆ の扱いも
共通関数が持っている）。修正後に検証を再実行し、描画結果が
「スターベガ」「スターアルタイル瓏覇」になることをブラウザーで確認した。

### 次の Phase への申し送り（今回は直していない）

- 種牡馬の面白・見事の4枠を、画面側の `sireLines` と `assist-plan` の両方が持っている。
  `assist-plan` 側が結果と一緒に持てば一本化できる。
- 種牡馬を1頭選ぶたびに `expandHorseBoard` が2回走る（画面側と `selectSire` の中）。
  上と同じく `assist-plan` の API を足せば1回で済む。
