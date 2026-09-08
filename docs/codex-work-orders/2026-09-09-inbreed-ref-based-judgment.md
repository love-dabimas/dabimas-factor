# 作業指示書: 積み上げた自家製馬をクロス判定の対象にする（全兄妹対応フェーズ2b）

- status: 依頼中
- 作成日: 2026-09-09
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 上位仕様: `docs/full-sibling-stacking-spec.md` v1.1（§5・§5.1・§4.2）
- 前提: フェーズ1（実装 c0f5b7d／検収 86b73d3）とフェーズ2a（実装 dffcf20／検収 b85ab73）が完了・検収済み
- **稼働影響あり:** 自家製馬・エディット種牡馬を含む血統表でクロス・血量・危険な配合が変わる。マスタ馬だけの血統表は変わらない（1000組で確認済み・後述）

## 背景と目的

保存した自家製馬（`☆` で始まる馬）が、クロス判定から丸ごと除外されている。積み上げた配合では次のことが起きる。

**例1: ルドルフのクロスが出ない**

スイートルナ × パーソロン1971 の娘を保存し、その娘にトウカイテイオーを掛ける。
テイオーの父はシンボリルドルフで、ルドルフの父母はパーソロン×スイートルナ。
つまり保存した娘とルドルフは全兄妹だが、**いまルドルフのセルには何も出ない**。

**例2: 同じ自家製馬を重ねても危険にならない**

自家製の種牡馬を娘に付け戻す極端な近親配合でも、**いまは何も検出されない**。

**例3: ドゥラメンテが不成立なのは偶然**

エアグルーヴ×サンデーの娘A、A×キンカメの娘B、B×ドゥラメンテ。
Aはアドマイヤグルーヴと父母が同じだが別個体なので、Bとドゥラメンテは全兄妹ではない。
**いまは自家製が除外されているだけで、判定した結果ではない。**

**例4: エディット種牡馬は馬名一致で判定されている**

エディット種牡馬がベース馬とクロスするのは、`nodeId` が無くて**馬名フォールバックに落ちている**からである。
`★1薄めダンスインザダーク` のような自動生成名が左右に揃えば、別個体どうしが誤ってクロスし得る。

フェーズ2aで個体参照（ref）と統合 resolver は判定関数まで届いている。本フェーズはそれを**実際に使う**。

## 実装方針

変更は `vue/logic/inbreed/inbreed-detector.js` の **nodeTable 経路だけ**。6点。

### 1. ref ベースの関係関数を足す

`cellRef` の定義の直後に置く。

```javascript
const sameCrossHorseRef = (a, b) => !!resolver && resolver.sameCrossHorse(a, b);
const isFullSiblingRef = (a, b) => {
  if (!resolver || sameCrossHorseRef(a, b)) return false;
  const pa = resolver.parentsOf(a);
  const pb = resolver.parentsOf(b);
  if (!pa || !pb) return false;
  return resolver.sameKnownParent(pa.father, pb.father)
    && resolver.sameKnownParent(pa.mother, pb.mother);
};
const isRefCrossRelated = (a, b) =>
  sameCrossHorseRef(a?.ref, b?.ref) || isFullSiblingRef(a?.ref, b?.ref);
```

- **同一馬なら全兄妹にしない。** 同一 pedigreeId（年号版と因名版など）は「同一馬」側で成立させる。
  片方だけ入れると既存の variant クロスが消える（仕様書 v1.1 §5.1）
- `sameKnownParent` は未知キー同士を false にする。resolver 側で実装済み

### 2. 群の関係を ref ベースへ差し替える

```javascript
const isMasterCrossRelated = (a, b) => isRefCrossRelated(a, b);
```

`isExactSameNode` / `isFullSiblingByMaster` / `isFullSiblingByMasterNodeIds` の**定義は残す**。
nodeTable 不在の縮退経路と legacy 経路がまだ使っている。**これで馬名フォールバックが判定から消える。**

