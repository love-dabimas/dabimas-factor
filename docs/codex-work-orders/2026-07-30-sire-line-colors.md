# 作業指示書: 子系統カラー設定（設定画面からの色割り当て＋子系統モード特化表示）

- status: 完了（2026-08-01 検収済み。実機・実画面の操作確認は残（検収記録参照））
- 作成日: 2026-07-30
- 依頼元: Claude Code セッション

## 背景と目的

ユーザーが子系統（サイアーライン、全 58 系統）を自由に色分けし、血統表の**子系統モード**（`dispCategory` が奇数のときの表示）を「子系統グルーピングに特化した画面」にする。

- 色は親系統・血統・強さに**意味を持たせない**。ユーザーが「自分の目印」として自由に割り当てるだけの機能。
- 色は 9 色（①〜⑨）＋未設定。UI では番号で識別し、色名（赤・青など）は表示しない。
- 色の割り当ては**設定画面**（ホーム右上の歯車 → 設定メニュー）から行う。
- 割り当ては**アプリ全体で 1 セット**（カテゴリ・作業枠に紐づかないグローバル設定）。IndexedDB `dabifaku_unified` の appMeta ストアに永続化する。
- 子系統モードでは:
  - 既存の**行テーマ色**（馬セルの水色/ピンク/緑/黄と、そのフォールバック系）を消し、設定した子系統色で**行全体**を塗る。因子セル・親系統セルなど固有の色を持つセルはそちらを優先する。
  - 集計ヘッダのニトロ・クロス表を潰し、**色バケット別の子系統集計**（未・①〜⑨ × 系統数/出現数）に置き換える。
- **通常モード（馬選択画面）は一切見た目を変えない。**

この指示書は仕様と実装方針の両方を含む。**この文書だけで実装が完結する**ように書いてある。外部の仕様書 v4（`子系統色設定仕様_v4_色定義追加.md`）は参照不要（本文書が正）。

## 仕様

### §1 色定義（正式パレット）

| 区分 | HEX | 実装上の色名（UI 非表示） | 黒文字コントラスト |
| --- | --- | --- | --- |
| 未設定 | （塗りなし。背景変更しない） | - | - |
| ① | `#F4B8B8` | red | 12.4:1 |
| ② | `#F6CD9E` | orange | 14.1:1 |
| ③ | `#F2E388` | yellow | 16.1:1 |
| ④ | `#BCDD9A` | yellow-green | 14.0:1 |
| ⑤ | `#8FDEC1` | teal | 13.4:1 |
| ⑥ | `#9BD6EF` | sky | 13.3:1 |
| ⑦ | `#AABCF0` | blue-violet | 11.2:1 |
| ⑧ | `#D4B8EC` | purple | 11.9:1 |
| ⑨ | `#F1B3D8` | pink | 12.2:1 |

- 全 9 色は CIEDE2000 で相互色差 ΔE ≥ 9.9（最悪ペア ⑧-⑨）になるよう選定済み。**HEX 値を変更しない**こと。
- 文字色は変更しない（Vuetify 既定の `rgba(0,0,0,0.87)` のまま。全色で WCAG AAA を満たす）。
- **未設定はグレー等で塗らない**。クラスを付与しない＝塗りなし、とする。
- 色覚特性対応: 色付きの系統名表示には必ず番号バッジ（`①`〜`⑨` の丸数字文字）を系統名の前に付ける（§3）。色だけに頼る識別にしない。

### §2 データモデル

appMeta ストア（key-value）に 1 キーで保存する。

```
key: "sireLineColorSettings"
value: {
  schemaVersion: 1,
  colors: { "<sireLineId>": <1〜9 の整数> },   // 例 { "4": 1, "21": 6 }。未設定の系統はキー自体なし
  labels: { "<1〜9>": "<文字列>" }              // 色スロットの任意ラベル。例 { "1": "スピード用" }。未設定はキーなし
}
```

- `sireLineId` は `data/sire_lines_public.json` の `id`（1〜58）。子系統名の文字列をキーにしない（名前は表記揺れ・trim の問題があるため）。
- ラベルは trim 後 **最大 10 文字**。空文字はキー削除扱い。ラベルは設定画面（パレット選択・ラベル編集）でのみ表示し、血統表・集計には出さない。
- 読み込み時は必ずバリデーション（§7 の `validateSettings`）を通し、範囲外の値・未知のキーは黙って捨てる（クラッシュさせない）。
- 「すべて解除」は `colors` を空にするだけで `labels` は残す。
- 名前→ID の解決は `nicks-boot.js` と同じ規則（`name.trim()` の完全一致）。解決できない系統名（自家製馬など）は「未設定」バケット扱い。エラーを出さない。

