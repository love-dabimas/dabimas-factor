# 作業指示書: 保存時の個体解決を判定側と揃える（全兄妹対応フェーズ2e）

- status: 完了（2026-09-10 検収済み。パート4は見送り。受け入れ基準5は条件不足だったため検収記録で補足）
- 作成日: 2026-09-09
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 上位仕様: `docs/full-sibling-stacking-spec.md` v1.1（§4.1・§5.2）
- 前提: フェーズ1（c0f5b7d）、2a（dffcf20）、2b（fbafca8）、2c（b11a580）、2d（ad4dcab）が完了・検収済み。
  2a〜2c は `origin/main` へマージ済み（67135e6）。2d は `feature/dabifaku-unified` に未マージ
- **稼働影響あり:** 自家製馬を新規保存したときの保存内容が変わる。
  既存の保存レコードはパート4を入れない限り変わらない

---

## 背景（ユーザー報告4件目。実機で再現済み）

### 報告された手順

1. 自家製の繁殖牝馬を登録する
   - 父側①へ **サンデーサイレンス1989**
   - 母側②へ **パーソロン1971**、母側③（母父）へ **スイートルナ**
   - 母側①は自動生成の「ワタシノヒンバ」のまま（＝この馬が **シンボリルドルフの全兄妹**）
   - 「☆ザサンデー」として保存
2. 別の盤面を作る
   - 父側①へ **トウカイテイオー**（父＝シンボリルドルフ）
   - 母側へ下から順に **☆ザサンデー（⑤）→ アイスカペイド極走（④）→ アイリッシュリヴァー覇走（③）→ アイネスフウジン覇煌（②）**

期待: 5代目牝馬（＝☆ザサンデーの母＝パーソロン1971×スイートルナ）が
シンボリルドルフと全兄妹クロスになる。

実際: **クロスに出ない。**

### 再現結果（まっさらな Chrome プロファイル・新規保存レコード）

保存レコードは新形式で保存されている。それでも母が入っていない。

```
pedigreeSchemaVersion: 2
fatherRef: {kind:"master", nodeId:"0000333862-01"}   ← サンデーサイレンス1989。正しい
motherRef: null                                      ← ここ
mareRefs の母側7枠: 全部 {kind:"unknown"}             ← ここも
```

判定結果:

```
colored = [12, 30, 14, 26]      dangerous = false   count = 4
  ニアークティック   血量6250  ["MFFF","MMFF"]
  プリンスリーギフト 血量6250  ["MMFF","FMFF"]
  （シンボリルドルフは出ない）
```

**「保存レコードが2a以前の古い形式だから」ではない。** 積み上げ配合で保存すると必ずこうなる。

### 原因

盤面ルートの牝馬枠「ワタシノヒンバ」が同一性を一切持っていない。

- `vue/app/methods/pedigree-cells.js` の `setPedigree` が作るこのセルは
  `identityRef` も `mareRefs` も `mareNodeIds` も持たない（実測で全部 `null`）
- フェーズ2aで入れた正規化ループ `vue/logic/pedigree/pedigree-builder.js:821` は
  `setDataForPedigree()` の戻り値だけを通る。別経路で作られるこのセルは素通りする
- `vue/logic/horses/saved-horse-builder.js` は
  `motherRef: cells[16]?.identityRef ?? null` と素で読むので **null** になる

`motherRef` が null なので、盤面で `"MMM"`（＝☆ザサンデー）の母を辿る
`motherRefOf` が null を返し、**5代目牝馬 `"MMMM"` の出現そのものが作られない**。
全兄妹判定に到達する以前の問題である。

同じ穴が父側にもある。父側を積み上げると（種牡馬をセル②以降へ置くと）
セル①は `★１薄めトウカイテイオー` というプレースホルダになり、これも `identityRef` を持たない。
`fatherRef: cells[0]?.identityRef ?? null` なので **自家製種牡馬は `fatherRef` が null になる**。

### なぜフェーズ2dで塞がらなかったか

**2d が直したのは判定側であり、判定側は既に正しい。**

保存せずにその場で積み上げただけの盤面（トウカイテイオー ×〔パーソロン1971 + スイートルナ〕）は、
現状のコードで正しくクロスが出る（実測）。