### 3. `buildSideOccurrences` から `★☆` 除外を外す

2箇所（ルートセルと `SIRE_PATHS` ループ）の `isInbreedExcludedHorse` 呼び出しを削除する。

**`isInbreedExcludedHorse` の定義と、`stallionsArray` / `broodmaresArray` を作る分割ループでの使用は残すこと。**
そちらは legacy 経路（`recognizedCrosses` / `legacyCount`）へ流れるので、変えると因子計算の起動条件まで動く。

### 4. 早期 return の条件を直す

```javascript
if (stallionsArray.length === 0 || broodmaresArray.length === 0) { return { ... }; }
```

この2つの配列は `★☆` を除外して作られるため、**片側が自家製馬だけの盤面が「空」と判定され、
nodeTable 経路ごと打ち切られる**。実測で、自家製馬だけを左右に置いた盤面はクロス0件になる。

判定の有無は `★☆` 除外前のセルの有無で決めること。例えば
`selected.slice(0,16).some(c => c?.name)` と `selected.slice(16).some(c => c?.name)` を使う。
legacy 用の2配列はそのまま作ってよい（空のまま legacy 経路へ渡る）。

### 5. 枝の親を ref で持つ

`buildSideOccurrences` の末尾で `branchParentNodeId` と併せて `branchParentRef` を持たせ、
`isSameBranch` を ref ベースにする。

```javascript
occurrences.forEach((occurrence) => {
  const parent = occurrence.path ? byPath.get(occurrence.path.slice(0, -1)) : null;
  occurrence.branchParentNodeId = parent?.nodeId ?? null;
  occurrence.branchParentRef = parent?.ref ?? null;
});

const isSameBranch = (a, b) => {
  const parentA = a?.branchParentRef;
  const parentB = b?.branchParentRef;
  if (!parentA || !parentB) return false;
  return sameCrossHorseRef(parentA, parentB) || isFullSiblingRef(parentA, parentB);
};
```

`branchParentNodeId` は戻り値に残す（既存の消費側があるため）。

### 6. 牝馬15枠の門を広げる

`buildMareOccurrences` は `if (typeof nodeId !== "string") return;` で出現を捨てるため、
**nodeId を持たない自家製牝馬は ref があっても判定へ届かない**（フェーズ2aの検収で実測済み）。

`ref` が解決できるなら出現を作るように変える。

```javascript
const explicitRef = explicitMareRefsByPath.get(path);
const ref = explicitRef ?? (typeof nodeId === "string" ? { kind: "master", nodeId } : null);
if (!ref) return;
occurrences.push({
  // 明示配置が master 以外なら nodeId は名乗らせない（派生した別馬の nodeId を持たせない）
  nodeId: explicitRef && explicitRef.kind !== "master"
    ? null
    : (typeof nodeId === "string" ? nodeId : null),
  ...
  ref,
  sexKind: "female",
});
```

### 変更対象ファイル

- `vue/logic/inbreed/inbreed-detector.js` — 上記6点
- `service-worker.js` — `CACHE_NAME` の bump

## 制約

- `AGENTS.md` に従うこと。
- **変更は nodeTable 経路だけ。** legacy 経路（`recognizedCrosses`、`broodmareGroups`、
  `legacyInbreedColorIndexes`、`legacyCount`）と、nodeTable 不在時の縮退経路を変えないこと。
- `judgeInbreed` の引数と戻り値のキーを増減しないこと。
- `selfAncestorWarning` の対象・判定を変えないこと（仕様書 v1.1 §7）。
- 至高（`evaluateSupremeCross`）の式を変えないこと。全兄妹・自家製が群へ混ざって不成立になるのは
  意図した挙動である（同 §7）。
- `resolver` が `null` のときは従来どおり動くこと（`sameCrossHorseRef` が false を返すので、
  クロスが1件も出なくなる。この縮退は許容する）。

## スコープ外（やらないこと）

