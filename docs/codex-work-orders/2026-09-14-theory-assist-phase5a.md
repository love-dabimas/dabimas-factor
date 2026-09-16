# 作業指示書: 選んだ1組の因子とクロスを出す（配合理論補助 Phase 5a）

- status: 依頼中
- 作成日: 2026-09-14
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 対象リポジトリ: **`dabimasFactor_new`（ダビふぁく）**。ダビ娘側は触らない
- 枝: **`feature/theory-assist-phase5a`**（`release/2026-11` から作成済み。作業前に checkout すること）
- 上位仕様: `docs/haigou-theory-assist-design.md` の §1.4 / §4.6

---

## 直すもの

配合理論補助で種牡馬を選ぶと、いまはこう出る（実機で指摘された）。

```
因子             → 「未計算」
クロスの詳細     → 「クロスの詳細 — 未計算」
```

Phase 2 で置いた仮の表示のまま実装されていない。**ここを実際に計算して出す。**

計算そのものは既存の関数でできる。**新しい判定ロジックを書かない。**

---

## 1. 判定をまとめる純粋関数を作る

新規 **`vue/logic/plan/assist-diagnosis.js`**（`window.Dabimas.logic.plan.diagnoseStep`）。
DOM も Vue も触らない。既存の関数を呼んで結果を組み立てるだけにする。

```js
diagnoseStep(sireBoard, mareBoard, { inbreedExceptions, nodeTable, resolver })
// → { nitro, crossFactor, crosses, count, dangerous }
```

手順は本体の配線（`vue/app/methods/inbreed-ui.js` の `judgeInbreed` /
`performInbreedFactorCounts`）と同じものを、インスタンス状態から切り離して並べる。

1. `plan.buildStepSelected(sireBoard, mareBoard)` で32セルの `selected` を作る。
2. `inbreed.judgeInbreed(selected, inbreedExceptions, nodeTable, resolver)` を呼ぶ。
   返り値の `sameNameGroups` / `siblingGroups` / `inbreedList` / `count` / `dangerous` を使う。
3. `inbreed.buildInbreedFactorCounts(sameNameGroups, siblingGroups, inbreedList)` で
   クロスぶんの `factorCd` を得る。**引数は3つ。** `selected` を渡す形ではない。
4. `factor.dispFactorCounts(factorCd)` でクロスの本数（14個の文字列配列）にする。
5. ニトロ（全因子）の本数は、**2つの盤面のセルが持つ因子から32×3の `factorCd` を組んで**
   同じ `dispFactorCounts` に通す。本体は `this.factorCd` をセルを埋めるたびに
   育てているが、ここでは盤面から一度に組めばよい。

**注意**: `dispFactorCounts` に `selected` をそのまま渡しても全部 `"00"` になる。
渡すのは「セルごとの因子コード3つ」の配列である。ここは実際に間違えたので明記する。

`resolver` と `nodeTable` は無くても動く（名前一致に落ちる）。`$root` にあるものを
渡す。無ければ `null` を渡して落ちないこと。

## 2. 表示する

`vue/components/assist/assist-screen.js` の「未計算」を置き換える。

### 因子

**ダビふぁく本体のヘッダにあるニトロ／クロスの表と同じ見た目**にする
（`vue/components/header/factor-summary-header.js` が出しているもの）。
利用者が確認済みの形である。ただし**そのまま流用しない** —
あの部品はカメラボタン・工程診断ボタン・系統カウントまで抱えていて、この画面には要らない。

**新規 `vue/components/assist/assist-factor-table.js`** を作り、必要な2行だけを描く。

| 行 | 中身 |
| --- | --- |
| ニトロ | 短 速 底 長 走 中 強 雷 堅 難 適 丈 早 晩 の14列に本数 |
| クロス | 同じ14列にクロスぶんの本数 |

見出しの並び・色・セル幅は本体の表に合わせる。CSS を新しく作らず、
既存のクラス（`css/` にある本体のヘッダ表のもの）を使えるなら使う。
使えない場合だけこの画面用のスタイルを足す。**カメラボタンは出さない。**

### クロスの詳細

**既定で畳む。** 「クロスの詳細（N件）」のようにボタンに件数を出し、
押すと中身が開く。工程ごとに独立した開閉状態を持つ。

中身は `judgeInbreed` の返り値から出せるもの（クロスした馬の名前と代数）を並べる。
本体の表示（`vue/components/plan/plan-diagnosis-panel.js` などが出しているもの）を
見て、同じ言い回しにすること。

