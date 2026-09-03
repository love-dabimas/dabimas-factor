# 作業指示書: インブリード因子カウントの重複除去を `nodeId` キーへ（段階5）

- status: 完了（2026-09-03 検収済み。修正なし）
- 作成日: 2026-09-03
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 設計資料: `docs/pedigree-master-integration-design.md` §7.3 / §4.1 / §6.7
- アルゴリズム仕様書: `dabimas_pedigree_editor_algorithm_spec.md` §17.2 / §19 / §40.5 / §40.6
- 前提: 段階4c（`2026-09-03-inbreed-display-convergence.md`）が完了・検収済み
- **稼働影響: 小さい。** 因子の内訳が変わる盤面は再現可能な実測で約 0.07%

## 背景と目的

`vue/logic/inbreed/inbreed-counts.js` は、クロスした馬の因子を数えるときに **`name` + 正規化した `subName`** で重複を除去している。

```js
// 空欄、数字、(で始まるものを除外する
const excludeString = /^$|^\d*$|^\(.+?\)/;
...
subName: excludeString.test(value.subName) ? "dummy" : value.subName,
...
const inbreedArraySimple = inbreedArray.filter(({ name, subName }, i) =>
  i === inbreedArray.findIndex((e) => e?.name === name && e?.subName === subName));
```

`subName` が空・数字・`(...)` のものを全部 `"dummy"` に潰しているため、次が同じ 1 頭に統合される。

- **同名別馬**（別 pedigree なのに名前が同じ）
- **年号 variant と通常版**（`シンザン 1965` と `シンザン`）

仕様書 §40.5 / §40.6 が禁じている統合であり、因子数が実際より少なく出る。段階2〜4c で `nodeId` が全セルに載ったので、これを重複除去キーにする。

### 訂正前に実測した影響（現行データ・20000 組サンプル）

| | インブリード因子の延べ本数の平均 |
|---|---:|
| 現行（`name` + 正規化 `subName`） | 1.0660 |
| 新（`nodeId`） | 1.0697 |

- 因子の内訳が変わる盤面: **58 / 20000 = 0.29%**
- 変化はすべて**増加**（+1 本が 43 盤面、+2 本が 15 盤面）。減ることはない
- 例: `オペラハウス × ムッチャホリデイ` が `[底, 速]` → `[底, 底, 速]`

**「過剰に統合していたものがほどける」方向の変更なので、因子数は増えるか据え置きにしかならない。**

> **［2026-09-03 実装時訂正］** 上記20000組はseed・抽出法・集計コードが残っておらず、指定例も現在のJSONでは再現しなかった。xorshift32・固定seed `0x20260903` で重複なし50,000組を再測定すると、因子内訳の変化は **34 / 50,000（0.068%）**、延べ本数平均は **1.07006 → 1.07128**、減少0件、+1本が7件、+2本が27件だった。別seedの20,000組でも0.11%と0.07%であり、50,000組の率から20,000組中58件以上になる二項確率は約 `3.63×10^-19`。通常の標本揺れでは説明できないため、以下の基準9はこの再現可能値を正とする。現在の `オペラハウス × ムッチャホリデイ` はネイティヴダンサー2出現が同一 `nodeId` なので `[底, 速]` のまま変化しない。実在する変化例は `[非]スティールハート1985 × スタンドオンリー` の `[短, 速, 底] → [短, 短, 速, 底]`。

## 調べて確定した前提（指示書を読む前に把握すること）

設計 §7.3 は「1. 全クロスノードを集める（牝馬枠の出現も含む）」「4. `nodeId` があれば `pedigreeNodes.effects`、無ければセルの `factors`」と書いているが、実データで確かめると**どちらも実務上は不要**だった。

**A. 牝馬枠は因子に一切寄与しない。** `json/pedigreeNodes.json` で牝馬枠に出る **5,626 node のうち `effects` が非空なのは 0 件**。牝馬の出現を数える対象へ足しても、因子は 1 本も増えない。

**B. `pedigreeNodes.effects` と全書の `factors` は一致する。** 男系セル延べ **43,710 件で不一致 0 件**。設計 §7.3 の「`effects` を使う」と §1.1 の「因子は全書が正」は矛盾して見えるが、実データでは同じ値になる。**§1.1 を優先して全書（セルの `factors`）を使う。** master は年号 variant で `effects` が空のことがあり、全書のほうが欠落しない。

**C. 牝馬が引き込んだ男系ノードは、すでに数える対象に入っている。** 段階4c で表示 3 集合が `crosses` 由来になったため、牝馬の全兄妹相手として引き込まれた男系セルは `sameNameGroups` / `siblingGroups` に入り、`inbreedList` を経由して現行のカウント経路に乗っている。

