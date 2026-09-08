# 作業指示書: 祖先セルに置いた繁殖牝馬をクロス判定へ戻す（全兄妹対応フェーズ1）

- status: 完了
- 作成日: 2026-09-08
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 調査資料: `docs/full-sibling-stacking-spec-review.md` §3
- **稼働影響あり:** 祖先セルに繁殖牝馬を置いた血統表で `crosses` / `inbreedColorIndexes` / `dangerous` が変わる。置いていない血統表は一切変わらない（1000組で検証済み・後述）

## 背景と目的

血統表の祖先セルのうち localIndex **3 / 5 / 7 / 9 / 11 / 13 / 15** は、種牡馬だけでなく**繁殖牝馬も選択できる**（`vue/components/pedigree/horse-cell.js:226` が `horses[0]`＝種牡馬＋繁殖牝馬のリストを返す）。

そこへ繁殖牝馬を置くと、`setDataForPedigree` は `id !== 0` 側の分岐（`vue/logic/pedigree/pedigree-builder.js:451`〜）に入り、そのサブツリー **15セル全部** に `subName: "(その牝馬名)"` を付ける。牝馬本人のセルは存在せず、選んだセルにはその**牝馬の父**が入る。

例: 母側ルート＝エアグルーヴ、母側 localIndex 3 に ダンスパートナー を選ぶと

```
cell19 = サンデーサイレンス   subName="(ダンスパートナー)"   ← ダンスパートナーの父
cell22 = ヘイロー             subName="(ダンスパートナー)"
cell23 = ニジンスキー         subName="(ダンスパートナー)"
...
```

配置自体は正しい。`cell19` は path `MF`（母の母の父）で、母の母＝ダンスパートナーなのだからその父が入るのは正しい。

### 何が壊れているか

`vue/logic/inbreed/inbreed-detector.js:95` の `isBroodmarePlaceholderHorse` が、`buildSideOccurrences` でこれらのセルを**丸ごとクロス判定から除外している**。結果、

1. その牝馬の父系に由来する**通常のクロスが全部消える**
2. 牝馬**本人**はセルを持たないうえ牝馬15枠にも入らないので、どこにも出現しない
3. さらに牝馬15枠（`mareNodeIds`）はルート選択時に一度だけ確定され、祖先セルを差し替えても更新されないので、**画面に無い血統**を指したまま判定に参加する

上の例で実測した現行の出力は次のとおり。**何ひとつクロスが出ない。**

```
inbreedColorIndexes = []
crosses = [Natalma 血量6250]   ← 牝馬枠同士の無関係な1件のみ
dangerous = false
```

### いつ壊れたか

`git log -S isBroodmarePlaceholderHorse` で追える。この除外を `buildSideOccurrences` へ適用したのは **b869028「同一家系枝の重複クロスを除外」（2026-09-02、本フェーズの直前作業）** である。それ以前の実装では

- `(牝馬名)` セルは**同名クロスの検出ループには参加していた**（名前一致ループに除外チェックは無い。現在も無い）
- 除外していたのは全兄妹ループだけで、その分は冒頭の `broodmareGroups` ブロック（`type: 'broodmare-stallion-sibling'`）が専門に担当していた

b869028 が nodeTable 経路を新設したとき、**除外だけを引き継いで専用ブロックを引き継がなかった**。`broodmareGroups` が作る `recognizedCrosses` は nodeTable 経路の表示出口から参照されない。これが本件の正体である。

### 目的

祖先セルに置いた繁殖牝馬について、**本人も、その祖先も、正しくクロス判定へ参加する**状態に戻す。

## 実装方針

変更は3点。いずれも nodeTable がある経路だけを直す。

### 変更1: プレースホルダー・セルの除外をやめる

`vue/logic/inbreed/inbreed-detector.js` の `buildSideOccurrences`（785行付近）から、`isBroodmarePlaceholderHorse` の呼び出しを**2箇所とも削除する**（ルートセルの判定と `SIRE_PATHS` ループの判定）。

`isInbreedExcludedHorse`（`★☆` 除外）は**そのまま残す**。フェーズ2の対象であり、本フェーズでは触らない。

