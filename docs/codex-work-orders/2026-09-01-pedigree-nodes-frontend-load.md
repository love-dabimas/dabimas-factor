# 作業指示書: pedigreeNodes.json をフロントで読み込み nodeId を配合表まで通す（段階2）

- status: 依頼中
- 作成日: 2026-09-01
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 設計資料: `docs/pedigree-master-integration-design.md` §6.1〜§6.4 / §8.2 / §9.1 / §9.2 / §11.4
- 前提: 段階1（`2026-09-01-pedigree-master-python.md`）が完了・検収済み
- **稼働影響: なし。** 判定ロジックは 1 行も変えない。データを読んで配合表まで運ぶだけ

## 背景と目的

段階1 でビルド成果物に血統ノード ID が入り、**すでにリポジトリへコミット済み**である。フロントエンドはまだ何も読んでいない。

```text
json/dabimasFactor.summary.json   nodeId / pedigreeId 入り（2914 頭・null なし）
json/dabimasFactor-details/*.json descendants[].nodeId / pedigreeId と mares[15] 入り（23 chunk）
json/pedigreeNodes.json           新規。pedigree 8868 / node 10275、gzip 約 232KB
```

段階2 のゴールは、**このデータをフロントで読み込み、判定 3 機能が段階3 以降で使える場所まで運ぶこと**。判定の中身（インブリード判定・配合理論・因子カウント）は一切触らない。したがって**画面の見た目も判定結果も 1 件も変わってはならない**。これが最大の受け入れ条件である。

段階3 以降で必要になる「同一馬か」「全兄妹か」の判定材料を、この段階で次の 3 経路に用意する。

| 判定に必要なもの | 段階2 で用意する場所 |
|---|---|
| 選択馬・祖先セルの `nodeId` | `selected[0..31]` の各セル |
| 牝系15枠の `nodeId` | `selected[0]` / `selected[16]` の `mareNodeIds` |
| 父母・奇跡グループ・系統の引き当て | `window.Dabimas.pedigreeNodes`（ノードテーブル） |

## 実装方針

### 変更対象ファイル

- `vue/logic/pedigree/pedigree-node-table.js` — **新規**。`buildNodeTable()`
- `index.html` — 上記の `<script>` を 1 行追加（**AGENTS.md の手順必須**）
- `vue/app/methods/horse-loading.js` — 読み込み・`normalizeHorseSummary`・`hydrateHorseWithDetail`・`stripHorseForStorage`
- `vue/app/methods/bootstrap.js` — `restoreInputData()` に `backfillPedigreeIds()`
- `vue/logic/pedigree/pedigree-builder.js` — `retDataForPedigree[0]` に `mareNodeIds`（1 行）
- `service-worker.js` — `CACHE_NAME` 更新・`urlsToCache` へ 2 件追加

### 1. `vue/logic/pedigree/pedigree-node-table.js`（新規）

既存の `vue/logic/**/*.js` と同じ IIFE + `window.Dabimas.logic.*` 登録の形にそろえる（`vue/logic/pedigree/pedigree-builder.js` の冒頭が手本）。

`buildNodeTable(json)` は `json/pedigreeNodes.json` をパースしたオブジェクトを受け取り、次を持つ**凍結されたテーブル**を返す。

```js
{
  datasetVersion,                       // 文字列。summary/details との齟齬検出用に保持する
  getNode(nodeId),                      // -> { pedigreeId, subname, effects } | null
  getPedigree(pedigreeId),              // -> { name, father, mother, kiseki, sireLineBaseId } | null
  parentsOf(nodeId),                    // -> { father, mother }（pedigree_id。全兄妹判定用）
  variantsOf(pedigreeId),               // -> nodeId[]（昇順）
  findByName(name),                     // -> nodeId[]（自家製馬の祖先解決用。必ず配列で返す）
}
```

実装上の必須事項:

- **`pedigreeFields` / `nodeFields` を見て添字を決めること。** 配列の並びを実装へ直書きしない。将来フィールドが増えたときに静かにずれる。
- **`pedigreeId` は `nodeId` から切り出さない。** `nodes[nodeId][0]` の値をそのまま使う。現行データの 8868 pedigree のうち `game:baf5c72f-3f2f-...` 形式のハイフン入り ID が実在し、`nodeId.split("-")[0]` は壊れる。
- `findByName(name)` は `pedigrees[].name`（= `canonical_name`）の完全一致で引く。正規化は段階3 で必要になったら足す。**同名が複数ありうるので必ず配列を返し、先頭を自動採用しない。**
- 索引（name → pedigreeId、pedigreeId → nodeId[]）は `buildNodeTable()` 内で 1 回だけ作る。呼ばれるたびに全走査してはいけない。
- 入力が壊れている（`pedigrees` か `nodes` が無い等）ときは例外を投げる。呼び出し側が `null` へ縮退させる。

### 2. `index.html` への `<script>` 追加

**`AGENTS.md` の Safety Rules を必ず守ること。** `apply_patch` のみ、編集前に `backup-index-exp`、編集後に `verify-index-exp`、BOM 禁止。

挿入位置は `pedigree-builder.js` の直前（同じ `vue/logic/pedigree/` のブロック内）。

```html
  <script src="./vue/logic/theory/affinity.js"></script>
  <script src="./vue/logic/pedigree/pedigree-node-table.js"></script>   <!-- 追加 -->
  <script src="./vue/logic/pedigree/pedigree-builder.js"></script>
```

### 3. `vue/app/methods/horse-loading.js`

#### 3.1 `pedigreeNodes.json` の読み込み（`dbinitializer`）

`dbinitializer()` の中で、summary の fetch と**並行に**取得を始める。

```js
const nodeTablePromise = fetch("./json/pedigreeNodes.json")
  .then((response) => {
    if (!response.ok) {
      throw new Error("pedigree nodes fetch failed: " + response.status);
    }
    return response.json();
  })
  .then((json) => {
    window.Dabimas.pedigreeNodes =
      window.Dabimas.logic.pedigree.buildNodeTable(json);
  })
  .catch((error) => {
    console.warn("pedigree nodes load failed", error);
    window.Dabimas.pedigreeNodes = null;   // 名前ベースへ縮退（§6.7）
  });
```

**`c4()` より前に解決していること。** 復元処理が `nodeId` を詰めるので、`brosData.json` のような撃ちっぱなしにはできない。既存の `waitReady()` と同じ扱いにする。

```js
const waitReady = () => Promise.all([readyPromise, nodeTablePromise]);
```

`dbinitializer()` には **`.then(() => this.c4())` が 2 か所**ある（通常経路と `loadFullJsonFallback()`）。**両方が待つこと。** `waitReady()` を上のように変えれば両方に効く。

`nodeTablePromise` は `.catch()` を持つので reject しない。**起動を止めてはならない。**

#### 3.2 `normalizeHorseSummary()`（見落とし注意）

この関数は**ホワイトリスト方式**で、列挙されていないフィールドは捨てられる。JSON に `nodeId` があっても、ここに書かなければ消える。

```js
nodeId: typeof horse.nodeId === "string" ? horse.nodeId : null,
pedigreeId: typeof horse.pedigreeId === "string" ? horse.pedigreeId : null,
```

**必ず `typeof === "string"` で判定すること。** `nodeId` は `"0000008661-10"` のような文字列で、数値ではない。

`createSavedHorseSummary()`（自家製馬）と、エディット種牡馬の summary 生成には `nodeId: null` / `pedigreeId: null` を明示する。master に存在しない馬なので、undefined のまま放置せず「無い」と分かる形にする。

#### 3.3 `hydrateHorseWithDetail()` に `mares` を通す（**この段階の要）**

現行はこうなっており、**`detail.mares` を捨てている**。ここを直さないと牝系15枠は配合表に一切届かない。

```js
hydrateHorseWithDetail(horse, descendants) {
  return { ...horse, descendants };
},
```

