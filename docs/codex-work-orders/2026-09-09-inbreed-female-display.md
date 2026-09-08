# 作業指示書: 全兄妹クロスで牝馬側を光らせない（全兄妹対応フェーズ2c）

- status: 実装完了（受け入れ基準3・5との矛盾あり・完了報告参照）
- 作成日: 2026-09-09
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 上位仕様: `docs/full-sibling-stacking-spec.md` v1.1（§6）
- 前提: フェーズ1（c0f5b7d／86b73d3）、2a（dffcf20／b85ab73）、2b（fbafca8／9540ed1）が完了・検収済み
- **稼働影響あり:** 全兄妹クロスの牝馬セルが着色されなくなる。内部のクロス・血量・危険な配合・理論・因子は変わらない

## 背景と目的

最優先要件に「全兄妹クロスの牝馬側表示は不要」がある（仕様書 冒頭・§6）。
フェーズ2bまでで判定は正しくなったが、**表示はまだ牝馬側も光る**。

例えばダンスインザダーク（父側ルート）とダンスパートナー（母側ルート）を置くと、
いま両方のセルが着色される。期待は**ダンスインザダーク側だけ**である。

```
いま  inbreedColorIndexes = [0, 16]
期待  inbreedColorIndexes = [0]
```

ケース2（ルドルフ×自家製の娘）、ケース3（ドゥラメンテ×自家製の娘）でも同じことが起きる。

ただし**牝馬をクロスから消すのではない**。血量・危険な配合・至高・理論は
完全な内部結果を入力にし続ける（仕様書 §6）。消すのは着色だけである。

## 実装方針

変更は `vue/logic/inbreed/inbreed-detector.js` の**表示出口**（`if (nodeTable)` の中、1482行付近の
`crosses.forEach`）だけ。2点。

### 1. 全兄妹成立だけを理由にした牝馬の出現を表示対象から外す

牝馬でも「群の中に同じ実馬の相手がいる」なら、それは本来の同名クロスなので**残す**。
外すのは、全兄妹として群に入っただけの牝馬である。

```javascript
// 全兄妹成立だけを理由にした牝馬の出現は表示しない（仕様書 §6）。
// 群の中に「同じ実馬」の相手がいる牝馬は、本来の同名クロスなので残す。
const hasSameHorsePartner = (occurrence) =>
  cross.occurrences.some(
    (other) =>
      other !== occurrence &&
      sameCrossHorseRef(occurrence.ref, other.ref)
  );
const displayNodes = cross.occurrences
  .filter(
    (occurrence) =>
      occurrence.index !== null &&
      (occurrence.sexKind !== "female" || hasSameHorsePartner(occurrence))
  )
  .map((occurrence) => selected[occurrence.index])
  .filter(Boolean);
if (displayNodes.length === 0) {
  return;
}
```

`sameCrossHorseRef` はフェーズ2bで同じ関数スコープに定義済み。そのまま使える。

**例外ルールの判定（`stallionIndexes` / `broodmareIndexes` / `crossPairs`）は
`cross.occurrences` 全件のまま変えないこと。** 除外の可否は表示の話ではない。

### 2. 分類を群全体の関係で決める

現行は「表示ノードの nodeId／名前が1種類か」で `sameNameGroups` と `siblingGroups` を分けている。
牝馬を落とすと片側1セルの群が増え、全兄妹なのに同名クロスへ倒れてしまう。

群の中の**クロス上の同一馬キーが何種類あるか**で決める。

```javascript
// 分類は「残った表示セル数」ではなく群全体の関係で決める。
// 片側1セルでも全兄妹なら siblingGroups へ出す（仕様書 §6）。
const crossHorseKeys = new Set(
  cross.occurrences
    .map((occurrence) => resolver?.crossHorseKey(occurrence.ref))
    .filter((key) => key)
);
let sameHorse;
if (crossHorseKeys.size > 0) {
  sameHorse = crossHorseKeys.size === 1;
} else {
  // resolver が無い等でキーが1つも取れないときは従来の判定へ落とす
  const hasCompleteNodeIds = displayNodes.every(
    (node) => typeof node.nodeId === "string"
  );
  const identityValues = hasCompleteNodeIds
    ? displayNodes.map((node) => node.nodeId)
    : displayNodes.map((node) => node.name);
  sameHorse = new Set(identityValues).size === 1;
}
addDisplayGroup(displayNodes, sameHorse);
```