- **牝馬側の表示抑制、`sameNameGroups` / `siblingGroups` の分類修正。** フェーズ2c。
  本フェーズでは牝馬本人のセルが着色されたままになる（受け入れ基準に織り込み済み）。
- **工程診断の一時 registry、共有の再帰収集。** フェーズ2c。
- `vue/logic/inbreed/inbreed-counts.js`、`vue/logic/theory/*.js`、`vue/logic/pedigree/*.js`、
  保存・読み込み経路。フェーズ2aで完了している。
- 旧保存レコードのマイグレーション。`fatherRef` が無い記録は父母未解決のままでよい。
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

すべて依頼側の試作で実測した値である。**この数値が出なければ実装が違う。**

検証は Node から `judgeInbreed(selected, [], nodeTable, resolver)` を直接呼んで行う。
自家製馬は「保存レコードから復元したセル」を模して次の形で作る。

```javascript
{ name: "☆X", subName: "", nodeId: null, pedigreeId: null, index,
  sex, source: "custom", customHorseId: "ch_X",
  identityRef: { kind: "custom", id: "ch_X" },
  factors: ["", "", ""], mareNodeIds: new Array(15).fill(null) }
```

resolver は `buildIdentityResolver({ nodeTable, customRecordsById, editRecordsById, baseHorseNodeIdById })`
に父母 ref を持つ擬似レコードを渡して作る。

### 1. マスタ馬だけの盤面は変わらない

固定 seed で実データから種牡馬×繁殖牝馬 **1000組以上**を生成し、フェーズ2a（HEAD）と比較する。
`count` / `inbreedColorIndexes` / `dangerous` / `crosses.length` / `bloodVolume` /
`selfAncestorWarningIndexes` / `sameNameSpecialChecks` が**差分0件**であること。

依頼側は seed `0x20260909` の1000組で 1000/1000 一致を確認している。

### 2. ケース2（B01・B03）

父側ルート＝トウカイテイオー。母側ルート＝自家製娘A（`ch_A`）。母側 cell17 以下＝パーソロン1971。
A の `mareNodeIds[0]` に スイートルナ `0000050973-00`。

| A の父ref | 期待 |
|---|---|
| `master 0000333257-01`（1971） | `inbreedColorIndexes=[1,16]` / crosses 1件 / 代表=シンボリルドルフ / 血量75000 / occurrences `[[1,"F"],[16,""]]` / `dangerous=true` |
| `master 0000333257-10`（覇煌） | ルドルフのクロスが**出ない**。`inbreedColorIndexes=[2,17]` / crosses 2件（パーソロン 血量37500、スイートルナ 血量37500）/ `dangerous=false` |

cell16 が着色されるのは想定どおり（牝馬側の非表示はフェーズ2c）。

### 3. ケース3（C01・C02）

父側ルート＝ドゥラメンテ。母側ルート＝自家製娘B（`ch_B`、父ref＝キングカメハメハ `0000729458-00`）。
母側 cell17 以下＝キングカメハメハ。

| B の母ref | 期待 |
|---|---|
| `custom ch_A` | ドゥラメンテの全兄妹**不成立**。`inbreedColorIndexes=[1,17]` / crosses 1件（キングカメハメハ 血量50000）/ `dangerous=true` |
| `master 0000713851-00`（アドマイヤグルーヴ） | 全兄妹**成立**。`inbreedColorIndexes=[0,16]` / crosses 1件（ドゥラメンテ 血量100000）/ `dangerous=true` |

C01 でキンカメのクロスが残るのが正しい（仕様書「別祖先で生じるクロスまで一括で消さない」）。
C02 でキンカメのクロスが消えるのも正しい（本馬どうしが全兄妹なので同一家系枝として除外される）。

### 4. 血量（E01）

同一 custom `ch_X` を配置したときの**その群の**血量。

| 配置 | 血量 |
|---|---|
| cell0 と cell16（1代目×1代目） | 100000 |
| cell0 と cell17（1代目×2代目） | 75000 |
| cell4 と cell20（3代目×3代目） | 12500 |