第 3 引数を足す。既定は `null`。

```js
hydrateHorseWithDetail(horse, descendants, mares) {
  return { ...horse, descendants, mares: Array.isArray(mares) ? mares : null };
},
```

`ensureHorseDetail()` 内の**呼び出し 5 か所すべて**に `detail.mares` / `retryDetail.mares` を渡すこと。抜けがあるとその経路だけ牝系が空になる。

| 経路 | 渡す値 |
|---|---|
| エディット種牡馬（通常） | `detail.mares` |
| エディット種牡馬（再解決） | `retryDetail.mares` |
| 自家製馬 | `null`（段階4 まで `mares` を持たない） |
| 通常馬（通常） | `detail.mares` |
| 通常馬（再解決） | `retryDetail.mares` |

`ensureHorseDetail()` の冒頭にある「既に `descendants` を持つならそのまま返す」旧 snapshot 互換パスは**そのままにする**。復元経路は §4 の `backfillPedigreeIds()` が別途埋める。

#### 3.4 `stripHorseForStorage()`

`mares`（detail 由来の生フィールド）は localStorage へ入れない。配合表セルには §5 の `mareNodeIds` として入るので、同じ配列が 2 つ保存されるのを避ける。

```js
const { descendants, searchText, displayName, mares, ...rest } = horse;
```

`nodeId` / `pedigreeId` / `mareNodeIds` は**落とさない**（現行どおり `rest` に残る）。設計 §8.2 のとおり保存はされるが、復元時は必ず再計算して上書きするので参考情報にすぎない。

### 4. `vue/app/methods/bootstrap.js` — `backfillPedigreeIds()`

`restoreInputData()` は localStorage の `selected` を読むが、古い保存データには `nodeId` が無い。復元直後に補う。

```text
restoreInputData()
  ├ selected を localStorage から読む          （現行どおり）
  ├ await this.backfillPedigreeIds()            ← 追加。因子・親系統を詰める前
  ├ 因子・親系統を詰める                        （現行どおり）
  ├ await this.dispInbreed()                    （現行どおり）
  └ this.dispTheory()                           （現行どおり）
```

```text
backfillPedigreeIds():
  for side in (0, 16):
      root = this.selected[side]
      if !root or !root.id: continue                     // 下記「拾えない盤面」参照
      summary = this.findSummaryHorse(root)              // 既存メソッド
      detail  = await this.ensureHorseDetail(root)       // 既存メソッド。失敗は握って次の side へ
      if summary:
          root.nodeId     = summary.nodeId ?? null
          root.pedigreeId = summary.pedigreeId ?? null
      if detail:
          root.mareNodeIds = Array.isArray(detail.mares) ? detail.mares.slice() : null
          for i, d in enumerate(detail.descendants):
              for slot in (DESCENDANT_SLOTS[i], DESCENDANT_SLOTS[i] - 1):
                  cell = this.selected[side + slot]
                  if cell && cell.name === d.name:       // ★名前が一致したときだけ
                      cell.nodeId     = d.nodeId ?? null
                      cell.pedigreeId = d.pedigreeId ?? null
                      break
```

**「名前が一致したときだけ付ける」が肝。** 祖先セルの因子はユーザーが `applyManualFactors()` で上書きできるので、セルを作り直してはならない。`nodeId` を足すだけの加算的な操作に限定する。`mareNodeIds` は表示にも編集にも使われないので無条件で上書きしてよい。

#### 祖先セルの位置（`DESCENDANT_SLOTS`）

`descendants` の添字 → 表示スロットの対応は `setDataForPedigree()` の実装から読み取れ、設計資料 §4.6 の表と一致する。

```js
// descendants[i] が入る片側のスロット番号（実セルは side + slot）
var DESCENDANT_SLOTS = [1, 2, 4, 8, 9, 5, 10, 11, 3, 6, 12, 13, 7, 14, 15];
```

