# 作業指示書: 配合理論補助の判定セッションと工程の連結（Phase 1）

- status: 依頼中
- 作成日: 2026-09-13
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 上位仕様: `docs/haigou-theory-assist-design.md` v0.2（以下「設計書」）の §1・§3.2・§7
- 枝: **`feature/theory-session`**（`release/2026-11` から作成済み）。この枝で作業する
- **公開しないこと。** 統合版の本番稼働は2026年11月。`main` へのマージも push もしない
- 着手前の状態: `scripts/verify-*.cjs` 17本（`verify-p2d-common.cjs` を除く）と
  `verify-index-exp` はすべて通過を確認済み。壊したらすぐ分かる

---

## 背景と目的

ダビマスには「配合理論補助」という機能がある。繁殖牝馬を起点に、代ごとに種牡馬を選び、
その組み合わせで生まれる産駒を次代の繁殖牝馬として扱いながら、3代先までの配合理論を
確認していくものである。これをダビふぁくに実装する。

この指示書が扱うのは **Phase 1 だけ**で、判定ロジックと工程の連結に限る。
**画面は作らない。** 画面（Phase 2）とダビ娘との連携（Phase 4）は別の指示書になる。

### 既存の似た機能との違い（重要）

`vue/logic/plan/plan-diagnosis.js` に「工程診断」がある。やっていることは近いが**向きが逆**である。

| | 工程診断（既存） | 配合理論補助（本件） |
|---|---|---|
| 入力 | 血統表32セルを全部埋めた状態 | 繁殖牝馬1頭だけ |
| 工程の決め方 | 埋まったセルから**逆算**する（`detectPlan` / `detectBaseDepth`） | 種牡馬を選ぶたびに**前へ進む** |
| いつ動くか | ボタンを押したとき1回 | 種牡馬を選ぶたび |

したがって `detectPlan` / `detectBaseDepth` / `diagnoseBreedingPlan` は**流用しない**。
いっぽう `expandHorseBoard` と `composeVirtualMareBoard` は向きに関係なく使えるので、
**こちらは必ず再利用する**（すでに `window.Dabimas.logic.plan` に公開されている）。

---

## 確認済みの事実（設計書 §1。実データで検証済みなので疑わなくてよい）

### 理論判定に必要なのは親系統だけ

`vue/logic/theory/compatibility.js` の `detectMatchedTheories(Sire, Dam, context)` は
`Sire = [面白4枠, 見事4枠]`、`Dam = [4枠, 4枠]` を取る。16セルの盤面から
次のセル番号で取り出す（既存 `plan-diagnosis.js` の `buildTheoryOperands` と同じ）。

| 取り出すもの | セル番号 |
|---|---|
| 種牡馬の面白4枠 | 1, 3, 5, 7 |
| 種牡馬の見事4枠 | 9, 11, 13, 15 |
| 繁殖牝馬の4枠 | 1, 3, 5, 7（**繁殖牝馬は面白・見事とも同じ4枠を使う**） |

繁殖牝馬側は `Dam = [lines, lines.slice()]` のように同じ配列を2つ渡す。

### 世代の連結

1代目の産駒（＝2代目の繁殖牝馬）の4枠は、`composeVirtualMareBoard(sireBoard, mareBoard, ...)`
で作った盤面のセル 1, 3, 5, 7 から取れる。**新しい導出式を書く必要はない。**

スターベガ × スターアルタイル（瓏覇）で、この経路が `Ns Ma He Ha` を返すことを確認済み。
ゲーム画面の2代目「1代目配合の繁殖牝馬」の表示と一致する。

### 速度

全2,433頭の判定に **536ms**（盤面の組み立て込み、詳細チャンクがメモリ上にある前提）。
**遅延評価は要らない。** 母が決まった時点で全候補を判定してよい。
「見えている行だけ計算する」「Worker へ逃がす」といった仕組みは**作らないこと**。

### 危険・至高・奇跡は Phase 1 の対象外

- 奇跡は `compatibility.js` の `if (perfect)` の内側にあり、`selected`（32セル）が要る
- 至高は `judgeInbreed` の `sameNameSpecialChecks` が要る
- 危険も `judgeInbreed` が要る（全候補で1.3〜1.7秒）

Phase 1 では `detectMatchedTheories` に `context = {}` を渡す。
この3つが出ないのは正しい挙動である。**無理に対応しないこと。**

