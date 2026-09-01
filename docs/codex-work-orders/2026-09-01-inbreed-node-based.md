# 作業指示書: インブリード判定を nodeId ベースへ（男系のみ・血量・危険な配合）（段階3）

- status: 依頼中
- 作成日: 2026-09-01
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 設計資料: `docs/pedigree-master-integration-design.md` §7.1 / §6.6 / §6.7 / §12.2
- アルゴリズム仕様書: `dabimas_pedigree_editor_algorithm_spec.md` §12 / §13 / §40.1 / §40.4
- 前提: 段階2（`2026-09-01-pedigree-nodes-frontend-load.md`）が完了・検収済み
- **稼働影響あり: 全兄妹クロスの検出数が大きく増える**（下表の実測値を参照）

## 背景と目的

段階2 で `window.Dabimas.pedigreeNodes` が読み込まれ、`selected[]` の各セルに `nodeId` / `pedigreeId` が入るようになった。**まだ誰もそれを見ていない。** 段階3 で初めて判定に効かせる。

現行 `vue/logic/inbreed/inbreed-detector.js` の課題は 2 つ。

1. **同一馬判定が馬名の文字列比較**（`stallion.name === broodmare.name`）。アルゴリズム仕様書 §40.1 が明確に禁止している。同名別馬を誤ってクロス扱いし、逆に variant 違い（シンザン通常版とシンザン神速）を取りこぼす。
2. **全兄妹判定が `json/brosData.json` だけ**。仕様書 §40.4 の「全兄妹を無視」に相当する状態で、master から機械的に分かるペアをほとんど見ていない。

現行 R2 データ（`2026-09-01T052756Z+raw.f7018232c481`）での実測値。

| 母集団 | 全兄妹ペア数 |
|---|---:|
| `json/brosData.json`（現行の唯一の根拠） | キー 66 件 / 兄弟姉妹名 延べ 72 |
| master 全体・**pedigree レベル**（別々の実馬同士） | 1008 ペア（503 グループ） |
| `json/pedigreeNodes.json` 内・pedigree レベル（実際に判定へ効く範囲） | **696 ペア**（303 グループ） |
| master 全体・**node レベル**（variant 違いを含む） | 5731 ペア |
| 　うち同一 pedigree の variant 同士 | **4003 ペア** |

**増分の大半（5731 中 4003）は「同じ実馬の variant 同士」である。** シンザン通常版とシンザン神速のようなペアで、これらが新たに全兄妹として数えられる。設計資料 §6.6 は「4076 ペア」「36 ペア」と書いているが、これは旧データセットでの値で現行とは合わない。**本作業指示書の数値を正とする。**

加えて、血量（クロスの濃さ）と危険な配合の判定が未実装なので、この段階で内部計算だけ用意する。

### この段階でやらないこと（理由つき）

| 項目 | 段階 | 理由 |
|---|---|---|
| 牝馬15枠を判定に入れる | 段階4 | 設計 §13 が段階3 と分けている。全兄妹の増加とクロス群の増加を同時に出すと差分を切り分けられない |
| 同一家系枝の重複除外（仕様書 §11） | **段階4** | 下記のとおり牝馬ノードが要る |
| `count` の式変更 | 段階4 | 表示行を持たないクロス群は牝馬が入って初めて生じる |
| 血量・危険な配合の画面表示 | 未定 | 設計 §14 の未決事項2。この段階では戻り値に載せるだけ |
| `getCrossCommentType()` | 対象外 | Word マスター未入手（設計 §7.1 末尾） |

**仕様書 §11 を段階4 へ回す根拠。** §11 は「各出現の `branchParentNodeId`（その祖先へ到達する直前のノード）同士が完全同一 or 全兄妹ならそのペアを採用しない」という規則である。ところが 32 セルの男系ツリーで branch parent を辿ると、その約半分は**表示されない母**になる。既存の `parentChildMap` がそれを示している。

```text
セル 2（FF）  … 直前は セル 1（父）        → 男系セル。比較できる
セル 3（MF）  … 直前は index 100（本馬の母） → 牝馬。段階3 では nodeId が無い
```

