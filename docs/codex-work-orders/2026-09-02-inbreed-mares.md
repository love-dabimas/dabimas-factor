# 作業指示書: 牝馬15枠をインブリード判定へ投入する（段階4）

- status: 依頼中
- 作成日: 2026-09-02
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 設計資料: `docs/pedigree-master-integration-design.md` §4.6 / §6.4 / §7.1 / §8.5 / §9.3 / §12.2
- アルゴリズム仕様書: `dabimas_pedigree_editor_algorithm_spec.md` §9 / §12 / §17.1
- 前提: 段階3（`2026-09-01-inbreed-node-based.md`）が完了・検収済み
- **稼働影響: この移行で最も大きい。** 下記の実測を参照

## 背景と目的

段階2 で `selected[0].mareNodeIds` / `selected[16].mareNodeIds`（各 15 要素）が盤面に載り、段階3 で `nodeId` ベースのクロス判定が動き出した。**牝馬15枠はまだ判定に一切参加していない。** 段階4 で参加させる。

血統表は片側 31 ノード（ルート1 + 男系15 + 牝馬15）で、**牝馬は表示行を持たない**。したがって「画面には出ないがクロスとして成立する」ケースが生まれる。設計 §7.1 はこれを仕様として許容している。

### 実測した影響（現行データ・種牡馬2415 × 特殊牝馬499 から 4000 組をサンプル）

| | クロス群の平均 |
|---|---:|
| 男系16枠のみ（段階3 相当） | 1.07 |
| 牝馬15枠を追加（段階4） | **1.47** |

増分の分布:

```text
+0: 3074 (76.9%)   +1: 631   +2: 82   +3: 145   +4: 29   +5: 6   +6: 6   +7: 21   +8: 6
1 件以上増えた組合せ: 926 / 4000 = 23.2%
```

**約 4 分の 1 の配合で新しいクロスが検出される。** 設計資料 §2.5 の見積り（1.06 → 1.47・約23%）と一致した。目に見える挙動変更なので、段階3 とは必ず別リリースにすること（設計 §13）。

### この段階でやらないこと（理由つき）

| 項目 | 段階 | 理由 |
|---|---|---|
| 同一家系枝の重複除外（仕様書 §11） | **段階4b（別指示書）** | 下記 |
| 因子カウントの `nodeId` 化 | 段階5 | |
| 配合理論の変更 | 段階6 | |
| 血量・危険な配合の画面表示 | 未定 | 設計 §14 の未決事項2 |

**§11 を段階4b へ分ける根拠。** §11 の枝除外は牝馬ノードが揃って初めて実装できる（段階3 の指示書で説明済み）ので、実装可能になるのはこの段階からである。しかし §11 は**クロスを減らす方向**の規則で、本作業は**増やす方向**の変更である。同時に入れると「牝馬追加で +926 組のはずが +700 組になった。§11 が効きすぎたのか、牝馬の投入が漏れているのか」が切り分けられない。上の実測値を検収の物差しとして使うため、まず増やす側だけを入れる。

## 実装方針

### 変更対象ファイル

- `vue/logic/inbreed/inbreed-detector.js` — 牝馬出現の投入と `count` の式。**主対象**
- `vue/logic/horses/saved-horse-builder.js` — `MARE_SOURCE_IDS` と `mares` の組み立て
- `vue/app/methods/horse-loading.js` — 自家製馬 detail の `mares` 引き回しと `backfillCustomHorse()`

### 1. 牝馬出現リストを作る

各側のルートセルが持つ `mareNodeIds`（15 要素・`null` 混在可）から擬似出現を作る。**セルではないので `index` を持たない。**

```js
// MARE_PATHS（設計 §4.6）に対応する世代。generation = 1 + path.length
// ["M","FM","MM","FFM","FMM","MFM","MMM","FFFM","FFMM","FMFM","FMMM","MFFM","MFMM","MMFM","MMMM"]
const MARE_GENERATIONS = [2, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5];

const buildMareOccurrences = (rootCell, side) => {
  const ids = Array.isArray(rootCell?.mareNodeIds) ? rootCell.mareNodeIds : [];
  const out = [];
  ids.forEach((nodeId, slot) => {
    if (typeof nodeId !== "string") {
      return;                      // 欠損枠は判定に参加させない（設計 §6.7 ルール2）
    }
    out.push({
      nodeId,
      side,                        // "stallion" / "broodmare"
      generation: MARE_GENERATIONS[slot],
      index: null,                 // 表示行を持たない
      mareSlot: slot,
    });
  });
  return out;
};
```