```
colored = [1, 16]   dangerous = true   count = 7
  シンボリルドルフ  血量75000  ["F", ""]
```

`vue/logic/inbreed/inbreed-detector.js:862-867` が、ルートセルの `ref.kind === "unknown"` を見て
その場で `{kind:"implied", fatherRef, motherRef}` を組み立てているからである。

取り残されたのは**保存側**だけ。保存側は盤面から解決せず、セルに載っている値を素で読む。
つまり**同じ規則が2箇所で別々に実装されていて、片方にしか入っていない**というのが今回の構図である。

---

## 実装方針

盤面から個体refを解決する規則を**ひとつに寄せ**、保存側もそれを使う。

### パート1: 盤面の個体解決を共有ヘルパへ切り出す

新規ファイル `vue/logic/pedigree/board-refs.js` を作る。

```javascript
window.Dabimas.logic.pedigree.resolveBoardRefs = function (selected, sideOffset, context) {
  // context: { nodeTable, resolver }
  // 戻り値: Object.freeze({ rootRef, mareRefs, refByPath })
  //   rootRef   … path "" の個体ref（ルートセル。解決できなければ {kind:"unknown"}）
  //   mareRefs  … MARE_PATHS 順の15枠。解決できない枠は null
  //   refByPath … "" / SIRE_PATHS / MARE_PATHS を引ける Map
};
```

中身は `inbreed-detector.js` の `buildMareOccurrences`（148行〜）にある解決手順を
**そのまま移す**。移す範囲は次のとおり。

1. `refByPath` の初期化と `SIRE_PATHS` の走査（`placeholderMareRef` / `placeholderMareNodeId` の採取を含む）
2. `canonicalMasterRef` / `motherRefOf` / `masterRef`
3. `MARE_PATHS` の解決（`explicitMareRefsByPath` → `explicitMaresByPath` → `motherRefOf` →
   `rootCell.mareRefs[slot]` → `mareNodeIds[slot]` の優先順）
4. 牝馬枠の暗黙個体の逆順バックフィル（`slot = 14 → 0`）
5. **新規**: 手順4のあとに、ルート（path `""`）へ同じ規則を適用する。
   `refByPath.get("")` が `unknown` で、`refByPath.get("F")` と `refByPath.get("M")` が
   どちらも `unknown` でないなら `{kind:"implied", fatherRef, motherRef}` を入れる。
   これは `inbreed-detector.js:862-867` が `buildSideOccurrences` の中でやっている処理と同じものである

`nodeTable` が無いときは今の `buildMareOccurrences` と同じ扱いにする
（`rootRef` は `cellRef(rootCell)`、`mareRefs` は全 null）。

`index.html` の読み込み順は `pedigree-builder.js`（173行）の直後、
`saved-horse-builder.js`（174行）の直前に入れる。
**`service-worker.js` の `urlsToCache` にも追加し、`CACHE_NAME` を bump すること。**

### パート2: 判定側をヘルパ経由に置き換える（挙動は変えない）

`vue/logic/inbreed/inbreed-detector.js`

- `buildMareOccurrences(sideOffset, side)` は `resolveBoardRefs` を呼び、
  返ってきた `mareRefs` から出現を組み立てるだけにする
- `buildSideOccurrences` のルート処理（862-867行）は、同じ側の `resolveBoardRefs().rootRef` を使う

**このパートは出力が1件も変わってはいけない。** 純粋な切り出しである。

### パート3: 保存側をヘルパ経由にする【本題】

`vue/logic/horses/saved-horse-builder.js`

`buildSavedHorseRecord` に第5引数 `context`（`{ nodeTable, resolver }`）を足す。
`context` が無い / `nodeTable` が無いときは**今と同じ値を返す**（後方互換）。

`context` があるときだけ、**今の値が使えない枠に限って**ヘルパの解決結果で埋める。

```javascript
    var usable = function (ref) {
      return ref && ref.kind && ref.kind !== "unknown" ? ref : null;
    };
    var sireBoard = context && context.nodeTable
      ? window.Dabimas.logic.pedigree.resolveBoardRefs(cells, 0, context) : null;
    var damBoard = context && context.nodeTable
      ? window.Dabimas.logic.pedigree.resolveBoardRefs(cells, 16, context) : null;

    // fatherRef / motherRef
    //   今まで: cells[0]?.identityRef ?? null
    //   これから: 使えないときだけ盤面から解決した個体で埋める
    fatherRef: usable(cells[0]?.identityRef) ?? usable(sireBoard?.rootRef) ?? null,
    motherRef: usable(cells[16]?.identityRef) ?? usable(damBoard?.rootRef) ?? null,
```

