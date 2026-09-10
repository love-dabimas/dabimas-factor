# 作業指示書: 自家製馬の子系統の欠落と、工程診断の工程漏れ

- status: 未着手
- 作成日: 2026-09-10
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 前提: `origin/main` は 8936a9c（`feature/dabifaku-unified` をマージ済み）
- **稼働影響あり:** 子系統の「出現数」が増える盤面がある。工程診断の工程数が増える盤面がある

ユーザー報告2件。原因は別々で、パート1とパート2は独立している。片方だけ入れても壊れない。

---

## 報告1: 自家製馬を置くと子系統が消える

> （パーソロン×スイートルナ）×ダンスパートナー で作った自家製牡馬を置くと子系統が消えている

再現手順:

1. 父側**②**へ **パーソロン1971**（`s9142543838` / 子系統「マイバブー系」）
2. 父側**③**（母父）へ **スイートルナ**（`b8665243163`）
3. 母側**①**へ **ダンスパートナー**（`b5212364985`）
4. この盤面を**自家製種牡馬**として保存する
5. 別の盤面の父側**③**（セル2）へその自家製種牡馬を置き、子系統表示に切り替える

現行の子系統表示（`this.category`）:

| セル | 馬 | 現行 | 期待 |
|---|---|---|---|
| 0 | ★２薄めルドルフ牡馬 | `""` | `マイバブー系` |
| 1 | ★１薄めルドルフ牡馬 | `""` | `マイバブー系` |
| 2 | ☆ルドルフ牡馬（自家製） | `""` | `マイバブー系` |
| 4 | ★１薄めパーソロン1971 | `""` | `マイバブー系` |
| 8 | パーソロン1971 | `マイバブー系` | 同左 |
| 9 | サンデーサイレンス | `ヘイルトゥリーズン系` | 同左 |

ヘッダーの子系統集計は **系統数2 / 出現数2**。DB馬2頭ぶんしか数えられていない。

### 原因

`vue/app/methods/pedigree-cells.js` の `setPedigree`。
中間セルへ馬を置くと、そこから下のセルに `★N薄め` の馬が自動生成される（`while (isEven(reverseNum))` のループ）。
このとき作られるセルのオブジェクトが**`son`（子系統）を持っていない**。

```javascript
                const horseData = {
                  name: handMadeName,
                  subName: "",
                  parentLine: parentLine,     // ← 親系統は入っている
                  factors: [...emptyFactors],
                  ...
                };
                ...
                // 子系統をセット
                this.category[reverseCellIndex] = son;   // ← 表示用配列にだけ入る
```

`this.category` には入るので**保存する前の盤面では正しく表示される**。
ところが `buildSavedHorseRecord` が読むのは `localStorage` の `dabimasFactor`＝`this.selected` のほうで、
そこには `son` が無い。結果として:

- `record.son` が `""`（`saved-horse-builder.js` の `son: sire.son || ""`）
- `record.descendants[0].son` も `""`（`son: cell.son || ""`）

保存馬を置き直すと `this.category[cellIndex] = horseData.son` が `""` になり、
`★N薄め` の子孫セルにも `son`（＝`""`）がそのまま配られる。上の表の4セルが空になるのはこのため。

**親系統（`parentLine`）だけが引き継がれ、子系統（`son`）が落ちている非対称**が本体である。
セル0へ直接種牡馬を選んだ盤面から保存した場合は `cells[0]` がDB馬なので、この不具合は出ない。

### 実装（パート1）

#### 1-1. `★N薄め` セルに `son` を持たせる【必須】

`vue/app/methods/pedigree-cells.js` の `setPedigree` 逆走ループ。
自動生成する2つのオブジェクトに `son` を足す。`son` は同じ関数の中で
`const son = horseDataList[0]?.son;` として既に取ってある。

- `broodmareData`（`reverseNum === 0 && sex === 1` の「ワタシノヒンバ」）
- `horseData`（`★N薄め`）

`this.category[reverseCellIndex] = son;` の行は**そのまま残す**。表示の経路は変えない。

#### 1-2. 保存済みレコードの救済【必須】

