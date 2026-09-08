# 作業指示書: 個体refと統合resolverを通す（全兄妹対応フェーズ2a）

- status: 完了（2026-09-09）
- 作成日: 2026-09-08
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 上位仕様: `docs/full-sibling-stacking-spec.md` v1.1（§4.1・§4.2・§5.2）
- 前提: フェーズ1（`docs/codex-work-orders/2026-09-08-inbreed-ancestor-broodmare.md`）が完了・検収済み（実装 c0f5b7d、検収 86b73d3）
- **稼働影響なし:** 本フェーズは配線だけで、クロス判定の結果を1件も変えない。それが受け入れ基準2である

## 背景と目的

仕様書 v1.1 のフェーズ2は「ref／resolver／親比較キー、保存・共有・診断への伝播、名前照合の禁止、表示抑制と分類修正」を一括で求めており、対象は9ファイルに及ぶ。一度に変えると、回帰が出たときに配線の不備か判定規則の不備かを切り分けられない。

そこで**判定規則を1つも変えずに、個体参照（ref）と統合 resolver だけを先に通す**。判定の切り替え（フェーズ2b）と表示・診断・共有（フェーズ2c）は本指示書のスコープ外とする。

### なぜ ref が必要か

現状、クロス判定は `nodeId`（マスタ variant の参照）だけを個体の手がかりにしている。しかし

- 自家製馬（`☆`）は `createSavedHorseSummary` が `nodeId` を `null` 固定にする（`vue/app/methods/horse-loading.js:143`）
- 自家製馬を祖先セルへ積むと、`saved-horse-builder.js` が `id` / `customHorseId` を祖先セルへ写さないため、セル上で無名になる
- エディット種牡馬も `nodeId` が `null` で、名前一致にしか引っかからない
- `★N薄め<馬名>` は自動生成名なので、名前一致で別個体が同一視され得る

このため「誰であるか」をセルとレコードへ明示的に持たせる必要がある。それが `identityRef` である。

## 実装方針

### 1. ref の形（4種）

```javascript
{ kind: "master",  nodeId: "0000274883-00" }
{ kind: "custom",  id: "ch_<UUID>" }
{ kind: "edit",    id: "<editStallions レコードの id>", baseHorseId: "<ベース馬の summary id>" }
{ kind: "unknown" }
```

セルから ref を作る規則は次の優先順で1つに決める。

1. `source === "edit"` → edit
2. `source === "custom"` または `customHorseId` が真 → custom（`id` は `customHorseId || id`）
3. `typeof nodeId === "string"` → master
4. それ以外（★薄め馬、手入力、detail 解決前）→ unknown

**`unknown` 同士、`null` 同士を一致させないこと。** 比較関数は常に false を返す。

### 2. 新規ファイル `vue/logic/pedigree/identity-resolver.js`

`window.Dabimas.logic.pedigree.buildIdentityResolver(sources)` を公開する。`sources` は
`{ nodeTable, customRecordsById, editRecordsById, baseHorseNodeIdById }`。
戻り値は `Object.freeze` した読み取り専用オブジェクトで、次を持つ。

| メソッド | 返すもの |
|---|---|
| `identityKey(ref)` | 保存個体としての同一性キー。master は `master:<nodeId>`、custom は `custom:<id>`、edit は `edit:<id>`、unknown は `null` |
| `crossHorseKey(ref)` | **クロス上の同一馬**キー。master と edit は `pedigree:<pedigreeId>`、custom は `custom:<id>`、unknown は `null`。edit はベース馬の pedigreeId を継ぐ |
| `parentComparisonKey(ref)` | **親として参照されたとき**のキー。下表 |
| `parentsOf(ref)` | `{ father, mother }`（いずれも ref）。取れなければ `null` |

`parentComparisonKey` の規則。

| ref の kind | キー |
|---|---|
| master（`subname` が null・空文字・`/^[0-9]+$/`） | `master-base:<pedigreeId>` |
| master（それ以外の `subname`） | `master-variant:<nodeId>` |
| custom | `custom:<id>` |
| edit | `edit:<id>`（通常血統キーへ落とさない） |
| unknown / 解決不能 | `null` |