`mareRefs` も同様に、`MARE_SOURCE_IDS` の各要素について

- `source[1] === null` → `usable(cells[16]?.identityRef) ?? usable(damBoard?.rootRef) ?? {kind:"unknown"}`
- それ以外 → `usable(今の式の値) ?? usable((source[0]==="sire" ? sireBoard : damBoard)?.mareRefs[source[1]]) ?? {kind:"unknown"}`

**「使えている値は絶対に触らない」** という形にすること。
通常の盤面（種牡馬・繁殖牝馬をルートに選ぶ）では `cells[0]` / `cells[16]` が
ちゃんと `identityRef` と `mareRefs` を持っているので、この変更で1件も値が動かない。

`vue/CombinationDialog.js`

- props に `identityResolver`（`Object`, default `null`）を足す
- `saveConfig()` の `buildSavedHorseRecord(...)` 呼び出しへ
  第5引数 `{ nodeTable: window.Dabimas.pedigreeNodes || null, resolver: this.identityResolver }` を渡す

`index.html`（84-90行）

- `<combination-dialog>` へ `:identity-resolver="identityResolver"` を足す
  （`identityResolver` は `vue/app/app-computed.js:24` の computed。root にある）

### パート4【任意・実装するか要判断】: 既存レコードの ref 補完

今までに保存された自家製馬は `motherRef: null` のままである。
保存元 config には盤面が丸ごと入っている（`config.configData.dabimasFactor` = 32セルのJSON）ので、
そこから同じヘルパで補完できる。

`vue/app/methods/horse-loading.js` の `backfillCustomHorse`（684行〜）が
「`mares` を持たない旧形式を config の盤面から補完する」という**同じ形の前例**なので、
そこへ相乗りするのが素直である。

- 対象: `record.motherRef == null` または `record.fatherRef == null` のレコード
- `configData.dabimasFactor` をパースして `resolveBoardRefs` を両側に掛け、
  `fatherRef` / `motherRef` / `mareRefs` の欠けている枠だけ埋める
- 補完結果は IndexedDB へ書き戻す（次回以降の起動で再計算しない）

**このパートは入れなくてもよい。** 入れない場合、ユーザーは自家製馬を保存し直す必要がある。
未公開のアプリなので保存し直しでも困らない、という判断は既にユーザーから出ている。
**判断できない場合はパート1〜3だけ実装し、パート4は着手せずに報告すること。**

---

## 受け入れ基準

`json/` 配下の実データで確認すること。すべて Claude 側で実測済みの値である。

### 1. 報告された事象が直る【必須】

背景に書いた手順を再現し、母側⑤へ☆ザサンデーを置いた盤面で:

- `inbreedColorIndexes` に **1**（＝シンボリルドルフのセル）が入る
- `crosses` に **シンボリルドルフ / 血量 28125 / 出現 `["F", "MMMM"]`** が出る
- `dangerous === false`
- `count === 5`、`inbreedColorIndexes === [1, 12, 30, 14, 26]`
- ニアークティック（6250）とプリンスリーギフト（6250）は今までどおり出る。
  **スピードシンボリ・Palestine が別クロスとして増えてはいけない**（`isSameBranch` が効いている）

### 2. 保存レコードの中身【必須】

背景の手順1で保存した直後のレコードが:

- `motherRef.kind === "implied"`
- `motherRef.fatherRef` が パーソロン1971（`{kind:"master", nodeId:"0000333257-01"}`）
- `motherRef.motherRef` が スイートルナ（`{kind:"master", nodeId:"0000050973-00"}`）
- 母側 `mareRefs` の7枠（`MARE_SOURCE_IDS` の `["dam", 0..6]`）が `unknown` でなくなる
  - Claude 側の実測では、母側15枠の解決結果は先頭から
    スイートルナ / Paleo / ダンスタイム / Oatflake / Calonice / スイートイン / Samaritaine /
    Perfume / Avena / Carissima / Coronis / Skerweather / フィーナー / Una II / Sarita II