`dangerous` は盤面全体で決まるので、**`ch_X` の群の `bloodVolume` で判定すること**。
3代目×3代目のケースでは `ch_X` の群が 50000 未満であることを確認する。

### 5. 自家製だけの盤面でも判定が走る（早期 return）

cell0 と cell16 に同一 custom を置き、他を空にした盤面で **crosses が1件（血量100000）** 出ること。
現行実装ではここが 0件になる。

### 6. 自家製牝馬を祖先セルへ置ける（A05）

父側ルート＝ディープインパクト。母側ルート＝エアグルーヴ。
母側 localIndex 3 へ、父ref＝サンデーサイレンス `0000333862-00`・母ref＝ウインドインハーヘア `0000430846-00`
の自家製牝馬（`ch_A`）を配置する。

- `inbreedColorIndexes` に `0` が含まれる（ディープインパクトのセル）
- crosses に 代表=ディープインパクト / 血量75000 / occurrences `[[0,""],[null,"M"]]` が出る
- 牝馬側の出現は `index=null` なので着色されない

### 7. エディット種牡馬（D08）

父側ルート＝ディープインパクト。母側 cell17 に、ベース＝ディープインパクト（`0000742976-00`）の
エディット種牡馬（`edit_1`）を置く。

- crosses に 代表=ディープインパクト / 血量75000 / occurrences `[[0,""],[17,"F"]]` が出る（**同一馬クロス**）
- 同じ resolver で `parentComparisonKey({kind:"edit",id:"edit_1"})` が `edit:edit_1` であること
  （ベース馬の `master-base:0000742976` と一致しない＝親としては別扱い）

### 8. 偽陽性が出ない（D07・F01）

- `★1薄めナントカ` という**同名**のセルを左右に1つずつ置いても、その2セルのクロスが出ないこと
- パーソロン1971（cell0）と パーソロン覇煌（cell17）を置くと、クロスが**出る**こと
  （代表=パーソロン、血量75000）。同一馬として成立し、全兄妹にはしない

### 9. 既存ガード

- `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html` が `[verify] OK`
- `python -m pytest tests/ -q` が 52 passed
- `node --check` が通る
- `git diff --check` が何も出さない、BOM なし・LF

### 10. 画面

`.claude/launch.json` の `static-verify`（ポート8767）で確認する。

- **確認前に ServiceWorker とキャッシュを消すこと。** 古い SW が残っていると前バージョンの JS が配信される
  （フェーズ2aの検収で実際に誤測定した）
- ポート8766 には別ディレクトリの古いコピーを配信するサーバが常駐しているので使わない
- マスタ馬だけの血統表でクロス着色と理論表示が従来どおり出ること
- コンソールに ServiceWorker 登録エラーが出るが、これは埋め込みブラウザの制約で本変更とは無関係
  （無改造の旧コピーでも再現する）

## 検証コマンド

```
node --check vue/logic/inbreed/inbreed-detector.js
node tmp/verify-p2b-regression.cjs     # 基準1
node tmp/verify-p2b-cases.cjs          # 基準2〜8
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html
python -m pytest tests/ -q
git diff --check
```

## 後続フェーズ（スコープ外・参考）

| フェーズ | 内容 |
|---|---|
| 2c | 牝馬側の表示抑制と `sameNameGroups` / `siblingGroups` の分類修正、工程診断の一時 registry、共有の再帰収集。受入は仕様書 v1.1 の A02・B02・D04〜D06・E02〜E04 |

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。

### 変更ファイル一覧

<変更した全ファイルと、それぞれ何をしたか>

### 設計判断

<指示書に書かれていなくて自分で判断したことがあれば、その内容と理由。なければ「なし」と書く>

### 実行した検証と結果

<検証コマンドごとの実行結果。受け入れ基準の番号と対応させる>

### 残課題・気づき

<スコープ外だが気づいた問題、やり残し。なければ「なし」>
