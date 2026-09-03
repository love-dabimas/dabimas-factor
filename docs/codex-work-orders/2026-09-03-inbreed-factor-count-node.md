# 作業指示書: インブリード因子カウントの重複除去を `nodeId` キーへ（段階5）

- status: 依頼中
- 作成日: 2026-09-03
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 設計資料: `docs/pedigree-master-integration-design.md` §7.3 / §4.1 / §6.7
- アルゴリズム仕様書: `dabimas_pedigree_editor_algorithm_spec.md` §17.2 / §19 / §40.5 / §40.6
- 前提: 段階4c（`2026-09-03-inbreed-display-convergence.md`）が完了・検収済み
- **稼働影響: 小さい。** 因子の内訳が変わる盤面は実測 0.29%

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

### 実測した影響（現行データ・20000 組サンプル）

| | インブリード因子の延べ本数の平均 |
|---|---:|
| 現行（`name` + 正規化 `subName`） | 1.0660 |
| 新（`nodeId`） | 1.0697 |

- 因子の内訳が変わる盤面: **58 / 20000 = 0.29%**
- 変化はすべて**増加**（+1 本が 43 盤面、+2 本が 15 盤面）。減ることはない
- 例: `オペラハウス × ムッチャホリデイ` が `[底, 速]` → `[底, 底, 速]`

**「過剰に統合していたものがほどける」方向の変更なので、因子数は増えるか据え置きにしかならない。**

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
9. **因子の変化が実測と整合する。** 実データからランダムに 10000 組以上を取り、段階4c と段階5 で因子の延べ本数を比較し、**変わる盤面が 0.3% 前後・平均が 1.066 → 1.070 前後・減る盤面が 0 件**になることを確認する。減る盤面が出たら実装ミス。
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

<変更した全ファイルと、それぞれ何をしたか>

### 設計判断

<指示書に書かれていなくて自分で判断したことがあれば、その内容と理由。なければ「なし」>

### 実行した検証と結果

<検証コマンドごとの実行結果。受け入れ基準の番号と対応させる>

### 因子変化の実測（基準9）

<サンプル数・因子の延べ本数の平均の前後・変わる盤面の割合・減った盤面の件数>

### 手動クロスの確認（基準8）

<selfInbreed: true の要素が factorCd に反映されることをどう確認したか>

### `excludeString` を外したことによる差分（基準5）

<subName が数字・(...) のセルが別行に分かれた例。無ければ「なし」>

### ベースライン盤面の変化（基準10）

<ダッシャーゴーゴー × シル で因子数がどうなったか>

### 残課題・気づき

<スコープ外だが気づいた問題、やり残し。なければ「なし」>