これで同一実馬の別 variant（パーソロン1971と覇煌など）が `sameNameGroups` へ入る。
現行はこれが `siblingGroups` に入っており、仕様書 F01 の「分類は同一馬」と食い違っている。

### 変更対象ファイル

- `vue/logic/inbreed/inbreed-detector.js` — 上記2点
- `service-worker.js` — `CACHE_NAME` の bump

## 制約

- `AGENTS.md` に従うこと。
- **`crosses` の中身を変えないこと。** 牝馬の出現は `crosses[].occurrences` に残す。
  血量・`dangerous`・至高・`selfAncestorWarningIndexes` は完全な内部結果のまま（仕様書 §6）。
- `count` / `legacyCount` / `legacyHiddenCrossCount` の契約を変えないこと。`hasCross` は追加しない。
- `vue/logic/inbreed/inbreed-counts.js`（因子集計）を変更しないこと。牝馬は因子を持たないので、
  表示から外れても因子数は変わらない（仕様書 §6）。
- legacy 経路、nodeTable 不在の縮退経路、例外ルールの除外判定を変えないこと。
- `sexKind` の付与規則（フェーズ2a・2b）を変えないこと。

## スコープ外（やらないこと）

- **工程診断の一時 registry と、共有の再帰収集。** フェーズ2d（後述）。
- 判定規則（同一馬・全兄妹・親比較キー）。フェーズ2bで完了している。
- 保存・読み込み経路。
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

すべて依頼側の試作で実測した値である。**この数値が出なければ実装が違う。**

### 1. A01：ダンス2頭を左右ルート

父側ルート＝ダンスインザダーク（通常版）、母側ルート＝ダンスパートナー。

| 項目 | 変更前 | 期待 |
|---|---|---|
| `inbreedColorIndexes` | `[0,16]` | **`[0]`** |
| `siblingGroups` | `[[0,16]]` | **`[[0]]`** |
| `crosses` の血量 | `[100000]` | `[100000]`（不変） |
| `dangerous` | `true` | `true`（不変） |
| `count` | `2` | `2`（不変） |
| `crosses[0].occurrences` | index 0 と 16 | index 0 と 16（**不変**。内部からは消さない） |

### 2. ケース2（B01）とケース3（C02）

フェーズ2bの検証で使った盤面をそのまま使う。

| ケース | 変更前 | 期待 |
|---|---|---|
| B01（ルドルフ×自家製娘A） | `inbreedColorIndexes=[1,16]` | **`[1]`** |
| C02（ドゥラメンテ×自家製娘B） | `inbreedColorIndexes=[0,16]` | **`[0]`** |

どちらも `crosses` の件数・血量（75000／100000）・`dangerous=true` は不変であること。

### 3. B03・C01 は変わらない

牝馬が全兄妹として群に入っていないケースは、着色も分類も変わらないこと。

- B03（父＝覇煌）: `inbreedColorIndexes=[2,17]` のまま
- C01（母＝自家製A）: `inbreedColorIndexes=[1,17]` のまま

### 4. F01：同一実馬の別 variant は「同一馬」に分類される

パーソロン1971（cell0）とパーソロン覇煌（cell17）を置いた盤面で、
`sameNameGroups` に `[0,17]` が入り、`siblingGroups` には入らないこと。

### 5. マスタ盤面 1000組の回帰

固定 seed で種牡馬×繁殖牝馬 1000組以上を生成し、フェーズ2b（`HEAD`）と比較する。

- **`inbreedColorIndexes` の差分は 0 件**であること
- `count` / `dangerous` / `crosses.length` / `bloodVolume` の差分も 0 件であること
- `sameNameGroups` / `siblingGroups` の差分は出てよい。ただし
  **すべて「`siblingGroups` から `sameNameGroups` へ移った」方向であり、
  同一 pedigreeId の別 variant どうしの群であること**を確認する