母側ノードは `mareNodeIds` として段階4 で入る。段階3 で §11 を入れると半分の枝で判定不能になり、かえって挙動が読めなくなる。したがって**現行の `addExcludedAncestorPairs` による除外をそのまま残す**。

## 実装方針

### 変更対象ファイル

- `vue/logic/inbreed/inbreed-detector.js` — 判定の中核。**この段階の主対象**
- `vue/app/methods/inbreed-ui.js` — `judgeInbreed()` ラッパから `nodeTable` を渡す（数行）

### 1. シグネチャ

純関数の原則（ファイル冒頭のコメント）を守り、グローバルを直接読まずに引数で受け取る。

```js
window.Dabimas.logic.inbreed.judgeInbreed = function (
  selected,
  inbreedExceptions,
  nodeTable            // 追加。null / undefined 可
) {
```

`vue/app/methods/inbreed-ui.js` の `judgeInbreed()` ラッパで `window.Dabimas.pedigreeNodes` を渡す。

```js
const result = window.Dabimas.logic.inbreed.judgeInbreed(
  this.selected,
  this.inbreedExceptions,
  window.Dabimas.pedigreeNodes || null
);
```

**第 3 引数を省略した呼び出しは現行と完全に同じ結果を返すこと。** 既存のテスト・検証スクリプトが 2 引数で呼んでいる可能性があるため、後方互換を壊さない。

### 2. 同一馬判定を nodeId ベースへ

現行の「名前一致でクロス検出」ループの比較条件を差し替える。

```js
// どちらも nodeId を持つときだけ nodeId で判定する。
// 片方でも欠けていれば、そのペアだけ従来の名前比較へ縮退する（設計 §6.7 ルール1）。
const isExactSameNode = (a, b) => {
  if (typeof a?.nodeId === "string" && typeof b?.nodeId === "string") {
    return a.nodeId === b.nodeId;
  }
  return a?.name === b?.name;
};
```

- **`pedigreeId` で同一馬判定をしてはならない。** variant 違いは「同一馬」ではなく「全兄妹」として扱う（設計 §4.1 の役割分離）。
- 縮退の単位は**そのペアだけ**。片方に `nodeId` が無いからといって判定全体を名前ベースへ落とさない。
- 自家製馬・エディット種牡馬・master 未登録馬は `nodeId` が `null` なので、必ず名前比較へ落ちる。

### 3. 全兄妹判定を master ベースへ

現行の `fullBrothers` / `fullSisters` 一致による検出に、master 由来の判定を **OR で足す**。`brosData` は消さず手動オーバーライドとして残す（設計 §6.6）。

`brosData` の 72 ペア（延べ）を `json/pedigreeNodes.json` と突き合わせると、**master で裏が取れないのは 4 ペア**だけだった（設計 §6.6 は 10 件と書いているが旧データセットの値）。

```text
ハーランズホリデー × Harlan's Holiday   ← 同一馬のカナ/英字表記ゆれ。兄妹ではない
ダイワメジャー     × ウィルロック
Bull Lea          × Dogpatch
フジキセキ         × ハツコイケール
```

1 件目は明らかに同じ馬の表記ゆれで、兄妹データとしては誤りである。ただし**これは現行実装でも同じ扱いなので、この段階では直さない**（実機確認が要る。設計 §14 の未決事項1）。完了報告の「残課題・気づき」にだけ書くこと。

```js
const parentsOf = (horse) => {
  if (!nodeTable || typeof horse?.nodeId !== "string") {
    return null;
  }
  return nodeTable.parentsOf(horse.nodeId);
};

// node_id が違い、かつ父母の pedigree_id が両方一致するなら全兄妹。
const isFullSiblingByMaster = (a, b) => {
  if (typeof a?.nodeId !== "string" || typeof b?.nodeId !== "string") {
    return false;
  }
  if (a.nodeId === b.nodeId) {
    return false;                 // 同一ノードは「同一馬」であって全兄妹ではない
  }
  const pa = parentsOf(a);
  const pb = parentsOf(b);
  if (!pa || !pb) {
    return false;
  }
  if (!pa.father || !pa.mother || !pb.father || !pb.mother) {
    return false;                 // 片親でも欠けていれば全兄妹と断定しない
  }
  return pa.father === pb.father && pa.mother === pb.mother;
};
```