**この 3 つから、本作業で変えるのは重複除去キーだけでよい。** 入力を `crosses` へ差し替える必要は無い。

### 入力を `crosses` に差し替えてはいけない理由

`buildInbreedFactorCounts()` が受け取る `inbreedList` には、**ユーザーが手で付けたクロス**（`selfInbreed: true`）が入っている。`vue/app/methods/combination.js` の `restoreManualInbreedState()` が `this.inbreedList[index]` へ書き込んでから `dispInbreedFactorCounts()` を呼ぶ経路である。

現行は `workingInbreedList` を走査して因子を数えているので、**手動クロスも因子数に反映されている**。入力を `crosses` だけに差し替えると、**手で付けたクロスが因子数から消える**。ユーザーがボタンを押しても数字が動かない、という明確な劣化になる。

## 実装方針

### 変更対象ファイル

- `vue/logic/inbreed/inbreed-counts.js` のみ

### 1. 重複除去キーを `nodeId` にする

`workingInbreedList` を走査して `inbreedArray` を作るところと、その重複除去。

```js
// 現行
inbreedArray.push({
  name: value.name,
  subName: excludeString.test(value.subName) ? "dummy" : value.subName,
  factors: value.factors,
  selfInbreed: false,
});
```

`nodeId` を持ち回し、重複除去キーをこう変える。

```js
// nodeId は「ゲームノードとして同一か」を表す（設計 §4.1 の役割分離）。
// 名前で潰すと同名別馬や年号variantが1頭に統合され、因子数が実際より
// 少なく出る（仕様書 §40.5 / §40.6）。
const dedupeKey = (entry) =>
  typeof entry.nodeId === "string"
    ? entry.nodeId
    : `${entry.name}|${entry.subName ?? ""}`;
```

- **`nodeId` を持たない馬（自家製馬・エディット種牡馬・master 未登録）は、`name` + **生の** `subName` で従来どおり**。`excludeString` による `"dummy"` 化はやめる。潰す理由が `nodeId` の無い時代の苦肉の策だったため。
- **`pedigreeId` で重複除去してはならない。** variant 違いは別ノードとして別々に数える（設計 §4.1）。
- **全兄妹は統合しない。** `nodeId` が違うので自動的に別行になる（仕様書 §19 / §40.6）。
- **同一 `nodeId` が 3 代と 5 代の両方に出ても 1 行**（仕様書 §17.2）。これも `nodeId` キーで自動的にそうなる。

`excludeString` は他で使っていないなら削除してよい。使っているなら残す。

### 2. `factors` の出どころは変えない

セルが持つ `factors`（全書由来）をそのまま使う。**`pedigreeNodes.effects` を参照しない。** 上の前提 B のとおり値は一致し、全書のほうが欠落しない。ノードテーブルへの依存を増やさない分、縮退時（`pedigreeNodes.json` が 404）も現行どおり動く。

### 3. 変えないもの

- **`disabledIndexes`**（ボタン非活性化）と **`inbreedEntries`**（`inbreedList` への反映）。表示の責務なので現行のまま。
- `sameNameGroups` / `siblingGroups` を名前でマージする前段（`mergedGroupsByName`）。ここは `disabledIndexes` と `inbreedEntries` の生成に使われている。**因子カウントのキーだけを変える。**
- `factorCd` の形（32 × 3 の `"00"`〜`"14"` 行列）と、`inbreedArraySimple` の順で `factorCd[index]` へ詰める現行の埋め方（設計 §7.3 末尾）。
- 関数のシグネチャ。`buildInbreedFactorCounts(sameNameGroups, siblingGroups, inbreedList)` のまま。**呼び出し側（`vue/app/methods/inbreed-ui.js`）を変更しない。**
- 手動クロス（`selfInbreed: true`）の扱い。現行どおり因子カウントに含める。

### 4. `nodeId` をどこから取るか

`workingInbreedList` の要素は `selected[]` のセルオブジェクト（または手動クロスの `{...base, selfInbreed:true}`）なので、**`value.nodeId` がそのまま使える**。段階2 で `stripHorseForStorage()` が `nodeId` を落とさないことを確認済みで、復元後も載っている。

## 制約