**クロスが0件のときは「クロスなし」と出す。** ボタンは出すが開いても空にしない。

### 危険な配合

`dangerous` が真のときは、成立した配合理論のところに**危険であることを出す**。
`breedingTheories` の `DANGEROUS` は優先度999で他をすべて上書きするので、
`selectDisplayedTheory` に `context` を渡し直せば「危険な配合」が出る。
いまの `assist-plan.js` は `context` を渡していない（`{}` を渡している）ので、
**クロスの判定結果を渡すようにする。**

```js
theory.detectMatchedTheories(sireOperands, dam, {
  sameNameSpecialChecks: cross.sameNameSpecialChecks,
  selected: selected,
  dangerous: cross.dangerous === true,
})
```

これで至高（`SUPREME`）も出るようになる。**至高が出たらそう表示する。**

## 3. いつ計算するか

**種牡馬を選んだ直後に1回**でよい。1組だけなら `judgeInbreed` は 0.5〜0.7ms
（初回だけ12ms程度）で、画面が固まる心配はない（設計書 §1.4）。

**候補一覧の全頭に対しては絶対に流さない。** 1.3〜1.7秒かかる（Phase 5b で扱う）。

工程を選び直したら、その工程と後続の結果を捨てる。いまの `clearSire` と同じ扱いにする。

---

## 制約

- IIFE ＋ `window.Dabimas` 名前空間、classic script、Vue2 / Vuetify2、ビルド工程なし、
  **新しいライブラリを足さない。**
- 新規ファイルは `index.html` の script タグと `service-worker.js` の `urlsToCache` に
  追加し、`CACHE_NAME` を上げる。`index.html` を編集するときは `AGENTS.md` の手順に従う。
- **`vue/logic/inbreed/inbreed-detector.js` と `vue/logic/factor/*.js` を変えない。** 呼ぶだけ。
- **`vue/components/header/factor-summary-header.js` を変えない。** 本体のヘッダが壊れる。
- **ダビ娘側（`C:/derby/dabimas-data`）を触らない。**
- コミットメッセージは日本語。**push しない。`main` にマージしない。**

## スコープ外（やらないこと）

- **候補一覧の至高チップを出さない**（Phase 5b）。いまは3つ（完璧・超完璧・奇跡）で正しい。
- 全候補へのクロス判定をしない。
- 因子の手動クロス（本体のクロスボタン）をこの画面に持ち込まない。表示だけにする。
- 周辺のリファクタリングをしない。気づいた別の問題は直さず、完了報告に書く。

---

## 受け入れ基準

1. `verify-index-exp .\index.html` が OK を返す。

2. `scripts/verify-*.cjs`（`verify-p2d-common.cjs` を除く20本）がすべて通る。

3. **`scripts/verify-theory-assist-phase5a.cjs` を新規に作る。** `vm` で読み込んで確認する。

   a. `diagnoseStep` が、本体の配線（`judgeInbreed` →
      `buildInbreedFactorCounts` → `dispFactorCounts`）と**同じ値**を返す。
      実在馬の組で、本体と同じ手順を素で書いたものと突き合わせること。

   b. ニトロの本数が全部 `"00"` にならない。実在馬の組で、因子を持つ祖先が
      いる組み合わせを選び、期待値を直接書いて突き合わせる。

   c. クロスが0件の組と、1件以上ある組の両方を通す。

   d. `dangerous` が真になる組で、成立した理論が「危険な配合」になる。

   e. `resolver` と `nodeTable` を `null` にしても落ちない。

4. **画面の確認。** ヘッドレス Chrome で配合理論補助を開き、次を示す。

   a. 種牡馬を選ぶと「未計算」が消え、ニトロとクロスの本数が出る。

   b. クロスの詳細が畳まれていて、押すと開く。件数がボタンに出ている。

   c. 選び直すと、その工程の結果が組み直され、後続が消える。

   d. 375px 幅で横スクロールが出ない。

5. 1組の `diagnoseStep` にかかる時間を測り、完了報告に書く。**50ms を超えたら報告すること。**

---

## 検証コマンド

```
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html
node scripts/verify-theory-assist-phase5a.cjs
node scripts/verify-theory-assist-screen.cjs
python scripts/lan_server.py 8790 --bind 127.0.0.1
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 dump-dom http://127.0.0.1:8790/index.html 390 844 300000
```

---

## 完了報告（Codex が記入する）

### 変更ファイル一覧

### 設計判断

### 実行した検証と結果

### 残課題・気づき
