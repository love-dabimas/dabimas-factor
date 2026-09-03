# 作業指示書: 至高の配合を仕様書 §32 に合わせる（段階7・最終段階）

- status: 依頼中
- 作成日: 2026-09-03
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 設計資料: `docs/pedigree-master-integration-design.md` §7.2.3
- アルゴリズム仕様書: `dabimas_pedigree_editor_algorithm_spec.md` **§32**（§32.1〜§32.6）
- 前提: 段階6（`2026-09-03-theory-detect-and-display.md`）が完了・検収済み
- **稼働影響: 現行データでは表示が変わらない。** 理由は下記

## 背景と目的

至高の配合の判定は `vue/logic/inbreed/inbreed-detector.js` の `evaluateSameNameSpecialCheck()` にあり、仕様書 §32 の 6 条件のうち **2 つしか実装されていない**。

```js
const evaluateSameNameSpecialCheck = (group) => {
  const coveredGroups = new Set(group.map(item => indexGroupAssignments[item.index]));
  const coverageOk = coveredGroups.has(3) && coveredGroups.has(4) && coveredGroups.has(5);
  if (!coverageOk) return false;
  const factorSet = new Set();
  group.forEach(item => (item.factors || []).forEach(f => { if ((f??"").trim()) factorSet.add(f.trim()); }));
  return factorSet.size >= 6;
};
```

不足しているのは §32.1（候補の再収集）・§32.3（基準馬制限）・§32.4（同一グループ制限）・§32.6（血統全体の因子 30 以上）である。

### 現行実装は候補群が仕様と違う

**仕様書 §32.1 は「通常クロスの基準馬に対して、完全同一 OR 全兄妹となる全出現を両血統から再収集する」と定めている。** 現行実装が渡されているのは `sameNameGroupsFinalFiltered`、つまり**同一馬クロスだけ**の群である。

これが実害になっている。同一馬の出現は祖先セルでは代表 variant に揃うので**因子が全部同じ**になり、条件 §32.5（因子 6 種類以上）が構造的に満たせない。実測すると `sameNameGroups` の因子種類数は**最大 3 種類**だった。

段階3〜4b で作った `crosses` が、まさに §32.1 の「同一馬 + 全兄妹を 1 群にまとめ、両血統の全出現を集めたもの」である。**至高の候補群は `crosses` から取る。**

### 実測（現行データ・50000 組サンプル）

| 条件 | 満たす件数 |
|---|---|
| 至高が成立した盤面（現行実装） | **0 / 50000** |
| a: 世代集合が {3,4,5} を含む（`crosses` 群） | 544 群 |
| b: 因子 6 種類以上（`crosses` 群） | **0 群** |
| a と b の両方 | **0 群** |
| e: 血統全体の因子延べ数 >= 30 | 21245 / 50000 盤面（42.5%） |

`crosses` 群の因子種類数の分布:

```text
0種 3928 / 1種 19520 / 2種 16278 / 3種 281 / 4種 132 / 5種 31 / 6種以上 0
```

**候補群を仕様どおり `crosses` にしても、6 種類には届かない（最大 5 種類）。** したがって **本作業を入れても現行データでは至高は 1 件も成立せず、画面表示は変わらない。**

これは想定内である。至高は「複数 variant が両血統に現れ、それぞれ別の因子を持つ」という非常に狭い条件で、`3種 281 → 4種 132 → 5種 31 → 6種 0` という減り方から見て、データが増えたときに初めて踏む領域である。**本作業は「データが変わったときに正しく判定できるようにする」ための仕様準拠であり、いまの見た目を変えるものではない。**

### 検証は合成盤面で行う

実データで成立しない以上、**条件 a〜e は合成盤面（手で組んだ `selected` と `crosses`）でしか確認できない。** 受け入れ基準もそう組んである。実データに対しては「**表示が 1 件も変わらないこと**」だけを見る。

## 実装方針

### 変更対象ファイル

- `vue/logic/inbreed/inbreed-detector.js` のみ

### 1. 候補群を `crosses` から取る（§32.1）

`evaluateSameNameSpecialCheck()` の入力を `sameNameGroupsFinalFiltered` から `crosses` へ変える。1 群ごとに §32.2〜§32.5 を判定し、1 つでも成立したら §32.6 を見る。

**`sameNameGroups` / `siblingGroups` / `inbreedColorIndexes` の作り方は変えない。** 至高の判定だけが `crosses` を見るようになる。

### 2. 条件 a: 世代集合（§32.2）

`crosses[].generations` に **3・4・5 がすべて含まれる**こと。**完全一致ではない。**

