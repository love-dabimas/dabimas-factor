# 作業指示書: 同一家系枝の重複除外（仕様書 §11）を入れる（段階4b）

- status: 依頼中
- 作成日: 2026-09-02
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- アルゴリズム仕様書: `dabimas_pedigree_editor_algorithm_spec.md` §11 / §12
- 設計資料: `docs/pedigree-master-integration-design.md` §7.1
- 前提: 段階4（`2026-09-02-inbreed-mares.md`）が完了・検収済み
- **稼働影響あり:** `crosses` / 血量 / 危険な配合が変わる。血統表の着色は変わらない

## 背景と目的

仕様書 §11 はこう書いている。

> 一致候補A/Bについて、その経路ノード同士が「完全同一 OR 全兄妹」なら、その組合せを独立したクロスとして採用しない。

「経路ノード」＝ `branchParentNodeId` は、**その祖先へ到達する直前のノード**、つまり血統表の path でいえば 1 文字短い path のノードである。祖先の「親」ではなく「子」側（ルートに近い方）を指す。

```text
祖先が path "FMF"（父の母の父）にいる → 枝親は path "FM"（父の母）
祖先が path "M"  （母）              → 枝親は path ""  （本人）
祖先が path ""   （本人）            → 枝親なし
```

**意味するところは「最も近い共通祖先だけを数える」である。** ある馬 X がクロスしていれば、X の祖先は自動的に全員クロスする。それを別々のクロスとして数えるのは二重計上なので消す。血統表記の常識（3×4 のノーザンダンサーがあるとき、その父ネアルコ 4×5 を別に数えない）と同じ規則である。

### 現行の実装との関係

現行の `addExcludedAncestorPairs()` は「認定したクロスの祖先ペアを除外する」処理で、**§11 と同じ仕事を場当たりにやっている**。ただし男系セルの index でしか動かないので、牝馬15枠が絡む重複を一切消せない。

段階3 の検収から申し送っている「`crosses` の平均が直接グループ化より約 0.31 低い」ずれは、この `addExcludedAncestorPairs` の影響が `crosses` に漏れているために起きている。**段階4b でこのずれを解消する。**

### 31 ノードは完全二分木である（実装の前提）

片側のノードは ルート 1 + 男系15 + 牝馬15 = **31**。長さ 0〜4 の全 path（1+2+4+8+16 = 31）とちょうど一致することを確認済みである。

```text
長さ0: ""                                    → ルートセル
長さ1: F(男系[0]) / M(牝馬[0])
長さ2: FF,MF(男系) / FM,MM(牝馬)
長さ3: FFF,FMF,MFF,MMF(男系) / FFM,FMM,MFM,MMM(牝馬)
長さ4: F で終わる8つ(男系) / M で終わる8つ(牝馬)
```

したがって **path をキーにした Map を作れば、どのノードの枝親も必ず同じ側の 31 ノードの中に存在する**（ルートを除く）。特別扱いは要らない。

**段階3 で §11 を見送った理由もこれである。** 牝馬15枠が無いと、男系ノードの枝親の半分（`FM` や `M` など M で終わる path）が引けず、§11 が半分しか効かない。段階4 で牝馬が入って初めて正しく実装できる。

### 実測した影響（現行データ・2000 組サンプル）

| | クロス群の平均 |
|---|---:|
| 直接グループ化・男系のみ | 1.075 |
| 　+ §11 | 0.831 |
| 直接グループ化・牝馬あり | 1.472 |
| 　**+ §11（＝この段階の到達点）** | **0.810** |
| 現行実装（既存の祖先除外 + 牝馬） | 1.136 |

- クロスペア延べ 3305 のうち **1442 件（43.6%）** が §11 で除外される。
- 除外理由の内訳: 枝親が完全同一 1382 / 枝親が全兄妹 60。
- クロス群が実際に減る盤面: **407 / 2000（20.3%）**。

**牝馬15枠を入れると §11 の除外率が 23.2% → 43.6% へ跳ね上がる**（男系のみだと枝親が引けない枝が多いため）。牝馬を入れたあとにこそ意味がある規則である。