依頼側は seed `0x20260909` の1000組で、一致976／差分24、差分はすべて分類のみ・着色差分0件を確認している。

### 6. D05：母側の牡馬祖先は従来どおり表示される

基準5で着色差分が0件であることが、そのままこの確認になる（1000組の多くが
母側セルを含む着色を持つ）。個別に1件、母側の牡馬祖先が着色される盤面を挙げて記録すること。

### 7. 既存ガード

- `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html` が `[verify] OK`
- `python -m pytest tests/ -q` が 52 passed
- `node --check` が通る
- `git diff --check` が何も出さない、BOM なし・LF

### 8. 画面

`.claude/launch.json` の `static-verify`（ポート8767）で確認する。

- **確認前に ServiceWorker とキャッシュを消すこと。** 古い SW が残っていると前バージョンの JS が配信される
- ポート8766 には別ディレクトリの古いコピーを配信するサーバが常駐しているので使わない
- ダンスインザダーク×ダンスパートナーを置き、**父側のセルだけが着色される**こと
- 理論表示が「危険な配合」のままであること（内部の血量は変わっていないため）
- コンソールに ServiceWorker 登録エラーが出るが、埋め込みブラウザの制約で本変更とは無関係

## 想定される副作用（許容する）

牝馬セルが表示グループから外れることで、そのセルの**ハートボタンの自動非活性が外れる**。
`buildInbreedFactorCounts` の `disabledIndexes` は表示グループから作られるためである。
因子数・血量・理論には影響しない（牝馬は因子を持たない）。
この挙動でよい。変える必要はない。

## 検証コマンド

```
node --check vue/logic/inbreed/inbreed-detector.js
node tmp/verify-p2c-cases.cjs        # 基準1〜4・6
node tmp/verify-p2c-regression.cjs   # 基準5
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html
python -m pytest tests/ -q
git diff --check
```

## 後続フェーズ（スコープ外・参考）

| フェーズ | 内容 |
|---|---|
| 2d | 工程診断の一時 registry（合成した仮想繁殖牝馬へ一時 ref と父母を与え、`board[0]` が null でも個体を失わない）と、共有の再帰収集（`identityRef` を辿って祖先の custom・edit レコードも同梱する）。受入は仕様書 v1.1 の A02・B02・D06・E02・E04 |

なお、フェーズ2bの検収で挙げた申し送り（`resolver` が渡らないとクロスが全滅する。
警告を出すか graceful にフォールバックするかの検討）は 2d で扱う。

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。

### 変更ファイル一覧

- `vue/logic/inbreed/inbreed-detector.js`: nodeTable経路の表示出口だけを変更。全兄妹だけを理由に参加したfemale出現を表示から外し、同一馬の相手がいるfemaleは維持。分類は非表示を含む群全体のcrossHorseKeyで決定し、キー未取得時は既存分類へフォールバック。
- `service-worker.js`: `CACHE_NAME` を `dabimas-factor-v20260909-02` へ更新。
- 本指示書: ステータスと完了報告を記入。

### 設計判断

- 実装方針の2点をそのまま適用した。判定規則、内部crosses、例外除外、legacy経路、保存・読み込み、sexKind付与、因子集計には変更なし。
- 基準5の「着色差分0」「分類は全兄妹→同一馬のみ」は、指定された表示ロジックおよび上位仕様§6と両立しない入力がある。指定ロジックを優先し、差分を隠すための抽出変更や例外追加は行っていない。詳細は下記。基準5の全面合格とは報告しない。

### 実行した検証と結果