```text
3×4×5     ○      3×3×4×4  ×
3×4×5×5   ○      4×4×5×5  ×
3×4×4×5   ○
3×3×4×5   ○
```

現行の `indexGroupAssignments[item.index]` を使う実装は、**牝馬枠の出現（`index === null`）を落としてしまう**。`crosses[].generations` は牝馬枠の世代も含むので、そちらを使うこと。

### 3. 条件 b: 因子 6 種類以上（§32.5）

候補群に含まれる**各ノードの `pedigree_effect_ids` を集合へ統合**し、種類数が 6 以上であること。

```js
const effectIds = new Set();
cross.occurrences.forEach((o) => {
  const node = nodeTable && typeof o.nodeId === "string" ? nodeTable.getNode(o.nodeId) : null;
  (node?.effects || []).forEach((id) => effectIds.add(id));
});
if (effectIds.size < 6) return false;
```

**回数ではなく種類**である（§32.5）。`nodeTable` が無いときは現行どおりセルの `factors` の種類数へ縮退してよい。

### 4. 条件 c: 基準馬の制限（§32.3）

**基準ノードが牝馬・UserPedigree なら至高にしない。** 原則として牡馬の master 由来ノードが基準。

この盤面モデルでは次のとおり判定する。

- **牝馬枠の出現（`index === null`）は基準馬にできない。** 表示行を持つ出現だけが候補。
- **`nodeId` が `null` のセルは基準馬にできない**（自家製馬・エディット種牡馬 = UserPedigree 相当）。
- 男系セル（`index !== null` かつ `nodeId` が文字列）は牡馬なので、この 2 つを満たせば c は成立する。
- 特殊牝馬側のルートセル（index 16）は牝馬なので基準馬から除く。

**牝馬枠や自家製馬が候補（クロス相手）に含まれること自体は許される。** 基準馬になれないだけである。

### 5. 条件 d: 同一グループ制限（§32.4）

候補群の中で、基準馬**以外**のノードは「基準馬と完全同一（`nodeId` 一致）」または「同じ奇跡グループ」でなければならない。

**`kiseki_group_id` は使わず、`pedigreeId` の一致で判定する。** 段階6 で確定したとおり、パイプライン修正後の奇跡グループ 475 個は**すべて 1 pedigree しか含まない**ため、「同じ奇跡グループ」と「同じ `pedigreeId`」は同じ意味になる。`inbreed-detector.js` は `nodeTable.getNode(nodeId).pedigreeId` で引けるので、新しい依存も要らない。

```js
// 基準馬と別ノードの関係は「完全同一」か「同じ実馬（＝同じ奇跡グループ）」に限る。
// 全兄妹は §32.1 で候補へ集めるが、この条件で落ちる。
const basePedigree = pedigreeIdOf(baseNodeId);
const allSameHorse = others.every(
  (nodeId) => nodeId === baseNodeId || (basePedigree && pedigreeIdOf(nodeId) === basePedigree)
);
```

つまり **全兄妹だけで構成された群は至高にならない**。これが d の実質的な内容である。

### 6. 条件 e: 血統全体の因子延べ数（§32.6）

候補が 1 つでも成立したあと、**血統全体**の因子延べ数を数え、30 以上であること。

```text
種牡馬側の表示祖先（index 1〜15）の因子延べ数
+ 種牡馬自身（index 0）の因子数
+ 特殊牝馬側の表示祖先（index 17〜31）の因子延べ数
>= 30
```

**特殊牝馬ルート（index 16）自身の因子は加算しない。** これは仕様書 §32.6 が明記している**非対称実装**で、意図的にゲームの挙動へ合わせるものである。直したくなるが直さないこと。

**種類数ではなく延べ数**である（`b` は種類数なので取り違えないこと）。因子は全書由来のセル `factors` を使う（段階5 で `effects` と一致することを確認済み）。

実測では 50000 盤面中 21245 件（42.5%）がこの条件を満たす。**単独では緩い条件**なので、これだけで至高が増えることはない。

### 7. 戻り値の形は変えない

`sameNameSpecialChecks`（index の配列）と `sameNameSpecialChecksByIndex`（32 要素の boolean）の形は現行のまま。`compatibility.js` は `sameNameSpecialChecks.length > 0` しか見ない（段階6 で確認済み）。

**牝馬枠の出現は `sameNameSpecialChecks` に入れない。** 表示行を持たないため、`inbreed-ui.js` のボタン処理が壊れる（段階4 で確定した方針）。

## 制約