マスタ馬の**親**は `nodeTable.parentsOf(nodeId)` が pedigree ID を返すので、
そのまま `master-base:<pedigreeId>` とする（variant を経由しない）。

> **落とし穴（必読）**: フェーズ1で `nodeTable.canonicalNodeOf(pedigreeId)` を足したが、
> **親比較キーの経路にこれを使ってはならない。** canonical は「`-00` があればそれ、無ければ
> variant_code 最小」であり、`-00` も年号版も持たない馬では**因名版が canonical になる**。
> その場合 `parentComparisonKey` が `master-variant:...` を返し、`master-base:<pedigreeId>` と
> 一致しなくなって全兄妹が永久に成立しない。該当する pedigree は現データで70件ある
> （ブルタカチホ、ランドプリンス等）。今のところ父母として参照されている馬は0件なので
> 表面化していないが、規則として危ない。pedigree ID からは直接 `master-base:` を作ること。

`parentsOf(ref)` の解決元。

- master → `nodeTable.parentsOf(nodeId)` の pedigree ID を `{kind:"master"}` ではなく**キー直値**として返せないため、
  `{ father: {kind:"masterPedigree", pedigreeId}, mother: {...} }` を返す。
  `parentComparisonKey` は `masterPedigree` を `master-base:<pedigreeId>` へ写す
- custom → 保存レコードの `fatherRef` / `motherRef`。無い旧レコードは `null`（推測補完しない）
- edit → ベース馬の nodeId から master と同じ解決
- unknown → `null`

### 3. セルへの伝播（`vue/logic/pedigree/pedigree-builder.js`）

`setDataForPedigree` が作る各セルへ次を足す。既存フィールドは変えない。

- `identityRef` — 上記の規則で作る
- `sexKind` — `"male"` / `"female"` / `"unknown"`。**位置から決める**。
  ルートセル（localIndex 0）は `horseData.sex === "1"` なら female、そうでなければ male。
  祖先セル（localIndex 1〜15）は常に male（男系枠なので）。
  牝馬15枠は判定側で female を付けるのでセルには持たせない
- `placeholderMareRef` — フェーズ1で追加した `placeholderMareNodeId` の**置き換えではなく併設**。
  `id !== 0` 分岐で `horseData` から作った ref を入れる。自家製牝馬を祖先セルへ置いたとき
  `placeholderMareNodeId` は `null` になるが `placeholderMareRef` は `{kind:"custom"}` を保持できる

ルートセル（0 / 16）には `mareRefs`（15件、`MARE_PATHS` と同じ順）も足す。値は
`mares` の各 nodeId から作った master ref、`null` の枠は `{kind:"unknown"}`。

### 4. 保存（`vue/logic/horses/saved-horse-builder.js`）

`buildSavedHorseRecord` が返すレコードへ次を足す。既存フィールドは1つも変えない。

```javascript
pedigreeSchemaVersion: 2,
identityRef: { kind: "custom", id: <このレコードの id> },
fatherRef:   <cells[0] の identityRef>,      // descendants[0] は cells[0]（＝父）
motherRef:   <cells[16] の identityRef>,
mareRefs:    <MARE_SOURCE_IDS と同じ順の15件>,
```

`descendants` の各要素にも `identityRef` を足す（元セルの ref をそのまま写す）。
`mareRefs` は `mares` と同じ `MARE_SOURCE_IDS` の対応で作る。`["dam", null]` の枠は
`cells[16].identityRef`、それ以外は `cells[0]` / `cells[16]` の `mareRefs[mareIndex]`。

### 5. 読み込み（`vue/app/methods/horse-loading.js`）

- `createSavedHorseSummary` に `identityRef` / `pedigreeSchemaVersion` を載せる。
  **`nodeId` / `pedigreeId` は `null` のまま変えない**（マスタ実馬へ化けさせないため）
- `createEditStallionSummary` に `identityRef: {kind:"edit", id, baseHorseId}` を載せる
- `hydrateHorseWithDetail` が `fatherRef` / `motherRef` / `mareRefs` を落とさないよう、
  `mares` と同じ扱いで detail から引き継ぐ
- `stripHorseForStorage` は除外リスト方式なので**変更不要**。新フィールドは自動的に localStorage を通る

### 6. resolver の組み立てと受け渡し