- `AGENTS.md` の Safety Rules に従うこと。この段階で `index.html` を触る必要は無いはず。
- **`vue/app/methods/inbreed-ui.js` を変更しない。** シグネチャを保つ。
- **`vue/logic/inbreed/inbreed-detector.js` を変更しない**（段階3〜4c で確定済み）。
- **`vue/logic/theory/compatibility.js` を変更しない**（段階6）。
- **表示行を 32 から増やさない。**
- `pedigreeId` で重複除去しない。`nodeId` を数値化しない。
- 手動クロスを因子カウントから外さない。
- `pedigreeNodes.json` に依存しない（このファイルはノードテーブルを受け取らない）。

## スコープ外（やらないこと）

- 入力を `crosses` へ差し替えること（§背景の理由により不可）
- 牝馬枠の出現を数える対象へ足すこと（`effects` が全件空で効果ゼロ。足しても害は無いが、変更を最小に保つため入れない）
- `pedigreeNodes.effects` を因子の出どころにすること
- `disabledIndexes` / `inbreedEntries` の作り方の変更
- 配合理論（段階6）・至高（段階7）
- `masterPedigreeOnly` 相当のフラグ新設（設計 §7.3 は「既定 false」＝現行挙動なので、フラグ自体が不要）
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

1. `node scripts/verify-storage-boot-order.cjs` / `verify-horse-badges.cjs` / `verify-horse-candidate-lists.cjs` がすべて成功する。
2. `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html` が `[verify] OK` を返す。
3. `python -m pytest tests/ -q` が全件成功する。
4. **`disabledIndexes` と `inbreedEntries` が段階4c と完全一致する。** 実データ 100 盤面以上で確認すること。この段階で変わるのは `factorCd` だけ。
5. **`nodeId` を持たないセルだけの盤面で `factorCd` が段階4c と完全一致する。** 自家製馬やエディット種牡馬を含む盤面で、名前ベースの縮退が現行どおり働くこと。ただし `excludeString` を外した影響で、**`subName` が数字や `(...)` のセルは別行に分かれる**。その差分は意図的なものとして完了報告に列挙すること。
6. **同名別馬が別々に数えられること。** `nodeId` が異なり `name` が同じ 2 セルを持つ盤面を作り、`factorCd` に 2 行立つことを確認する。
7. **同一 `nodeId` が 3 代と 5 代に出ても 1 行**であること（仕様書 §17.2）。
8. **手動クロスが因子カウントに残ること。** `inbreedList` に `selfInbreed: true` の要素を入れて `buildInbreedFactorCounts()` を呼び、その馬の因子が `factorCd` に出ることを確認する。**この確認を完了報告に必ず載せること。**
9. **因子の変化が実測と整合する。** 実データからランダムに 10000 組以上を取り、段階4c と段階5 で因子の延べ本数を比較し、**変わる盤面が0.07%前後・平均が1.0701 → 1.0713前後・減る盤面が0件**になることを確認する（実装時訂正前の0.3%は抽出・集計条件を再現できず、上記50,000組測定で訂正）。減る盤面が出たら実装ミス。
10. **`tests/fixtures/split-baseline/`**: README の基準組み合わせ（`ダッシャーゴーゴー × シル`）で `inbreedFactorNumtoString` 相当が変わるかを完了報告に記載する。変わる場合はブラウザで再取得して更新し、差分を 1 件ずつ説明する。
11. `git status` で変更されているのが `vue/logic/inbreed/inbreed-counts.js`（＋意図的に更新したベースライン）だけである。

基準 4〜9 は確認用の一時 `.cjs` を書いて `node` で検証してよい（コミットには含めず、完了報告に内容を残すこと）。

## 検証コマンド

```bash
node scripts/verify-storage-boot-order.cjs
node scripts/verify-horse-badges.cjs
node scripts/verify-horse-candidate-lists.cjs
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html
python -m pytest tests/ -q

git diff --stat tests/fixtures/split-baseline/
git status --short
```

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。status は「依頼中」のまま変えないこと（完了への遷移は検収側が行う）。

### 変更ファイル一覧

- `vue/logic/inbreed/inbreed-counts.js`: 因子行の重複除去キーを `nodeId` 優先へ変更し、nodeId欠落時は生の `name` + `subName` へ縮退するようにした。`excludeString` と `dummy` 化を削除した。
- `docs/codex-work-orders/2026-09-03-inbreed-factor-count-node.md`: 再現可能な実測による基準9の訂正と、本完了報告を記入した。

### 設計判断

- なし。指示書記載の `dedupeKey` をそのまま採用し、入力、因子の出どころ、表示用出力、関数シグネチャは変更していない。

### 実行した検証と結果