- 基準1〜4: `node tmp/verify-p2c-cases.cjs` — 成功。A01の着色 `[0]`、siblingGroups `[[0]]`、血量100000・dangerous=true・count=2・内部出現0/16を確認。B01は `[1]`、C02は `[0]` となり、血量75000/100000は不変。B03 `[2,17]`、C01 `[1,17]` は維持。F01の `[0,17]` はsameNameGroupsへ分類。全ケースでcrosses全体・count・dangerous・自己祖先警告・特殊判定が旧実装と一致。
- 追加ケース: 同一馬の相手がいる牝馬の表示（同一馬のみ／全兄妹との混在）、牝馬同士の全兄妹で表示が空でも内部クロスが残ること、前フェーズの血量・自家製・edit・未知値・縮退ケースも検証。
- 基準3の分類不変には追加の矛盾がある。B03は着色 `[2,17]` を維持するが、同一実馬の別variant（パーソロン1971/覇煌）なので、旧siblingGroups `[[2,17]]` がsameNameGroups `[[2,17]]` へ移る。実装方針2・F01に従う変更であり、基準3も分類不変という点では未達。
- 基準5: `node tmp/verify-p2c-regression.cjs` — 固定点 `dc94895f9607665274552532f534295e3c3bf14b` と実データ1,000組を比較。seed `0x20260909`、LCG `state = (1664525 * state + 1013904223) >>> 0`、抽出indexは `state % list.length`。例外ルール空配列と実際の例外ルールの両方で検証。内部crosses全体・count・dangerous・自己祖先警告・特殊判定は全件一致。nodeTable無しの戻り値全体も一致。
  - 着色差分は2組。すべて同一馬の相手を持たないfemaleの抑制であり、着色の追加はない。
  - 分類変更は全兄妹→同一馬12組、同一馬→全兄妹6組。前者はすべて同一pedigreeIdの別variant。後者はすべて非表示牝馬を含む異なる実馬キーの群で、指定の「片側1セルでも全兄妹ならsiblingGroups」による修正。
  - 具体例1: ハイセイコー通常（0000036106-00）×シックスクラウンズ（0000394259-00）。表示index13と非表示牝馬からなる血量6250の群は、旧sameNameGroups `[13]` からsiblingGroups `[13]` へ移る。着色と内部crossesは不変。
  - 具体例2: ロゴタイプ（0001124405-01）×メモリーレーン（0000416806-00）。着色 `[10,16]` → `[10]`。index16は同一馬の相手を持たないfemaleのため、指定どおり非表示になる。内部crossesは不変。
  - このため基準5の差分ゼロ・分類一方向という条件は未達。検証スクリプトはその例外件数を明示し、各差分が指定された表示変更だけで説明できることを検査している。
- 基準6: ノーアテンション（0000333697-10）×ハイラヴァヒット（0000298778-00）で着色 `[2,21]` を維持。母側の牡馬祖先ニジンスキー（index21）が正常に表示される。
- 因子集計: 基準5の全1,000組・例外ルール有無の両方で、既存 `buildInbreedFactorCounts` の集計因子コードの数量が新旧一致。表示から除かれる牝馬の影響や分類変更による因子数変化はなかった。
- 基準7: detectorとService Workerの `node --check` — 成功。`powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html` — `[verify] OK`。`python -m pytest tests/ -q` — `52 passed`。`git diff --check` — 指摘なし。変更JSはBOM無し・LF。
- 基準8: ポート8767で `scripts/codex-powershell.ps1 dump-dom` / `screenshot` を使用。確認前にService Workerを登録解除しCache Storageを削除、登録0・キャッシュ0・controller無しを記録。新コードを読み込み、ダンス2頭の父側セル0のみ着色・母側16は非着色、theory_08（危険な配合）、内部クロス1件を確認。アプリのコンソールエラー0件。`tmp/p2c-ui.png` を目視確認。
- レビュー: Standardsは独立エージェントの指摘0件。Specも実装不備なし。上記2種類の基準5矛盾を独立に再現・確認した。
- 検証スクリプト・旧実装コピー・結果ログ・画像は `tmp/` に置き、コミット対象外。

### 残課題・気づき

- 受け入れ基準5には上記の矛盾がある。サンプル生成手順もseedだけでは一意にならないため、依頼側の976一致/24分類差分とは抽出が異なる。必要な修正は基準側の期待の整理であり、指定どおり動く表示ロジックへ例外を足すことではない。
- 牝馬のハートボタンの自動非活性が外れる点は許容された挙動として維持。
- 工程診断の一時registry、共有の再帰収集、resolver未指定時の扱いは予定どおりフェーズ2dへ残る。