- `fatherRef` は今までどおり `{kind:"master", nodeId:"0000333862-01"}`（変わらない）

### 3. 判定側の切り出しで結果が動かない【必須・不変条件】

パート2は純粋な切り出しである。**パート2だけを当てた状態で**、
既存の検証スクリプト（`scripts/verify-p2d-ui.html` と、フェーズ2a〜2dの回帰確認で使った盤面）の
結果が1件も変わらないこと。

とくに、保存せずその場で積み上げただけの盤面
（父側①トウカイテイオー / 母側②パーソロン1971 / 母側③スイートルナ）が

```
colored = [1, 16]   dangerous = true   count = 7
  シンボリルドルフ  血量75000  ["F", ""]
```

のままであること。

### 4. 通常の盤面が動かない【必須・不変条件】

種牡馬・繁殖牝馬をルートに選ぶ通常の盤面では、
**保存レコードの `fatherRef` / `motherRef` / `mareRefs` / `mares` が1件も変わらないこと。**
パート3の実装が「使えている値は触らない」形になっていれば自動的に満たされる。
満たされない場合は実装の形が違う。

### 5. 父側の積み上げ【必須】

父側を積み上げて（種牡馬をセル②以降へ置いて）自家製種牡馬を保存したとき、
`fatherRef` が `null` ではなく `{kind:"implied", ...}` になること。

> Claude 側では `cells[0]` が `★１薄めトウカイテイオー` で `identityRef === null` であること、
> および `fatherRef: cells[0]?.identityRef ?? null` というコードから導いた。
> 保存まで通した実測はしていないので、**実装時に実際に保存して確かめること。**
> もし実測すると別の値になるなら、それは指示書の誤りなので報告してほしい。

### 6. resolver が無いときに壊れない【必須】

`buildSavedHorseRecord` を第5引数なしで呼んでも今までどおり動くこと。
`window.Dabimas.pedigreeNodes` が null（`pedigreeNodes.json` の取得失敗時）でも保存が通ること。

---

## 検証時の注意（過去に踏んだ罠）

- **ローカルサーバの取り違え**: ポート8766・8767 に古いリポジトリのコピーを配る
  `python -m http.server` が残っていることがある。
  検証前に `Dabimas.logic.inbreed.judgeInbreed.toString()` へ新しい識別子が含まれるかを見て、
  自分が編集したコードを見ているか確かめること
- **ServiceWorker のキャッシュ**: `CACHE_NAME` を bump しないと古いJSが配られ続ける。
  検証時はブラウザ側で `getRegistrations()` → `unregister()` と `caches.delete()` をしてから再読み込みする
- **新規ファイルの取りこぼし**: `index.html` の `<script>` と `service-worker.js` の
  `urlsToCache` の両方へ追加すること。片方だけだとオフライン時に落ちる
- **改行コード**: このリポジトリは LF。Python の `io.open(p, 'w')` は CRLF を書くので使わない

---

## 検収記録

- 検収日: 2026-09-10
- 検収者: Claude Code セッション（指示書の書き手。Codex の検証スクリプトとは別に、独立の harness で再測した）
- 実装コミット: `3ffe8f0 Share board identity resolution with saved horse records`
- パート4（既存レコードの ref 補完）は見送り。指示書の判断どおり

### 結果

| 基準 | 結果 | 実測値 |
|---|---|---|
| 1. 報告された事象が直る | **合格** | `colored=[1,12,30,14,26]` `dangerous=false` `count=5` / シンボリルドルフ 血量28125 出現 `["F","MMMM"]` / ニアークティック 6250・プリンスリーギフト 6250 / スピードシンボリ・Palestine は増えていない |
| 2. 保存レコードの中身 | **合格** | `motherRef={kind:"implied", fatherRef:パーソロン1971(0000333257-01), motherRef:スイートルナ(0000050973-00)}` / `fatherRef` は 0000333862-01 のまま / unknown 枠 8/15 → **0/15** |
| 3. 判定側の切り出しで結果が動かない | **合格** | 2200盤面（通常1200・母側積み上げ400・父側積み上げ300・自家製300）で 28ef75e の検出器と**差分0件**。比較対象は count / dangerous / colored / selfAncestorWarningIndexes / factorCd / 群数 / 全クロスの代表ノード・血量・出現（index・path・世代・mareSlot・side・refのkind）。指定盤面も `colored=[1,16]` `dangerous=true` `count=7` シンボリルドルフ 75000 `["F",""]` のまま |
| 4. 通常の盤面が動かない | **合格** | 通常盤面800件で `fatherRef`/`motherRef`/`mareRefs`/`mares` に**差分0件** |
| 5. 父側の積み上げ | **合格（基準の書き方を訂正）** | 下記参照 |
| 6. resolver が無いときに壊れない | **合格** | 第5引数なし / `{nodeTable:null}` / `{}` のいずれでも 28ef75e と同一の戻り値 |

