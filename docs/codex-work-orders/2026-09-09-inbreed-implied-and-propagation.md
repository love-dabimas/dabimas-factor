# 作業指示書: 盤面から組み立てる個体・工程診断・共有（全兄妹対応フェーズ2d）

- status: 依頼中
- 作成日: 2026-09-09
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 上位仕様: `docs/full-sibling-stacking-spec.md` v1.1（§5.2・§8）
- 前提: フェーズ1（c0f5b7d）、2a（dffcf20）、2b（fbafca8）、2c（b11a580）が完了・検収済み。`origin/main` へマージ済み（67135e6）
- **稼働影響あり:** パート1は血統表のクロス結果が変わる。パート2〜4は工程診断と共有の挙動が変わる

本指示書は独立した4パートからなる。**パートごとに実装・検証してよい。**

---

## パート1: 盤面から父母が引ける個体を判定へ入れる【最優先・ユーザー報告あり】

### 背景

ユーザー報告。パーソロン1971 と スイートルナ を祖先セルへ置いて作った繁殖牝馬に
トウカイテイオーを付けたが、**シンボリルドルフのクロスが出ない**。

```
母（本馬）   = ワタシノヒンバ（自動生成。血統マスタに無い）
母の父       = アイアンリージ巌瓏
母の母       = ???            ← ここが「ルドルフの全兄妹」
母の母の父   = パーソロン1971   ← 盤面にある
母の母の母   = スイートルナ     ← 盤面にある
```

血統表に牝馬のセルは無く、牝馬15枠はルート馬の血統から辿って決める。
ルートが「ワタシノヒンバ」で血統を持たないため、**母の母が誰なのか解決できず、出現すら作られない**。
父母は両方とも盤面にあるのに、その2頭の子を組み立てる処理が無い。

31ポジションを機械的に監査したところ、**同じ性質の穴が3種類**あった。

| 穴 | 例 | 現状 |
|---|---|---|
| 牝馬15枠が解決できない | 上記の「母の母」 | 出現なし |
| ルートセルの個体が不明 | 「ワタシノヒンバ」 | `unknown`。誰とも一致しない |
| 自家製の旧レコードをルートに置いたときの牝馬枠 | 保存refが無い自家製馬の下の牝馬枠 | 出現なし |

いずれも**盤面には父母が揃っている**。通常の盤面（種牡馬×繁殖牝馬をルートに選ぶ）では穴は無い。

### 実装方針

**盤面のどの位置でも、父と母が盤面から引けるなら「その2頭の子」として個体を組み立てる。**

位置 `p` の父は男系セル `p + "F"`、母は牝馬枠 `p + "M"`。どちらも同じ側の31ポジション内にある。

#### 1-1. resolver に `implied` を足す（`vue/logic/pedigree/identity-resolver.js`）

`parentsOf` の先頭へ追加する。

```javascript
    const parentsOf = (ref) => {
      // 盤面の父母から組み立てた暗黙の個体。個体としては誰とも一致しないが、
      // 父母は分かるので全兄妹判定には参加できる。
      if (ref?.kind === "implied") {
        if (!ref.fatherRef && !ref.motherRef) return null;
        return { father: ref.fatherRef ?? null, mother: ref.motherRef ?? null };
      }
      if (ref?.kind === "custom") {
        ...
```

`identityKey` / `crossHorseKey` / `parentComparisonKey` は **`implied` に対して `null` を返すまま**にする
（既存の分岐は `master` / `custom` / `edit` / `masterPedigree` しか見ていないので変更不要）。
暗黙の個体は「誰とも同一ではない」が「父母は分かる」という位置づけである。

#### 1-2. 牝馬15枠へ暗黙の個体を作る（`vue/logic/inbreed/inbreed-detector.js`）

`buildMareOccurrences` を2パスにする。1パス目は現行どおり解決し、
2パス目で未解決の枠に暗黙の個体を作る。

**母の枠のほうが path が長いので、2パス目は slot の大きいほうから回すこと。**
（`"M"` の母は `"MM"`、`"MM"` の母は `"MMM"`。降順なら先に解決済みになる）

```javascript
// 1パス目: 現行の解決結果を refBySlot / nodeIdBySlot へ貯める（出現はまだ作らない）

// 2パス目: 未解決の枠を、盤面の父母から組み立てる
const slotByPath = new Map(MARE_PATHS.map((p, i) => [p, i]));
const cellByPath = new Map();
SIRE_PATHS.forEach((p, i) => {
  cellByPath.set(p, selected[sideOffset + DESCENDANT_SLOTS[i]]);
});
for (let slot = MARE_PATHS.length - 1; slot >= 0; slot--) {
  if (refBySlot[slot]) continue;
  const path = MARE_PATHS[slot];
  const fatherRef = cellByPath.has(path + "F")
    ? cellRef(cellByPath.get(path + "F")) : null;
  const motherSlot = slotByPath.get(path + "M");
  const motherRef = motherSlot === undefined ? null : refBySlot[motherSlot];
  const known = (r) => r && r.kind !== "unknown";
  if (!known(fatherRef) && !known(motherRef)) continue;
  refBySlot[slot] = {
    kind: "implied",
    fatherRef: known(fatherRef) ? fatherRef : null,
    motherRef: known(motherRef) ? motherRef : null,
  };
}
// 3パス目: refBySlot から出現を作る（nodeId は1パス目で決めた値）
```