### §3 血統表への反映（子系統モードのみ）

通常モード（`dispCategory` が偶数）は**現状の見た目を 1px も変えない**。以下はすべて子系統モード（奇数）のときだけ適用する。

#### §3.1 既存の行テーマ色の無効化

子系統モード中は、血統表ラッパーにモードクラス `exp-category-mode` を付与し（§5.4）、CSS で以下のクラスの背景だけを透明にする（border・font-size 等の他プロパティは触らない。`.Broodmare` はグラデーションなので `background-color` ではなく `background: transparent` で上書きする）:

- 馬セル td の行テーマ: `.AliceBlue` `.SalmonPink` `.Broodmare` `.omoshiro_0` `.migoto_0`
- rowState フォールバックの行テーマ: `.factor_AliceBlue` `.factor_SalmonPink` `.factor_omoshiro` `.factor_migoto`

**触らないもの**（子系統モード中も現状の色を維持）: 因子セルの `f01`〜`f14` 系クラス、親系統名のクラス（親系統セルに親系統が入っているとき）、父母ラベルセル（`father*` / `mother*`）、インブリード強調（`inbreed` クラス、ハートボタンの状態色）、ヘッダ以外の全 UI。

#### §3.2 子系統色による行の塗り

行（血統表の 1 馬ぶん）の各セルを、その行の子系統に割り当てた色で塗る。**ただし固有の色を持つセルはそちらを優先**する。セル別の適用先:

| セル | 子系統モードでの背景 |
| --- | --- |
| 馬セル td（memo-cell が乗る td） | 子系統色（未設定は塗りなし） |
| memo-cell の系統名・メモの両 v-text-field | 子系統色（Vuetify solo の白を上書き。未設定は白のまま） |
| 世代セル | 子系統色 |
| 親系統セル | 親系統が入っていれば**既存の親系統色を優先**。空（フォールバック）なら子系統色 |
| ハートボタンセル | インブリード状態のクラスが入っていれば**それを優先**。フォールバックなら子系統色 |
| 因子セル ×3 | 因子があれば**既存の f クラス色を優先**。因子なし（フォールバック）なら子系統色 |
| 父母ラベルセル | 現状のまま（塗らない） |

- 系統名フィールドの表示値は `<丸数字><系統名>`（例 `④ネアルコ系`）にする。未設定・未解決の系統は現状どおり系統名のみ。丸数字は**表示時に組み立てるだけ**で、`category` 配列や保存データには一切書き込まない。
- 集計ヘッダの既存の子系統数セル（`categoryNumtoString` 表示）は §4 の新ヘッダ内で維持する。

### §4 集計ヘッダ（子系統モード時の置き換え）

`factor-summary-header` は、子系統モード時に**ニトロ・クロスの集計表を丸ごと色バケット集計表に置き換える**。通常モード時の DOM は変更しない。

#### §4.1 集計の定義

32 セルの `category`（子系統名）を色バケットに分類して数える。バケットは「未」（色未割り当て or 名前が ID 解決できない）＋①〜⑨ の 10 個。

- **系統数**: バケット内の、重複を除いた子系統の種類数（trim した名前の distinct 数）。
- **出現数**: バケット内の、延べ登場セル数。
- 空セル（`category[i]` が null/空文字）はどのバケットにも数えない。
- 全バケットの系統数の合計は、既存の子系統数セルの値と一致する（既存 `dispCategoryCount` は「distinct な非 null 名の数」を出しており、定義が同じため）。既存セルの計算は**変更しない**。

#### §4.2 PC レイアウト（mdAndUp）

既存の tbody に `dispCategory % 2 === 0` の条件を足し、奇数用の tbody を新設する。奇数用は既存と同じ 3 行構造で:

- ヘッダ行: 「未」＋「①」〜「⑨」の 10 セル。各セルは対応する色で塗り（`sire-color-<n>` クラス。未は塗りなし）、丸数字を表示する（凡例を兼ねる）。
- 「系統数」行: 行ラベルセル＋バケット別の系統数 10 セル。
- 「出現数」行: 行ラベルセル＋バケット別の出現数 10 セル。
- 右端は既存の奇数モードと同じ機能を維持する: 子系統数ラベル＋値（`categoryNum`）、配合保存ボタン（horse アイコン、`combination-open`）、リセットボタン（`reset`）。
- 左端に「戻る」相当のクリック可能セル（例: 縦書きラベル「系統」、click で `toggle-category` を emit）を置く。既存 PC の「クロス」セルクリックによるモード切替の代替。