実機のブラウザ（まっさらな Chrome プロファイル・ServiceWorker 未登録）で、
指示書の手順を保存ダイアログまで通した結果も同じだった。手作業のパッチは無し。

```
保存直後: motherRef = implied(パーソロン1971 × スイートルナ)   母側7枠 = 全て master
盤面    : colored=[1,12,30,14,26]  count=5  シンボリルドルフ 血量28125
```

### 受け入れ基準5の記述が不足していた（指示書側の誤り）

基準5は「父側を積み上げて保存したとき `fatherRef` が implied になること」とだけ書いた。
これは**条件が足りない**。`★N薄め` の母は父側の牝馬枠 `"M"` であり、
そこに何も置かれていなければ母は盤面のどこにも存在しない。実測:

- 父側へ種牡馬だけを積み上げた盤面 → `fatherRef = null`（父側 unknown 枠 7/7 → 3/7 へ改善）。
  残る3枠（`"M"` `"MM"` `"MMM"`）は盤面から知りようがないので null が正しい
- 父側へ牝馬も置いた盤面（父側②パーソロン1971・父側③スイートルナ）
  → `fatherRef = implied(パーソロン × スイートルナ)`、父側 unknown 枠 **0/7**

つまり実装は母側と対称に正しく動いている。**基準の書き方が悪かった**ので、
正しくは「父側の牝馬枠が盤面から解決できるとき、`fatherRef` が implied になること」。
Codex の実装に手を入れる必要は無い。

### 積み残し（今回のスコープ外・2e による退行ではない）

**男系セルには暗黙の個体が復元されない。**

自家製種牡馬を4代目（cell7）へ置くと、その父は5代目 cell14 に来る。
保存レコードの `fatherRef` は今回 implied になったが、
盤面の cell14 は `descendants[0]` 由来の `{kind:"unknown"}` のままで、
クロス判定には参加しない。

28ef75e と 3ffe8f0 で結果が同一（`colored=[10,22,16]`、シンボリルドルフのクロスなし）なので、
**今回の変更による退行ではなく、以前からある同種の穴**である。
`resolveBoardRefs` は指示書どおり牝馬枠とルートにしか implied を作らない（男系には作らない）。

男系にも広げるかは仕様の判断が要る（男系セルは「その位置の individual」であって
父から一意に決まらないため、牝馬枠と同じ理屈がそのまま通るとは限らない）。
必要ならフェーズ2fとして別に立てる。

## 実装報告（Codex、2026-09-10）

### 実装内容

- `vue/logic/pedigree/board-refs.js`: 判定側の解決規則を移し、牝馬15枠とルートのrefを共通の手順で解決。入力セルは変更しない。男系祖先の暗黙個体化はしない。
- `vue/logic/inbreed/inbreed-detector.js`: 同じ側の解決結果を1回だけ取得し、牝馬出現とルート出現へ利用。判定・血量・表示規則は変更しない。
- `vue/logic/horses/saved-horse-builder.js`: 第5引数contextを追加。有効な既存refを優先し、父母・牝馬枠の欠損だけを補完。context/nodeTableなしではunknownも含めて従来値を保持。
- `vue/CombinationDialog.js`、`index.html`: resolverをpropで受け渡し、保存時にnodeTableとともに渡す。ヘルパのscriptは指定順に追加。
- `service-worker.js`: ヘルパをプリキャッシュへ追加し、キャッシュ名を `dabimas-factor-v20260910-01` に更新。
- `scripts/verify-p2d-common.cjs`、`scripts/verify-p2d-ui.html`: 新規ヘルパの読込と新実装の識別子検査に対応。ブラウザハーネスはHTTPキャッシュによる旧JS読込も避ける。
- `scripts/verify-p2e-refactor.cjs`: 変更前コミット `28ef75e0b800c62ed3d8eee27cca3eb249ad2593` との判定全体比較。
- `scripts/verify-p2e-saved.cjs`: 報告4、保存内容、後方互換、通常保存1,500組を実データで検証。
- `scripts/verify-p2e-ui.html`: 実際のVue保存ダイアログとIndexedDBで、母側・父側の保存から再配置まで検証。