- **牝馬枠は名前を持たない。** `nodeId` が無ければ判定に参加させない。名前ベースへ縮退する手段が無いため（設計 §6.7 ルール2）。
- 種牡馬側は `selected[0].mareNodeIds`、特殊牝馬側は `selected[16].mareNodeIds` を使う。他のセルの `mareNodeIds` は見ない（載っていない）。

### 2. `crosses` へ合流させる（既存の表示パイプラインには触らない）

段階3 で `crosses` は「既存フローの認定ペアを種にして関係を推移的に連結し、32 セルの全出現を加える」独立パスとして実装されている。**牝馬の投入もこのパスの中だけで行う。** 既存の `crossCandidates` / `recognizedCrosses` / 祖先除外 / 例外処理には手を入れないこと。

やること:

1. 既存グループの拡張候補に牝馬出現を加える（`allOccurrences` に牝馬を足す）。
2. **既存グループに属さない新しいクロスも作る。** 種牡馬側の出現（男系セル＋牝馬枠）× 特殊牝馬側の出現（男系セル＋牝馬枠）を突き合わせ、`isExactSameNode` または `isFullSiblingByMaster` が成立する組を新しいグループの種にする。牝馬が絡むクロスは既存パイプラインが一切知らないので、ここで作らないと永久に検出されない。
3. 片側内どうしの重複はクロスにしない（設計 §7.1 手順2）。ただし**グループが成立した後、同じ側の追加出現を血量計算のために取り込むのは従来どおり**（仕様書 §12.1「同一クロスグループの全出現位置を加算」）。

牝馬出現には `name` が無いので、`isExactSameNode` の名前フォールバックに落ちてはいけない。牝馬が絡む比較は必ず `nodeId` があることを確認してから行うこと。

```js
const isMareOccurrence = (o) => o && o.index === null;
const canCompare = (a, b) =>
  (!isMareOccurrence(a) || typeof a.nodeId === "string") &&
  (!isMareOccurrence(b) || typeof b.nodeId === "string");
```

`crosses[].occurrences` の要素は段階3 の形のまま、牝馬は `index: null` で入る。`hasMareOccurrence` を**実際に牝馬出現を含むかで立てる**（段階3 では常に `false` だった）。

### 3. 牝馬クロスは画面に出さない（確定）

牝馬は表示行を持たないのでセルを着色できない。**牝馬クロスは画面に出さない。**

- `inbreedColorIndexes` に牝馬の出現を入れない（着色対象は男系セルのみ）。
- `sameNameGroups` / `siblingGroups` に牝馬ノードを入れない。これらは表示用の集合で、`inbreed-ui.js` がヘッダーボタンの非活性化（`isInbreedButtonClicked`）に使っているため、**行を持たない要素を混ぜると壊れる**。
- 牝馬の出現は新設の `crosses[].occurrences` にのみ保持する。血量・危険な配合・因子カウント（段階5）・至高判定（段階7）はそちらを見る。

この結果、**画面には出ないが因子数だけが増える**ケースが生じる（牝馬の全兄妹が男系ノードを引き込んだとき）。仕様として許容する。

### 4. `count` の式を変える

現行 `count` は `inbreedColorIndexes.length`（＝着色されたセル数）で、クロス本数ではない。`dispInbreed()` はこれが `> 0` かどうかだけを見て因子カウントを走らせる。

**牝馬だけで成立するクロスは着色セルを持たない**ため、素直に実装すると `count` が 0 のままになり因子カウントが走らない。

```js
// 表示行を持たないクロス群（着色セルを 1 つも含まないグループ）を数に含める。
// これを入れないと、牝馬だけで成立したクロスで因子カウントが走らない。
const colored = new Set(inbreedColorIndexes);
const hiddenCrossCount = crosses.filter(
  (cross) => !cross.occurrences.some((o) => o.index !== null && colored.has(o.index))
).length;
const count = inbreedColorIndexes.length + hiddenCrossCount;
```