**父母どちらかが `null` のときに全兄妹と判定してはならない。** master には父母が揃わない pedigree が 2841 件（14780 件中）ある。`null === null` を真にすると、父母不明の馬同士が全部「全兄妹」になって判定が崩壊する。

#### variant 違いは全兄妹になる（仕様どおり）

シンザン通常版（`0000008661-00`）とシンザン神速（`0000008661-10`）は、`node_id` が違い父母 `pedigree_id` が同一なので、この規則で**全兄妹**になる。同じ実馬なのに違和感があるが、ゲームの `PedigreeTreeNode::isSibling()` の挙動と一致する（設計 §7.1）。意図した結果なので直さないこと。

#### 判定順序は現行を維持する

現行は「全兄妹（`fullBrothers`）→ 名前一致」の順に候補を作り、`siblingPairs` で重複を防いでいる。**この順序と重複防止をそのまま保つこと。** master 由来の全兄妹判定は `fullBrothers` 判定と同じループの中で OR に足す。

```js
let isSibling = false;
if (Array.isArray(stallion.fullBrothers) && stallion.fullBrothers.includes(broodmare.name)) isSibling = true;
if (Array.isArray(broodmare.fullBrothers) && broodmare.fullBrothers.includes(stallion.name)) isSibling = true;
if (isFullSiblingByMaster(stallion, broodmare)) isSibling = true;   // 追加
```

### 4. クロス血量と危険な配合

仕様書 §12 / §13 に沿って計算する。**画面には出さない。** 戻り値に載せるだけ。

```js
// 1/1000% 単位の整数。浮動小数だと 3.125 の加算で 50.000 の境界判定がぶれる。
const BLOOD_VOLUME = { 1: 50000, 2: 25000, 3: 12500, 4: 6250, 5: 3125 };
```

- 世代は既存の `generationMap`（index → 1〜5）をそのまま使う。
- 同一クロスグループの**全出現位置**を加算する。同じ馬が 3 代と 5 代に出るなら両方足す。
- 危険な配合 = **どれか 1 グループの血量が 50000 以上**。異なるクロス馬の血量を合算しない（仕様書 §13）。
- 表示するときだけ 1000 で割る。この段階では表示しない。

検算に使える値（仕様書 §12.1）:

| 形 | 血量 |
|---|---:|
| 3×4 | 18750 |
| 3×5 | 15625 |
| 3×4×5 | 21875 |
| 3×4×5×5 | 25000 |
| 3×4×4×5 | 28125 |
| 2×2 | 50000（危険） |

### 5. 戻り値の追加

**既存キーは 1 つも削らず、値の意味も変えない。** 表示側（`inbreed-ui.js` / `pedigree-cells.js` / `inbreed-counts.js`）が依存している。

```js
return {
  count,                          // 現行のまま（式は段階4 で変える）
  sameNameGroups,                 // 現行のまま
  siblingGroups,                  // 現行のまま
  sameNameSpecialChecks,          // 現行のまま
  sameNameSpecialChecksByIndex,   // 現行のまま
  inbreedColorIndexes,            // 現行のまま
  crosses,                        // 追加
  dangerous,                      // 追加（boolean）
};
```

`crosses` の 1 要素:

```js
{
  representativeNodeId,   // グループ代表の nodeId。全員 null なら名前でよい
  occurrences: [          // 同一グループの全出現
    { nodeId, side, generation, index }   // side は "stallion" / "broodmare"
  ],
  bloodVolume,            // 整数（1/1000%）
  generations,            // [3, 4] のような世代の配列。重複を潰さない
  hasMareOccurrence,      // 段階3 では常に false。段階4 で使う
}
```

`crosses` は**同一馬クロスと全兄妹クロスを 1 グループにまとめる**（設計 §7.1 の手順4）。既存の `sameNameGroups` / `siblingGroups` は表示用に別建てのまま残すこと。両者を統合しようとしないこと。

### 6. `nodeTable` が無いときの挙動

`nodeTable` が `null` のとき、**戻り値は現行と完全に一致すること**（`crosses` と `dangerous` は追加されるが、`crosses` は名前ベースで組んだ結果でよい）。段階2 の縮退（`pedigreeNodes.json` の 404）でアプリが従来どおり動く必要がある。