1-1 だけでは、**すでに保存してある自家製馬は直らない**（IndexedDB の `customHorses` に `son: ""` で入っている）。
子系統は直系父方向でしか決まらない属性なので、レコードから復元できる。

純関数を `vue/logic/horses/saved-horse-builder.js` に足す（例: `fillMissingSon(record)`）。

- `descendants[i]` は仔から見た祖先で、`vue/logic/pedigree/pedigree-builder.js` の
  `DESCENDANT_SLOTS = [1,2,4,8,9,5,10,11,3,6,12,13,7,14,15]` の位置に対応する
- 位置 `k` の父は位置 `2k`。`son` が空なら `k → 2k → 4k …`（16未満のあいだ）とさかのぼり、
  最初に見つかった空でない `son` を入れる
- `record.son` 本体は位置1（父）からさかのぼって埋める
- **空のときだけ**埋める。値が入っているものには触らない

呼ぶ場所は「レコードがメモリに載る入口」2か所:

- `vue/app/methods/horse-loading.js` `loadCustomHorseDetails()` で
  `storage.loadCustomHorses(db)` が返した各レコード
- 同ファイル `getCustomHorseDetail()` の IndexedDB から読む分岐

IndexedDB へ書き戻すかどうかは任意。読むたびに埋まるので書き戻さなくても表示は直る。

---

## 報告2: 自家製牝馬を使うと途中工程が出てこない

> （ドリームジャーニー×メゾンフォルティー）で作った自家製牝馬に対してドリームジャーニーを掛けて
> 診断すると危険になるのは良いが、途中ドリームジャーニー×メゾンフォルティーは完璧な配合なのに
> それが出てこない

再現手順:

1. **ドリームジャーニー央瓏**（`s5315478238`）× **メゾンフォルティー**（`b9214958361`）の盤面を
   **自家製繁殖牝馬**として保存する（この配合単体の理論は **完璧**）
2. 新しい盤面の父側**①**へ **ドリームジャーニー翔天**（`s7810313245`）、母側**①**へ 1 の自家製牝馬
3. 工程診断を実行する

| | 現行 | 期待 |
|---|---|---|
| パネル見出し | 1工程の計画（基礎繁殖牝馬: 指定なし） | 2工程の計画（基礎繁殖牝馬: メゾンフォルティー） |
| 工程1 | 基礎繁殖牝馬 × ドリームジャーニー → **危険な配合** | メゾンフォルティー × ドリームジャーニー → **完璧な配合** |
| 工程2 | （無い） | 工程1産駒（仮想繁殖牝馬） × ドリームジャーニー → **危険な配合** |

### 原因

`vue/logic/plan/plan-diagnosis.js` の `detectBaseDepth`。

```javascript
    var root = selected[ROWS_PER_SIDE];
    if (root && root.selfSelected === true) {
      return 0;
    }
```

母側ルート（セル16）へ自分で置いた馬は「もう存在する基礎繁殖牝馬」とみなされ、工程は最終工程1つだけになる。
DB馬ならこれで正しい。しかし**自家製馬はこれから作る馬**なので、その馬を作る配合そのものが工程1になるはずである。

自家製牝馬を置くと母側の血統表はちょうど「1世代ぶんの計画表」の形になっている
（セル17＝その牝馬の父、セル19＝その牝馬の母の父）。つまり `baseDepth` が 1 になりさえすれば、
既存の工程切り出し・仮想繁殖牝馬の合成はそのまま使える。実測で確認済みである。

### 実装（パート2）

#### 2-1. 自家製馬は「まだ作っていない馬」として扱う【必須】

`detectBaseDepth` を、母系の各深さの牝馬の ref を見る形にする。

- 深さ0の牝馬は `selected[16]` 本人 → ref は `selected[16].identityRef`
- 深さ d>0 の牝馬は `selected[16 + maternalSireCell(d)]` に**その牝馬の父**が入っている。
  牝馬本人の ref は同セルの `placeholderMareRef`
  （`vue/logic/pedigree/pedigree-builder.js` の牝馬ルートが付ける）