**着色の挙動は変えない。** 変わるのは `count` の値だけ。

### 5. `saved-horse-builder.js` — 自家製馬に `mares[15]` を持たせる

自家製馬は「現在の盤面から生まれた子」として保存される。既存の `DESCENDANT_CELL_IDS` が男系15枠を盤面のセルから組み立てているのと同じ方法で、牝馬15枠も組み立てる。

```js
// [どちら側, その側の mareNodeIds のインデックス]。null は「その側のルート自身」。
var MARE_SOURCE_IDS = [
  ["dam",  null], ["sire", 0], ["dam",  0], ["sire", 1], ["sire", 2],
  ["dam",  1],    ["dam",  2], ["sire", 3], ["sire", 4], ["sire", 5],
  ["sire", 6],    ["dam",  3], ["dam",  4], ["dam",  5], ["dam",  6],
];
```

対応表（設計 §8.5）:

```text
mares[ 0] M     <- cells[16].nodeId            （特殊牝馬本人）
mares[ 1] FM    <- cells[0].mareNodeIds[0]
mares[ 2] MM    <- cells[16].mareNodeIds[0]
mares[ 3] FFM   <- cells[0].mareNodeIds[1]
mares[ 4] FMM   <- cells[0].mareNodeIds[2]
mares[ 5] MFM   <- cells[16].mareNodeIds[1]
mares[ 6] MMM   <- cells[16].mareNodeIds[2]
mares[ 7] FFFM  <- cells[0].mareNodeIds[3]
mares[ 8] FFMM  <- cells[0].mareNodeIds[4]
mares[ 9] FMFM  <- cells[0].mareNodeIds[5]
mares[10] FMMM  <- cells[0].mareNodeIds[6]
mares[11] MFFM  <- cells[16].mareNodeIds[3]
mares[12] MFMM  <- cells[16].mareNodeIds[4]
mares[13] MMFM  <- cells[16].mareNodeIds[5]
mares[14] MMMM  <- cells[16].mareNodeIds[6]
```

**この対応表は検算済みである。** 同じ翻訳規則（子から見た path `p` を、`p[0]==="F"` なら種牡馬側・`"M"` なら特殊牝馬側の起点へ移し、残り `p[1:]` をその側の枠として引く）を**男系15枠へ適用すると、既存の `DESCENDANT_CELL_IDS = [0,1,2,4,5,3,6,7,17,18,20,21,19,22,23]` が 15 要素すべて一致して再現される**。規則が正しいことの裏付けとして扱ってよい。

実装要件:

- `buildSavedHorseRecord()` の戻り値へ `mares`（15 要素）を追加する。
- **欠損は `null` のまま保存する。** 男系のように「セルが無ければ例外」にしない。牝馬枠は master 側に無いことが普通にある（現行 `json/` で延べ 43710 枠中 869 枠＝**2.0%** が `null`）。
- `cells[0].mareNodeIds` / `cells[16].mareNodeIds` が `null` の場合、その側由来の枠はすべて `null` になる。それでも保存は成功させる。
- `descendants[]` に `nodeId` / `pedigreeId` を持たせる。セル（`cells[n].nodeId`）から写すだけでよく、名前解決に頼らない。
- 既存の `descendants` 構築・`ownFactors` の右詰め・バッジフィールドの写しには手を入れない。

`buildSavedHorseRecord()` は `cells = JSON.parse(localStorage.dabimasFactor)` を受け取っている。`mareNodeIds` は `stripHorseForStorage()` で落とされないので（段階2 で確認済み）、**呼び出し側の変更なしに参照できる**。

### 6. `horse-loading.js` — 自家製馬の `mares` を配合表へ戻す

段階2 では自家製馬経路が `hydrateHorseWithDetail(horse, descendants, null)` と `null` 固定だった。`detail.mares` を渡すように変える。

```js
return this.hydrateHorseWithDetail(
  horse,
  this.restoreDescendantBadgeFields(detail.descendants),
  detail.mares
);
```

### 7. `backfillCustomHorse()`（設計 §9.3）

この変更より前に保存された自家製馬は `mares` を持たない。`loadCustomHorseDetails()` の読み込み後に 1 度だけ補完する。

