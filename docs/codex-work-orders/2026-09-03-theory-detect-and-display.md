# 作業指示書: 配合理論の成立判定と表示判定を分離し、奇跡の照合を `nodeId` へ（段階6）

- status: 依頼中
- 作成日: 2026-09-03
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 設計資料: `docs/pedigree-master-integration-design.md` §7.2 / §7.2.2 / §7.2.4 / §7.2.5
- アルゴリズム仕様書: `dabimas_pedigree_editor_algorithm_spec.md` §33 / §35 / §40.8
- 前提: 段階5（`2026-09-03-inbreed-factor-count-node.md`）が完了・検収済み
- **稼働影響: なし。** 実データ 30000 盤面で表示が 1 件も変わらないことを検証済み

## 背景と目的

`vue/logic/theory/compatibility.js` は、理論の**成立判定**と**どれを画面に出すか**が `if / else` の入れ子に混ざっている。

```js
if (sameNameSpecialChecks.length > 0) return "theory_07";   // 至高は即 return
if (omoshiro_flag) {
  if (common_elms == 3) result = "theory_03";
  if (common_elms == 4) { /* 奇跡 / 超完璧 / 完璧 */ }
  if (common_elms < 3) result = "theory_01";
} else {
  if (common_elms == 3) result = "theory_03";
  if (common_elms == 4) result = "theory_02";   // 見事は「面白でないとき」しか出ない
}
```

このため **見事は「面白が成立していないとき」しか出ない**など、成立と表示が分けられない。仕様書 §33 / §35 に沿って次の 2 段へ分ける。

```js
detectMatchedTheories(S, D, context)          // → ["WONDERFUL","INTERESTING","PERFECT",...]
selectDisplayedTheory(matched, priorityTable) // → 1 件
```

あわせて、奇跡判定の照合を**馬名の文字列比較から `nodeId` 比較へ**移す（設計 §7.2.5）。

### この段階は挙動を変えない（検証済み）

**§7.2.4 のモデルを実装して現行 `compatibility()` と突き合わせたところ、実データ 30000 盤面で表示が 1 件も食い違わなかった。**

```text
サンプル 30000 組（xorshift32・seed 0x51EED）
  現行式と §7.2.4 モデルで表示が食い違う盤面: 0 / 30000

  現行の表示分布:
    (なし) 20693 / theory_01 面白 7874 / theory_03 よくでき 789
    theory_08 危険 587 / theory_02 見事 41 / theory_04 完璧 14
    theory_05 超完璧 2 / theory_06 奇跡 0 / theory_07 至高 0
```

**したがって本作業の受け入れ条件は「表示が 1 件も変わらないこと」である。** 1 件でも変われば実装ミス。

### 設計資料 §7.2 の表のうち、実際に変えるものは 1 つだけ

| 理論 | 設計資料の記述 | 検証結果 |
|---|---|---|
| 面白 | 変更なし | 変更なし |
| **見事** | 「変更する」 | **同値。変更不要**（下記） |
| ほどよい | 現行式を採用（§7.2.2 で確定） | 変更なし |
| **完璧** | 「変更する」 | **同値。変更不要** |
| **超完璧** | 「変更する」 | **同値。変更不要** |
| 奇跡 | 照合方法を変更 | **照合方法だけ変える**（挙動は不変） |
| 至高 | 条件 c/d/e を追加 | **段階7 の担当。この段階では触らない** |
| 危険 | priority 999 で最優先 | **実装済み**（`a132242`） |

**見事の式は数学的に同値である。** `|A| = |B| = 4` のとき、

```text
countCommonElements(A,B) === min(countA, countB)
min === 4  ⟺  countA === 4 かつ countB === 4
countA === 4 ⟺ A の全要素が B に出る ⟺ set(A) ⊆ set(B)
countB === 4 ⟺ set(B) ⊆ set(A)
両方      ⟺ set(A) === set(B)
```

5 記号 × 4 枠の総当たり 390,625 通りで確認したところ、どちらの式でも成立するのは 17,805 通りで、片方だけ成立は **0 件**だった。仕様書が付けている「かつ非空」の条件も、`parentLine` が空の馬が本人 0 / 2914・祖先セル 0 / 43710 で存在しないため効く場面が無い。

