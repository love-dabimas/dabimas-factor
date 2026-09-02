# 作業指示書: 血統表の表示を `crosses` 由来へ寄せる（段階4c）

- status: 依頼中
- 作成日: 2026-09-03
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 設計資料: `docs/pedigree-master-integration-design.md` §7.1 / §6.7
- アルゴリズム仕様書: `dabimas_pedigree_editor_algorithm_spec.md` §10 / §11
- 前提: 段階4b（`2026-09-02-inbreed-branch-exclusion.md`）が完了・検収済み
- **稼働影響: 小さい。** 着色が変わる盤面は実測 2.3%

## 背景と目的

段階4b で `crosses` は「片側31ノード × 31ノードの直接突き合わせ + §11 の枝除外」だけで決まるようになり、既存の祖先除外から独立した。

一方で**血統表の着色・クロス表示・ボタン非活性は、いまも旧パイプライン（`recognizedCrosses` → 名前でグループ化）が作っている**。旧パイプラインは牝馬15枠を知らず、§11 も効かないので、`crosses` と食い違う。

```text
ヴァーミリアン × サドラーズギャル
  crosses      : サドラーズギャル / Lisadell / ノーザンダンサー / ヘイルトゥリーズン の 4 群
  画面の着色    : サドラーズウェルズ(5,17) を含む 9 セル
                 ↑ crosses には無いのに着色されている
```

段階5 で因子カウントが `crosses` を見るようになると、**画面に出ているクロスと因子数の根拠がずれる**。ユーザーからは何が起きているか分からないので、その前に表示側を `crosses` へ寄せる。

### 実測した影響（現行データ・1500 組サンプル）

| | 着色セル数の平均 |
|---|---:|
| 現行（旧パイプライン） | 1.591 |
| `crosses` 由来 | 1.593 |

- 着色が変わる盤面: **34 / 1500（2.3%）**
- 旧パイプラインにだけある着色: 延べ 38 / `crosses` にだけある着色: 延べ 42

**平均はほぼ同じで、変わるのは 2.3% の盤面だけである。** 段階4b の作業指示書で「着色が目に見えて減る大きな変更」と書いたが、実測すると外れていた。§11 が消すクロスの多くは旧パイプラインの `addExcludedAncestorPairs` も消していたため。**本作業指示書の実測値を正とする。**

## 例外ルールは残す（重要）

`json/inbreed-exceptions.json` の 6 件は、牝馬データが無かった時代の手当てである。関係そのものはマスターから引ける。

| # | ルール | マスター上の関係 |
|---|---|---|
| 1 | ステイゴールドの母 × サッカーボーイ | ゴールデンサッシュ と サッカーボーイ が**全兄妹** |
| 2 | ボイズィーボーイの母 × ライジングフレーム | Rising Hope と ライジングフレーム が**全兄妹** |
| 3 | リアルスティールの母母 × キングマンボ | Monevassia と キングマンボ が**全兄妹** |
| 4 | サドラーズウェルズの母母 / ヌレイエフの母 | どちらも **Special**（同一 pedigree） |
| 5 | ノーザンダンサーの母母 / ヘイローの母母 | どちらも **Almahmoud**（同一 pedigree） |
| 6 | セクレタリアトの母 / サーゲイロードの母 | どちらも **サムシングロイヤル**（同一 pedigree） |

1〜3（`recognizeAsCross`）は牝馬枠 + master の全兄妹判定で自動的に立つ。**しかし 4〜6（`excludeAncestors`）は §11 では再現できない。**

実測すると、例外ルールは旧パイプラインの着色から**クロスを消している**（1500 組中 9 盤面・0.6%）。

```text
例外で変化: 削除[10:ノーザンダンサー, 20:ノーザンダンサー, 6:ノーザンダンサー]
            → これらは crosses 由来の着色には含まれる
```

§11 は「クロスしている馬の**祖先**側の重複を消す」規則で、例外ルール 4〜6 が消しているのは**子孫**側である。向きが逆なので置き換えにならない。

**したがって例外ルールは削除せず、`crosses` 由来の表示に対する後段フィルタとして維持する。** 手で調整された挙動を、根拠を確かめずに消してはならない。実機で「例外ルールが消しているクロスがゲームでも出ないのか」を確認できたら、そのとき改めて判断する（設計 §14 に追記すること）。