### 具体例（ヴァーミリアン × サドラーズギャル）

サドラーズギャルはヴァーミリアンの父エルコンドルパサーの母。彼女自身が 1×3 でクロスする盤面。

```text
採用  サドラーズギャル (種FM × 牝本人)    枝親: エルコンドルパサー / —（ルートは枝親なし）
除外  サドラーズウェルズ (種FMF × 牝F)    枝親: サドラーズギャル / サドラーズギャル
除外  Glenveagh        (種FMM × 牝M)     枝親: サドラーズギャル / サドラーズギャル
除外  ノーザンダンサー  (種FMFF × 牝FF)   枝親: サドラーズウェルズ / サドラーズウェルズ
除外  シアトルスルー    (種FMMF × 牝MF)   枝親: Glenveagh / Glenveagh
除外  Fairy Bridge     (種FMFM × 牝FM)   枝親: サドラーズウェルズ / サドラーズウェルズ
除外  Lisadell         (種FMMM × 牝MM)   枝親: Glenveagh / Glenveagh
採用  ノーザンダンサー  (種MMFF × 牝FF)   枝親: ノーザンテースト / サドラーズウェルズ
採用  ヘイルトゥリーズン (種MFFF × 牝FMFF) 枝親: ヘイロー / Bold Reason
採用  Lisadell         (種FMMM × 牝FMM)  枝親: Glenveagh / Fairy Bridge
```

サドラーズギャル本人のクロスが立っているので、その配下の祖先クロスは全部消える。**同じ祖先でも別の枝から合流したもの（ノーザンダンサーの 種MMFF × 牝FF、Lisadell の 種FMMM × 牝FMM）は残る。** これが §11 の狙いどおりの挙動である。

## 実装方針

### 変更対象ファイル

- `vue/logic/inbreed/inbreed-detector.js` のみ

### 1. path つきの出現リストを作る

現在は男系セルを `stallionsArray` / `broodmaresArray`（index ベース）で、牝馬を `buildMareOccurrences()` で別々に作っている。**`crosses` を組み立てるパスのために、片側 31 ノードを path キーで引ける形に整える。**

```js
const SIRE_PATHS = ["F","FF","FFF","FFFF","FFMF","FMF","FMFF","FMMF",
                    "MF","MFF","MFFF","MFMF","MMF","MMFF","MMMF"];
const MARE_PATHS = ["M","FM","MM","FFM","FMM","MFM","MMM","FFFM",
                    "FFMM","FMFM","FMMM","MFFM","MFMM","MMFM","MMMM"];
// 男系セルの表示 index。SIRE_PATHS[i] のセルは side*16 + DESCENDANT_SLOTS[i]
const DESCENDANT_SLOTS = [1, 2, 4, 8, 9, 5, 10, 11, 3, 6, 12, 13, 7, 14, 15];
```

`DESCENDANT_SLOTS` は `vue/app/methods/bootstrap.js` に同じ配列がある。**書き写さず、どちらかを公開して 1 か所にすること**（`window.Dabimas.logic.pedigree` へ出すのが素直）。同じ配列が 2 か所にあると必ずずれる。

各出現に `path` と `branchParentNodeId` を持たせる。

```js
// side ごとに path -> occurrence の Map を作ってから枝親を解決する
const byPath = new Map();          // "" / "F" / "FM" / ...
// ... ルート・男系15・牝馬15 を byPath へ登録 ...
byPath.forEach((occurrence, p) => {
  occurrence.branchParentNodeId =
    p.length > 0 ? (byPath.get(p.slice(0, -1))?.nodeId ?? null) : null;
});
```

**ルート（path `""`）の枝親は `null`。** 後述のとおり、枝親が片方でも無いペアは除外しない。

### 2. ペア判定に §11 を入れる

```js
// 枝親どうしが完全同一 or 全兄妹なら、そのペアは独立したクロスとして採用しない。
// 上位の祖先が既にクロスしているので、その配下は同じ家系枝の重複である。
const isSameBranch = (a, b) => {
  const pa = a?.branchParentNodeId;
  const pb = b?.branchParentNodeId;
  if (!pa || !pb) {
    return false;          // 片方でも枝親が無い（ルート）なら除外しない
  }
  if (pa === pb) {
    return true;
  }
  return isFullSiblingByMasterNodeIds(pa, pb);
};
```