#### §4.3 モバイルレイアウト（smAndDown）

既存の tbody に偶数条件を足し、奇数用の tbody を新設する。奇数用:

- ヘッダ行: スクリーンショットボタン（既存と同じ `capture-screenshot`）＋「未」「①」〜「⑨」の色付きセル＋「子系統」ラベルセル。
- 「系統数」行: ラベル（colspan 2）＋ 10 セル＋右端上段に子系統数の値（rowspan 2 可）。
- 「出現数」行: ラベル（colspan 2）＋ 10 セル＋右端下段に配合保存ボタン（既存奇数モードと同じ `combination-open`）。
- モバイルのモード切替は血統表内の「子系統」ボタン（pedigree-row の rowIndex 16）が既存どおり担うので、ヘッダ内に切替セルは不要。

#### §4.4 高さ再計測

モバイルはヘッダ高さを `applyMobileViewportLayout()` が実測している。`dispCategory` の既存 watch（`vue/app/app-computed.js`）で再計測が走ることを確認し、走らない・崩れる場合のみ既存の呼び出しパターン（`scheduleInitialMobileViewportLayout` 等）に合わせて再計測を追加する。

### §5 反映タイミング・リアクティビティ（実装上の要点）

1. **起動時読み込み**: `dbinitializer` 内で**非ブロッキング**に読み込む（`loadEditStallions` と同様の並行パターン。復元チェーンには**加えない**）。マスター fetch と appMeta 読み込みの両方が解決してから root state `sireLineColorSettings` に**1 回で**代入する。
2. **設定変更時**: root の保存メソッドは state を**新しいオブジェクトで置き換える**（ミューテーション禁止）。これが下記 3〜5 の再描画トリガーになる。
3. **rowState 経路**: `selectionArraysForRowState`（computed）に `dispCategory` / `category` / `sireLineColors: this.sireLineColorSettings` を追加し、`buildRowState` をモード対応にする（§3.2 のフォールバック差し替えと `categoryColorClass` フィールド追加）。`category` は index 直接代入で変更される配列だが、馬の選択は通常モードでしか起きず、モード切替（`dispCategory` 変更）で必ず再計算されるため問題ない。
4. **集計カウント**: root に **method**（computed にしない）`buildSireLineColorCounts()` を作り、index.html のヘッダ binding から `dispCategory % 2 === 1 ? buildSireLineColorCounts() : null` で渡す。computed にしない理由: `category` が index 直接代入のため computed だと古い値をキャッシュする（既存 `dispCategoryCount` が method なのと同じ理由）。この理由をコードコメントに書くこと。
5. **memo-cell**: 色解決は**表示している系統名と同じ render 内**で行う（`horseSelectionOptions` 経由で settings を prop 渡しし、memo-cell 内で `category[index]` から解決する）。色と名前が絶対にズレないようにするため。

### §6 設定画面（子系統カラー管理ビュー）

`settings-page.js` のメニューに「子系統カラー」（アイコン `mdi-palette`、subtitle「色分けの割り当て・ラベル」）を追加し、タップで管理ビュー `sire-line-color-manager` に切り替える（`activeMenu = 'sire-line-colors'`。エディット種牡馬と同じパターン）。

管理ビューの構成（`edit-stallion-manager.js` の流儀に合わせる）:

1. **app-bar**: 戻るボタン（`@back` → メニューへ）、タイトル「子系統カラー」。
2. **ヘッダ行**: 「設定済み n / 58」の件数表示＋「色ラベル」ボタン＋「すべて解除」ボタン。
   - すべて解除は確認ダイアログ（「すべての子系統の色設定を解除します。よろしいですか？」）を挟む。ラベルは消さない。
3. **系統リスト**: 58 系統を**大系統ごとにグループ表示**する。
   - グループヘッダ: `baseAbbr`＋`baseName`（例「Ph｜Phalaris」）。マスターの `sireLineBaseId` でグループ化し、グループ内・グループ間とも `id` 昇順。
   - 各行: 先頭に現在色のスウォッチ（色付き円＋丸数字。未設定は輪郭のみの円）、続けて系統名。**行の背景も現在色で塗る**（未設定は塗らない）。一覧を見るだけで配色の全体像が分かるようにするため。
   - 行タップで **色ピッカーダイアログ**を開く。
4. **色ピッカーダイアログ**(1 個を使い回す):
   - タイトル: 対象の系統名。
   - 本文: 「未設定」＋①〜⑨ の 10 ボタンをグリッド表示。各色ボタンは背景 = その色、表示 = 丸数字＋ラベル（あれば）。現在の選択には枠線等の選択中スタイル。
   - ボタンタップで**即保存して閉じる**（確定ボタンは置かない）。