`vue/app/app-computed.js` に computed を1つ足す。

```javascript
identityResolver() {
  return window.Dabimas.logic.pedigree.buildIdentityResolver({
    nodeTable: window.Dabimas.pedigreeNodes || null,
    customRecordsById: this.customHorseDetails,
    editRecordsById: <this.editStallions を id キーの map にしたもの>,
    baseHorseNodeIdById: <this.horsesBase から id → nodeId>,
  });
}
```

`this.customHorseDetails` は `loadCustomHorseDetails` が全件を載せる既存のレジストリなので、
新しい読み込み経路は要らない。computed なので依存が変わったときだけ作り直される。

呼び出し側を第4引数へ対応させる。

- `vue/app/methods/inbreed-ui.js:104` — `judgeInbreed(this.selected, this.inbreedExceptions, window.Dabimas.pedigreeNodes || null, this.identityResolver)`
- `vue/logic/plan/plan-diagnosis.js:391, 424` — `input.resolver` を受け取ってそのまま渡す。
  呼び出し元（工程診断の起動側）から `resolver` を `input` へ足す

### 7. 判定側（`vue/logic/inbreed/inbreed-detector.js`）

**この段階では判定規則を1つも変えない。** やることは2つだけ。

1. 第4引数 `resolver` を受け取る（未使用でよい。`nodeTable` 同様 `null` を許容する）
2. occurrence へ `ref` と `sexKind` を足す。
   - 男系セル由来 → セルの `identityRef` と `sexKind`
   - 牝馬15枠由来 → `placeholderMareRef` があればそれ、無ければ算出した nodeId から作った master ref。
     `sexKind` は常に `"female"`

`isExactSameNode` / `isFullSiblingByMaster` / `isInbreedExcludedHorse` / 表示出口は**触らない**。

### 変更対象ファイル

- `vue/logic/pedigree/identity-resolver.js` — 新規。resolver 本体
- `vue/logic/pedigree/pedigree-builder.js` — セルへ `identityRef` / `sexKind` / `placeholderMareRef` / `mareRefs`
- `vue/logic/horses/saved-horse-builder.js` — レコードへ ref 一式
- `vue/app/methods/horse-loading.js` — summary / detail へ ref を引き継ぐ
- `vue/app/app-computed.js` — `identityResolver` computed
- `vue/app/methods/inbreed-ui.js` — 第4引数を渡す
- `vue/logic/plan/plan-diagnosis.js` — `input.resolver` を受けて渡す
- `index.html` — `identity-resolver.js` の script タグを `pedigree-node-table.js` の後、`inbreed-detector.js` より前に追加
- `service-worker.js` — `CACHE_NAME` の bump と、プリキャッシュ一覧への新ファイル追加

## 制約

- `AGENTS.md` に従うこと。特に `index.html` は `apply_patch` のみ、編集前に `backup-index-exp`、編集後に `verify-index-exp`。
- **クロス判定の結果を変えないこと。** 受け入れ基準2がこれを機械的に確認する。
- `judgeInbreed` の戻り値のキーを増減しないこと（`crosses[].occurrences` の要素にフィールドが増えるのは可）。
- `nodeTable` が無いときの縮退経路、legacy 経路（`recognizedCrosses` 系）を変更しないこと。
- 自家製の `nodeId` へマスタの実馬 ID を代入しないこと。
- 旧保存レコード（`pedigreeSchemaVersion` なし）は `fatherRef` / `motherRef` を `null` のままとし、
  `descendants[0]` や `mares[0]` からの推測補完をしないこと（仕様書 v1.1 §8）。

## スコープ外（やらないこと）

- **判定規則の変更**（同一馬判定・全兄妹判定・親比較キーの適用・名前フォールバックの禁止・`★☆` 除外の解除）。フェーズ2b。
- **表示抑制と分類の修正、工程診断の一時registry、共有の再帰収集**。フェーズ2c。
- `vue/logic/inbreed/inbreed-counts.js`、`vue/logic/theory/*.js`、`vue/constants/breeding-theories.js`。
- Python 生成処理と `json/` 配下。仕様書 v1.1 §8 のとおり変更なし。
- 旧保存のマイグレーション。
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

