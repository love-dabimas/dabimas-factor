# 作業指示書: 盤面から組み立てる個体・工程診断・共有（全兄妹対応フェーズ2d）

- status: 実装完了（C01の旧期待値との不整合は完了報告参照）
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

さらにユーザー報告が2件続いた。どちらも**自家製馬の下の母系が辿れない**という同一原因である。

- 2件目: 自家製繁殖牝馬を祖先セルへ置くと、彼女の母が現れず `isSameBranch` が効かない。
  ルドルフとの共通祖先（スピードシンボリ・Palestine）が別クロスとして誤検出される
- 3件目: 自家製馬の中に自家製馬がいる2段構成で、**5代目にあたる牝馬が判定にまったく現れない**

保存レコードには `motherRef` が正しく入っているのに、判定側が `nodeTable.parentsOf(nodeId)` しか
見ていないことが原因である。1-2 の「ある個体の母を ref で引く」形への統一で3件とも塞がる。

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

#### 1-2. 牝馬15枠の解決を ref ベースにする（`vue/logic/inbreed/inbreed-detector.js`）

**ユーザー報告2件目の原因はここにある。**

自家製繁殖牝馬を祖先セルへ置くと、彼女は牝馬枠 `"M"` に入る。しかし現行の牝馬枠の解決は
`nodeTable.parentsOf(nodeId)` しか使わないため、**nodeId を持たない自家製馬の下の枠
（`"MM"` = 彼女の母 など）が解決できない**。

その結果、彼女の母（スイートルナ）が盤面に現れず、`isSameBranch` が効かなくなり、
**ルドルフと彼女の共通祖先（スピードシンボリ・Palestine 等）が別々のクロスとして誤検出される**。

牝馬枠の解決を「ある個体の母を ref で引く」形に統一する。

```javascript
const canonicalMasterRef = (pedigreeId) => {
  const nodeId = nodeTable && pedigreeId ? nodeTable.canonicalNodeOf(pedigreeId) : null;
  return typeof nodeId === "string" ? { kind: "master", nodeId } : null;
};
const motherRefOf = (ref) => {
  if (!ref || ref.kind === "unknown") return null;
  if (ref.kind === "implied") return ref.motherRef ?? null;
  if (resolver) {
    const parents = resolver.parentsOf(ref);
    const mother = parents && parents.mother;
    if (mother) {
      return mother.kind === "masterPedigree"
        ? canonicalMasterRef(mother.pedigreeId) : mother;
    }
  }
  if (nodeTable && typeof ref.nodeId === "string") {
    return canonicalMasterRef(nodeTable.parentsOf(ref.nodeId).mother);
  }
  return null;
};
```

`buildMareOccurrences` を3パスにする。位置→ref の対応表 `refByPath` を持ち、
男系セルとルートは `cellRef()` で埋めておく。

1. **1パス目（`MARE_PATHS` 順）**: 各枠を次の優先順で解決する
   1. その位置に明示配置された繁殖牝馬の ref（`placeholderMareRef`。無ければ `placeholderMareNodeId` から master ref）
   2. `motherRefOf(refByPath.get(path.slice(0, -1)))` ← **親位置の個体の母**
   3. ルートセルの `mareRefs[slot]`、無ければ `mareNodeIds[slot]` から master ref
2. **2パス目（slot の大きいほうから）**: まだ決まらない枠を、盤面の父母から
   `{kind:"implied", fatherRef, motherRef}` として組み立てる。
   父は男系セル `path + "F"`、母は牝馬枠 `path + "M"`
3. **3パス目**: `refBySlot` から出現を作る。`nodeId` は `ref.kind === "master"` のときだけ入れる

母の枠は親の path より後に並ぶので、1パス目・3パス目は配列順のままでよい。
2パス目だけ降順（`"M"` の母は `"MM"`、`"MM"` の母は `"MMM"` のため）。

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

#### 2. ユーザー報告2件目（自家製で試した盤面）が直る

「☆ルドルフ牝馬」（父＝パーソロン1971・母＝スイートルナ）を**繁殖牝馬として保存**し、
母側の localIndex 3 へ置く。父側ルート＝トウカイテイオー覇魂。母の父＝アイアンリージ巌瓏。

| 項目 | 現行 | 期待 |
|---|---|---|
| `inbreedColorIndexes` | `[1,5,23,11,31]` | **`[1]`** |
| `crosses` | シンボリルドルフ50000／**スピードシンボリ12500**／**Palestine6250** の3件 | **シンボリルドルフ 血量50000 の1件** |