`isBroodmarePlaceholderHorse` 関数の**定義は残す**。段階4以前の legacy 経路（全兄妹ループ、330行付近）がまだ使っている。

### 変更2: 繁殖牝馬本人の識別子をセルへ記録する

`vue/logic/pedigree/pedigree-builder.js` の `id !== 0` 側の分岐で、`retDataForPedigree[0]`（＝ユーザーが選んだセルに入る、その牝馬の父）に牝馬本人の nodeId を持たせる。

```javascript
              retDataForPedigree[0] = {
                ...horseData.descendants[0],
                placeholderMareNodeId: horseData.nodeId ?? null,   // ← 追加
                subName: `(${horseData.name})`,
```

**`retDataForPedigree[0]` にだけ付ける。** 1〜14 には付けない。牝馬本人の位置は「選ばれたセルの path から末尾1文字を落とした path」で一意に決まるので、選択セルにだけあれば足りる。

`stripHorseForStorage`（`vue/app/methods/horse-loading.js`）は除外リスト方式（`descendants` / `searchText` / `displayName` / `mares` だけを落とす）なので、この新フィールドは localStorage の保存・復元を素通りする。同ファイルの変更は不要。

### 変更3: 牝馬15枠を盤面から再計算する

`buildMareOccurrences`（`inbreed-detector.js:127`）を、ルートセルの `mareNodeIds` をそのまま読むのではなく、**現在の盤面のセルから 15 枠を組み立てる**ように書き換える。

アルゴリズム: **path `p` の牝馬 = path `p` から末尾1文字を落とした個体の母**。

```
node("")            = ルートセルの nodeId
node(SIRE_PATHS[i]) = selected[sideOffset + DESCENDANT_SLOTS[i]] の nodeId
node(MARE_PATHS[k]) = 次の優先順で決める
   1. その位置に繁殖牝馬が明示配置されていれば、その nodeId
      （selected[...] の placeholderMareNodeId が付いたセルの path から末尾1文字を落とした位置）
   2. node(MARE_PATHS[k] の末尾1文字を落とした path) の母を canonical ノードへ解決した値
   3. どちらも取れなければ、従来どおり ルートセルの mareNodeIds[k]
```

`MARE_PATHS` は前方の path が後方の prefix になる順に並んでいるので、配列順にそのまま計算してよい（`"FMM"` の prefix `"FM"` は index 1、`"MMMM"` の prefix `"MMM"` は index 6、`"MMFM"` の prefix `"MMF"` は `SIRE_PATHS` 側）。特別扱いは要らない。

**この規則が既存データを完全に再現することは確認済みである。** `json/dabimasFactor-details/` の全2914頭について、`descendants` の nodeId と summary の本人 nodeId からこの規則で15枠を計算したところ、保存されている `mares` 配列と **43,710枠すべてが一致した（不一致 0 件）**。優先順 3 のフォールバックは、自家製馬のように本人 nodeId が無いルートのためだけに残す。

### 変更4: canonical ノード解決を nodeTable へ足す

pedigree ID から「マスタの祖先枠に実際に現れるノード」を引く関数を `vue/logic/pedigree/pedigree-node-table.js` の返却オブジェクトへ追加する。

```javascript
      canonicalNodeOf(pedigreeId) {
        const list = variantsByPedigree.get(pedigreeId);
        if (!list || list.length === 0) {
          return null;
        }
        return list.indexOf(pedigreeId + "-00") >= 0
          ? pedigreeId + "-00"
          : list[0];
      },
```

`variantsByPedigree` はソート済みなので `list[0]` が variant_code 最小になる。この規則は `scripts/pedigree_master_source.py:296` の `representative_node_id()` と同じで、祖先枠・牝馬枠 86,551件で例外が無いことを確認済みである（`-00` が存在しない馬は239頭あり、パーソロンなどが該当する）。

### 変更対象ファイル

- `vue/logic/pedigree/pedigree-node-table.js` — `canonicalNodeOf` を追加（純粋な追加。既存メソッドは変更しない）
- `vue/logic/pedigree/pedigree-builder.js` — `id !== 0` 分岐の `retDataForPedigree[0]` に `placeholderMareNodeId` を追加
- `vue/logic/inbreed/inbreed-detector.js` — `buildSideOccurrences` から除外を削除、`buildMareOccurrences` を盤面ベースの再計算へ書き換え