```text
backfillCustomHorse(record):
  if record.mares != null: return                    // 冪等
  config = configs.find(c => c.customHorseId === record.id)
  if !config: return                                 // 紐づく config が無ければ諦める
  cells = JSON.parse(config.configData.dabimasFactor)
  d0  = await ensureHorseDetail(cells[0])            // 種牡馬側の mares
  d16 = await ensureHorseDetail(cells[16])           // 特殊牝馬側の mares
  record.mares = MARE_SOURCE_IDS.map(([side, idx]) =>
      idx === null ? (cells[16].nodeId ?? null)
                   : ((side === "sire" ? d0.mares : d16.mares) ?? [])[idx] ?? null)
  record.descendants[i].nodeId = cells[DESCENDANT_CELL_IDS[i]].nodeId ?? null
  save(record)
```

要件:

- **冪等**（`mares` が既にあれば何もしない）。
- `config` が見つからない・`cells[0]` が自家製馬・detail が取れない場合は `mares` を `null` のままにして続行する。判定は縮退モードで動く（設計 §6.7）。
- **UI は出さない。** `loadCustomHorseDetails()` はもともと復元チェーンを待たせない並行処理なので、体感に出さないこと。
- 失敗件数は `console.warn` に出す。
- `MARE_SOURCE_IDS` / `DESCENDANT_CELL_IDS` を `bootstrap.js` や `horse-loading.js` へ**書き写さない**。`saved-horse-builder.js` の末尾で公開して参照すること。同じ配列が 2 か所にあると必ずずれる。

```js
// vue/logic/horses/saved-horse-builder.js の末尾（buildSavedHorseRecord の公開と並べる）
window.Dabimas.logic.horses.DESCENDANT_CELL_IDS = DESCENDANT_CELL_IDS;
window.Dabimas.logic.horses.MARE_SOURCE_IDS = MARE_SOURCE_IDS;
```

## 制約

- `AGENTS.md` の Safety Rules に従うこと。この段階で `index.html` を触る必要は無いはず。
- **表示行を 32 から増やさない。** `row-configs.js` / `pedigree-indexes.js` / `pedigree-row.js` / `factorCd[32][3]` / `dispColor[32]` / `isInbreedButtonClicked[32]` / `inbreedList[32]` / `category[32]` / `inputed[32]` には一切触らない。
- **既存の戻り値キーを削らない。** 変えてよいのは `count` の値と `hasMareOccurrence` だけ。
- **`sameNameGroups` / `siblingGroups` / `inbreedColorIndexes` に牝馬を入れない。**
- 既存の `crossCandidates` / `recognizedCrosses` / 祖先除外 / 例外処理の流れを変えない。牝馬の投入は `crosses` を組み立てるパスの中だけで行う。
- `vue/logic/inbreed/inbreed-counts.js`（段階5）と `vue/logic/theory/compatibility.js`（段階6）を変更しない。
- `nodeId` を数値化しない。`nodeId` から `pedigreeId` を切り出さない。
- 保存形式のバージョンを上げない。`mares` の追加は前方・後方とも互換（設計 §8.4）。

## スコープ外（やらないこと）

- 同一家系枝の重複除外／仕様書 §11（段階4b）
- 因子カウントの `nodeId` 化（段階5）
- 配合理論（段階6）・至高の条件追加（段階7）
- 血量・危険な配合の画面表示（設計 §14 の未決事項2）
- 牝馬クロスの着色・表示行の追加
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