#### 1-3. ルートセルにも暗黙の個体を作る

`buildSideOccurrences` のルートセルで、`cellRef(root)` が `unknown` のときだけ、
父＝`selected[sideOffset + DESCENDANT_SLOTS[0]]`（path `"F"`）、母＝牝馬枠 `"M"` から
同じ形の `implied` ref を作る。

**男系の祖先セル（localIndex 1〜15）には暗黙の個体を作らないこと。**
そこが `unknown` になるのは `★N薄め…` の希釈用ダミーと手入力馬で、実在の個体ではない。
盤面の父母から子を組み立てると、希釈元の馬の全兄妹として誤検出する。

### 受け入れ基準（パート1）

すべて依頼側の試作で実測した値である。

#### 1. ユーザー報告の盤面が直る

父側ルート＝トウカイテイオー央獅。母側は 本馬＝ワタシノヒンバ／母の父＝アイアンリージ巌瓏／
母の母の父＝パーソロン1971（localIndex 3）／母の母の母＝スイートルナ（localIndex 7 へ繁殖牝馬として選択）。

| 項目 | 現行 | 期待 |
|---|---|---|
| `inbreedColorIndexes` | `[2,19]` | **`[1]`** |
| `crosses` | パーソロン25000、スイートルナ25000 の2件 | **シンボリルドルフ 血量50000 の1件** |
| その occurrences | — | `[[1,"F"],[null,"M"]]` |
| `dangerous` | `false` | **`true`** |
| 牝馬枠 `"M"` の ref | 出現なし | `{kind:"implied", fatherRef:{master 0000333257-01}, motherRef:{master 0000050973-00}}` |

パーソロンとスイートルナのクロスが消えるのが正しい。ルドルフと母の母が全兄妹なので、
その共通祖先は同一家系枝として二重計上しない（既存の §11 ルール）。

#### 2. 通常の盤面が変わらない

固定 seed で種牡馬×繁殖牝馬 **1000組以上**を生成し、フェーズ2c（`HEAD`）と比較する。
`count` / `inbreedColorIndexes` / `dangerous` / `crosses.length` / `bloodVolume` /
`selfAncestorWarningIndexes` / `sameNameSpecialChecks` の**差分0件**であること。
（通常の盤面では牝馬15枠がすべて解決済みなので、暗黙の個体は作られない）

#### 3. ★薄め馬に暗黙の個体を作らない

`★1薄め…` のセルを含む盤面で、そのセルの ref が `unknown` のままであること。
盤面の父母から組み立てないこと。

#### 4. 前フェーズの受入が壊れていない

フェーズ2b・2cの受入基準（B01・B03・C01・C02・E01・F01・D07・D08・A01・A05）を再実行し、
すべて従来どおりの値になること。

---

## パート2: 工程診断へ resolver と個体を届ける

### 背景

`vue/logic/plan/plan-diagnosis.js` の `composeVirtualMareBoard` は、工程で生まれる仮想繁殖牝馬の
`board[0]` を `null` にする。血統マスタに無い個体だからである。
その結果、その側の牝馬15枠が丸ごと消え、**工程診断では画面と違うクロス結果になる**。

### 実装方針

- 工程ごとに一意な一時 ref を作る（例 `{kind:"custom", id:"plan:step2:<診断内で安定な連番>"}`）。
  **保存済みの `ch_` と衝突させないこと。**
- その ref の父母を診断用 registry へ登録する。父＝その工程の種牡馬の ref、母＝前工程の繁殖牝馬の ref。
- resolver を `input.resolver` のままにせず、診断用 registry を重ねた読み取り専用ラッパを作って
  `judgeInbreed` へ渡す。元の resolver を書き換えないこと。
- `composeVirtualMareBoard` が返す board の `[0]` へ、その ref と `sexKind: "female"` を持つ
  最小限のセルを置く。名前は既存の `mareLabel` を使ってよい。

### 受け入れ基準（パート2）

1. フェーズ2bの B01 相当の配合を、画面側 `judgeInbreed` と工程診断の合成盤面の両方で評価し、
   **内部クロス・血量・`dangerous` が一致**すること