## 制約

- `AGENTS.md` に従うこと。
- `judgeInbreed` の**引数と戻り値の形は変えない**。`(selected, inbreedExceptions, nodeTable)` のまま、返すキーも現行のまま。
- `nodeTable` が無いときの縮退経路の挙動を変えないこと。`buildMareOccurrences` は現行どおり `nodeTable` が無ければ空配列を返す。
- 表示出口（`displaySameNameGroups` / `displaySiblingGroups` / `inbreedColorIndexes` を組み立てる 1404行以降）は**触らない**。牝馬の出現は `index === null` なので、既存の `occurrence.index !== null` フィルタによって自動的に非表示になる。これが仕様どおりの挙動である。
- `isInbreedExcludedHorse`（`★☆` 除外）は残すこと。
- 新フィールド名は `placeholderMareNodeId` を使うこと（後続フェーズが参照する）。

## スコープ外（やらないこと）

- **全兄妹判定そのもの、自家製馬（`☆`）の取り込み、牝馬側の表示抑制。** これらはフェーズ2の範囲。
- legacy 経路（`broodmareGroups` ブロック、`recognizedCrosses`、`legacyInbreedColorIndexes`、`legacyCount`）。1件も変更しないこと。
- `vue/logic/inbreed/inbreed-counts.js`、`vue/logic/theory/*.js`、`vue/constants/breeding-theories.js`。
- `vue/logic/horses/saved-horse-builder.js` の保存経路。**既知の制限として、保存時の `mares` 配列は今も ルートセルの `mareNodeIds` から作られるため、祖先セルを差し替えた盤面を保存すると判定と保存内容がずれる。** これはフェーズ2で `mareRefs` として作り直すので、本フェーズでは直さないこと。
- `index.html` の変更は不要なはず。必要になったら理由を完了報告に書くこと。
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

### 1. 対象シナリオが直る

父側ルート＝ダンスインザダーク（通常版）、母側ルート＝エアグルーヴ、母側 localIndex 3 に ダンスパートナー を選択した盤面で、`judgeInbreed` の戻り値が次のようになること。

| | 現行 | 修正後（期待値） |
|---|---|---|
| `inbreedColorIndexes` | `[]` | `[0]` |
| `crosses` | Natalma 血量6250 の1件 | ダンスインザダーク 血量75000 の1件 |
| そのクロスの occurrences | — | `index=0 / path=""` と `index=null / path="M"` |
| `dangerous` | `false` | `true` |

ダンスインザダークとダンスパートナーは全兄妹（父サンデーサイレンス・母ダンシングキイ）なので全兄妹クロスが成立し、牝馬側は `index === null` なので着色されず、**ダンスインザダーク側のセル0だけが光る**のが正しい。

サンデーサイレンス等の共通祖先が別クロスとして出ないのも正しい。b869028 が入れた同一家系枝の除外が効いており、全兄妹である2頭の共通祖先を二重計上しないためである。

### 2. 通常の盤面が1件も変わらない

祖先セルに繁殖牝馬を置いていない盤面では、戻り値が現行と完全一致すること。

`git show HEAD:vue/logic/inbreed/inbreed-detector.js` などで修正前のファイルを一時ディレクトリへ書き出し、新旧を同じ Node の `vm` コンテキストへ読み込んで、実データからランダム生成した **種牡馬×繁殖牝馬 1000組以上**について `inbreedColorIndexes` / `dangerous` / `crosses.length` / 各クロスの `bloodVolume` を比較する。

**差分 0 件であること。** 依頼側の試作でも 1000組・差分0件を確認している。検証スクリプトは `tmp/` に置き、コミットしないこと。

### 3. 牝馬枠の再計算が既存データを再現する

`buildMareOccurrences` の新アルゴリズムが、`json/dabimasFactor-details/` に保存されている `mares` 配列を再現すること。

全2914頭について、`descendants` の nodeId と summary の本人 nodeId から15枠を計算し、保存値と比較する。**43,710枠すべて一致（不一致 0 件）であること。** 依頼側で確認済みの数値なので、この数字が出なければ実装が違う。