---

## 実装方針

### 変更対象ファイル

- `vue/logic/theory/theory-session.js`（新規）— 母を固定した候補判定とその保持
- `vue/logic/plan/assist-plan.js`（新規）— 前進型の工程管理
- `scripts/verify-theory-assist.cjs`（新規）— 上2本の検証
- `index.html` — 新規2本の script タグを追加
- `service-worker.js` — `urlsToCache` に新規2本を追加し `CACHE_NAME` を上げる

### `vue/logic/theory/theory-session.js`

`window.Dabimas.logic.theory` に次を足す。既存のものは変えない。

```js
// 16セルの盤面から判定用の親系統を取り出す
prepareSireOperands(board)   // → { omoshiro: [4], migoto: [4] }
prepareMareLines(board)      // → [4]

// 母を固定した候補判定。母が変わったら作り直す（使い回さない）
createTheorySession({ sires, damLines })
```

`sires` は `[{ key, omoshiro, migoto }, ...]` の配列。`key` は呼び出し側が付ける識別子で、
中身は問わない（重複していてもよい。セッションは添字で扱う）。

セッションが返すもの:

| メソッド | 動き |
|---|---|
| `get(index)` | `{ matched: [...], displayed: "PERFECT" 等 or null }` を返す。2回目以降は計算し直さない |
| `evaluateAll()` | 全候補を計算して埋める。戻り値は結果の配列 |
| `indexesFor(theoryKey)` | その理論が成立している候補の添字の配列。内部で `evaluateAll()` を呼ぶ |
| `countsByTheory()` | `{ PERFECT: 6, WONDERFUL: 6, ... }` の形。内部で `evaluateAll()` を呼ぶ |
| `size` | 候補数 |

実装上の決まり:

- **計算済みかどうかは、結果とは別に持つ。** 「理論なし（`displayed === null`）」と
  「まだ計算していない」を取り違えないため。`Uint8Array` の `ready` 配列などでよい。
- `get(index)` に整数でない値・範囲外の値が来たら `RangeError` を投げる。
- セッションは作った後 `sires` と `damLines` を書き換えない。母が変わったら新しく作る。
- 判定は `detectMatchedTheories(...)` と `selectDisplayedTheory(...)` をそのまま呼ぶ。
  **理論の判定条件を自前で書き直さないこと。**
- `context` は `{}` を渡す（前述のとおり危険・至高・奇跡は対象外）。

### `vue/logic/plan/assist-plan.js`

`window.Dabimas.logic.plan` に `createAssistPlan` を足す。既存のものは変えない。

```js
createAssistPlan({ baseMare, brosData })
```

`baseMare` は `descendants` を15件持つ繁殖牝馬（`ensureHorseDetail` 済みのもの）。
3工程（1〜3代目）を持つ計画を返す。

| メソッド / プロパティ | 動き |
|---|---|
| `steps` | 3件。各要素は `{ stepNo, mareLabel, mareLines, sire, result }` |
| `selectSire(stepNo, sireDetail)` | その工程の種牡馬を決め、理論を判定し、次工程の母を作る。**それより後ろの工程は必ず破棄する** |
| `clearSire(stepNo)` | その工程の種牡馬を外し、後ろの工程も破棄する |
| `mareLinesFor(stepNo)` | その工程の母の4枠。`createTheorySession` の `damLines` に渡す |
| `isSelectable(stepNo)` | 前工程が確定しているか |

決まり:

- 工程数は3で固定。定数にして直書きしない。
- 盤面は `plan.expandHorseBoard(record, brosData)` で作る。
- 次工程の母は `plan.composeVirtualMareBoard(sireBoard, mareBoard, ref, label)` で作る。
  第3引数の `ref` は `{ kind: "custom", id: "assist:step:" + stepNo }` の形でよい。
- 前工程を変えたときに後ろが残っていると、古い母に対する結果が表示され続けてしまう。
  **`selectSire` は必ず後続を破棄すること。** ここは受け入れ基準で確認する。
- 2代目以降の母は仮想の産駒なので、`descendants` を持たない。盤面（16セル）だけを持つ。
  `mareLines` は盤面のセル 1, 3, 5, 7 から取る。

### `scripts/verify-theory-assist.cjs`