完璧（`見事 かつ 面白`）と超完璧（`見事 かつ unique==8`）も、見事が `common==4` と同値なので現行式と一致する。**これら 3 つは式を書き換えず、同値である旨をコメントに残すこと。**

## 実装方針

### 変更対象ファイル

- `vue/constants/breeding-theories.js` — **新規**。priority テーブル
- `index.html` — 上記の `<script>` を 1 行追加（**AGENTS.md の手順必須**）
- `vue/logic/theory/compatibility.js` — 成立/表示の分離と奇跡の照合
- `service-worker.js` — `urlsToCache` へ新規 JS を追加

### 1. `vue/constants/breeding-theories.js`（新規）

既存の `vue/constants/factor-definitions.js` / `parent-lines.js` と同じ IIFE + `window.Dabimas.constants.*` 登録の形にそろえる。

```js
window.Dabimas.constants.breedingTheories = {
  PRIORITY: Object.freeze({
    INTERESTING: 1,
    WELL: 2,
    WONDERFUL: 3,
    PERFECT: 500,
    SUPER_PERFECT: 600,
    MIRACLE: 700,
    SUPREME: 800,
    DANGEROUS: 999,
  }),
};
```

この数値はゲームの master から実測したもので、**推定値ではない**（設計 §7.2.4）。`RecordMasterBreedingTheory::readValueFromJsonObject()` が JSON キー `priority` をレコードの `+0x48` へ格納し、`getCurrentRecordsOrderByPriority(time)` がその値で単純降順に並べる。

内部名と CSS クラスの対応も同じファイルに持たせる。**この対応は変えてはならない**（`css/style.css` が依存）。

```js
CLASS_NAME: Object.freeze({
  INTERESTING: "theory_01",   // 面白
  WONDERFUL:   "theory_02",   // 見事
  WELL:        "theory_03",   // よくでき
  PERFECT:     "theory_04",   // 完璧
  SUPER_PERFECT: "theory_05", // 超完璧
  MIRACLE:     "theory_06",   // 奇跡
  SUPREME:     "theory_07",   // 至高
  DANGEROUS:   "theory_08",   // 危険
}),
```

**`compareByPriorityDescExceptDangerous()` に相当する処理を書いてはならない。** 逆解析の結果、あの比較関数は血統表の検索条件一覧用で、配合結果の画面表示経路では呼ばれない（設計 §7.2.4）。危険は `priority=999` の数値どおり最優先である。

### 2. `compatibility.js` を 2 段へ分ける

```js
// 成立している理論を全部返す。表示の優先順位はここでは考えない。
function detectMatchedTheories(Sire, Dam, context) { ... }   // → string[]
// priority の単純降順で先頭 1 件を返す。
function selectDisplayedTheory(matched, priorityTable) { ... } // → string | null
```

成立条件（現行と同値になるよう組むこと）:

| 内部名 | 成立条件 |
|---|---|
| `DANGEROUS` | `context.dangerous === true` |
| `SUPREME` | `context.sameNameSpecialChecks.length > 0` |
| `INTERESTING` | `countUniqueElements(S[0], D[0]) >= 7` |
| `WELL` | `countCommonElements(S[1], D[0]) === 3` |
| `WONDERFUL` | `countCommonElements(S[1], D[0]) === 4` |
| `PERFECT` | `WONDERFUL` かつ `INTERESTING` |
| `SUPER_PERFECT` | `WONDERFUL` かつ `countUniqueElements(S[0], D[0]) === 8` |
| `MIRACLE` | `PERFECT` かつ §3 の照合で一致数がちょうど 1 |

`selectDisplayedTheory()` は `matched` が空なら `null`、それ以外は `priorityTable` の降順で先頭。**危険を末尾へ送る例外処理を書かない。**

`compatibility()` は**公開 API として残し**、この 2 つを合成して従来どおり CSS クラス名（`"theory_04"` など）を返す薄いラッパにする。

```js
function compatibility(Sire, Dam, context) {
  const matched = detectMatchedTheories(Sire, Dam, context);
  const name = selectDisplayedTheory(matched, PRIORITY);
  return name ? CLASS_NAME[name] : "";
}
```