いちばん深い `selfSelected` を探す既存ループは**先に**回す（ユーザーが自分で置いた馬が優先）。
そのうえで、見つかった深さの牝馬が自家製馬なら、母をたどって深さを足す。

```javascript
    // 自家製馬は「これから作る馬」なので、その馬を作る配合が1工程ぶん手前に付く。
    // 母が自家製ならさらに手前へ。盤面は母系4代までなので MAX_BASE_DEPTH で止める。
    var depth = <既存ロジックが返した深さ>;
    var ref = mareRefAtDepth(selected, depth);
    while (depth < MAX_BASE_DEPTH && ref && ref.kind === "custom") {
      depth += 1;
      var parents = resolver && resolver.parentsOf ? resolver.parentsOf(ref) : null;
      ref = parents ? parents.mother : null;
    }
```

`resolver` は `detectPlan(selected, resolver)` として受け取る。
呼び出し側は2か所とも同じ resolver を渡すこと（食い違うと hydrate 対象がずれる）。

- `vue/logic/plan/plan-diagnosis.js` の `diagnoseBreedingPlan` 内 → `input.resolver`
- `vue/app/methods/plan-diagnosis-ui.js` の `runPlanDiagnosis` → `this.identityResolver`

resolver が無いときは従来どおり（`depth` を足さない）。

#### 2-2. 基礎繁殖牝馬を ref から解決する【必須】

2-1 だけでも工程数と理論は正しくなる。ただし基礎繁殖牝馬の血統が
`sliceMareBoard` の切り出し（盤面にある4代ぶん）になり、5代目が欠ける。
`judgeInbreed` が5代目のクロスを見落とすと、**途中工程の「危険な配合」を見逃す**。
工程診断はまさにそれを見つけるための機能なので、ここは埋める。

自家製牝馬を保存すると `record.motherRef` に母の ref が入っている（実測済み）。
一方、母側ルートに置いた牝馬の名前は `descendants` の `subName` に残らないので、
**名前ではなく ref で解決する**。

- `detectPlan` の戻り値に `baseMareRef` を足す（2-1 のループを抜けたときの `ref`。深さ0のときは null）
- `diagnoseBreedingPlan` は `input.resolveMareByRef(plan.baseMareRef)` を先に試し、
  取れなければ従来の `input.resolveMare(plan.baseMareName)` → `sliceMareBoard` の順に落ちる
- `runPlanDiagnosis` は `baseMareRef` の馬を hydrate 対象へ足す
  - `kind === "custom"` → `this.customHorseDetails[ref.id]`（`descendants` を持っているのでそのまま使える）
  - `kind === "master"` → `this.horsesBase` から `nodeId` 一致・`sex === "1"` で引いて `ensureHorseDetail`
- パネル見出し用に、解決できた馬の `name` を `baseMareName` として結果へ入れる

#### 2-3. 対象外（今回はやらない）

- **父側①に自家製種牡馬を置いた場合**。その種牡馬を作る配合も工程ではあるが、
  計画は母系1本の鎖という前提で組まれている（`note-article/chapters/05-koutei-shindan.md`）。
  枝分かれを入れると工程番号・⚠の付け先・パネルの構造まで変わるので、別途相談する
- `step.sireName` に `subName` が出ない件（「ドリームジャーニー翔天」が「ドリームジャーニー」と出る）。
  既存の表示上の粗さで、今回の報告とは別

---

## 受け入れ基準

`json/` 配下の実データで確認すること。数値はすべて Claude 側で実測済みである。

### 1. 報告1の盤面が直る【必須】

報告1の手順1〜3の盤面で:

- `selected[0].son === "マイバブー系"`（現行はキー自体が無い）
- そこから保存したレコードが `son === "マイバブー系"`、`descendants[0].son === "マイバブー系"`

手順5の盤面で、`category` のセル0・1・2・4 がすべて `"マイバブー系"`、セル8も `"マイバブー系"`、
セル9が `"ヘイルトゥリーズン系"` であること。
子系統ヘッダーは **系統数2 / 出現数6**（現行は 系統数2 / 出現数2）。

### 2. 保存済みレコードも直る【必須】