- `AGENTS.md` の Safety Rules に従うこと。この段階で `index.html` を触る必要は無いはず。
- **`sameNameGroups` / `siblingGroups` / `inbreedColorIndexes` / `count` / `crosses` / `dangerous` を変えない。** 変わってよいのは `sameNameSpecialChecks` と `sameNameSpecialChecksByIndex` だけ。
- **`vue/logic/theory/compatibility.js` を変更しない**（段階6 で確定済み）。
- **`vue/logic/inbreed/inbreed-counts.js` を変更しない**（段階5 で確定済み）。
- `kiseki_group_id` を参照しない（§5 の理由により `pedigreeId` を使う）。
- §32.6 の非対称実装（特殊牝馬ルートを足さない）を「バグ」と判断して直さない。
- `nodeTable` が無いときは現行と同じ結果を返すこと。
- 表示行を 32 から増やさない。

## スコープ外（やらないこと）

- `getCrossCommentType()` / クロスコメント種別（Word マスター未入手・設計 §14）
- 利根川系ほか期間限定理論
- 危険な配合の表示順の変更。**仕様書 §35 は「通常理論が先に選ばれる」と書いているが、設計資料 §7.2.4 が実機確認のうえ「危険が最優先」と訂正しており、段階6 でそちらを実装済み。** 本作業で蒸し返さない
- 血量の数値表示
- 例外ルールの整理
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

1. `node scripts/verify-storage-boot-order.cjs` / `verify-horse-badges.cjs` / `verify-horse-candidate-lists.cjs` がすべて成功する。
2. `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html` が `[verify] OK` を返す。
3. `python -m pytest tests/ -q` が全件成功する。
4. **実データで表示が 1 件も変わらない。** 20000 組以上を取り、段階6（`29ce26e` 以降の HEAD）と本実装で `sameNameSpecialChecks` / `styleThoeryClass` 相当が一致すること。**固定点のコードを読み込んで実装どうしを比較すること**（近似で比べない）。seed・PRNG・比較方法を完了報告に記載する。
5. **`sameNameGroups` / `siblingGroups` / `inbreedColorIndexes` / `count` / `crosses` / `dangerous` が段階6 と完全一致する。** 同じ 20000 組で確認。
6. **条件 a（§32.2）を合成盤面で確認する。** 世代の組み合わせごとに期待どおりになること。

   | 形 | 期待 |
   |---|---|
   | 3×4×5 / 3×4×5×5 / 3×4×4×5 / 3×3×4×5 | 成立 |
   | 3×3×4×4 / 4×4×5×5 | 不成立 |

7. **条件 b（§32.5）を合成盤面で確認する。** ノードの `effects` の和集合が 5 種類なら不成立、6 種類なら成立。**回数ではなく種類**であることを、同じ因子を何度も持つケースで確認する。
8. **条件 c（§32.3）を合成盤面で確認する。**
   - 基準馬が牝馬枠（`index === null`）→ **不成立**
   - 基準馬の `nodeId` が `null`（自家製馬）→ **不成立**
   - 基準馬が特殊牝馬ルート（index 16）→ **不成立**
   - 基準馬が男系セルで `nodeId` あり → 他条件を満たせば成立
9. **条件 d（§32.4）を合成盤面で確認する。**
   - 群のノードがすべて同じ `pedigreeId`（variant 違いを含む）→ 成立
   - 群に別 `pedigreeId` のノード（＝全兄妹）が混ざる → **不成立**
10. **条件 e（§32.6）を合成盤面で確認する。**
    - 延べ 29 → 不成立、延べ 30 → 成立
    - **特殊牝馬ルート（index 16）の因子を増やしても合計が変わらない**こと（非対称実装の確認）。**この確認を完了報告に必ず載せること。**
11. **至高が成立する合成盤面を 1 つ作り、`styleThoeryClass` が `"theory_07"` になること**を確認する。a〜e をすべて満たす盤面である。
12. `nodeTable` を渡さない呼び出しで、戻り値が段階6 と完全一致する。
13. `git status` で変更されているのが `vue/logic/inbreed/inbreed-detector.js` だけである。

基準 4〜12 は確認用の一時 `.cjs` を書いて `node` で検証してよい（コミットには含めず、完了報告に内容を残すこと）。

## 検証コマンド

```bash
node scripts/verify-storage-boot-order.cjs
node scripts/verify-horse-badges.cjs
node scripts/verify-horse-candidate-lists.cjs
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html
python -m pytest tests/ -q

git status --short
```

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。status は「依頼中」のまま変えないこと（完了への遷移は検収側が行う）。

### 変更ファイル一覧

- `vue/logic/inbreed/inbreed-detector.js`: 至高候補を `crosses` から評価し、世代包含、master牡馬の基準馬、同一 `pedigreeId`、node effects 6種類、血統全体30因子の全条件を実装した。nodeTableなしの旧判定と戻り値形は維持した。
- `docs/codex-work-orders/2026-09-03-theory-supreme.md`: 本完了報告を追記した。