5. **色ラベル編集ダイアログ**: ①〜⑨ の 9 行（色スウォッチ＋ `v-text-field`、`maxlength=10`、`counter`）＋保存・キャンセル。保存で 9 件まとめて永続化。

- 保存はすべて即時に appMeta へ書き込む。失敗時は `console.error`（既存のエラー通知パターンがあればそれに合わせる）。
- マスター読み込みが終わるまではローディング表示（`v-progress-circular` など簡素でよい）。

### §7 ロジックモジュール（純関数）

新規 `vue/logic/sire-line-colors.js`（classic script / IIFE / `window.Dabimas.logic.sireLineColors`）に以下を置く。**DOM・Vue・IndexedDB に触らない**（fetch のみ可）。

```
COLOR_HEX:   [null, "#F4B8B8", "#F6CD9E", "#F2E388", "#BCDD9A", "#8FDEC1", "#9BD6EF", "#AABCF0", "#D4B8EC", "#F1B3D8"]
COLOR_BADGE: ["", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"]

ready()                        // data/sire_lines_public.json を 1 回だけ fetch する Promise（キャッシュ）。
                               // 失敗時は console.warn して resolve（機能全体を未設定扱いに落とす）
getMasterLines()               // ready 解決後に系統配列（id/name/sireLineBaseId/baseName/baseAbbr）を返す。未解決なら []
groupByBase(lines)             // 大系統グループの配列 [{ baseId, baseAbbr, baseName, lines: [...] }]（id 昇順）を返す純関数
colorIndexForName(name, settings)  // 系統名（trim して名前→ID 解決）→ 0〜9。解決不能・settings null は 0
colorIndexForId(id, settings)      // sireLineId → 0〜9
badgeFor(colorIndex)           // "①" 等。0 は ""
colorClassFor(colorIndex)      // "sire-color-4" 等。0 は ""
countCategoryColorBuckets(categoryArray, settings)
                               // → { distinct: number[10], total: number[10] }（index 0 = 未）。§4.1 の定義どおり。
                               // null/空文字はスキップ。distinct は trim 後の名前の Set で数える
validateSettings(raw)          // 生 JSON → { schemaVersion:1, colors:{}, labels:{} } に正規化。
                               // colors: id 1〜58・値 1〜9 の整数のみ通す。labels: キー 1〜9・値は trim して 1〜10 文字のみ通す。
                               // raw が null/不正型でも必ず有効なオブジェクトを返す
```

`nicks-boot.js`（ES module・相性計算専用）には**依存しない**。こちらは独立に master を読む（fetch は SW precache 済みなのでコスト無視できる）。

### §8 CSS

`css/unified.css` に追記。html2canvas（スクリーンショット機能）互換のため **CSS カスタムプロパティは使わず**、明示的なルールで書く。specificity の関係（中和ルールが 2 クラス）に注意して、以下の 4 系統を**この順で**置く:

```css
/* (1) 中和: 子系統モード中だけ行テーマ色の背景を消す（border 等は触らない） */
.exp-category-mode .AliceBlue,
.exp-category-mode .SalmonPink,
.exp-category-mode .Broodmare,
.exp-category-mode .omoshiro_0,
.exp-category-mode .migoto_0,
.exp-category-mode .factor_AliceBlue,
.exp-category-mode .factor_SalmonPink,
.exp-category-mode .factor_omoshiro,
.exp-category-mode .factor_migoto {
  background: transparent;
}

/* (2) 設定画面・ヘッダ凡例用（9 ルール） */
.sire-color-1 { background-color: #F4B8B8; }
/* … sire-color-2〜9 … */

/* (3) 血統表 td 用。td 付きで (1) より強くする（9 ルール） */
.exp-category-mode td.sire-color-1 { background-color: #F4B8B8; }
/* … 2〜9 … */

/* (4) memo-cell の v-text-field 用。Vuetify solo の白を上書き（9 ルール） */
.exp-category-mode .sire-color-cell.sire-color-1 .v-input__slot { background-color: #F4B8B8 !important; }
/* … 2〜9 … */
```

スウォッチ円・選択中スタイルなど設定画面専用の装飾クラスも unified.css に置く。

## 実装方針

実装順の推奨:

1. `vue/logic/sire-line-colors.js` — 新規。§7 の定数と純関数。
2. `css/unified.css` — §8 のルール追記。
3. `vue/app/app-state.js` — `createInitialState()` に `sireLineColorSettings: null` を追加。
4. `vue/app/methods/sire-line-color-settings.js` — 新規（`pedigree-cells.js` と同じ `Object.assign(window.Dabimas.app.methods, {...})` パターン）。root メソッド:
   - `loadSireLineColorSettings()` — `logic.sireLineColors.ready()` と `repositories.appMeta.get("sireLineColorSettings")` を `Promise.all` → `validateSettings` → `this.sireLineColorSettings` に代入。失敗時は `console.warn` ＋空設定を代入。
   - `saveSireLineColorAssignment(sireLineId, colorIndex)` — colorIndex 0 はキー削除。新オブジェクトを作って appMeta へ `set` → 成功後に state を置き換え。
   - `saveSireLineColorLabels(labels)` — validate 済みラベルで同様に保存。
   - `clearAllSireLineColors()` — `colors: {}`（labels 温存）で保存。
   - `buildSireLineColorCounts()` — `logic.sireLineColors.countCategoryColorBuckets(this.category, this.sireLineColorSettings)` を返すだけ（§5-4 のコメント必須）。
5. `vue/app/methods/horse-loading.js` — `dbinitializer()` 冒頭（`loadEditStallions()` の隣）に `this.loadSireLineColorSettings();` を追加。**戻り値をどの Promise チェーンにも合流させない**。
6. `vue/app/app-computed.js` — `horseSelectionOptions()` に `sireLineColors: this.sireLineColorSettings,` を追加。`selectionArraysForRowState()` に `dispCategory` / `category` / `sireLineColors` を追加。
7. `vue/logic/pedigree/pedigree-selection.js` — `buildRowState` をモード対応にする（§3.2）:
   - 子系統モード時、その行の `colorClass = colorClassFor(colorIndexForName(arrays.category[index], arrays.sireLineColors))` を求める。
   - `generationCellClass` / `factorClasses` のフォールバック / `parentLineClass` のフォールバック / `inbreedButtonClass` のフォールバックで、テーマ色（`getCss`）の代わりに `colorClass`（空なら無色）を使う。値が入っている場合（f クラス・親系統名・インブリード状態）は現状どおり優先。
   - 戻り値に `categoryColorClass`（子系統モード時 `colorClass`、通常モード時 `""`）を追加。
8. `vue/components/pedigree/pedigree-row.js` — 馬セル td を `:class="[row.autoClass, rowState.categoryColorClass]"` に変更。horse-cell への binding に `:color-settings="horseOptions.sireLineColors"` を追加。
9. `vue/components/pedigree/horse-cell.js` — prop `colorSettings: { type: Object, default: null }` を追加し、memo-cell へ `:color-settings="colorSettings"` を渡す。
10. `vue/components/pedigree/memo-cell.js` — prop `colorSettings` 追加。computed で `colorIndex`（`colorIndexForName(this.category[this.index], this.colorSettings)`）を作り、両方の v-text-field に `sire-color-cell sire-color-<n>` クラス（colorIndex 0 なら付与しない）、系統名フィールドの表示値に丸数字接頭辞を適用。メモ側の値・イベントは不変。
11. `vue/components/pedigree/pedigree-card.js` — prop `categoryMode: { type: Boolean, default: false }` を追加し、`.pedigree-card-table-wrap` に `:class="{ 'exp-category-mode': categoryMode }"` を付ける。
12. `vue/components/header/factor-summary-header.js` — prop `sireLineCounts: { type: Object, default: null }` を追加。既存 PC/モバイル tbody に偶数条件を足し、奇数用 tbody を §4.2 / §4.3 のとおり新設。
13. `vue/components/settings/sire-line-color-manager.js` — 新規。§6 の管理ビュー。マスターは `logic.sireLineColors.ready()` → `getMasterLines()` / `groupByBase()` で取得。保存は `$root` のメソッド呼び出し。
14. `vue/components/settings/settings-page.js` — メニュー項目＋ `activeMenu === 'sire-line-colors'` の分岐追加。
15. `index.html` — (a) factor-summary-header に `:sire-line-counts="dispCategory % 2 === 1 ? buildSireLineColorCounts() : null"` を追加、(b) 2 つの pedigree-card に `:category-mode="dispCategory % 2 === 1"` を追加、(c) script タグ 3 本追加（logic は既存 logic 群の位置、methods は既存 `vue/app/methods/*.js` 群の位置で `main.js` より前、component は `settings-page.js` の近く）。
16. `service-worker.js` — 新規 3 ファイルを `urlsToCache` へ追加し、`CACHE_NAME` を現行 `dabimas-factor-v20260723-02` から **1 回だけ** bump（日付形式を踏襲）。