### 4. 既存ガードが通る

- `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html` が `[verify] OK` を返す
- `python -m pytest tests/ -q` が現行と同じ件数で pass する
- 変更した3ファイルすべてで `node --check` が通る
- `git diff --check` が何も出さない

### 5. 差分が指定ファイルだけに収まる

変更が `vue/logic/pedigree/pedigree-node-table.js` / `vue/logic/pedigree/pedigree-builder.js` / `vue/logic/inbreed/inbreed-detector.js` と本指示書の完了報告だけであること。`service-worker.js` の `CACHE_NAME` bump が必要なら、その1行は許可する（必要と判断した理由を完了報告に書くこと）。

## 検証コマンド

```
node --check vue/logic/pedigree/pedigree-node-table.js
node --check vue/logic/pedigree/pedigree-builder.js
node --check vue/logic/inbreed/inbreed-detector.js
node tmp/verify-phase1-scenario.cjs          # 受け入れ基準1
node tmp/verify-phase1-regression.cjs        # 受け入れ基準2
node tmp/verify-phase1-mareslots.cjs         # 受け入れ基準3
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html
python -m pytest tests/ -q
git diff --check
```

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。

### 変更ファイル一覧

- `vue/logic/pedigree/pedigree-node-table.js`: `canonicalNodeOf` を追加。`-00` を優先し、なければソート済みの最小 variant を返す。
- `vue/logic/pedigree/pedigree-builder.js`: 祖先セルへの牝馬選択時、先頭セルだけに `placeholderMareNodeId` を記録。
- `vue/logic/inbreed/inbreed-detector.js`: nodeTable 経路のプレースホルダー除外2箇所を削除し、牝馬15枠を明示配置・盤面の親情報・保存済み枠の優先順で再構築。
- `service-worker.js`: `CACHE_NAME` を `dabimas-factor-v20260908-07` へ更新。
- 本指示書: ステータスと完了報告を更新。

### 設計判断

- 対象 JavaScript が Service Worker のプリキャッシュおよび cache-first 配信対象のため、既存利用者にも更新が届くよう、許可されたキャッシュ名1行を更新した。
- 本体の実装方針は指定どおり。`index.html`、legacy 経路、表示出口、保存馬生成経路は変更していない。

### 実行した検証と結果

- 基準1: `node tmp/verify-phase1-scenario.cjs` — 成功。着色 `[0]`、ダンスインザダークのクロス1件、血量75000、出現 `index=0/path=""` と `index=null/path="M"`、`dangerous=true`。先頭セルのみの識別子付与、JSON保存・復元後の結果一致、ルート nodeId 不在時のフォールバック、nodeTable 不在時の挙動、canonical 解決も確認。
- 基準2: `node tmp/verify-phase1-regression.cjs` — seed `20260908` の実データ1,000組で、作業開始時 `5f2f16c` の判定と戻り値全体が一致（差分0件）。nodeTable 不在時も1,000組すべて一致。新旧関数は同じ Node vm コンテキストで読み込み、比較した。
- 基準3: `node tmp/verify-phase1-mareslots.cjs` — 全2,914頭・43,710枠が一致、不一致0件。実装の非公開関数を一時検証ランタイムで呼び出し、ルートの保存済み枠へのフォールバックを無効化して再計算を確認。null 枠も位置を維持して比較した。
- 基準4: 指定3ファイルの `node --check` — すべて成功。`powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html` — `[verify] OK`。`python -m pytest tests/ -q` — 既存テスト52件すべて成功（テストファイル変更なし）。`git diff --check` — 指摘なし。
- 基準5: 変更は指定3ファイル、許可されたキャッシュ名1行、本指示書のみ。検証スクリプトと旧実装のコピーは `tmp/` に置き、コミット対象外とした。
- `code-review` の独立した2エージェントによるレビュー: Standards（規約）0件、Spec（仕様）0件。いずれも指摘なし。

### 残課題・気づき

- 指示書記載の既知の制限は継続する。祖先セルを差し替えた盤面から保存馬を作る際の `mares` は、依然としてルートの `mareNodeIds` に由来する。フェーズ2で対応するため、今回は変更していない。