### 1. resolver が期待どおりのキーを返す

`json/pedigreeNodes.json` を読み込んだ resolver に対し、次が**文字列として完全一致**すること。

**クロス上の同一馬キーと親キー**

| ref | `crossHorseKey` | 父の `parentComparisonKey` | 母の `parentComparisonKey` |
|---|---|---|---|
| master `0000274883-00`（ダンスインザダーク通常） | `pedigree:0000274883` | `master-base:0000333862` | `master-base:0000383247` |
| master `0000274883-11`（同 燕闘） | `pedigree:0000274883` | `master-base:0000333862` | `master-base:0000383247` |
| master `0000262374-00`（ダンスパートナー） | `pedigree:0000262374` | `master-base:0000333862` | `master-base:0000383247` |
| master `0000140567-00`（シンボリルドルフ） | `pedigree:0000140567` | `master-base:0000333257` | `master-base:0000050973` |
| master `0000713851-00`（アドマイヤグルーヴ） | `pedigree:0000713851` | `master-base:0000333862` | `master-base:0000274849` |
| master `0001151936-00`（ドゥラメンテ） | `pedigree:0001151936` | `master-base:0000729458` | `master-base:0000713851` |

**親として参照されたときのキー**

| ref | `parentComparisonKey` |
|---|---|
| master `0000333257-01`（パーソロン1971） | `master-base:0000333257` |
| master `0000333257-10`（パーソロン覇煌） | `master-variant:0000333257-10` |
| master `0000333862-00`（サンデーサイレンス通常） | `master-base:0000333862` |
| master `0000333862-01`（同 1989） | `master-base:0000333862` |
| master `0000333862-02`（同 1995） | `master-base:0000333862` |
| master `0000333862-10`（同 覇煌） | `master-variant:0000333862-10` |
| master `0000729458-01`（キングカメハメハ2012） | `master-base:0000729458` |
| custom `ch_test` | `custom:ch_test` |
| edit（id `edit_1`、ベース `0001151936-00`） | `edit:edit_1` |
| unknown | `null` |

**同一性の否定**

- `crossHorseKey({kind:"unknown"})` と `crossHorseKey({kind:"unknown"})` を比較する関数は false
- `parentComparisonKey` が `null` 同士も false
- edit の `crossHorseKey` はベース馬と一致する（`pedigree:0001151936`）が、
  `parentComparisonKey` は一致しない（`edit:edit_1` ≠ `master-base:0001151936`）

### 2. クロス判定の結果が1件も変わらない

`git show HEAD:vue/logic/inbreed/inbreed-detector.js` などで修正前のファイルを一時ディレクトリへ書き出し、
新旧を同じ Node の `vm` コンテキストへ読み込み、実データからランダム生成した
**種牡馬×繁殖牝馬 1000組以上**について次を比較する。

`count` / `inbreedColorIndexes` / `dangerous` / `crosses.length` / 各クロスの `bloodVolume` /
`sameNameGroups` と `siblingGroups` の index 配列 / `selfAncestorWarningIndexes`

**差分 0 件であること。** `crosses[].occurrences` に `ref` / `sexKind` が増えるのは想定内なので比較対象に含めない。

祖先セルへ繁殖牝馬を置いた盤面（フェーズ1の A04 相当）でも同様に差分 0 件であること。

### 3. 保存レコードに ref が入る

`buildSavedHorseRecord` は純関数なので Node から直接呼べる。
`cells[0]` に master ref（`0000333257-01`）、`cells[16]` に master ref（`0000050973-00`）を持つ
32セルを与えて `broodmare` として保存したとき、返るレコードが次を満たすこと。

- `pedigreeSchemaVersion === 2`
- `identityRef.kind === "custom"` かつ `identityRef.id === record.id`
- `fatherRef` が `{kind:"master", nodeId:"0000333257-01"}`
- `motherRef` が `{kind:"master", nodeId:"0000050973-00"}`
- `mareRefs.length === 15` かつ `mareRefs[0]` が `motherRef` と同じ内容
- `descendants` の各要素が `identityRef` を持つ
- 既存フィールド（`id` / `name` / `sex` / `factors` / `descendants` の既存キー / `mares`）が
  変更前と同じ値であること