### 設計判断

`cross.representativeNodeId` と一致する最初の occurrence を基準馬として扱った。群内の任意の男系セルを基準にすると、代表が牝馬枠・自家製馬・特殊牝馬ルートであるケースを別の occurrence によって通してしまうためである。基準馬以外の occurrence は、指示どおり同一nodeまたは同一 `pedigreeId` の場合だけ許可した。

### 実行した検証と結果

- 基準1: `verify-storage-boot-order.cjs`、`verify-horse-badges.cjs`、`verify-horse-candidate-lists.cjs` はすべて終了コード0、`OK`。
- 基準2: `verify-index-exp .\index.html` は `[verify] OK`。
- 基準3: `python -m pytest tests/ -q` は **52 passed**。
- 基準4・5: 固定点との実データ30,000組比較は全項目不一致0件。詳細は次節。
- 基準6〜11: `tmp/verify-theory-supreme.cjs` の合成盤面テストはすべて成功。詳細は後述。
- 基準12: nodeTableなしで段階6の `judgeInbreed()` と戻り値全体が一致した。
- 基準13: 製品コードの変更は指定された `inbreed-detector.js` のみで、これに本完了報告だけを加えた。pytest が生成・更新した `scripts/__pycache__` は検証後に除去・復元した。
- 追加確認: `node --check vue/logic/inbreed/inbreed-detector.js`、`git diff --check` は成功した。

### 実データでの不変確認（基準4・5）

母集団は summary/detail の種牡馬2,415頭×特殊牝馬499頭。xorshift32（seed `0x51EED`）の符号なし32bit出力を各母集団サイズで剰余し、重複を許して30,000組を抽出した。実装の `setDataForPedigree()` で32セル盤面を作り、例外ルールと実 `pedigreeNodes.json` のnodeTableを渡した。

比較対象は固定点 `29ce26e` から `git show` で直接ロードした段階6の `judgeInbreed()` と実装後の同 API であり、近似ロジックは使っていない。

```text
至高成立盤面: 旧 0 / 30000、 新 0 / 30000
sameNameSpecialChecks の不一致: 0
styleThoeryClass 相当の不一致: 0
sameNameGroups の不一致: 0
siblingGroups の不一致: 0
inbreedColorIndexes の不一致: 0
count の不一致: 0
crosses の不一致: 0
dangerous の不一致: 0
```

### 条件 a〜e の合成盤面テスト（基準6〜10）

- a（世代包含）: `3×4×5`、`3×4×5×5`、`3×4×4×5`、`3×3×4×5` は成立し、`3×3×4×4` と `4×4×5×5` は不成立だった。完全一致ではなく `{3,4,5}` の包含であることを確認した。
- b（因子種類）: effectsを `[1,1,2] + [2,3,3] + [4,5,5]` とした和集合5種類は不成立、`[1,1,2] + [2,3,4] + [4,5,6]` の6種類は成立した。同一effectsの反復を回数として数えていない。
- c（基準馬）: 代表occurrenceが牝馬枠、`nodeId:null` の自家製馬、特殊牝馬ルートindex 16の各盤面は不成立。男系セルindex 2・nodeIdありを代表にした盤面は成立した。
- d（同一グループ）: nodeIdが異なっても全occurrenceが `pedigreeId:"same"` なら成立し、同じ父母を持つ全兄妹として収集された1ノードだけを `pedigreeId:"sibling"` にすると不成立だった。
- e（血統全体の因子延べ数）: index 0〜15と17〜31の合計29は不成立、30は成立した。合計29のまま**特殊牝馬ルートindex 16へ20因子を追加しても不成立**であり、§32.6の非対称実装を確認した。
- 出力形: 牝馬枠の `index:null` は `sameNameSpecialChecks` に入らず、`sameNameSpecialChecksByIndex` は従来どおり32要素booleanのままである。

### 至高が成立する合成盤面（基準11）

同じ `pedigreeId:"same-horse"` を持つvariant 3ノードをindex 2・5・25へ置いた。世代は `3×4×5`、node effectsの和集合は `{1,2,3,4,5,6}`、基準馬はindex 2のmaster由来男系ノード、別ノードはすべて同一pedigree、血統全体の因子延べ数は30である。

`judgeInbreed()` は `sameNameSpecialChecks: [2,5,25]` を返し、その結果を `compatibility()` へ渡すと `styleThoeryClass` 相当は **`"theory_07"`** になった。

### 残課題・気づき

なし。