### 検証結果

- **基準3（切り出しのみ）**: パート3実装前に `node scripts/verify-p2e-refactor.cjs` を実行。2dの報告・前フェーズ受入・通常盤面1,500組（例外あり/なし）・縮退経路・工程診断を含む6,037回で、変更前判定との戻り値全体が一致。
- **基準3（画面）**: 同じくパート3実装前に、`scripts/verify-p2d-ui.html` をポート8767で実行し成功。ServiceWorker登録0・Cache Storage 0・controllerなしを確認して開始。最初の試行ではHTTPキャッシュ由来の旧JSを識別子検査で検出したため、ハーネスのscript URLに検証用クエリを付けて再実行した。
- **基準1・2**: `node scripts/verify-p2e-saved.cjs` 成功。母はパーソロン1971×スイートルナのimplied、父はサンデーサイレンス1989のまま。保存後の盤面は色 `[1,12,30,14,26]`、count=5、dangerous=false、血量 `[28125,6250,6250]`、ルドルフの出現は `["F","MMMM"]`。
- **基準3の積み上げ盤面**: 保存前の盤面は色 `[1,16]`、count=7、dangerous=true、ルドルフ75000を維持。実際の未正規化ルートと同じく、テストでsexKindを補っていない。
- **基準4**: 固定seed `0x20260910` の通常盤面1,500組で、fatherRef/motherRef/mareRefs/maresが変更前保存とすべて一致。有効なcustom参照を優先するケースも成功。
- **基準5・6**: Node検証で父側implied保存、context省略・nodeTableなしの旧値維持、resolverなしでも保存成功を確認。
- **基準1・2・5の実保存**: `codex-powershell.ps1 dump-dom http://127.0.0.1:8767/scripts/verify-p2e-ui.html?verify=save2 1280 1000 60000` 成功。identityRefなしの「ワタシノヒンバ」から「☆ザサンデー」を保存し、IndexedDBから読んだレコードの母がimpliedであることを確認。父側も実際の「★１薄めトウカイテイオー」を保存し、fatherRefがimpliedであることを確認。⑤→④→③→②の順で再配置して報告4の全期待値と一致。画面エラー0件。
- 同じハーネスを指定の `screenshot` 経由で実行し、`tmp/p2e-ui.png` を目視確認。DOM結果は `tmp/p2e-ui-dom.txt`、切り出し段階の結果は `tmp/p2e-refactor-ui-dom.txt`。
- `node --check`: board-refs / saved-horse-builder / inbreed-detector / CombinationDialog / service-worker の全5ファイル成功。
- `python -m pytest tests/ -q`: 52 passed。
- `verify-index-exp .\index.html`: 成功。既定のindex.exp.htmlが存在しないため、backup/verifyにはindex.htmlを明示した。indexはbackup後にapply_patchのみで編集し、その都度verify成功。
- `git diff --check`: 成功。
- `code-review`: Standards・Specとも修正必須指摘0件。

### 判断・残事項

- 任意のパート4は実装していない。既存の保存レコードは変更しないため、該当する自家製馬は元の配合盤面から保存し直す必要がある。
- `docs/full-sibling-stacking-spec.md` のユーザー作業中の変更は編集・コミット対象に含めない。
- 対象外のレビュー所見: 保存されたimpliedの内部にcustom/editがあり、その深い祖先がimplied内部からしか参照されない共有ケースは後続確認候補。現在の共有収集はimplied内部を辿らない。今回のパート1〜3では共有方式を拡張していない。
- 配置パス定数はヘルパと判定側に残る。今回は指定どおり個体解決規則の共通化に限定し、定数APIの追加は行っていない。