`cells[0]` を custom（`{kind:"custom", id:"ch_prev"}`）にした場合、
`fatherRef` が `{kind:"custom", id:"ch_prev"}` になること。**自家製の父が失われないこと**が本フェーズの要点である。

### 4. 既存ガードが通る

- `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html` が `[verify] OK`
- `python -m pytest tests/ -q` が 52 passed
- 変更した JS すべてで `node --check` が通る
- `git diff --check` が何も出さない
- 新規ファイルと変更ファイルに UTF-8 BOM が無く、改行が LF であること

### 5. 画面が壊れていない

`.claude/launch.json` の `static-verify`（ポート8767）でリポジトリ直下を配信し、次を確認する。
**ポート8766 には別ディレクトリの古いコピーを配信するサーバが常駐しているので使わないこと。**

- 血統表を開き、種牡馬と繁殖牝馬を選んでクロス着色と理論表示が従来どおり出る
- コンソールエラーが 0 件
- 選択したセルの `identityRef` と `sexKind` が入っている（`window` 経由で確認してよい）

## 検証コマンド

```
node --check vue/logic/pedigree/identity-resolver.js
node --check vue/logic/pedigree/pedigree-builder.js
node --check vue/logic/horses/saved-horse-builder.js
node --check vue/app/methods/horse-loading.js
node --check vue/app/app-computed.js
node --check vue/app/methods/inbreed-ui.js
node --check vue/logic/plan/plan-diagnosis.js
node tmp/verify-p2a-resolver.cjs        # 受け入れ基準1
node tmp/verify-p2a-regression.cjs      # 受け入れ基準2
node tmp/verify-p2a-savedrecord.cjs     # 受け入れ基準3
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html
python -m pytest tests/ -q
git diff --check
```

## 後続フェーズ（本指示書のスコープ外・参考）

| フェーズ | 内容 |
|---|---|
| 2b | 判定の切り替え。`sameCrossHorse` / `isFullSibling` / 親比較キーの適用 / 名前フォールバック禁止 / `★☆` 除外の解除 / `isSameBranch` の整合。受入は仕様書 v1.1 の A01・A03・A05・B01・B03〜B06・C01〜C03・D01〜D03・D07・D08・E01・F01 |
| 2c | 表示抑制と分類、工程診断の一時 registry、共有の再帰収集。受入は A02・B02・D04〜D06・E02〜E04 |

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。

### 変更ファイル一覧

- `vue/logic/pedigree/identity-resolver.js`: 個体ref生成、統合resolver、同一性・クロス・親比較キー、父母参照の解決、未知値同士を一致させない比較関数を追加。
- `vue/logic/pedigree/pedigree-builder.js`: 各セルへ `identityRef` / `sexKind`、牝馬選択先頭セルへ `placeholderMareRef`、ルートへ15件の `mareRefs` を追加。
- `vue/logic/horses/saved-horse-builder.js`: schema 2、本体・父母・祖先・牝馬枠のrefを保存。既存フィールドは維持。
- `vue/app/methods/horse-loading.js`: custom/edit summaryへのrefとschema情報、detailから父母ref・mareRefsの引き継ぎを追加。
- `vue/app/app-computed.js`: 既存のcustom/edit/baseレジストリから `identityResolver` を構築。
- `vue/app/methods/inbreed-ui.js`: 判定の第4引数へresolverを渡す。
- `vue/logic/plan/plan-diagnosis.js`: 通常・fallback両方の判定へ `input.resolver` を渡す。
- `vue/app/methods/plan-diagnosis-ui.js`: 診断起動時のinputへresolverを追加（実装方針6の呼び出し元対応）。
- `vue/logic/inbreed/inbreed-detector.js`: 第4引数を受け取り、nodeTable経路の内部・出力occurrenceへrefとsexKindを伝播。判定規則は変更なし。
- `index.html`: node-tableの後にresolverのscriptタグを追加。
- `service-worker.js`: resolverをプリキャッシュへ追加し、cache名を `dabimas-factor-v20260908-08` へ更新。
- 本指示書: ステータスと完了報告を記入。

### 設計判断