2. 仮想繁殖牝馬を含む工程で、その個体の ref が診断内で安定していること（同じ診断を2回走らせて同じ結果）
3. 一時 ref が `customHorses` ストアへ書き込まれないこと（診断用 registry はメモリ上だけ）
4. 工程診断の既存の出力（`status` / `reasonCode` / 表示文言）が、
   仮想繁殖牝馬を含まない配合では変わらないこと

---

## パート3: 共有で祖先の自家製馬・エディット馬も同梱する

### 背景

`vue/CombinationDialog.js:263` の `collectCustomHorseIds` は32セルを走査して
`source === "custom"` か `customHorseId` を持つセルの id を集める。
しかし `saved-horse-builder.js` は `id` / `customHorseId` を祖先セルへ写さないので、
**実質ルートセルしか集まらない**。

フェーズ2a以降は祖先セルにも `identityRef` があり、その ref が指すレコードが受け取り側に無いと
`parentsOf` が解けず、**作者には見えるクロスが受け取り側では出ない**。

### 実装方針

- 収集を `identityRef` ベースにする。32セルの `identityRef` と、各セルの `mareRefs` を起点に、
  `kind === "custom"` / `"edit"` を集める
- 集めた custom レコードの `fatherRef` / `motherRef` / `mareRefs` を辿って**再帰的に**収集する。
  訪問済み集合で重複と循環を防ぐこと
- `edit` は `editStallions` ストアのレコードなので、`configData.editStallions` として別に同梱し、
  復元時は `vue/logic/storage/edit-stallion-repository.js` 経由で書き戻す
- 参照先が見つからないときは同梱をあきらめてよい。**別の同名馬へ接続しないこと**

### 受け入れ基準（パート3）

1. 祖先に自家製馬を含む配合を保存・共有し、**その自家製馬のレコードを持たない環境**で復元したとき、
   父母 ref と判定結果が作者側と一致すること
2. 自家製馬が自家製馬を父に持つ2段の積み上げでも、両方のレコードが同梱されること
3. エディット種牡馬を含む配合で、`configData.editStallions` が同梱され復元されること
4. 参照先が欠落しているときは `unknown` 扱いになり、同名の別馬へ接続しないこと

---

## パート4: resolver 未指定を検知できるようにする

### 背景

フェーズ2bの検収での申し送り。`isRefCrossRelated` は `resolver` が無いと常に false を返すため、
将来の改修で第4引数を渡し忘れると**エラーも警告も出ないままクロスが1件も出なくなる**。

### 実装方針

`judgeInbreed` の冒頭で、`nodeTable` があるのに `resolver` が無いときだけ `console.warn` を1回出す。
判定の挙動は変えない（従来どおりクロス0件のまま）。

### 受け入れ基準（パート4）

1. `nodeTable` あり・`resolver` なしで呼ぶと `console.warn` が1回出る
2. `nodeTable` なしでは警告を出さない（縮退経路は正常な使い方）
3. 両方ありのときは警告を出さない

---

## 制約（全パート共通）

- `AGENTS.md` に従うこと。
- legacy 経路（`recognizedCrosses`、`broodmareGroups`、`legacyCount`）と、
  nodeTable 不在の縮退経路を変えないこと。
- `judgeInbreed` の引数と戻り値のキーを増減しないこと。
- `selfAncestorWarning` と至高（`evaluateSupremeCross`）の式を変えないこと。
- 保存レコードの形（フェーズ2a）を変えないこと。
- 旧保存のマイグレーションはしないこと。

## スコープ外

- 表示抑制と分類（フェーズ2cで完了）。
- 判定規則そのもの（フェーズ2bで完了）。
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 検証コマンド

```
node --check vue/logic/pedigree/identity-resolver.js
node --check vue/logic/inbreed/inbreed-detector.js
node --check vue/logic/plan/plan-diagnosis.js
node tmp/verify-p2d-implied.cjs        # パート1
node tmp/verify-p2d-regression.cjs     # パート1 基準2
node tmp/verify-p2d-plan.cjs           # パート2
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html
python -m pytest tests/ -q
git diff --check
```

画面確認は `.claude/launch.json` の `static-verify`（ポート8767）。
**確認前に ServiceWorker とキャッシュを消すこと。** ポート8766 は別ディレクトリの古いコピーなので使わない。

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。パートごとに書いてよい。

### 変更ファイル一覧

<変更した全ファイルと、それぞれ何をしたか>

### 設計判断

<指示書に書かれていなくて自分で判断したことがあれば、その内容と理由。なければ「なし」と書く>

### 実行した検証と結果

<検証コマンドごとの実行結果。受け入れ基準の番号と対応させる>

### 残課題・気づき

<スコープ外だが気づいた問題、やり残し。なければ「なし」>