既存の検証スクリプト（`scripts/verify-plan-diagnosis.cjs` など）と同じ書き方にする。
`vm` でモジュールを読み込み、`json/` の実データを使い、失敗したら非ゼロ終了。

**週次のデータ更新で変わる数値を直書きしないこと。** 種牡馬の頭数や
「完璧が6頭」はデータ更新で動きうる。名前を指定した組み合わせの結果と、
データが変わっても成り立つ性質（不変条件）で確認する。

---

## 制約

- `AGENTS.md` に従うこと。`index.html` の編集は特に手順が決まっている。
- 新規ファイルは IIFE ＋ `window.Dabimas` 名前空間、classic script、UTF-8 BOM なし。
  Vue 2 / Vuetify 2 のまま。**新しいライブラリを足さない。** ビルド工程は無い。
- `index.html` の script タグは、依存の順番どおりに置く。
  `theory-session.js` は `compatibility.js` の後、`assist-plan.js` は `plan-diagnosis.js` の後。
- `service-worker.js` の `CACHE_NAME` は `dabimas-factor-vYYYYMMDD-NN` の形。
  同じ日付の連番を1つ上げる。
- コミットメッセージは日本語。**push はしない。**

---

## スコープ外（やらないこと）

- **画面・コンポーネント・CSS を作らない。** Vue の components には触らない。
- **`vue/logic/theory/compatibility.js` と `vue/logic/inbreed/inbreed-detector.js` を変更しない。**
  そのまま呼ぶだけ。
- **`vue/logic/plan/plan-diagnosis.js` を変更しない。** 公開済みの関数を使うだけ。
  既存の工程診断の挙動を1ミリも変えないこと。
- 危険・至高・奇跡の判定を実装しない（Phase 4・5）。
- ダビ娘との `postMessage` を実装しない（Phase 4）。
- 遅延評価・仮想スクロール・Worker を作らない（536ms なので不要）。
- 周辺のリファクタリングをしない。
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

---

## 受け入れ基準

1. `node scripts/verify-theory-assist.cjs` が成功で終了する（終了コード0）。
   その中で少なくとも次を確認していること。

   a. **スターベガ**（`sex: "1"`）×**スターアルタイル**（`subName: "瓏覇"`）の1代目の
      `displayed` が `"PERFECT"` になる。

   b. 上の組み合わせの1代目産駒（＝2代目の母）の4枠が、集合として
      `Ns` / `Ma` / `He` / `Ha` の4つに一致する。

   c. 全種牡馬をスターベガに対して判定したとき、完璧になった候補が1頭以上あり、
      **そのすべてについて「見事4枠と母の4枠が構成一致している」**（不変条件）。
      頭数は直書きしない。

   d. `get(index)` を同じ添字で2回呼ぶと、判定の実処理は1回しか走らない
      （スパイを挟むなどして確認する）。

   e. `get(index)` に範囲外の添字を渡すと `RangeError` になる。

   f. `selectSire(1, ...)` → `selectSire(2, ...)` と進めたあと、
      `selectSire(1, 別の種牡馬)` をすると、**2代目の種牡馬と結果が消えている**。

   g. 3代目まで種牡馬を選べる。4代目は存在しない。

2. `node scripts/verify-plan-diagnosis.cjs` が従来どおり通る（既存の工程診断を壊していない）。

3. `verify-p2d-common.cjs` を除く既存の `scripts/verify-*.cjs` 17本がすべて通る。

4. `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html`
   が `[verify] OK` を返す。

5. `service-worker.js` の `urlsToCache` に新規2本が入っていて、`CACHE_NAME` が上がっている。

---

## 検証コマンド

```
node scripts/verify-theory-assist.cjs
node scripts/verify-plan-diagnosis.cjs
for %f in (scripts\verify-*.cjs) do @node %f
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html
```

（`verify-p2d-common.cjs` は他から読まれる共通部品なので単体では実行しない）

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。

### 変更ファイル一覧

<変更した全ファイルと、それぞれ何をしたか>

### 設計判断

<指示書に書かれていなくて自分で判断したことがあれば、その内容と理由。なければ「なし」>

### 実行した検証と結果

<検証コマンドごとの実行結果。受け入れ基準の番号と対応させる>

### 残課題・気づき

<スコープ外だが気づいた問題、やり残し。なければ「なし」>