- 保存祖先には元の `id` が無いため、既存の `identityRef` も引き継ぐ。明示されたedit/customのsourceとIDを優先し、それらが無い祖先では保存refを使う。これにより自家製・editの祖先再配置で個体を失わない。
- ルートの `mareRefs` はdetailに保存済みのrefがある場合それを優先し、無い枠は `mares` からmaster/unknown refを作る。保存済みcustom牝馬refをmaster/nullに置換しないため。
- resolverに `sameCrossHorse` / `sameKnownParent` を追加し、未知キー同士の比較をfalseにする。判定側への適用は行っていない。
- `hydrateHorseWithDetail` へ第4引数detailを追加し、既存の全5呼び出しで渡す。旧レコードの父母はnullを保持し、祖先情報から推測しない。
- `index.exp.html` は存在しないため、バックアップコマンドには実際の編集対象 `index.html` を明示した。バックアップ成功後にapply_patchで編集し、直後のverify成功を確認した。

### 実行した検証と結果

- 基準1: `node tmp/verify-p2a-resolver.cjs` — 成功。指定の全キー、unknown/null同士の不一致、editとベース馬のクロスキー一致・親キー不一致、旧customの父母未解決、computed配線を確認。canonicalを呼ぶと失敗する模擬nodeTableでも親キーが直接解決されることを確認。
- 基準2: `node tmp/verify-p2a-regression.cjs` — 成功。固定点 `102a56c79fb757b0b0f42000bf4457a4c71e2a1c` の旧builder/判定と新実装を同じNode vmへ読み込み、seed `20260908` の実データ1,000組で比較。追加ref関連フィールドを除く戻り値全体・セル既存フィールドの差分0件。祖先牝馬配置はlocalIndex 3/5/7/9/11/13/15の全7箇所で差分0件。nodeTable無しの結果も全件一致。nodeTable経路の出力occurrenceにrefとsexKindがあることも検証。
- 基準3: `node tmp/verify-p2a-savedrecord.cjs` — 成功。指定のパーソロン1971×スイートルナからschema 2と父母・15牝馬枠・15祖先のrefを確認。UUIDを固定して旧保存関数との既存フィールド完全一致を確認。custom父ref、保存JSON→summary→ensureHorseDetail→セル再配置の伝播、custom牝馬のplaceholder、edit summary、旧レコードの父母nullを確認。
- 基準4: 変更・新規JavaScript全10ファイルの `node --check` — 成功。`powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html` — `[verify] OK`。`python -m pytest tests/ -q` — `52 passed`。`git diff --check` — 指摘なし。変更・新規JS/HTML全11ファイルのUTF-8 BOM無し・LFをバイト検査で確認。
- 基準5: `.claude/launch.json` のstatic-verifyと同じPython HTTP serverをリポジトリ直下・ポート8767で起動。`scripts/codex-powershell.ps1 dump-dom` / `screenshot` と一時ハーネス `tmp/verify-p2a-ui.html` で実アプリを表示し、選択ハンドラからダンスインザダーク通常版とダンスパートナーを選択。ルート2セルのクロス着色、クロス1件、`theory_08`（危険な配合）、32セルのidentityRef/sexKind、コンソールエラー0件を確認。画像 `tmp/p2a-ui.png` も目視確認。起動直後の最初の確認は待機中にタイムアウトしたが、再実行で読み込み・選択・描画すべて成功した。
- レビュー: Standardsは独立エージェントによる指摘0件。Spec担当エージェントは利用上限で停止したため、親エージェントが仕様・全差分・上記検証結果を照合し、未対応要件がないことを確認した。独立Specレビュー完了とは扱っていない。
- 検証スクリプト・旧実装コピー・画面ログ・画像は `tmp/` に置き、コミット対象外。

### 残課題・気づき

- 本フェーズではresolverを判定規則へ適用していない。custom/unknownを含む判定切り替え、名前照合禁止、★☆除外解除はフェーズ2bに残る。
- 盤面編集後の牝馬枠保存との整合、工程診断の一時registry、共有の再帰収集、表示抑制・分類変更は後続フェーズで扱う。今回は旧保存のマイグレーションを行っていない。

---

## 検収記録（Claude / 2026-09-09）

### 再実行した受け入れ基準