スピードシンボリと Palestine が消えるのが正しい。ルドルフと☆ルドルフ牝馬は全兄妹なので、
その共通祖先は同一家系枝として二重計上しない。
現行はスイートルナが牝馬枠 `"MM"` に現れないため、この除外が効いていない。

#### 3. ユーザー報告3件目（自家製を2段積んだ盤面）が直る

報告2件目と同じ原因が**1段深いところ**で起きる。自家製馬の中に自家製馬がいる形。

```
A = パーソロン1971 × スイートルナ    （＝ルドルフの全兄妹）
B = サンデーサイレンス1989 × A       （これを盤面へ置く）
```

B を母側の localIndex 15 へ置く。父側ルート＝トウカイテイオー。
このとき B は牝馬枠 `"MMM"`（4代目）、**A は `"MMMM"`（5代目）**に入る。

| 項目 | 現行 | 期待 |
|---|---|---|
| `inbreedColorIndexes` | `[12,30,14,26]` | **`[1,12,30,14,26]`** |
| `crosses` | ニアークティック6250／プリンスリーギフト6250 | 左記＋**シンボリルドルフ 血量28125** |
| そのクロスの occurrences | — | `[[1,"F",2],[null,"MMMM",5]]` |
| 牝馬枠 `"MMMM"` の出現 | **なし** | あり（A の custom ref） |

B の保存レコードには `motherRef = {kind:"custom", id:A}` が正しく入っている。
現行はそれを読まず `nodeTable.parentsOf(nodeId)` しか使わないため、
**nodeId を持たない B の母（A）が辿れず、5代目の牝馬枠が空のまま**になる。

仕様書 §9 D02 と §5.3 は「5代目の牝馬も判定対象」と定めている。
**自家製馬が何段積まれていても母系を辿れること**を、この基準で確認する。

#### 4. 通常の盤面が変わらない

固定 seed で種牡馬×繁殖牝馬 **1000組以上**を生成し、フェーズ2c（`HEAD`）と比較する。
依頼側は1500組で差分0件を確認している。
`count` / `inbreedColorIndexes` / `dangerous` / `crosses.length` / `bloodVolume` /
`selfAncestorWarningIndexes` / `sameNameSpecialChecks` の**差分0件**であること。
（通常の盤面では牝馬15枠がすべて解決済みなので、暗黙の個体は作られない）

#### 5. ★薄め馬に暗黙の個体を作らない

`★1薄め…` のセルを含む盤面で、そのセルの ref が `unknown` のままであること。
盤面の父母から組み立てないこと。

#### 6. 前フェーズの受入が壊れていない

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

- `vue/logic/pedigree/identity-resolver.js`: `implied` の父母解決を追加。同一性のキーは従来どおり null。
- `vue/logic/inbreed/inbreed-detector.js`: 牝馬15枠をrefで3パス解決し、盤面から牝馬枠・unknownルートの個体を補完。resolver未指定の警告を追加。
- `vue/logic/plan/plan-diagnosis.js`: 工程別の一時個体台帳と読み取り専用resolverラッパ、仮想牝馬のルートセルを追加。
- `vue/CombinationDialog.js`: 祖先・牝馬枠・父母の参照を再帰収集し、自家製馬とエディット馬を同梱。edit repository経由で復元。不要になった旧ID収集メソッドを削除。
- `vue/app/methods/combination.js`: 復元した両ストアのキャッシュ読込完了後に画面を再判定。
- `scripts/verify-p2d-common.cjs`: 実データ読込と変更前判定の共通ハーネス。
- `scripts/verify-p2d-implied.cjs`: 報告3件・unknownルート・希釈用祖先・警告の検証。
- `scripts/verify-p2d-regression.cjs`: 固定seedの1,500組と縮退経路の変更前比較。
- `scripts/verify-p2d-prior-cases.cjs`: 前フェーズ受入の再検証。C01のみ、新しく解決される牝馬クロスを期待値に含める。
- `scripts/verify-p2d-plan.cjs`: 工程診断と画面の一致、再現性、非永続性、実牝馬1工程の出力比較。
- `scripts/verify-p2d-sharing.cjs`: 循環・重複・欠落参照、空の復元先、edit復元、画面キャッシュ読込順を検証。
- `scripts/verify-p2d-ui.html`: SW・キャッシュ消去後、実画面でA01と報告1を検証するハーネス。
- 本指示書: 完了報告を記入。