**ただし `setDataForPedigree()` には配置が 1 つずれる分岐がある。** 特殊牝馬側（`id === 16`）へ牝馬を置いた場合だけ、ルートセルにその牝馬の父（`descendants[0]`）が `subName: "(牝馬名)"` として入り、以降が 1 スロットずつ手前へ詰む（`descendants[i]` が `DESCENDANT_SLOTS[i] - 1`）。種牡馬を置いた場合と、種牡馬側（`id === 0`）へ牝馬を置いた場合は上の表どおりになる。

そのため擬似コードは **候補スロットを 2 つ順に試し、`name` が一致した方だけへ書く**。分岐の判定を誤っても、名前が合わなければ何も書かないので誤った `nodeId` は付かない。両方に同じ名前が入っている場合は同じ馬なので `nodeId` も同じで、どちらでも等価である。

`DESCENDANT_SLOTS` は `vue/logic/horses/saved-horse-builder.js` の `DESCENDANT_CELL_IDS`（`[0,1,2,4,5,3,6,7,17,18,20,21,19,22,23]`）とは**別物なので流用しないこと**。あちらは「盤面 2 頭から生まれる子の 15 祖先」を両側から集める対応表、こちらは「片側 1 頭の 15 祖先」の配置である。混同すると祖先セルに他人の `nodeId` が付く。

#### 拾えない盤面（許容する）

特殊牝馬側へ牝馬を置いた盤面では、ルートセル（`selected[16]`）が牝馬本人ではなくその父のスプレッドなので `id` を持たない。detail を引く鍵が無いので、**その側は丸ごとスキップしてよい**。設計 §6.7 の縮退（`nodeId` が無いペアだけ現行の名前ベース判定）で動く。

この取りこぼしは古い保存データを復元したときだけの話で、**この変更後にユーザーが選び直した盤面は `setDataForPedigree()` のスプレッド経由で `nodeId` が入る**（§5）。

要件:

- `ensureHorseDetail()` が失敗しても**例外を投げず**、その側だけ諦めて続行する（オフライン起動を壊さない）。
- `window.Dabimas.pedigreeNodes` が `null` でも動くこと。この関数はノードテーブルを参照しない。
- 冪等であること（2 回呼んでも同じ結果）。
- **UI は出さない。** 復元は既存でも detail chunk を取りに行くので、体感は変わらない。

### 5. `vue/logic/pedigree/pedigree-builder.js`

`setDataForPedigree()` の `retDataForPedigree[0]` に 1 行足すだけ。祖先セル（index 1 以降）は `{ ...horseData.descendants[i] }` のスプレッドなので、`descendants` に `nodeId` があれば**自動的に流れる**。このファイルの男系まわりに変更は要らない。

```js
retDataForPedigree[0] = {
  ...horseData,
  mareNodeIds: Array.isArray(horseData.mares) ? horseData.mares.slice() : null,
  selectedHorse: horseData.name,
  // 以下現行どおり
```

**表示行を増やす案は採らない。** 牝馬15枠は「ルートセルに配列で載せる」だけで、32 行モデル・保存形式・共有形式はそのまま使う。`row-configs.js` / `pedigree-indexes.js` / `pedigree-row.js` / `factorCd[32][3]` / `dispColor[32]` などには**一切触らない**。

### 6. `service-worker.js`

```js
var CACHE_NAME = 'dabimas-factor-v20260901-01';   // 日付+連番の既存規則に合わせる
```

`urlsToCache` へ 2 件追加する。

```js
  BASE_PATH + 'json/pedigreeNodes.json',
  BASE_PATH + 'vue/logic/pedigree/pedigree-node-table.js',
```

**`json/pedigree_master.json` は追加しない。** R2 の入力ファイルはフロントへ配らない。

`json/` 配下は fetch ハンドラが network-first なので、`CACHE_NAME` を上げれば更新は届く。detail chunk を `urlsToCache` に入れない現行方針も変えない（1 ファイルの 404 で install 全体が落ちるため）。

## 制約