依頼側が独立に書いた検証スクリプトで全基準を再実行した。基準2は Codex とは**別の seed（`0x20260909`）**を使い、
比較項目も指示書より広く取った（`count` / `inbreedColorIndexes` / `dangerous` / `crosses.length` /
`bloodVolume` / `generations` / occurrence の index・path・side・generation・nodeId /
`sameNameGroups` / `siblingGroups` / `selfAncestorWarningIndexes` / `sameNameSpecialChecks`）。

| 基準 | 結果 |
|---|---|
| 1. resolver のキー | OK。指定した全キーが文字列一致。unknown 同士・null 同士が不一致、edit の crossHorseKey がベース馬と一致し親キーは不一致、旧 custom の父母が未解決、まで確認（34項目） |
| 2. 判定結果が変わらない | OK。通常盤面1000組で差分0。祖先牝馬配置を **localIndex 3/5/7/9/11/13/15 × 父側・母側の14通り**で差分0。nodeTable 不在経路も一致 |
| 3. 保存レコードの ref | OK。schema 2 / identityRef / fatherRef / motherRef / mareRefs 15件 / descendants 全件の ref を確認。自家製の父が `{kind:"custom"}` で残ること、既存フィールドが旧 builder と完全一致することも確認（10項目） |
| 4. 既存ガード | OK。変更・新規 JS 9件の `node --check`、`verify-index-exp` → `[verify] OK`、`pytest` → 52 passed、`git diff --check` 指摘なし、BOM なし・LF |
| 5. 画面 | OK（下記の注記あり）。script 読み込み順は node-table → identity-resolver → pedigree-builder で正しい。SW のプリキャッシュ追加と CACHE_NAME bump も確認 |

### 検収側で直した点

**`ref` と `sexKind` をセルから読むのではなく、判定時に導出するようにした。**

指示書の「男系セル由来 → セルの `identityRef` と `sexKind`」という書き方が literal すぎた。
localStorage から復元した**フェーズ2a以前のスナップショット**にはこれらのフィールドが無く、
実機で確認したところ `identityRef` を持つセルが 0/32、occurrence の `ref` も欠落していた。

そこで `inbreed-detector.js` に `cellRef()` を足し、`createIdentityRef(cell)` で導出するようにした。
同関数は `identityRef` があればそれをそのまま返すので、新しい盤面の挙動は変わらない。
`sexKind` も同様に位置から決める（ルートは `sex === "1"` で判定、男系15枠は常に male）。

修正後に基準1〜3を再実行し、同じ結果（差分0・44項目 OK）であることを確認した。
実機でも復元済み盤面の occurrence が `ref` 2/2 になり、判定結果は `[0]` / `dangerous=true` のまま変わらなかった。

### 画面確認の注記

`.claude/launch.json` の `static-verify`（ポート8767）で確認した。全リソースが 200/304 で読み込まれ、
クロス着色・理論表示・セルの `identityRef` / `sexKind` は期待どおり。

ただしコンソールに ServiceWorker 登録エラーが出る。
**これは本変更とは無関係の環境要因である。** `service-worker.js` 自体は 200 で取得でき構文も正常で、
**無改造の旧コピーを配信しているポート8766でも同一のエラーが再現する**（対照実験で確認）。
埋め込みブラウザ側の制約と判断した。

なお検収の途中、ポート8767 にフェーズ1時点のキャッシュ（`dabimas-factor-v20260908-07`）を持つ
ServiceWorker が残っており、古い JS が配信されて一度誤った測定をした。
**画面確認の前に SW とキャッシュを消すこと。**

### フェーズ2bへの申し送り

**自家製の繁殖牝馬を祖先セルへ置くと、本人の出現が作られない。** 実測で確認した。

```
cell19 placeholderMareNodeId = null
cell19 placeholderMareRef    = {"kind":"custom","id":"ch_A"}
牝馬枠の出現                  = []        ← 本人がどこにも現れない
```

`buildMareOccurrences` は `if (typeof nodeId !== "string") return;` で出現を捨てるため、
nodeId を持たない custom 牝馬は ref を持っていても判定へ届かない。
フェーズ2bでは**この門を「ref が解決できる、または nodeId が文字列」へ広げる**必要がある。
本フェーズは挙動不変が要件なので、ここは意図的に直していない。