1. `node scripts/verify-storage-boot-order.cjs` / `verify-horse-badges.cjs` / `verify-horse-candidate-lists.cjs` がすべて成功する。
2. `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html` が `[verify] OK` を返す。
3. `python -m pytest tests/ -q` が全件成功する。
4. **縮退の確認**: `nodeTable` を渡さない呼び出しで、既存 6 キーが段階3 の結果と完全一致する。**確認盤面には `nodeId` と `mareNodeIds` を持つセルを必ず含めること**（段階3 の検収で、`nodeId` を持たない盤面ばかりで検証して縮退の不具合を見逃した実績がある）。
5. `mareNodeIds` が `null` の盤面で、既存 6 キーが段階3 の結果と完全一致する（TC-M03）。
6. 設計 §12.2 の追加ケース。
   - **TC-M01**: 特殊牝馬側の 5 代目牝馬枠に「父キングマンボ・母サドラーズギャル」の馬が入り、種牡馬側 3 代目にエルコンドルパサーがいる盤面 → 全兄妹クロスが成立し、血量 12500 + 3125 = **15625**。
     エルコンドルパサー（`0000299155`）の父母がマスター上で キングマンボ（`0000347989`）× サドラーズギャル（`0000397191`）であることは確認済みなので、この 2 頭を父母に持つ牝馬枠は §3 の規則で全兄妹になる。
   - **TC-M02**: 牝馬枠だけで成立するクロス → `count > 0` になり因子カウントが走る。着色セルは増えない。
   - **TC-M04**: 自家製馬を保存 → ルートに置く → `mares[15]` が §5 の対応表どおりに埋まり、牝馬クロスが成立する。
   - **TC-M05**: 牝馬の全兄妹が男系ノードを引き込む → その男系ノードが `crosses[].occurrences` に入る（着色はされない）。
   - **TC-M06**: 入れ子の自家製馬（ルートが自家製馬）→ 牝馬枠が再帰的に伝播する。
   - **TC-M07**: 旧形式で保存した自家製馬 → `backfillCustomHorse()` で `mares` が埋まる。config が無ければ `null` のまま縮退する。
7. `mares` の対応表が正しいことを、**男系15枠での再現**で示す。同じ翻訳規則を `SIRE_PATHS` へ適用すると `DESCENDANT_CELL_IDS` が 15 要素すべて一致することをテストで固定する。
8. **クロス群の増加が実測値と整合する。** 実データからランダムに 1000 組以上の種牡馬 × 特殊牝馬を取り、牝馬15枠あり／なしでクロス群数を比較し、平均が **1.07 → 1.47 前後**、**1 件以上増える組合せが 23% 前後**になることを確認する。大きく外れる場合は投入漏れか過剰検出なので、原因を突き止めてから完了とすること。
9. **`tests/fixtures/split-baseline/*.json` は手書きのブラウザ スナップショットで、自動再生成する仕組みが無い。** `git diff` が空でも検証にならない。README の基準組み合わせ（種牡馬 `ダッシャーゴーゴー` × 繁殖牝馬 `シル`）を Node 上で再現し、牝馬15枠を入れて `count` / `sameNameGroups` / `siblingGroups` / `inbreedColorIndexes` がどう変わるかを完了報告に記載すること。変わる場合はブラウザで再取得してベースラインを更新し、差分の中身を 1 件ずつ説明する。
10. `git status` で変更されているのが §「変更対象ファイル」の 3 ファイル（＋意図的に更新したベースライン）だけである。

基準 4〜8 は確認用の一時 `.cjs` を書いて `node` で検証してよい（コミットには含めず、完了報告に内容を残すこと）。

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

- `vue/logic/inbreed/inbreed-detector.js`: 両側15枠の牝馬擬似出現を nodeId でクロス群へ合流し、牝馬を含む新規グループ、血量、`hasMareOccurrence`、非表示クロスを含む `count` を実装した。表示用3集合には牝馬を入れていない。
- `vue/logic/horses/saved-horse-builder.js`: `MARE_SOURCE_IDS` と既存 `DESCENDANT_CELL_IDS` を公開し、自家製馬へ `mares[15]` および descendants の `nodeId` / `pedigreeId` を保存するようにした。
- `vue/app/methods/horse-loading.js`: 自家製馬 detail の `mares` を水和し、旧形式レコードを保存元config・現行summary/detailから非同期補完・再保存する `backfillCustomHorse()` を追加した。
- `docs/codex-work-orders/2026-09-02-inbreed-mares.md`: 本完了報告を記入した（実装対象3ファイルには含めない）。

### 設計判断