## 制約

- `AGENTS.md` の Safety Rules に従うこと。ただしこの段階で `index.html` を触る必要は無いはず。
- **`vue/logic/inbreed/inbreed-counts.js` を変更しない**（因子カウントの `nodeId` 化は段階5）。
- **`vue/logic/theory/compatibility.js` を変更しない**（配合理論は段階6）。
- **表示行を 32 から増やさない。**
- **既存の戻り値キーを削らない・意味を変えない。**
- `pedigreeId` を同一馬判定に使わない。`nodeId` を数値化しない。`nodeId` から `pedigreeId` を切り出さない。
- 例外ルール（`json/inbreed-exceptions.json`）の形式・読み込み・適用箇所を変更しない。名前ベースのまま後段で適用する（設計 §7.1「例外ルールとの関係」）。
- `json/brosData.json` を削除しない。手動オーバーライドとして残す。
- 900 行の既存ファイルを全面書き換えしないこと。**判定の継ぎ目だけを差し替える**。グループ化・例外処理・`sameNameSpecialChecks` の既存フローはそのまま使う。全面書き換えは差分が読めなくなり、検収で挙動差を切り分けられない。

## スコープ外（やらないこと）

- 牝馬15枠の投入（段階4）
- 同一家系枝の重複除外／仕様書 §11（段階4。理由は §背景）
- `count` の式変更（段階4）
- 因子カウントの `nodeId` 化（段階5）
- 配合理論の変更（段階6）、至高の条件追加（段階7）
- 血量・危険な配合の UI 表示（設計 §14 の未決事項2）
- `brosData.json` の 10 ペアが実機で本当に全兄妹かの確認（設計 §14 の未決事項1）
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

1. `node scripts/verify-storage-boot-order.cjs` / `verify-horse-badges.cjs` / `verify-horse-candidate-lists.cjs` がすべて成功する。
2. `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html` が `[verify] OK` を返す。
3. `python -m pytest tests/ -q` が全件成功する（Python 側は無変更）。
4. **`judgeInbreed(selected, exceptions)` を 2 引数で呼んだとき、戻り値の既存 6 キーが現行実装と完全一致する。** 判定対象の盤面を 3 つ以上用意して確認すること。
5. `nodeTable` を渡したとき、次が成立する（検証スクリプトで確認）。
   - シンザン通常版（`0000008661-00`）とシンザン神速（`0000008661-10`）を左右に置くと **全兄妹クロスが成立**する（`node_id` 相違・父母一致）。
   - 同じ `nodeId` を左右に置くと **同一馬クロス**になり、全兄妹にはならない。
   - 父母のどちらかが `null` の pedigree 同士は全兄妹にならない。
6. 血量の検算: 3×4 が 18750、3×4×5 が 21875、2×2 が 50000 かつ `dangerous === true`、28125 と 25000 の同時成立で `dangerous === false`（設計 §12.2 の TC-008 / TC-009）。
7. `nodeTable` に `null` を渡したときの既存 6 キーが、基準4 の 2 引数呼び出しと一致する。
8. **`tests/fixtures/split-baseline/*.json` の差分は、全兄妹検出の増加によるものだけである。** 差分が出た場合、**1 件ずつ「どの馬とどの馬が新たに全兄妹と判定されたか」を完了報告に列挙してから**ベースラインを更新すること。説明できない差分が 1 件でもあれば更新してはいけない。
9. `git status` で変更されているのが §「変更対象ファイル」の 2 ファイル（＋意図的に更新したベースライン）だけである。

基準 4〜7 は確認用の一時 `.cjs` を書いて `node` で検証してよい（コミットには含めず、完了報告に内容を残すこと）。ブラウザ確認が要る場合は `scripts/codex-powershell.ps1 screenshot` / `dump-dom` を使う。

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

### ベースライン差分の内訳（基準8）

<split-baseline に差分が出た場合、1 件ずつ「どの馬とどの馬が新たに全兄妹になったか」を列挙する。差分が無ければ「差分なし」>

### 残課題・気づき

<スコープ外だが気づいた問題、やり残し。なければ「なし」>