`son: ""` で保存済みのレコード（`descendants[1].son` は入っている）を読み込んだとき、
`record.son` と `record.descendants[0].son` が `"マイバブー系"` に復元されること。
IndexedDB を書き換えずに再読込しても直ること。

### 3. 報告2の盤面が直る【必須】

報告2の手順の盤面で:

- `planDepth === 2` / `baseMareName === "メゾンフォルティー"`
- 工程1: `status === "safe"` / `displayedTheory === "PERFECT"` /
  `matchedTheories === ["INTERESTING","WONDERFUL","PERFECT"]` / `sireIndex === 17`
- 工程2: `status === "danger"` / `displayedTheory === "DANGEROUS"` / `sireIndex === 0`
- `summary` が
  `{totalDangerCount:1, intermediateDangerCount:0, finalStepDanger:true, dangerStepNumbers:[2], dangerCellIndexes:[0], unknownCount:0}`

### 4. 通常盤面の工程診断が動かない【必須・不変条件】

- ドリームジャーニー翔天 × **メゾンフォルティー本人**（DB牝馬をルートに置く）:
  `planDepth === 1` / 工程1 `PERFECT` / 危険0。現行と一致すること
- 母側⑯へ基礎繁殖牝馬・⑭⑩②へ種牡馬を置く従来の段階配合が、工程数・各工程の
  `status` / `displayedTheory` / `sireIndex` ともに現行と**差分0件**であること（最低200盤面）

### 5. 判定・保存の既存挙動が動かない【必須・不変条件】

- 通常盤面（種牡馬×繁殖牝馬をルートに選ぶ）から保存したレコードの
  `fatherRef` / `motherRef` / `mareRefs` / `mares` / `descendants` が、`son` 以外**1件も変わらない**こと
- `judgeInbreed` の `count` / `dangerous` / `inbreedColorIndexes` / `selfAncestorWarningIndexes` が
  現行（8936a9c）と差分0件であること（最低500盤面）。`son` は判定に使われていないので変わらないはず
- 既存の `scripts/verify-p2d-*.cjs` / `scripts/verify-p2e-*.cjs` が通ること

### 6. resolver が無くても壊れない【必須】

`detectPlan(selected)` を第2引数なしで呼んでも例外にならず、従来どおりの結果を返すこと。
`window.Dabimas.pedigreeNodes` が null でも動くこと。

---

## 検証時の注意

- **`setPedigree` は Vue のメソッドだが、node からモックで呼べる。**
  `selected` / `category` / `factorName` / `factorCd` / `styleFactorClasses` / `parentLines` /
  `styleParentLineClasses` / `horses` / `stallions` / `broodmares` と
  `$set(t,k,v){t[k]=v;}` を持つオブジェクトへ `window.Dabimas.app.methods` を
  `Object.assign` すれば動く。読み込みが要るのは
  `vue/constants/{factor-definitions,parent-lines,pedigree-indexes}.js` と
  `vue/logic/factor/{factor-map,factor-counts}.js`、`vue/logic/pedigree/*`
- **`detectPlan` は `diagnoseBreedingPlan` の中から直接呼ばれている。**
  `window.Dabimas.logic.plan.detectPlan` を差し替えても内部の呼び出しには効かない。
  試作するならソース文字列を書き換えて読み込むこと（Claude 側で一度これに引っかかった）
- **母側ルートに置いた牝馬の名前は `descendants` の `subName` に残らない。**
  `subName` に `(牝馬名)` が付くのは、牝馬を**ルート以外**のセルへ置いたときだけ
  （`pedigree-builder.js` の牝馬ルート）。だから 2-2 は名前ではなく ref で解決する
- **新旧で同じ盤面を評価しているか確かめること。** 盤面の材料は先に確定させてから両方へ渡す
- **ローカルサーバの取り違え**: ポート8766・8767 に古いリポジトリのコピーを配る
  `python -m http.server` が残っていることがある
- **ServiceWorker のキャッシュ**: `CACHE_NAME` を bump しないと古いJSが配られ続ける
- **改行コード**: このリポジトリは LF

---

## 検収記録

（実装後に Claude 側で記入する）