## 実装方針

### 変更対象ファイル

- `vue/logic/inbreed/inbreed-detector.js` — 表示 3 集合を `crosses` から導出する

### 1. 表示 3 集合を `crosses` から作る

`crosses` の各群について、**表示行を持つ出現（`index !== null`）だけ**を取り出し、対応する `selected[index]` のセルオブジェクトでグループを組む。

```js
const displayNodes = (cross) =>
  cross.occurrences
    .filter((o) => o.index !== null)
    .map((o) => selected[o.index])
    .filter(Boolean);
```

- **表示行を持つ出現が 0 件の群（牝馬だけで成立したクロス）は表示 3 集合に入れない。** 段階4 の決定どおり（設計 §7.1）。
- **表示行を持つ出現が片側にしか無い群も入れない。** 交差クロスとして画面に出す意味が無い。

`sameNameGroups` と `siblingGroups` の振り分け:

```js
// 群の中の表示ノードが全部同じ nodeId なら同一馬クロス、そうでなければ全兄妹クロス。
const ids = new Set(nodes.map((n) => n.nodeId));
const isSameHorse = ids.size === 1 && !ids.has(null) && !ids.has(undefined);
```

`nodeId` が欠けているノードが混ざる場合は名前で判定へ縮退する（設計 §6.7 ルール1）。

`inbreedColorIndexes` は、表示 3 集合に入った全ノードの `index` を重複なく集めたもの。順序は**現行と同じく「グループの出現順 → グループ内の出現順」**を保つこと。`dispColor` へ `$set` するだけなので順序自体は見た目に影響しないが、回帰比較を読みやすくするため。

### 2. 例外ルールを後段フィルタとして適用する

旧パイプラインは動かしたまま残す。そこで作られる `exceptionExcludedPairs`（`"idxA-idxB"` 形式の Set）を使って、`crosses` 由来の群から除外対象のペアを落とす。

```js
// 群に含まれる「種牡馬側 index × 特殊牝馬側 index」の組が
// すべて例外で除外されているなら、その群は画面に出さない。
const crossPairs = [];
stallionIdx.forEach((a) => broodmareIdx.forEach((b) => crossPairs.push([a, b])));
const allExcluded =
  crossPairs.length > 0 &&
  crossPairs.every(
    ([a, b]) =>
      exceptionExcludedPairs.has(`${a}-${b}`) ||
      exceptionExcludedPairs.has(`${b}-${a}`)
  );
if (allExcluded) return;    // 表示 3 集合へ入れない
```

例外ルールの `recognizeAsCross`（1〜3）で旧パイプラインが認定した `type: 'exception'` のクロスは、**現行どおり旧パイプライン経由で表示 3 集合へ足す**。`crosses` 側でも牝馬枠から自動的に立つはずだが、二重に出さないよう `index` で重複排除すること。

**`json/inbreed-exceptions.json` は変更しない。** 読み込み経路・ルール形式も変えない。

### 3. 触らないもの

- `crosses` / `bloodVolume` / `dangerous` / `count` の計算。**段階4b から 1 ミリも変えない。**
- `recognizedCrosses` を作る旧パイプライン本体（`crossCandidates` / 祖先除外 / 例外処理）。表示 3 集合の**出口だけ**を差し替える。
- `sameNameSpecialChecks` / `sameNameSpecialChecksByIndex`。至高判定は段階7 の担当。**現行どおり旧パイプラインの `sameNameGroupsFinalFiltered` から作る**こと。表示 3 集合の作り方を変えても、この 2 つの入力は変えない（変えると至高の出方が変わってしまう）。
- `vue/logic/inbreed/inbreed-counts.js`（段階5）と `vue/logic/theory/compatibility.js`（段階6）。
- `vue/app/methods/inbreed-ui.js`。`buildInbreedFactorCounts()` のシグネチャは維持する。

### 4. 変わるもの

| | 段階4c で |
|---|---|
| `sameNameGroups` / `siblingGroups` / `inbreedColorIndexes`（着色・ボタン非活性・`inbreedList`） | **変わる**（実測 2.3% の盤面） |
| 因子カウント（`buildInbreedFactorCounts` の入力が変わるため） | **変わりうる** |
| `crosses` / `bloodVolume` / `dangerous` | 変わらない |
| `sameNameSpecialChecks`（至高） | 変わらない |
| 右上の配合理論 | 至高・危険とも変わらない |