### 変更対象ファイル

- `vue/logic/sire-line-colors.js` — 新規。マスター読み込み＋純関数（§7）
- `vue/app/methods/sire-line-color-settings.js` — 新規。root の load/save/counts メソッド
- `vue/components/settings/sire-line-color-manager.js` — 新規。管理ビュー（§6）
- `vue/app/app-state.js` / `vue/app/app-computed.js` / `vue/app/methods/horse-loading.js` — state・computed・起動ロード
- `vue/logic/pedigree/pedigree-selection.js` — buildRowState のモード対応（§3.2）
- `vue/components/pedigree/pedigree-row.js` / `horse-cell.js` / `memo-cell.js` / `pedigree-card.js` — 塗りと prop の橋渡し
- `vue/components/header/factor-summary-header.js` — 子系統モード用集計表（§4）
- `vue/components/settings/settings-page.js` — メニュー追加
- `css/unified.css` — §8
- `index.html` — binding 3 箇所＋ script タグ 3 本
- `service-worker.js` — precache 3 件＋ CACHE_NAME bump

## 制約

- `AGENTS.md` の Safety Rules に従うこと（`index.html` は apply_patch 限定・編集前 backup・編集後 verify・BOM 禁止）。
- 新規 JS は classic script（IIFE + `window.Dabimas`）、UTF-8 BOM なし。Vuetify 2 の既存コンポーネントの流儀に合わせる。
- パレットの HEX 値（§1）を変えない。logic モジュールの `COLOR_HEX` と `css/unified.css` のルールは完全一致させる。
- `category` 配列・`son` の値（子系統名文字列）・`categoryNumtoString` / `dispCategoryCount` の計算を**一切改変しない**。丸数字は表示値の組み立てのみで付け、state・保存データには書き込まない。
- **通常モード（`dispCategory` 偶数）の DOM・見た目を変えない**。既存 tbody・既存クラスの変更は「偶数条件の追加」と「馬セル td の class 配列化（通常モードでは空文字が足されるだけ）」のみ。
- 因子セルの `f01`〜`f14`、親系統名クラス、`inbreed` クラス、父母ラベルセルの色には触れない（§3.1「触らないもの」）。
- `nicks-boot.js`・`vue/logic/nicks/*`・`vue/logic/theory/*`・`vue/logic/inbreed/*`・`vue/CombinationDialog.js`・`json/` 配下・`data/sire_lines_public.json` に触れない。
- `workspaceSync`・作業枠 snapshot（localStorage 6 キー）に色設定を乗せない（グローバル設定は appMeta のみ）。
- git の commit / branch / restore / stash 操作を一切行わない。

## スコープ外（やらないこと）

- 通常モードの行テーマ色の廃止（子系統モード限定。§3.1）。
- 色設定のエクスポート／インポート、作業枠・カテゴリ単位の色セット切り替え。
- ダークモード対応。
- note 向けマニュアル（`note-article/`）の更新。
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

1. `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp index.html` が `[verify] OK`。
2. **純関数の Node 検証**（`tmp/sire-line-colors-verify/logic-check.mjs`。stub window で logic ファイルを eval する既存パターン）:
   (a) `validateSettings` — null / 不正型 / 範囲外 id / 範囲外 colorIndex / 11 文字ラベル / 非文字列ラベルがすべて除去され、正常値だけ残る。
   (b) `colorIndexForName` — 完全一致・前後空白付き・未知名・null・settings 未ロード(null) の各ケース（マスターは fixture で注入）。
   (c) `badgeFor` / `colorClassFor` — 0〜9 の全対応（0 は "" ）。
   (d) `groupByBase` — グループが `sireLineBaseId` 単位・グループ内外とも id 昇順になる。
   (e) `countCategoryColorBuckets` — 系統数が重複除去（同名 3 セル → 1）、出現数が延べ（同 3）、色未割り当て・名前未解決が「未」、null/空文字がどこにも数えられない、全バケット系統数合計 = distinct 名数、を機械確認。
   (f) `COLOR_HEX` が §1 の 9 値と完全一致。