`isFullSiblingByMasterNodeIds(nodeIdA, nodeIdB)` は既存の `isFullSiblingByMaster()` を nodeId 文字列 2 つで呼べる形に切り出したもの。**枝親はセルオブジェクトではなく nodeId しか持たないので、名前フォールバックには落とさない。** `nodeTable` が無ければ `pa === pb` の判定だけ効かせ、全兄妹判定は行わない。

**`isSameBranch` が真のペアは、グループの種にも、既存グループへの合流にも使わない。**

### 3. `crosses` を既存の祖先除外から切り離す

段階3・4 では `crosses` の男系グループを「既存フローの `recognizedCrosses`（＝ `addExcludedAncestorPairs` 通過後）」から種にしていた。これが実測 0.31 のずれの原因である。

**段階4b では、`crosses` を 31 ノード × 31 ノードの突き合わせから直接組み立てる。** 手順:

1. 種牡馬側 31 出現 × 特殊牝馬側 31 出現を総当たりする。
2. `isExactSameNode` または `isFullSiblingByMaster` が成立するペアを候補にする。
3. `isSameBranch` が真のペアを捨てる（§11）。
4. 残ったペアを推移的に連結してグループにする。
5. グループが立ったあと、同じ側の追加出現を血量計算のために取り込む（仕様書 §12.1「同一クロスグループの全出現位置を加算」）。従来どおり。

**片側内どうしはクロスの種にしない**（設計 §7.1 手順2）。これも従来どおり。

**`recognizedCrosses` / `addExcludedAncestorPairs` / 例外処理そのものは削除しない。** 表示用の 3 集合（`sameNameGroups` / `siblingGroups` / `inbreedColorIndexes`）は引き続きそちらが作る。触らないこと。

### 4. 変わるもの・変わらないもの

| | 段階4b で |
|---|---|
| `crosses` / `bloodVolume` / `dangerous` / `count` | **変わる** |
| `sameNameGroups` / `siblingGroups` / `inbreedColorIndexes`（＝血統表の着色） | **変わらない** |
| 右上の配合理論（`theory_08` 含む） | `dangerous` 経由で**変わりうる** |

`count` は段階4 の式（`inbreedColorIndexes.length + 表示行を持たないクロス群の数`）のまま。`crosses` が減るので第 2 項が減る。

### 5. 表示との乖離について（この段階では直さない）

§11 を入れると、上の例のサドラーズウェルズ（種FMF × 牝F）のように「**血統表では着色されているのに `crosses` には無い**」クロスが生じる。着色は既存パイプラインが作っており、それは牝馬枠を知らないので枝親をたどれないためである。

**この段階では放置してよい。** 表示を `crosses` 由来へ寄せる作業（着色が減る＝ユーザーに見える大きな変更）は段階4c として別に切り出す。完了報告には、乖離が起きた盤面の例を 1 つ以上記録すること。

## 制約

- `AGENTS.md` の Safety Rules に従うこと。この段階で `index.html` を触る必要は無いはず。
- **表示用の 3 集合と着色ロジックを変えない。** `recognizedCrosses` を作る既存フロー（`crossCandidates` / 祖先除外 / 例外処理 / グループ化）には手を入れない。
- **既存の戻り値キーを削らない。**
- **表示行を 32 から増やさない。**
- `DESCENDANT_SLOTS` を新しく書き写さない（§1）。
- 枝親の比較で名前フォールバックへ落ちない。枝親は nodeId しか持たない。
- `nodeTable` が無いときは段階4 と完全に同じ結果を返すこと（§11 の全兄妹判定は `nodeTable` を要するため、`nodeTable` 不在時は §11 自体を無効化してよい）。
- `vue/logic/inbreed/inbreed-counts.js`（段階5）と `vue/logic/theory/compatibility.js`（段階6）を変更しない。