**`vue/app/methods/pedigree-cells.js` を変更しない。** 設計 §11.4 は `dispTheory()` を 2 関数の呼び出しへ変えると書いているが、`compatibility()` をラッパとして残せば呼び出し側は無変更で済み、差分が小さくなる。`detectMatchedTheories` / `selectDisplayedTheory` は `window.Dabimas.logic.theory` へ公開して、段階7 や将来の UI から使えるようにする。

### 3. 奇跡の照合を `nodeId` へ

現行は馬名の文字列比較である。

```js
var mother3 = selected[3 + 16] ? selected[3 + 16].name : undefined;   // 特殊牝馬側 index 19
var father4 = [selected[4], selected[5], selected[6], selected[7]].map(name);
var includesNum = father4.filter((value) => value === mother3);
if (includesNum.length === 1) { /* 奇跡 */ }
```

これを `nodeId` 比較へ変える。**どちらかに `nodeId` が無いときだけ名前比較へ縮退する**（設計 §6.7 ルール1）。

```js
// nodeId は「ゲームノードとして同一か」を表す（設計 §4.1）。
// 名前比較だと同名別馬を取り違える（仕様書 §40.1）。
const isMiracleMatch = (a, b) => {
  if (!a || !b) return false;
  if (typeof a.nodeId === "string" && typeof b.nodeId === "string") {
    return a.nodeId === b.nodeId;
  }
  return a.name != null && a.name === b.name;
};
```

**一致数がちょうど 1 のときだけ成立**という現行の条件は変えない（4×3 のみ奇跡、4×4×3 は奇跡にならない）。

#### `kiseki_group_id` は使わない（重要）

設計 §7.2.5 は `nodeId` に加えて `kiseki_group_id` の一致も見よと書いているが、**この段階では使わない**。理由は 2 つ。

1. **効果がゼロである。** 現行データで、奇跡グループ 475 個は**すべて 1 pedigree しか含まない**。したがって `kiseki_group_id` の一致は `pedigreeId` の一致と同じ意味しか持たず、`nodeId` 比較に足すものが無い。
2. **設計資料 §2.3 の根拠が消えた。** 「4 グループが別々の実馬をまとめているので `pedigree_id` では代用不可」という記述は、パイプラインの採番バグ（古い ID の残存）が生んだ見かけの現象だった。2026-09-03 の修正で解消済み（`2026-09-03-pipeline-kiseki-group-id.md`）。

実測でも、現行式が成立する **9,623 組すべてで `nodeId` も一致**しており、`pedigreeId` のみ一致・`kiseki` のみ一致はどちらも 0 件だった。

`compatibility.js` にノードテーブルへの依存を持ち込まないこと。将来 `kiseki` を使う必要が出たら、そのとき別途判断する。

### 4. `index.html` と `service-worker.js`

**`AGENTS.md` の Safety Rules を必ず守ること。** `apply_patch` のみ、編集前に `backup-index-exp`、編集後に `verify-index-exp`、BOM 禁止。

挿入位置は `compatibility.js` より前（`vue/constants/` のブロックがあればそこへ）。

`service-worker.js` は `urlsToCache` へ `vue/constants/breeding-theories.js` を追加する。**`CACHE_NAME` は上げなくてよい**（デプロイ時にまとめて上げる。段階4c までの変更もまだ上がっていない）。

## 制約

- `AGENTS.md` の Safety Rules に従うこと。特に `index.html`。
- **表示結果を変えない。** これが最大の受け入れ条件。
- **`styleThoeryClass` の文字列（`"theory_01"`〜`"theory_08"`）の対応を変えない。** `css/style.css` が依存している。
- **`vue/app/methods/pedigree-cells.js` を変更しない。** `compatibility()` のシグネチャと戻り値を保つ。
- **至高（`SUPREME`）の成立条件を変えない。** 現行どおり `sameNameSpecialChecks.length > 0`。条件 c/d/e の追加は段階7。
- **危険（`DANGEROUS`）の扱いを変えない。** `context.dangerous` で成立、priority 999 で最優先。
- 見事・完璧・超完璧の式を書き換えない（同値なので触る必要が無い）。
- `compatibility.js` から `pedigreeNodes.json` / ノードテーブルを参照しない。
- `vue/logic/inbreed/*.js` を変更しない（段階3〜5 で確定済み）。
- `compareByPriorityDescExceptDangerous()` 相当を実装しない。