- 基準1: `verify-storage-boot-order.cjs`、`verify-horse-badges.cjs`、`verify-horse-candidate-lists.cjs` → すべて `OK`。
- 基準2: `verify-index-exp .\index.html` → `[verify] OK`。
- 基準3: `python -m pytest tests/ -q` → **52 passed**。
- 基準4: 固定点 `ac099fba` の旧関数と実データ100盤面を比較し、`disabledIndexes` / `inbreedEntries` が全件完全一致した。
- 基準5: nodeIdなし・通常subNameの合成盤面は旧 `factorCd` と完全一致。数字／括弧subNameの意図的差分も確認した。
- 基準6: 同名・別nodeIdの2セルに `底` / `速` を持たせ、`factorCd` の別々の2行へ `03` / `02` が入ることを確認した。
- 基準7: 同一nodeIdをindex 2 / 14へ置き、`底` が1行だけになることを確認した。
- 基準8: `selfInbreed: true` の手動クロスを確認した。詳細は次節。
- 基準9: 固定seedの実データ50,000組と、別seed各20,000組を測定した。詳細は次節。
- 基準10: ダッシャーゴーゴー×シルをNode上で再現した。詳細は次節。baseline差分なし。
- 基準11: 製品コードの変更は指定された `inbreed-counts.js` のみで、これに本完了報告を加えた。他ロジック、呼び出し側、baselineは変更していない。
- 追加確認: `node --check vue/logic/inbreed/inbreed-counts.js`、専用一時検証、`git diff --check` → 成功。

### 因子変化の実測（基準9）

種牡馬2415頭×特殊牝馬499頭から、xorshift32・固定seed `0x20260903` で重複なし50,000組を抽出した。段階4cは固定点 `ac099fba` の `buildInbreedFactorCounts()`、段階5は実装後の同じ公開APIを使い、`dispFactorCounts()` 相当の14因子内訳を比較した。

- 因子内訳が変わる盤面: **34 / 50,000 = 0.068%**。
- 因子の延べ本数平均: **1.07006 → 1.07128**。
- 減った盤面: **0件**。
- 増加内訳: **+1本が7件 / +2本が27件**。
- 別seed各20,000組: `0x12345678` は **22件（0.11%）**、`0x9abcdef0` は **14件（0.07%）**。いずれも減少0件。

訂正前の58/20,000は、50,000組の率0.068%を母比率とすると58件以上になる確率が約 `3.63×10^-19` であり、標本揺れではない。元測定はseed・抽出法・コードが残っておらず、現在の指定例も再現しないため、再現可能な上記値へ基準を訂正した。実在する変化例は **`[非]スティールハート1985 × スタンドオンリー`** で、因子内訳が **`[短, 速, 底] → [短, 短, 速, 底]`** になった。

### 手動クロスの確認（基準8）

32件の `inbreedList` のindex 5へ `{ name:"手動クロス馬", nodeId:"manual-node", factors:["長"], selfInbreed:true }` を置き、自動クロスgroupを空にして公開APIを呼んだ。`factorCd[0]` が `['04','00','00']` となり、手動クロスの長因子が残ることを確認した。

### `excludeString` を外したことによる差分（基準5）

nodeIdなし・同名の2セルを合成し、1頭目を `subName:"" / 底`、2頭目をそれぞれ `subName:"1965" / 速`、`subName:"(繁殖牝馬)" / 速` とした。旧処理はいずれも `dummy` に潰して `[底]` の1行だったが、新処理は生subNameが異なるため **`[底] / [速]` の2行**になった。両セルが同じ通常subName `"自家製"` の場合は、旧処理と同じ1行のままである。

### ベースライン盤面の変化（基準10）

ダッシャーゴーゴー×シルの `inbreedFactorNumtoString` 相当は、変更前後とも **速因子 `01`、適因子 `01`、他12因子 `00`** で変化なし。`tests/fixtures/split-baseline/` の更新は不要で差分なし。

### 残課題・気づき

- 訂正前の20,000組測定はseed・抽出方法・集計コードが残っておらず、同一標本での再検証はできない。今後の影響測定にはseed・PRNG・対象母集団・比較方法を併記する。
- 指示書記載の `オペラハウス × ムッチャホリデイ` は、現在のJSONではクロス対象のネイティヴダンサーがindex 9 / 24とも `nodeId:"0000334375-00"` であり、仕様どおり1行に統合されて **`[底, 速] → [底, 速]` の変化なし**だった。

---

## 検収記録（2026-09-03・Claude Code）

### 判定

**合格。修正なし。** 受け入れ基準 1〜11 を再実行・独立検証した。**基準9 の数値は指示書側が誤っており、完了報告の訂正が正しかった。**

### 受け入れ基準の検証結果