## スコープ外（やらないこと）

- 表示（着色・`sameNameGroups` / `siblingGroups`）を `crosses` 由来へ寄せる作業（段階4c）
- `addExcludedAncestorPairs()` の削除・置き換え
- 因子カウントの `nodeId` 化（段階5）、配合理論（段階6）、至高（段階7）
- 血量の画面表示（危険な配合の表示は実装済み。血量の数値表示は別途）
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

1. `node scripts/verify-storage-boot-order.cjs` / `verify-horse-badges.cjs` / `verify-horse-candidate-lists.cjs` がすべて成功する。
2. `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html` が `[verify] OK` を返す。
3. `python -m pytest tests/ -q` が全件成功する。
4. **`nodeTable` を渡さない呼び出しで、戻り値が段階4（`2f0f994` 以降の HEAD）と完全一致する。** 確認盤面には `nodeId` と `mareNodeIds` を持つ実データの盤面を 3 つ以上含めること。
5. **表示用 3 集合が段階4 と完全一致する。** `nodeTable` を渡した場合も含め、`sameNameGroups` / `siblingGroups` / `inbreedColorIndexes` は 1 件も変わらない。実データの盤面 20 件以上で確認すること。
6. **31 ノードが長さ 0〜4 の全 path を過不足なく覆うことをテストで固定する。** `["", ...SIRE_PATHS, ...MARE_PATHS]` が完全二分木の 31 path と集合として一致すること。
7. 枝親の解決が正しいこと。`SIRE_PATHS[i]` / `MARE_PATHS[i]` それぞれについて、枝親の path が 1 文字短い path になっていることをテストで固定する。ルートの枝親は `null`。
8. **ヴァーミリアン × サドラーズギャル（種牡馬は通常版）で、§背景の「具体例」の採用・除外がそのとおりになる。** 特に次の 3 点。
   - サドラーズギャル（種FM × 牝本人）は**採用**され、血量 62500 のまま残る。
   - サドラーズウェルズ / Glenveagh / Fairy Bridge / Lisadell(種FMMM × 牝MM) / シアトルスルー / ノーザンダンサー(種FMFF × 牝FF) は**除外**される。
   - ノーザンダンサー（種MMFF × 牝FF）と Lisadell（種FMMM × 牝FMM）は別枝からの合流なので**採用**される。
9. **クロス群の減少が実測と整合する。** 実データからランダムに 1000 組以上を取り、`crosses.length` の平均が **1.136 → 0.81 前後**になることを確認する。大きく外れる場合は §11 の効かせすぎか効かなさすぎなので、原因を突き止めてから完了とすること。
10. `dangerous` の発生率の変化を測って完了報告に記載する（段階4 の実測は 1000 組中 22 組）。
11. `git status` で変更されているのが `vue/logic/inbreed/inbreed-detector.js`（＋ `DESCENDANT_SLOTS` 公開のため触るファイル）だけである。

基準 4〜10 は確認用の一時 `.cjs` を書いて `node` で検証してよい（コミットには含めず、完了報告に内容を残すこと）。

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

- `vue/logic/inbreed/inbreed-detector.js`: 片側31ノードをpath付き出現へ変換し、枝親の完全同一・master全兄妹ペアを除外したうえで、両側31×31の直接突き合わせから `crosses` を構築するようにした。nodeTable不在時は段階4の既存経路へ完全縮退する。
- `vue/logic/pedigree/pedigree-builder.js`: 15祖先セルの共通対応表 `DESCENDANT_SLOTS` を `window.Dabimas.logic.pedigree` へ公開した。
- `vue/app/methods/bootstrap.js`: 同ファイル内にあった `DESCENDANT_SLOTS` の複製を廃止し、血統ロジックが公開する共通対応表を参照するようにした。
- `docs/codex-work-orders/2026-09-02-inbreed-branch-exclusion.md`: 本完了報告を記入した（実装対象外の報告ファイル）。

### 設計判断