## スコープ外（やらないこと）

- 至高の条件 c/d/e の追加（段階7）
- `getCrossCommentType()` / クロスコメント種別（Word マスター未入手・設計 §14）
- 利根川系ほか期間限定理論の実装（設計 §7.2.4 の表は将来用の記録）
- `kiseki_group_id` を判定に使うこと（§3 の理由により）
- `dispTheory()` の S / D 組み立ての変更（設計 §7.2「位置の取得は現行のまま」）
- `CACHE_NAME` の更新
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

1. `node scripts/verify-storage-boot-order.cjs` / `verify-horse-badges.cjs` / `verify-horse-candidate-lists.cjs` がすべて成功する。
2. `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html` が `[verify] OK` を返す。
3. `python -m pytest tests/ -q` が全件成功する。
4. **`compatibility()` の戻り値が段階5（`192bbe2` 以降の HEAD）と 1 件も変わらない。** 実データからランダムに **20000 組以上**を取り、固定点のコードと実装後のコードへ同じ盤面を通して比較すること。**seed・PRNG・比較方法を完了報告に記載する。** 1 件でも変われば実装ミス。
   - 比較は**近似ではなく実装どうし**で行うこと。段階4c・段階5 の検収で、手で組んだ近似と比べて誤った基準値を出した実績がある。
5. **表示の分布が現行と一致する。** 参考値（30000 組・seed 0x51EED）: `(なし) 20693 / 面白 7874 / よくでき 789 / 危険 587 / 見事 41 / 完璧 14 / 超完璧 2 / 奇跡 0 / 至高 0`。別 seed でも各理論の比率が同程度になること。
6. **`detectMatchedTheories()` が複数返すこと。** 面白かつ見事かつ完璧が同時に成立する盤面で、戻り値に 3 つ以上が含まれること。現行 `compatibility()` は 1 件しか返せなかった。
7. **`selectDisplayedTheory()` の優先順位テスト**（設計 §12.2 の TC-T01〜T08）。
   - `[SUPER_PERFECT, PERFECT, WONDERFUL, INTERESTING]` → `SUPER_PERFECT`
   - `[PERFECT, WONDERFUL, INTERESTING]` → `PERFECT`
   - `[WELL, INTERESTING]` → `WELL`
   - `[INTERESTING, DANGEROUS]` → `DANGEROUS`
   - `[DANGEROUS]` → `DANGEROUS`
   - `[SUPREME, MIRACLE, PERFECT]` → `SUPREME`
   - `[]` → `null`
   - master の全 8 理論 → `DANGEROUS`
8. **奇跡の照合が `nodeId` になっていること。** `name` が同じで `nodeId` が違う 2 セルを 特殊牝馬側 index 19 と 種牡馬側 index 4 に置いた盤面で、**奇跡が成立しないこと**。同じ `nodeId` なら成立すること。
9. **`nodeId` が無いセルで名前比較へ縮退すること。** 両方 `nodeId: null` で `name` が同じなら奇跡が成立する。
10. **危険が最優先で出ること。** `context.dangerous = true` かつ他の理論も成立する盤面で `"theory_08"` が返ること。
11. `git status` で変更されているのが §「変更対象ファイル」の 4 ファイルだけである。

基準 4〜10 は確認用の一時 `.cjs` を書いて `node` で検証してよい（コミットには含めず、完了報告に内容を残すこと）。

## 検証コマンド

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 backup-index-exp
# …index.html を apply_patch で編集…
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html

node scripts/verify-storage-boot-order.cjs
node scripts/verify-horse-badges.cjs
node scripts/verify-horse-candidate-lists.cjs
python -m pytest tests/ -q

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

### 表示不変の実測（基準4・5）

<サンプル数・seed・PRNG・比較方法・食い違った件数・表示の分布>

### 優先順位テストの結果（基準7）

<TC-T01〜T08 に相当する 8 ケースの結果>

### 残課題・気づき

<スコープ外だが気づいた問題、やり残し。なければ「なし」>