- `AGENTS.md` の Safety Rules に従うこと。特に `index.html`（`apply_patch` のみ・前後に backup/verify・BOM 禁止）。
- **判定ロジックを変更しない。** `inbreed-detector.js` / `inbreed-counts.js` / `compatibility.js` / `affinity.js` は 1 行も触らない。
- **表示行を 32 から増やさない。**
- **全書由来の `id` 体系を変えない。** 保存済み配合・作業枠・自家製馬の参照が全部切れる。
- `nodeId` は文字列として扱う。数値化・`parseInt`・`Number()` を通さない。
- `pedigreeId` を `nodeId` から切り出さない（ハイフン入り ID が実在する）。
- `pedigreeNodes.json` の取得に失敗しても**起動を止めない**。`window.Dabimas.pedigreeNodes = null` で全機能が現行の名前ベース動作へ縮退する。
- 新規 JS は UTF-8（BOM なし）。既存 `vue/logic/**` と同じ IIFE・命名・日本語コメントの流儀にそろえる。

## スコープ外（やらないこと）

- **`backfillCustomHorse()`（設計 §9.3）** — 自家製馬の `mares` 補完。設計 §8.5 の `MARE_SOURCE_IDS` 定数が `saved-horse-builder.js`（段階4 の対象）に入るまで実装できないので、**段階4 に含める**。段階2 では自家製馬の `mares` は `null` のままでよい（設計 §6.7 の縮退で動く）。
- インブリード判定・配合理論・因子カウントのロジック変更（段階3〜7）
- `brosData.json` の役割縮小（段階3）
- `vue/constants/breeding-theories.js` の追加（段階6）
- 血量・危険な配合の UI 表示（設計 §14 の未決事項2）
- `json/` 配下の再生成
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

1. `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp` が `[verify] OK` を返す。
2. `node scripts/verify-storage-boot-order.cjs` が成功する。
3. `node scripts/verify-horse-badges.cjs` と `node scripts/verify-horse-candidate-lists.cjs` が成功する。
4. `python -m pytest tests/ -q` が全件成功する（段階1 の 52 件。Python 側は無変更）。
5. アプリを起動して血統表に馬を置いたとき、`window.Dabimas.pedigreeNodes` が `null` でなく、`getNode("0000008661-10")` が `{ pedigreeId: "0000008661", subname: "神速", effects: [2,2,2] }` を返す。
6. 同じ状態で `selected[0].nodeId` が文字列で入っており、`selected[0].mareNodeIds` が 15 要素の配列である。祖先セル（例 `selected[1]`）にも `nodeId` が入っている。
7. **`json/pedigreeNodes.json` を 404 にして起動しても、エラーダイアログを出さずに従来どおり動く。** `window.Dabimas.pedigreeNodes === null` になり、インブリード判定・配合理論・因子カウントの結果が 6 の状態と一致する。
8. **`tests/fixtures/split-baseline/` の全 json（S1 / S2_pressed / S2_released / S3_cleared / S3_overwritten / S4 / S5 / S6）に差分が出ない。** 段階2 は判定を変えないので、**ベースラインの更新は禁止**。差分が出たら実装が間違っている。
9. ハイフン入り `pedigree_id` の馬（`json/dabimasFactor.summary.json` で `pedigreeId` が `game:` で始まる馬。例「アイアムアカペラオー」）を血統表に置いたとき、`selected[0].pedigreeId` が `game:` から始まる完全な ID になっている（`game` だけに切れていない）。
10. 保存済み配合を復元したとき（旧形式の localStorage / 作業枠 / 保存済み配合）、`nodeId` が付き、かつ祖先セルの手動因子が消えていない。
11. `git status` で変更されているのが §「変更対象ファイル」の 6 ファイルだけである。`vue/logic/horses/saved-horse-builder.js` は触らない（段階4 の担当）。

5・6・9・10 の確認は `scripts/codex-powershell.ps1 dump-dom` / `screenshot` を使う（AGENTS.md のとおり Chrome を直接起動しない）。DevTools コンソールが使えない場合は、確認用の一時 `.cjs` を書いて `node` で検証してもよい（その場合は完了報告に残し、コミットには含めない）。