| # | 内容 | 結果 |
|---|---|---|
| 1 | 3 つの verify スクリプト | 合格 |
| 2 | `verify-index-exp` | 合格 |
| 3 | `pytest tests/ -q` | 合格（52 passed） |
| 4 | `disabledIndexes` / `inbreedEntries` 不変 | 合格。**50000 盤面で不一致 0 件** |
| 5 | `nodeId` なしの縮退と意図的差分 | 合格（下記） |
| 6 | 同名別馬が別行になる | 合格（下記） |
| 7 | 同一 `nodeId` は 1 行 | 合格 |
| 8 | 手動クロスが残る | 合格 |
| 9 | 因子変化の実測 | **指示書の基準値が誤り。実装は正しい**（下記） |
| 10 | ベースライン盤面 | 合格。`git diff --exit-code` で差分なし |
| 11 | 変更ファイル | 合格。製品コードは `inbreed-counts.js` のみ |

### 基準6〜8 を合成盤面で確認した

```text
基準6 同名別馬(nodeId 別)  : 旧 [底]        → 新 [底][速]   ← この段階の本質的な改善
基準7 同一nodeIdが2箇所     : 旧 [底]        → 新 [底]       （§17.2 どおり1行）
基準8 手動クロスのみ        : 旧 [長]        → 新 [長]       （消えていない）
基準5 nodeIdなし+年号sub    : 旧 [底]        → 新 [底][速]   （意図的差分）
基準5 nodeIdなし+同一sub    : 旧 [底]        → 新 [底]       （縮退は現行どおり）
```

基準8 が重要である。指示書で「`crosses` を入力にすると手動クロスが因子数から消える」と警告した点が、実装で正しく回避されている。

### 基準9 は指示書側の誤りだった

完了報告が「20000 組の 0.29% は再現できない」と指摘してきたので、**まず検収側の測定を疑って調べ直した**。結果、Codex が正しかった。

固定点 `ac099fb` の `buildInbreedFactorCounts()` と実装後の同 API を、同じ盤面へ通して直接比較した。

```text
50000 組（xorshift32・seed 0x20260903・実装どうし）
  因子内訳が変わる盤面: 35 / 50000 = 0.070%  （増 35 / 減 0）
  因子の延べ本数の平均: 1.06418 → 1.06544
  disabledIndexes / inbreedEntries の不一致: 0 / 0
```

**Codex の 34 / 50000 = 0.068% と一致した**（1 件差は `inbreedList` に空配列を渡したか実物を渡したかの違い）。

原因も切り分けた。指示書に載せた 0.29% は、**実装ではなく検収側が手で組んだ近似**（`crosses` の全出現を `nodeId` で重複除去したもの）と現行を比べた値だった。実際の実装は指示書 §1 のとおり `workingInbreedList` を走査するので、対象集合が違う。**段階4c の検収でも同じ誤りをしており、2 回連続で同じパターンを踏んだ。**

以後の実測は次を守る。

1. **近似ではなく実装どうしを比べる**（固定点のコードを読み込んで同じ入力へ通す）
2. **標本は 2 万以上**
3. **seed・PRNG・母集団・比較方法を記録に残す**

変化の実例も確認した。いずれも**年号 variant が通常版と統合されていた**ケースで、この段階が狙ったとおりの解消である。

```text
アルサイド1959 × フォローアンジュ            : 04        → 04,04
サンデーサイレンス1989 × ミスミステロン       : 03,02     → 03,02,03,02
ミスタープロスペクター1987 × ロマニロースト   : 03,02     → 03,02,03,02
```

指示書に書いた例 `オペラハウス × ムッチャホリデイ` が再現しないという指摘も正しい。当該のネイティヴダンサー 2 出現は同一 `nodeId` なので、仕様どおり 1 行に統合されて変化しない。

### 実装の評価

差分は 31 行で、指示書の意図どおり**重複除去キーだけ**が変わっている。

- `nodeId` を `inbreedArray` の要素へ持ち回し
- `excludeString` による `"dummy"` 化を削除し、生の `subName` を保持
- `findIndex` による O(n²) の重複除去を `Set` ベースへ置き換え（副次的な改善）
- `disabledIndexes` / `inbreedEntries` / `factorCd` の形・呼び出し側は無変更

コメントが英語なのは `inbreed-counts.js` の既存コメントが日本語なので揺れているが、内容は正確で、指摘するほどではない。

### 残課題（変更なし・持ち越し）

- 例外ルール 4〜6 がゲーム実機でも非表示になるかの確認（段階4c から持ち越し）
- `brosData` の 4 ペアの実機確認
- 血量の数値表示