## 制約

- `AGENTS.md` の Safety Rules に従うこと。この段階で `index.html` を触る必要は無いはず。
- **表示行を 32 から増やさない。**
- **既存の戻り値キーを削らない。**
- `json/inbreed-exceptions.json` を変更しない。例外ルールを削除しない。
- `nodeTable` が無いときは段階4b と完全に同じ結果を返すこと（`crosses` が旧経路で組まれるため、表示も旧経路のままでよい）。
- `nodeId` を数値化しない。`nodeId` から `pedigreeId` を切り出さない。

## スコープ外（やらないこと）

- 因子カウントの `nodeId` 化（段階5）
- 配合理論（段階6）・至高の条件追加（段階7）
- 例外ルールの削除・整理（実機確認が済むまで判断しない）
- 牝馬クロスを画面に出すこと（表示行が無いので出せない）
- 血量の数値表示
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

1. `node scripts/verify-storage-boot-order.cjs` / `verify-horse-badges.cjs` / `verify-horse-candidate-lists.cjs` がすべて成功する。
2. `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html` が `[verify] OK` を返す。
3. `python -m pytest tests/ -q` が全件成功する。
4. **`nodeTable` を渡さない呼び出しで、戻り値が段階4b（`b869028` 以降の HEAD）と完全一致する。** 確認盤面には `nodeId` と `mareNodeIds` を持つ実データの盤面を 3 つ以上含めること。
5. **`crosses` / `bloodVolume` / `dangerous` / `count` が段階4b と完全一致する。** 実データ 100 盤面以上で確認すること。この段階は表示だけを変える。
6. **`sameNameSpecialChecks` / `sameNameSpecialChecksByIndex` が段階4b と完全一致する。** 同じ 100 盤面で確認すること。
7. **着色が `crosses` と整合する。** 任意の盤面で、`inbreedColorIndexes` が「`crosses` のうち表示行を持つ出現が両側にある群」の index 集合と一致する（例外で落とした群を除く）。実データ 100 盤面で確認。
8. **ヴァーミリアン × サドラーズギャル**（種牡馬は通常版）で、サドラーズウェルズ（index 5 / 17）が**着色されなくなる**こと。残る着色が `crosses` の 4 群（サドラーズギャル / Lisadell / ノーザンダンサー / ヘイルトゥリーズン）に対応すること。サドラーズギャル群は牝馬枠と牝馬側ルート（index 16）なので、index 16 だけが着色対象になる点に注意。
9. **例外ルールが効いている盤面で、旧パイプラインと同じくクロスが消えること。** ノーザンダンサー × ヘイローが両側 4 代目より小さい盤面を実データから探し、例外ルールありで該当クロスが表示されないことを確認する。**この確認を完了報告に必ず載せること。**
10. **着色が変わる盤面の割合が実測と整合する。** 実データからランダムに 1000 組以上を取り、段階4b と段階4c で `inbreedColorIndexes` が変わる盤面が **2〜3% 程度**になることを確認する。大きく外れる場合は原因を突き止めてから完了とすること。
11. **`tests/fixtures/split-baseline/`**: README の基準組み合わせ（`ダッシャーゴーゴー × シル`）を Node 上で再現し、着色が変わるかを完了報告に記載する。変わる場合はブラウザで再取得して更新し、差分を 1 件ずつ説明する。
12. `git status` で変更されているのが `vue/logic/inbreed/inbreed-detector.js`（＋意図的に更新したベースライン）だけである。

基準 4〜11 は確認用の一時 `.cjs` を書いて `node` で検証してよい（コミットには含めず、完了報告に内容を残すこと）。

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

### 着色変化の実測（基準10）

<サンプル数・着色が変わる盤面の割合・着色セル数の平均の前後>

### 例外ルールが効いている盤面での確認（基準9）

<どの盤面で・どのクロスが・例外ありで消えることを確認したか>

### ベースライン盤面の変化（基準11）

<ダッシャーゴーゴー × シル で着色がどうなったか>

### 残課題・気づき

<スコープ外だが気づいた問題、やり残し。なければ「なし」>