3. **buildRowState の Node 検証**（`tmp/sire-line-colors-verify/rowstate-check.mjs`）: 子系統モードの arrays を与えたとき (a) `categoryColorClass` が色設定どおり付く／未設定は空、(b) 因子ありの factorClasses は f クラス維持・因子なしフォールバックが子系統色になる、(c) 親系統あり・インブリード状態ありはそれぞれ既存クラス維持、(d) 通常モード（偶数）の出力が変更前と完全一致する、を機械確認。
4. **CSS 整合の Node 検証**（`tmp/sire-line-colors-verify/css-check.mjs`）: `css/unified.css` に §8 の (1) 中和 9 クラス・(2)(3)(4) 各 9 ルールが存在し、HEX が logic モジュールの `COLOR_HEX` と一致する。
5. `python -m pytest -q` が全件成功（回帰）。
6. ローカル配信＋ `dump-dom`（390×844、VirtualTimeBudget 30000。空出力時は再試行）で ReferenceError / TypeError がないこと。加えて `tmp/sire-line-colors-verify/` のハーネスで:
   (a) 設定メニューに「子系統カラー」が出る。管理ビューに 58 行＋大系統グループヘッダが出る。色ピッカーに 10 ボタンが出る。色割り当て後に対象行へ色クラスが付く。
   (b) 子系統モード相当の状態で、ヘッダに「未①〜⑨× 系統数/出現数」表がマウントされ、既知の category fixture に対して正しい数字が出る。通常モード相当ではニトロ・クロス表が出る。
   (c) memo-cell ハーネスで、色設定ありのとき系統名フィールドに `sire-color-cell sire-color-<n>` と丸数字接頭辞が付き、なしのとき付かない。
7. `service-worker.js` に新規 3 ファイルが precache 追加され、`CACHE_NAME` が現行値から 1 回だけ bump されている。
8. §3〜§6 の各仕様項目について、完了報告に「実装箇所」「確認方法と結果」を記録。ヘッドレスで再現できない項目（実機での子系統モード表示・スクリーンショット保存への色の写り込み・PWA 再起動後の永続化・モバイルヘッダ高さなど）は「未検証（検収時に確認）」と明記する。無言のスキップ不可。

## 検証コマンド

```powershell
# index.html 編集前（必須）
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 backup-index-exp index.html

# index.html 編集後（必須）
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp index.html

# Node 検証（受け入れ基準 2〜4）
node tmp\sire-line-colors-verify\logic-check.mjs
node tmp\sire-line-colors-verify\rowstate-check.mjs
node tmp\sire-line-colors-verify\css-check.mjs

# 既存回帰
python -m pytest -q

# 起動回帰（リポジトリルートで配信してから）
python -m http.server 8080
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 dump-dom http://localhost:8080/index.html 390 844 30000
```

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。

### 変更ファイル一覧

- 新規: `vue/logic/sire-line-colors.js`、`vue/app/methods/sire-line-color-settings.js`、`vue/components/settings/sire-line-color-manager.js`
- 状態・起動・橋渡し: `vue/app/app-state.js`、`vue/app/app-computed.js`、`vue/app/methods/horse-loading.js`
- 血統表: `vue/logic/pedigree/pedigree-selection.js`、`vue/components/pedigree/pedigree-row.js`、`horse-cell.js`、`memo-cell.js`、`pedigree-card.js`
- ヘッダ・設定: `vue/components/header/factor-summary-header.js`、`vue/components/settings/settings-page.js`
- 配線・見た目・PWA: `index.html`、`css/unified.css`、`service-worker.js`
- 検証ハーネス: `tmp/sire-line-colors-verify/`（純関数、rowState、CSS、保存メソッド、統合 DOM）

### 設計判断

- 設定値は `sireLineId` の正規10進文字列だけを受理し、`"01"` や `"1e0"` を含む未知キー、範囲外値、不正ラベルを `validateSettings` で破棄する。
- 起動ロードは `dbinitializer()` から復元チェーンへ合流させず開始し、マスターと appMeta の両方が揃った時点で root state を1回だけ置換する。保存時も IndexedDB 成功後に新オブジェクトで置換する。
- 子系統モードの rowState は、実因子の `f01`〜`f14`、値のある親系統、`inbreed` 状態を優先し、それ以外のテーマ色フォールバックだけを子系統色へ差し替える。通常モードでは既存クラスを維持する。
- 色定義は html2canvas 互換のため CSS カスタムプロパティを使わず、仕様どおり明示ルールを列挙した。ロジック側のパレットとの一致は機械検証する。
- 集計は `category` の index 代入を確実に拾うため computed ではなく root method とし、ヘッダ描画時に再計算する。

### 実行した検証と結果