## 検証コマンド

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 backup-index-exp
# …index.html を apply_patch で編集…
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp

node scripts/verify-storage-boot-order.cjs
node scripts/verify-horse-badges.cjs
node scripts/verify-horse-candidate-lists.cjs
python -m pytest tests/ -q

git status --short
git diff --stat tests/fixtures/split-baseline/
```

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。status は「依頼中」のまま変えないこと（完了への遷移は検収側が行う）。

### 変更ファイル一覧

- `vue/logic/pedigree/pedigree-node-table.js`（新規）: 圧縮 JSON のフィールド定義から索引を構築し、凍結したノード参照テーブルを公開した。
- `index.html`: ノードテーブルを `pedigree-builder.js` より先に読み込む script を追加した。
- `vue/app/methods/horse-loading.js`: ノード JSON の並列読み込みと 404 縮退、summary の ID 正規化、detail の `mares` 引き回し、保存時の `mares` 除外を実装した。
- `vue/app/methods/bootstrap.js`: 古い保存盤面へルート・祖先・牝系 ID を加算的に補完する `backfillPedigreeIds()` を追加した。
- `vue/logic/pedigree/pedigree-builder.js`: ルートセルへ複製した `mareNodeIds` を載せた。
- `service-worker.js`: キャッシュ名を `dabimas-factor-v20260901-01` へ更新し、ノード JSON と新規 JS をキャッシュ対象へ追加した。
- `docs/codex-work-orders/2026-09-01-pedigree-nodes-frontend-load.md`: 本完了報告を記入した（実装対象 6 ファイルには含めない）。

### 設計判断

なし。ブラウザ相当の受け入れ確認 5・6・7・9・10 は、指示書で許可された一時 `tmp/verify-pedigree-frontend.cjs` を使って Node VM 上で実施し、コミット対象から除外した。`index.exp.html` が存在しないため、AGENTS.md 指定の補助コマンドには実在する `index.html` を第 2 引数で明示した。

### 実行した検証と結果

- 基準 1: `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html` → `[verify] OK`。
- 基準 2: `node scripts/verify-storage-boot-order.cjs` → `storage boot order regression: OK`。
- 基準 3: `node scripts/verify-horse-candidate-lists.cjs` → `horse candidate list regression: OK`。`node scripts/verify-horse-badges.cjs` は下記の既存固定件数不整合により失敗した。
- 基準 4: `python -m pytest tests/ -q` → `52 passed`。
- 基準 5・6・7・10: `node tmp/verify-pedigree-frontend.cjs` → `pedigree frontend verifier: OK`。実データの `getNode("0000008661-10")`、32 セルへの ID 引き回し、15 件の `mareNodeIds`、手動因子の保持、通常・再解決・エディット・自家製の各 detail 経路、ノード JSON の待機と 404 時の `null` 縮退を確認した。
- 基準 8: `git diff --exit-code -- tests/fixtures/split-baseline/` → 差分なし。
- 基準 9: 現行 summary から `pedigreeId` が `game:` で始まる馬を抽出し、`アイアムアカペラオー` の完全な UUID 形式 ID が `nodeId` と `pedigreeId` の双方で切断されず保持されることを Node で確認した。
- 基準 11: 実装差分は指定 6 ファイル、これに本完了報告 1 ファイルを加えた。作業開始前から存在する `css/style.css`、`docs/pedigree-master-integration-design.md`、`getSize.html` の変更は触れていない。

### 残課題・気づき

- `scripts/verify-horse-badges.cjs` が前段階以前の固定件数（全 2873、種牡馬 2375、繁殖牝馬 498）を期待している一方、段階1で生成済みの現行 summary は指示書どおり全 2914、種牡馬 2415、繁殖牝馬 499 のため、最初の件数 assertion で失敗する。今回の変更によるデータ差分ではなく、指示書の「気づいた別問題は直さない」に従ってテスト側は変更していない。