### 設計判断

- 一時IDは診断内の `plan:step:<工程番号>`。`ch_` と衝突せず、同じ診断を再実行しても安定する。
- `composeVirtualMareBoard` を単独利用した場合も個体情報を残すため、第3引数のref省略時は父母を持つ `implied` を使う。
- 共有復元はDBへの書込みだけでは既存の `identityResolver` に反映されないため、両キャッシュの再読込を待ってから `restoreInputData` を実行する。
- 復元先が無い参照は名前で補完しない。既存resolverの同一性規則は変更せず、父母解決不能として扱う。
- 検証は再利用できるよう `scripts/` に保存。指示された `tmp/verify-p2d-{implied,regression,plan}.cjs` にも呼出し用ファイルを作成した（tmpはgit管理外）。

### 実行した検証と結果

- 変更したJavaScript 5ファイルの `node --check`: すべて成功。
- `node scripts/verify-p2d-implied.cjs`: 成功（パート1基準1～3・5、パート4基準1～3）。報告1・2は色 `[1]`、ルドルフ50000のみ、dangerous=true。報告3は5代目 `MMMM` にcustom Aが現れ、ルドルフ28125と既存2クロス。報告3の未指定の他枝には、報告にある既存ニアークティック・プリンスリーギフトのセルを明示配置している。
- `node scripts/verify-p2d-regression.cjs`: 成功（パート1基準4）。変更前 `abccc16c89d6cec9eb8ba413f39f794a1fe29fa1` と固定seed `0x20260909` の1,500組を比較。例外ルールあり・なし計3,000判定で、count・色・dangerous・crosses全体（血量含む）・自己祖先警告・同名特殊チェックの差分0件。nodeTableなしの戻り値全体も差分0件。
- `node scripts/verify-p2d-prior-cases.cjs`: 成功（パート1基準6、ただしC01の内部クロス期待値は下記の理由で更新）。B01/B03/C01/C02/E01/F01/D07/D08/A01/A05を確認。
- `node tmp/verify-p2c-cases.cjs`: 旧C01の内部クロス不変比較で失敗。修正で初めて解決される牝馬枠が原因であり、表示色・dangerousは不変。旧テストは変更していない。
- `node scripts/verify-p2d-plan.cjs`: 成功（パート2基準1～4）。B01相当のルドルフ75000・dangerous=trueが画面と一致。2回の診断でref・内部クロス・出力が一致し、元resolverと保存レコードは不変。仮想牝馬なしの出力も変更前と一致。
- `node scripts/verify-p2d-sharing.cjs`: 成功（パート3基準1～4）。空の受信側レコード集合へ復元し、父母ref・判定全体が作者側と一致。2段の父参照・循環・重複・mareRefs・欠落ID・edit repositoryへの保存を確認。DB境界はインメモリのテストダブルで検証。
- `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html`: `[verify] OK`。indexファイルは未編集。
- `python -m pytest tests/ -q`: 52 passed。
- `git diff --check`: 成功。
- ポート8767で `codex-powershell.ps1 dump-dom ... 1280 1000 30000` と `screenshot ...` を実行。SW登録0・キャッシュ0・controllerなしで開始。A01および報告1の色・内部クロス・危険判定が成功、捕捉した画面エラー0件。`tmp/p2d-ui-dom.txt` と `tmp/p2d-ui.png` に保存し、スクリーンショットも目視確認。
- `code-review` の並列レビュー: Standardsの確定違反0件、Specの修正必須指摘0件。Standardsの軽微な旧メソッド削除提案1件は反映済み。

### 残課題・気づき

- **パート1基準6の「C01も内部クロスまで従来値」は、本修正と両立しない。** C01ではcustom母Aとマスタ母の全兄妹関係が、新たに解決される牝馬枠 `M` 同士で成立する。従来の父クロス50000に牝馬同士のクロス50000が1件加わる。色 `[1,17]`・dangerous=true、および「母Aをマスタの全兄妹と同一個体に昇格しない」というC01の本来の判定は維持する。既存の判定規則を変えて有効なクロスを抑制することはせず、この差を検収事項として残す。
- 別端末の実IndexedDBを用いた共有往復のブラウザE2Eは未実施。共有については実コンポーネントの収集・復元処理と空の受信側データを使ったNode検証まで実施した。