- `pedigree-builder.js` は `inbreed-detector.js` と `bootstrap.js` のどちらよりも先に読み込まれるため、`DESCENDANT_SLOTS` の唯一の定義元にした。これにより読み込み順を変更せず両方から参照できる。
- nodeTable不在時の完全一致を守るため、path・枝親フィールドを持つ31ノード直接判定は nodeTable がある場合だけ使い、不在時は段階4の `recognizedCrosses` 起点の処理をそのまま残した。返却する occurrence の追加フィールドも nodeTable がある場合だけ付与する。
- §11で候補ペアを除外した後にクロス群が成立した場合は、仕様書 §12.1どおり同一・master全兄妹の全出現を再度取り込む。このため、別枝のペアで採用されたLisadell群には、同じ群の除外対象位置も血量用の出現として含まれる。

### 実行した検証と結果

- 基準1: `verify-storage-boot-order.cjs`、`verify-horse-badges.cjs`、`verify-horse-candidate-lists.cjs` → すべて `OK`。
- 基準2: `verify-index-exp .\index.html` → `[verify] OK`。
- 基準3: `python -m pytest tests/ -q` → `52 passed`。
- 基準4: 一時 `tmp/verify-inbreed-branch-exclusion.cjs` で、nodeId・mareNodeIdsを持つ実データ3盤面を固定点 `5d8b822` と比較し、nodeTableなしの戻り値全体が完全一致した。
- 基準5: 同スクリプトで実データ25盤面を固定点と比較し、nodeTableありでも `sameNameGroups` / `siblingGroups` / `inbreedColorIndexes` が全件完全一致した。
- 基準6・7: 長さ0〜4のF/M二分木から独立生成した31 pathと実際の両側occurrenceが集合一致し、全30非root pathの `branchParentNodeId` が1文字短いpathのnodeId、rootが `null` になることを確認した。
- 基準8: ヴァーミリアン通常版×サドラーズギャルを実summary/detailから展開し、サドラーズギャルの採用・血量62500、指定6祖先ペアの除外、別枝のノーザンダンサーとLisadellの採用を確認した。
- 基準9・10: 固定seed `0x20260902` の実データ4000組を固定点と比較した。詳細は次節。
- 基準11: 実装差分は指定された判定ファイルと `DESCENDANT_SLOTS` 一元化の2ファイル、本完了報告のみ。`index.html`、表示用3集合、`inbreed-counts.js`、`compatibility.js` は変更していない。
- 追加確認: 変更3 JSの `node --check`、専用検証スクリプト、`git diff --check` はすべて成功した。

### クロス群減少の実測（基準9・10）

種牡馬2415頭×特殊牝馬499頭から、固定seed `0x20260902` で重複なし4000組を抽出した。

- `crosses.length` 平均: **1.13625 → 0.7825**。
- クロス群が1件以上減少した盤面: **809 / 4000 = 20.225%**。
- 減少数分布: `-1:3, 0:3188, 1:543, 2:62, 3:159, 4:16, 5:4, 6:1, 7:16, 8:5, 9:1, 11:1, 12:1`（`-1` は旧祖先除外から直接構築へ切り離したことで1群増えた盤面）。
- `dangerous`: **82 / 4000（2.05%）→ 82 / 4000（2.05%）**で、この標本では発生率の変化なし。

指示値0.81との差は0.0275だが、同じ4000組における段階4の直接グループ化平均も指示書の1.472に対して1.4445と同じく0.0275低い。§11適用後の差がそのまま標本差と一致し、減少盤面率20.225%も指示書の20.3%と整合するため、効かせすぎではないと判断した。

### 表示との乖離の実例（§5）

ヴァーミリアン通常版×サドラーズギャルでは、サドラーズウェルズの男系セル `種FMF`（index 5）と `牝F`（index 17）が `inbreedColorIndexes` に残って着色される一方、枝親が両方ともサドラーズギャルなので `crosses` の独立群からは除外された。これは段階4cで解消予定の、指示書 §5どおりの乖離である。

### 残課題・気づき

表示用3集合は意図的に既存パイプラインのままなので、§11で除外した祖先にも着色が残る。`crosses` 由来の表示へ寄せる段階4cまでは上記の乖離が継続する。