- §3 血統表: `vue/logic/pedigree/pedigree-selection.js` と pedigree 4 コンポーネント、`css/unified.css` に実装。`rowstate-check.mjs` で色設定／未設定、因子・親系統・インブリード優先、通常モード維持を確認。DOM ハーネスで memo-cell の `sire-color-cell sire-color-6` と `⑥ネアルコ系` を確認。
- §4 集計ヘッダ: `factor-summary-header.js` と `index.html` に PC／モバイルの奇数モード tbody を追加。390×844 と 1280×800 の DOM ハーネスで色バケット表、系統数／出現数、通常ニトロ表、PC の戻るセルを確認。
- §5 反映タイミング: `app-state.js`、`app-computed.js`、`horse-loading.js`、`sire-line-color-settings.js` に実装。`methods-check.mjs` で読み込み、immutable な保存、解除時のラベル温存、集計を確認。既存 `dispCategory` watch によるモバイル高さ再計測もコード確認。
- §6 設定画面: `sire-line-color-manager.js` と `settings-page.js` に実装。DOM ハーネスで 58 行、15 大系統グループ、10 色ボタン、割り当て行クラス、色の computed style を確認。390×844 のスクリーンショットでも色ピッカー表示を確認。
- `verify-index-exp index.html`: `[verify] OK`。
- `logic-check.mjs`、`rowstate-check.mjs`、`css-check.mjs`、`methods-check.mjs`、`integration-check.mjs`: すべて `OK`。
- `python -m pytest -q`: `13 passed in 2.26s`。
- 実アプリ `dump-dom`（390×844、VirtualTimeBudget 30000）: Vue の mount 成功、空出力なし、DOM 内に `ReferenceError` / `TypeError` なし。
- `service-worker.js`: 新規3ファイルの precache と `CACHE_NAME` の1回 bump を `integration-check.mjs` で確認。

### 残課題・気づき

- 実機での子系統モード全32行の見た目、スクリーンショット保存画像への色の写り込み、PWA 再起動後の IndexedDB 永続化、実端末でのモバイルヘッダ高さは未検証（検収時に確認）。
- 通常モードは DOM ハーネスと rowState 検証で既存ニトロ表・既存クラスを確認したが、全解像度でのピクセル比較は未実施。
- 指示書の制約に従い、git commit / branch / restore / stash は実行していない。

---

## 検収記録（Claude、2026-08-01）

- 受け入れ基準 1: `verify-index-exp index.html` 再実行 → `[verify] OK`。
- 受け入れ基準 2〜4: `logic-check.mjs` / `rowstate-check.mjs` / `css-check.mjs`（＋Codex 追加の `methods-check.mjs` / `integration-check.mjs`）を再実行 → すべて OK。dedup（同名3セル→系統数1・出現数3）、バケット合計 = distinct 名数、`COLOR_HEX` の §1 一致、CSS 27 ルール＋中和 9 クラスの整合を assert で確認。
- 受け入れ基準 5: `python -m pytest -q` → 13 passed。
- 受け入れ基準 6: fresh ポートでローカル配信＋`dump-dom`（390×844）再実行:
  - 実アプリ: Vue マウント済み（home 画面・歯車あり）、ReferenceError / TypeError 0。
  - component-harness: 設定メニューに「子系統カラー」、管理ビュー 58 行＋15 大系統グループ、色ピッカー 10 ボタン（スクリーンショットで §1 パレット・⑥のラベル表示も目視確認）、memo-probe = `⑥ネアルコ系|sire-color-cell sire-color-6`、color-probe = `rgb(155, 214, 239)`（#9BD6EF）、モバイル奇数ヘッダの系統数行 = fixture どおり `[2,1,0,0,0,0,1,0,0,0]`、通常モードのニトロ表も共存。
- 受け入れ基準 7: `CACHE_NAME` は検収前の現行値 `v20260723-02` から `v20260801-01` へ 1 回だけ bump。新規 3 ファイル（logic / methods / manager）の precache 追加を diff で確認。
- コードレビュー: `validateSettings` の正規 10 進キー検証・`colorIndexForName` の trim 完全一致（nicks と同規則・非依存）・保存メソッドの immutable 置換・`buildSireLineColorCounts` の method 化（理由コメントあり）・`buildRowState` の優先規則（f クラス正規表現 / 親系統テキスト有無 / `inbreed` トークン。bootstrap が theme クラスを事前充填する実装と整合）・通常モードの偶数条件追加のみ、をすべて確認。差し戻し事項なし。
- 新規 3 JS は BOM なし・`node --check` OK。
- 残（実機・実画面のみ）: 子系統モード全 32 行の見た目（行塗り＋因子セル優先の実表示）、PC 実解像度の奇数ヘッダ列幅、スクリーンショット保存画像への色の写り込み、PWA 再起動後の IndexedDB 永続化、モバイルヘッダ高さの再計測。