- `nodeTable` が無い場合は牝馬擬似出現自体を作らない。牝馬は名前を持たずmaster全兄妹も引けないためで、基準4の段階3完全縮退も保証できる。
- 新規クロスの種は少なくとも片方が牝馬出現のペアに限定した。男系×男系は既存の祖先・例外除外後の認定結果を維持し、段階4bの枝除外と混ぜないためである。
- `loadSavedHorseSummaries()` は既存の `loadCustomHorseDetails()` を通す形へ統一し、旧形式補完は候補一覧の復元を待たせないバックグラウンド処理にした。失敗レコード数は `console.warn` へ出す。
- 段階2以前のconfigには `nodeId` / `pedigreeId` / `mareNodeIds` が無いため、保存元2頭の現行summary/detailを取得し、既存の `setDataForPedigree()` で32セルを再構成してからIDを補完する。セル対応表を別に複製せず、現行の血統展開規則を単一の根拠にした。

### 実行した検証と結果

- 基準1: `verify-storage-boot-order.cjs`、`verify-horse-badges.cjs`、`verify-horse-candidate-lists.cjs` → すべて `OK`。
- 基準2: `verify-index-exp .\index.html` → `[verify] OK`。
- 基準3: `python -m pytest tests/ -q` → `52 passed`。
- 基準4・5: 一時 `tmp/verify-inbreed-mares.cjs` で nodeId / mareNodeIds を持つ盤面の nodeTable 省略時、および `mareNodeIds: null` の盤面を固定点 `4ab667a` の段階3実装と比較し、既存6キーの完全一致を確認した。
- 基準6: TC-M01=`15625`、TC-M02の牝馬のみクロスで `count=1`・着色なし、TC-M04の保存→ルート再配置、TC-M05の男系兄弟取り込み・非着色、TC-M06の入れ子伝播を確認した。TC-M07はレコードだけでなくconfigからも全IDを除いた段階2以前の形で、現行summary/detailからの再構成による補完、再実行時の冪等性、configなし縮退を確認した。
- 基準7: `SIRE_PATHS` を親側へ翻訳した15セルが、公開した `DESCENDANT_CELL_IDS` と全件一致した。
- 基準8: 一時 `tmp/measure-inbreed-mares.cjs` で固定seedのランダム4000組を測定した。詳細は次節。
- 基準9: 同スクリプトで `ダッシャーゴーゴー × シル` をsummary/detailから32セルへ展開して比較した。詳細は次節。
- 基準10: 実装差分は指定3ファイル、これに本完了報告1ファイルを加えた。split baselineは更新していない。
- 追加確認: 変更3 JS の `node --check`、`node tmp/verify-inbreed-mares.cjs`、`git diff --check` はすべて成功した。

### クロス群増加の実測（基準8）

種牡馬2415頭×特殊牝馬499頭から、固定seed `0x20260902` で重複なし4000組を抽出した。

- masterの完全同一・全兄妹を直接グループ化した値: **1.0465 → 1.4445**（指示値1.07→1.47前後と整合）。
- 現行 `judgeInbreed().crosses` の値: **0.73825 → 1.13625**。両方が直接値より約0.31低いのは、段階3から維持している既存の祖先・例外除外後の `recognizedCrosses` を男系グループの種にするため。牝馬追加による増分はどちらも **+0.398** で一致した。
- 増分分布: `+0:3095, +1:585, +2:99, +3:164, +4:29, +5:4, +6:0, +7:16, +8:5, +9:2, +10:0, +11:1`。
- 1件以上増加: **905 / 4000 = 22.625%**（指示値23%前後と整合）。

### ベースライン盤面の変化（基準9）

`ダッシャーゴーゴー × シル` は牝馬15枠の投入前後で変化なし。

- `count`: `2 → 2`
- `sameNameGroups`: `[[バックパサー, バックパサー]]` のまま
- `siblingGroups`: `[]` のまま
- `inbreedColorIndexes`: `[13, 17]` のまま
- `crosses.length`: `1 → 1`

ブラウザsnapshotの更新は不要で、`tests/fixtures/split-baseline/` に差分なし。

### 残課題・気づき

指示書の平均1.07→1.47はmaster関係を直接グループ化した値とは整合するが、段階3の実際の `crosses` は既存祖先除外後の認定ペアを種にするため0.738→1.136となる。増分と増加率は一致しており牝馬投入漏れではない。男系側の約0.31差を解消するには既存の祖先除外との関係を変える必要があり、クロスを減らす規則を扱う段階4bの検討事項として本作業では変更していない。
