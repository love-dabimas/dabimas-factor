# 種牡馬バッジ（非凡3種 / 非凡なし / 天性 / 因名祭 / エディット）・血統表表示・検索対応 仕様書

## 1. 背景・目的

配合の素材選びでは「この種牡馬が非凡を持っているか、持っているならどの種類か」「因名祭産か」を
その場で知りたい。現状のアプリはどちらの情報も一切持っておらず、候補リストからも血統表からも判別できない。

本仕様では次の 3 つをまとめて行う。

1. **データ**: ダビマス全書（dabimas.jp）の取得時に、**非凡の種別**（なし / 普通 / 弐重 / 特化）と
   **カテゴリ（入手経路）アイコン**を JSON へ落とす。
2. **表示**: それらを **1 文字バッジ（ワッペン）** で血統表セルと候補リストに出す。
   血統表の**可変行高を一切変えない**ことを必須要件とする。
   同時に、いま文字列で埋め込んでいる `[E]`（エディット種牡馬）と `[颶]`（天性）も同じバッジ機構へ寄せる。
3. **検索**: `非` `弐` `特` `凡` `祭` などの 1 文字と、`ひぼんなし` `いんめいさい` 等の語で絞り込めるようにする。

## 2. 用語とアイコン対応

### 2.1 非凡（非凡な才能）

★5 種牡馬の一部が持つ固有能力。ダビマス全書は**種別ごとに別アイコン**を出しており、一意に判別できる。

| 全書アイコン | 才能ページの構造 | 本仕様での種別 | `abilityType` | 頭数 |
|---|---|---|---|---|
| `icon_ability_00.png` | 「非凡な才能はありません」 | 非凡なし | `"none"` | 572（★5） |
| `icon_ability_99.png` | 「才能詳細」1 本 | 普通の非凡 | `"normal"` | 1,025 |
| `icon_ability_98.png` | 「**才能詳細：その1 / その2**」2 本 | 特化非凡 | `"focused"` | 264 |
| `icon_ability_97.png` | 「才能詳細」1 本 | 弐重非凡 | `"double"` | 10 |

- 頭数は現行 `summary.json`（種牡馬 2,375 件）と一覧ページを突き合わせた実測。
  一覧ページ側の生カウントは 99: 1,046 / 98: 266 / 97: 13 で、差分は既存の連続重複スキップによるもの。
- 2026-08-23 のユーザー確認により、**`98` = 特化非凡、`97` = 弐重非凡**を正とする。
  初期設計では「才能詳細：その1 / その2」の構造から `98` を弐重と推定していたが、これは逆だった。
  才能詳細の本数や効果数は種別の判定根拠にせず、アイコン番号との確定済み対応を使用する。
- 効果の個数（`・効果1`〜）は種別の判定材料にならない。`99` にも効果 4 つのもの（`覇翼空翔`）や
  「才能詳細：レベル1 / レベルMAX」形式のもの（`血脈相承`）があり、ばらつく。**アイコンが唯一の正解**。

### 2.2 天性

一部の種牡馬が持つ追加能力。`颶風` `飛燕` `洞察` `情熱` の 4 種で、計 78 頭。
アイコンは `icon_ability_95.png`、見出しは `天性`。現行アプリが `[颶]` として文字列表示している対象。

### 2.3 因名祭

添付いただいたアイコンは、全書の種牡馬パネル／詳細ページに出る**カテゴリ（入手経路）アイコン**
`https://cf.dabimas.jp/kouryaku/images/stallion/list_icn_cat_14.png`
（紫地に「驫」の字＋ページ折れ）。

全書のカテゴリアイコンは全 40 種あり、**紫系はこれだけ**（もう 1 つの紫系
`list_icn_cat_collabo_1007.png` は星座柄のコラボアイコンで別物）。実測での性質:

- 対象は **60 頭**（一覧ページ生カウントは 64 件）
- **全頭が ★5**
- **全頭が 2 文字の因名付き**（`アリバイ-天煌-` `アーティアス-獅煌-` `インリアリティ-翔魂-` …）
- **全頭が `icon_ability_00`（非凡なし）**、かつ**天性持ちは 0 頭**

「因名だけを配る祭」という性格とぴったり合うので、これを因名祭と判定する。
なお主要カテゴリの内訳は次のとおり（参考）。

| アイコン | 図柄 | 頭数 | 備考 |
|---|---|---|---|
| `list_icn_cat_05` | オレンジの紙 | 1,011 | 通常。★1〜5 混在 |
| `list_icn_cat_12` | 青地「究極」 | 602 | 全て★5・全て因名付き |
| `list_icn_cat_07` | 赤地「凄」 | 238 | 全て★5 |
| `list_icn_cat_11` | 金地「究極」 | 222 | 全て★5 |
| **`list_icn_cat_14`** | **紫地「驫」** | **60** | **因名祭（本仕様の対象）** |
| `list_icn_cat_13` | 「交換Pt」 | 54 | ★1 中心 |
| `list_icn_cat_collabo_*` ほか | コラボ各種 | 計 188 | 30 種以上 |

### 2.4 バッジ

本仕様で追加する、馬名の左に出る 1 文字のワッペン。コード上の呼び分けは既存踏襲
（`ability` = 非凡、`nature` = 天性）。

## 3. 現状

### 3.1 ダビマス全書の DOM（実測）

種牡馬詳細ページ `#content > div > div`（スクレイパーが `detail` と呼ぶ要素）配下:

**非凡あり**（`/kouryaku/stallions/3315497239.html` アイアンリージ巌瓏）

```html
<h4>非凡な才能</h4>
<a href="/kouryaku/abilities/9165243167.html">
  <div class="horse_spec"><div class="ability">
    <img class="icon" src="//cf.dabimas.jp/kouryaku/images/stallion/icon_ability_99.png">
    <div class="ability_info"><p class="large">鉄情不羈</p><p>鉄の心を胸に秘め…</p></div>
  </div></div>
</a>
```

**非凡なし**（`/kouryaku/stallions/2614531278.html` アイスカペイド極走）

```html
<h4>非凡な才能</h4>
<div class="horse_spec"><div class="ability">
  <img class="icon" src="//cf.dabimas.jp/kouryaku/images/stallion/icon_ability_00.png">
  <div class="ability_info"><p>非凡な才能はありません</p></div>
</div></div>
```

**非凡あり＋天性あり**（`/kouryaku/stallions/3507931482.html` アメリゴ央天）は
上の非凡ブロックに続けて `<h4>天性</h4>` + `<a>…icon_ability_95.png…<p class="large">颶風</p>` が並ぶ。

確認できた性質:

- `<h4>非凡な才能</h4>` は非凡の有無にかかわらず常に存在する
  （詳細ページ十数件で直接確認。加えて一覧ページ全 2,461 パネルに非凡アイコンが出ている）。
- 非凡なしのときだけ、そのブロックが `<a>` で囲まれていない。
- 非凡ブロックは常に天性ブロックより前に出る。
- 能力名は `<p class="large">` にだけ入る（「非凡な才能はありません」は `class` なしの `<p>`）。
- カテゴリアイコンは主テーブル 2 行目の先頭 `<td>` にあり、**一覧ページのアイコンと一致する**
  （`list_icn_cat_14` の 4 頭で照合済み）。

### 3.2 スクレイパー（`scripts/build_dabimas_stream.py`）

- `parse_stallion()` が `a_tags = detail.find_all("a")` を取り、`a_tags[0]` の最初の `<p>` を
  `HD_ABILITY`（21列）、`a_tags[1]`（無ければ `a_tags[0]`）の `<p>` を `HD_NATURE`（22列）に入れている。
- `HD_ABILITY` は **JSON へは出力していない**。用途は
  「馬名 + 非凡が連続で同じならスキップ」という VBA 互換の重複除去だけ。
- **`HD_ICON`（10列）にはカテゴリアイコン URL が既に入っている**が、JSON 変換時に捨てている。
  → 因名祭の判定に**追加のリクエストは不要**。
- 非凡アイコン（`icon_ability_XX`）はどこにも保存していない。→ 列を 1 つ追加する。

### 3.3 アプリ側の表示・検索

表示名と検索インデックスの生成は `vue/logic/horses/horse-search.js` に集約済みで、
PC の `v-autocomplete`・スマホ検索ダイアログ・血統セル・エディット種牡馬管理がすべてここを経由する。

```js
function getHorseBaseText(horse, options) {
  var editTag = horse.source === "edit" && !hideEditTag ? "[E]" : "";
  var natureTag = horse.nature ? "[" + horse.nature.charAt(0) + "]" : "";
  return [editTag, natureTag, horse.name || "", horse.subName || ""].filter(Boolean).join("");
}
```

`filterHorse()` は `getHorseSearchIndexText()`（表示名・名前・補足・ふりがな・天性を `|` 連結して正規化）
に対する**部分一致**。`normalizeSearchText()` は NFKC → trim → 小文字化 → 空白除去 → カタカナ→ひらがな。

- summary JSON の `displayName` / `searchText` は現状**アプリ実行時には使われていない**が、
  「JS と同じ結果になること」を仕様として持っているので本仕様でも同時に更新する。

### 3.4 血統表のレイアウト（実測値）

ローカル（`python -m http.server`）で実機計測した数値。**ここが本仕様の肝**。

| 環境 | 行の実高 | セル内要素の高さ | 高さを決めているもの | 文字サイズ |
|---|---|---|---|---|
| PC 1280×720 | `td` 39.75px | `.v-input` 38.75px / `.v-input__slot` 36.88px | `.v-input__slot { min-height: 30px }`（Vuetify） | 10px |
| PC 1280×1000 | `td` 57.25px | `.v-input__slot` 36.88px | 同上（余白がさらに増える） | 10px |
| スマホ 375×812 | 21.09px | trigger 20.53px | JS 計算値 `--exp-mobile-row-height` | 12px |
| スマホ 375×667 | 16.63px | trigger 16.06px | 同上 | 11.97px |
| スマホ 320×568 | 13.53px | — | 同上 | 9.74px |

- **スマホ**: `applyMobileViewportLayout()`（`vue/app/methods/ui-viewport.js:393`）が
  `rowHeight = (mainHeight - fixedHeight) / 32` を求めて `--exp-mobile-row-height` に流し込み、
  `css/mobile.css` が `tr` / `td` に `height` / `max-height` + `overflow: hidden` を当てている。
  **`td` の中身が行高より高くなると行が伸びてカード下端がクリップされる**
  （`css/mobile.css:363-375` のコメントが同じ事故を記録している）。ここが「邪魔しない」の焦点。
- **PC**: 行高は Vuetify の `.v-input__slot { min-height: 30px }` が決めていて、
  10px の文字に対して 20px 以上の余白がある。ここは余裕が大きい。

### 3.5 `v-autocomplete` の選択表示（実測・重要）

PC のセルは `v-autocomplete`（`solo dense`）だが、選択後の DOM は
**`.v-select__selections` / `.v-select__selection` が存在しない**（選択値は `<input>` の value に入る）。
Vuetify 2 の `VAutocomplete` は「selection スロットがある」か「multiple」のときしか selection 要素を描画しないため。

→ **`v-slot:selection` を足すと `.v-select__selections`（`display:flex; flex-wrap: wrap`）が
出現し、折り返しで入力欄が背を伸ばすリスクが生まれる**。本仕様ではここには触らない（§5.3）。

### 3.6 現状データの実測（2026-08-22 時点）

`json/dabimasFactor.summary.json`（2,873 件 = 種牡馬 2,375 / 牝馬 498）と
一覧ページ `stallions/name.html` の 2,461 パネルを突き合わせた結果:

| ★ | 非凡 | 頭数 |
|---|---|---|
| 5 | なし | 572 |
| 5 | 普通（99） | 1,025 |
| 5 | 弐重（97） | 10 |
| 5 | 特化（98） | 264 |
| 4 / 3 / 2 / 1 | すべて「なし」 | 237 / 167 / 39 / 61 |

- **★4 以下は 1 頭も非凡を持たない。** 非凡バッジは ★5 限定で初めて情報量を持つ。
- 一覧ページの★数は summary の `rare` と全 2,375 件で完全一致。
- 天性持ちは 78 頭。**天性あり かつ 非凡なしが 4 頭存在する**（エルバジェ央瓏 /
  コンキスタドールシエロ獅煌 / ヘイルトゥリーズン巌天 / リファレンスポイント神速）。
  → §7 の既存不具合はこの 4 頭で顕在化している。
- 因名祭 60 頭は**全て非凡なし・天性なし**。

**バッジ同時表示数**（エディットを除く）:

| 同時に付くバッジ数 | 頭数 | 内訳 |
|---|---|---|
| 0 | 504 | ★4 以下 |
| 1 | 1,733 | 非凡バッジのみ |
| 2 | 138 | 天性 + 非凡（78）／ 非凡なし + 因名祭（60） |

**最大 2 個**（エディット `E` を足しても最大 3 個）。因名祭と天性は排他なので、
バッジ 3 個を超える組み合わせは現行データに存在しない。

## 4. バッジ設計

### 4.1 1 文字の割り当て

| バッジ | 文字 | 対象 | 頭数 | 色 |
|---|---|---|---|---|
| エディット種牡馬 | `E` | `source === "edit"` | — | 紫 `#5b4b8a`（既存 `.edit-stallion-chip` と同色） |
| 天性 | `颶` `飛` `洞` `情` | `nature` が空でない | 78 | ティール `#00796b` |
| 特化非凡 | **`特`** | `abilityType === "focused"` | 264 | 金 `#a67c00` |
| 弐重非凡 | **`弐`** | `abilityType === "double"` | 10 | 濃青 `#01579b` |
| 普通の非凡 | **`非`** | `abilityType === "normal"` | 1,025 | 赤 `#c62828` |
| 非凡なし | **`凡`** | `abilityType === "none"` かつ `rare === 5` | 572 | グレー `#8d9aa5` |
| 因名祭 | **`祭`** | `categoryIcon === "14"` | 60 | マゼンタ `#ad1457` |

- 「非凡」から `非` と `凡` を 1 文字ずつ取って有無の対にし、上位種別は `弐`（弐重）`特`（特化）で分ける。
  **意味は文字が担い、色は補助**という役割分担にする（1 文字なら色を覚えなくても読める）。
- **衝突検証**: summary 全 2,873 件の `name` / `subName` に
  `非` `凡` `弐` `特` `祭` `双` `因` `名` `重` はいずれも **0 件**。
  バッジ文字を検索インデックスへ入れても既存の名前検索を汚さない。
- **★4 以下・牝馬にはバッジを出さない。** 非凡は★5固有の概念なので、
  「非凡バッジが付いている ＝ ★5」という読み方が同時に成立する。
- 因名祭の 60 頭は必ず `凡` と同時に付く（`凡` `祭` の 2 個）。冗長ではあるが、
  `凡` の意味を「★5 で非凡なし」で一貫させたいのでこの形を推す。
  バッジ数を減らしたい場合は「`祭` があるときは `凡` を省く」（`祭` ⇒ 非凡なしが確定するため
  情報は落ちない）に切り替えられるよう、判定は 1 箇所（`getHorseBadges`）に閉じておく。

### 4.2 並び順

```
[E][天性][非凡][祭] 馬名 補足名
```

例: `E 飛 凡 エルバジェ央瓏` / `颶 非 アメリゴ央天` / `弐 アイリッシュリヴァー翔漸` / `凡 祭 アリバイ天煌`

`[E]` → 天性 の順は既存の文字列タグの並び（`[E][颶]…`）を踏襲する。

### 4.3 「行高を邪魔しない」ための構造

**採用する置き方**: `horse-cell` のルート `div.exp-mobile-autocomplete-root` の**先頭の子**として
バッジ列を置き、ルートを **flex 行**にする。PC・スマホで同じマークアップ・同じ CSS を使う。

```html
<div class="exp-mobile-autocomplete-root exp-horse-cell--select">
  <span class="exp-horse-badges">        <!-- ← 追加。flex アイテム -->
    <span class="exp-horse-badge exp-horse-badge--nature">颶</span>
    <span class="exp-horse-badge exp-horse-badge--ability">非</span>
  </span>
  <!-- 既存: PC は v-autocomplete / スマホは .exp-mobile-horse-trigger -->
</div>
```

これが安全な理由:

- **スマホ**: ルートは既に `display:flex; align-items:stretch; height:100%`（`css/mobile.css:356`）。
  `td` 側に `height` / `max-height: var(--exp-mobile-row-height)` と `overflow:hidden` が効いており、
  バッジは flex アイテムなので**行ボックスを作らず**、高さは親（＝行高）に従う。
- **PC**: 行高は `.v-input__slot { min-height: 30px }` が決めていて、
  14px のバッジはその内側に完全に収まる。
- **やってはいけない置き方**: 馬名テキストと同じ**インラインフロー**に `inline-block` で置くこと。
  インラインレベルのボックスはライン ボックスを押し広げるため、
  スマホの 13〜16px 行では確実に行が伸びる。

**バッジ CSS の制約**:

- `border` を使わない（上下 1px ずつで行が伸びうる。かつ html2canvas が描かない）。
  枠が欲しければ**背景色のベタ塗り**で表現する。`box-shadow` も html2canvas が描かないので不可。
- `line-height: 1` 固定、高さは明示（`height`）。`margin` の縦方向は 0。
- バッジ列には `pointer-events: none` を付ける。
  PC では入力欄の外側になるためクリックしても候補が開かず、押せそうに見えるのを避ける。

```css
/* 共通（PC 基準） */
.exp-horse-badges {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding-left: 4px;
  pointer-events: none;
}
.exp-horse-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: 14px;
  min-width: 14px;
  padding: 0 2px;
  border-radius: 3px;
  font-size: 10px;
  line-height: 1;
  font-weight: 700;
  color: #fff;
}
.exp-horse-badge--edit      { background: #5b4b8a; }
.exp-horse-badge--nature    { background: #00796b; }
.exp-horse-badge--focused   { background: #a67c00; }
.exp-horse-badge--double    { background: #01579b; }
.exp-horse-badge--normal    { background: #c62828; }
.exp-horse-badge--noability { background: #8d9aa5; }
.exp-horse-badge--inmeisai  { background: #ad1457; }

/* PC のセルだけ flex 行にする（メモ／子系統モードには当てない） */
.table_main .exp-horse-cell--select { display: flex; align-items: center; min-width: 0; }
.table_main .exp-horse-cell--select > .v-input { flex: 1 1 auto; min-width: 0; }

/* スマホは行高に追随させる */
.exp-mobile-layout .exp-horse-badges { gap: 1px; padding-left: 2px; }
.exp-mobile-layout .exp-horse-badge {
  height: calc(var(--exp-mobile-row-height) * 0.80);
  min-width: calc(var(--exp-mobile-row-height) * 0.80);
  padding: 0 1px;
  border-radius: 2px;
  font-size: clamp(7px, calc(var(--exp-mobile-row-height) * 0.66), 11px);
}
```

### 4.4 実測による裏付け

上記の構造・CSS を実際のページへ注入し、32 セル全部に**バッジ 3 個**を出した状態で計測した。

| 環境 | 行高 | バッジ実寸 | バッジ文字 | 血統表の高さ 前 → 後 |
|---|---|---|---|---|
| PC 1280×720 | `td` 39.75px | 14 × 14px | 10px | **627px → 627px** |
| スマホ 375×667 | 16.63px | 13 × 13px | 10px | **274px → 274px** |
| スマホ 320×568 | 13.53px | 10.5 × 10.5px | 8.4px | **231px → 231px** |

`td` の高さ（39.75px / 17.06px）とカードラッパー `.pedigree-card-table-wrap` の高さも
**すべて 1px も変わらなかった**。

**横幅**: バッジ 3 個で PC 約 46px / スマホ約 40px。血統セルの実測幅は最小 168px なので
馬名側に 120px 以上残る（スマホ 12px 文字で 10 文字相当）。§3.6 のとおり 3 個は
エディット種牡馬のときだけで、通常は 1〜2 個。

**スクリーンショット機能（html2canvas）**: バッジを含むセルを `html2canvas` で描画し、
出力ピクセルに指定色が正しく現れることを確認済み。ベタ塗り＋`border-radius` は問題なく描かれる。

**注意点（可読性）**: 320×568 のような最小級の画面ではバッジ文字が 8.4px まで縮む。
`凡` `非` `弐` `特` `祭` `E` は問題ないが、**天性の `颶` は画数が多く潰れる**。
これは現行の文字列タグ `[颶]`（同画面で 9.7px）でも同様の状態なので新規の劣化ではないが、
気になる場合は天性バッジだけ「色のみ・文字なし」へ落とす余地を残しておく。

## 5. 変更内容

### 5.1 スクレイパー（`scripts/build_dabimas_stream.py`）

**(1) 列を 1 つ追加する。** 既存の 1〜112 列は VBA 互換のため動かさず、末尾へ足す。
カテゴリアイコンは既存の `HD_ICON`（10列）をそのまま使う。

```python
HD_ABILITY_ICON = 113          # 非凡な才能アイコンの URL
ROW_SIZE = 113                 # 112 -> 113

ABILITY_TYPE_BY_ICON = {
    "icon_ability_00.png": "none",
    "icon_ability_99.png": "normal",
    "icon_ability_98.png": "focused",
    "icon_ability_97.png": "double",
}
INMEISAI_CATEGORY_ICON = "14"
```

`CONVERSION_WARNING_COUNTS` に `"missing_ability_icon": 0` と `"unknown_ability_icon": 0` を追加する。

**(2) 見出しでセクションを特定するヘルパーを追加する。**
`detail.find_all("a")` の添字に依存する現行方式は §7 の不具合の原因なので使わない。

```python
def find_spec_section(detail: Optional[Tag], heading: str) -> Optional[Tag]:
    """`<h4>{heading}</h4>` の直後のブロック（<a> または <div class="horse_spec">）を返す。"""
    if detail is None:
        return None
    for h4 in detail.find_all("h4"):
        if safe_str(h4.get_text()) == heading:
            return h4.find_next_sibling()
    return None


def extract_ability_icon(detail: Optional[Tag]) -> str:
    """非凡な才能セクションのアイコン URL を返す（見つからなければ空文字）。"""
    section = find_spec_section(detail, "非凡な才能")
    if section is None:
        return ""
    img = section.select_one("div.ability img.icon")
    return normalize_src(img.get("src", "")) if img else ""


def extract_spec_name(detail: Optional[Tag], heading: str) -> str:
    """セクションの能力名（<p class="large">）を返す。無しの行は空文字になる。"""
    section = find_spec_section(detail, heading)
    if section is None:
        return ""
    p = section.select_one(".ability_info p.large")
    return safe_str(p.get_text()) if p else ""
```

**(3) `parse_stallion()` を差し替える。**

```python
row[HD_ABILITY_ICON] = extract_ability_icon(detail)
row[HD_ABILITY] = extract_spec_name(detail, "非凡な才能")   # 非凡なしなら ""
row[HD_NATURE]  = extract_spec_name(detail, "天性")         # 天性なしなら ""
```

既存の `a_tags` を使った取得と `h4_tags` の件数分岐は削除する。`HD_ICON` は現行のまま。

**(4) `all_row_to_dabifac_entry()` に `abilityType` と `categoryIcon` を出力する。**

```python
CATEGORY_ICON_RE = re.compile(r"list_icn_cat_(.+)\.png$")


def parse_ability_type(icon_url: str, sex: str, identifier: str) -> Optional[str]:
    """非凡アイコン URL から種別を判定する。牝馬・判定不能は None。"""
    if sex != "0":
        return None
    icon = safe_str(icon_url)
    if not icon:
        CONVERSION_WARNING_COUNTS["missing_ability_icon"] += 1
        print(f"[warn] ability icon not found ({identifier})")
        return None
    name = icon.rsplit("/", 1)[-1]
    ability_type = ABILITY_TYPE_BY_ICON.get(name)
    if ability_type is None:
        # 未知アイコンは「非凡あり（普通）」に倒す。バッジを付け損ねるのは無害だが、
        # 非凡持ちへ「凡」を付けるのは誤情報になるため。
        CONVERSION_WARNING_COUNTS["unknown_ability_icon"] += 1
        print(f"[warn] unknown ability icon: {name} ({identifier})")
        return "normal"
    return ability_type


def parse_category_icon(icon_url: str) -> Optional[str]:
    """カテゴリアイコン URL から識別子（"14" / "collabo_1017" 等）を取り出す。"""
    m = CATEGORY_ICON_RE.search(safe_str(icon_url))
    return m.group(1) if m else None
```

```python
entry["abilityType"]  = parse_ability_type(row_get(row, HD_ABILITY_ICON), sex, identifier)
entry["categoryIcon"] = parse_category_icon(row_get(row, HD_ICON))
```

- `--fail-on-error` の判定対象に `missing_ability_icon` / `unknown_ability_icon` を加える
  （サイト側に新しい非凡区分が増えたのを CI で検知するため）。
- `categoryIcon` は**因名祭専用のブール値にせず、生の識別子をそのまま持つ**。
  こうしておけば「究極配合（`11` / `12`）にもバッジを付けたい」となったときに
  **再スクレイピングなしでアプリ側だけで対応できる**。牝馬側にも同じ列があるが値は空になる。

**(5) `entry_to_summary()` / 表示名 / 検索テキストを更新する（§5.4 と対になる）。**

```python
ABILITY_BADGE_CHAR = {"none": "凡", "normal": "非", "double": "弐", "focused": "特"}
ABILITY_ALIASES = {
    "none":    ("非凡なし", "ひぼんなし"),
    "normal":  ("非凡あり", "ひぼんあり"),
    "double":  ("非凡あり", "ひぼんあり", "弐重非凡", "にじゅうひぼん"),
    "focused": ("非凡あり", "ひぼんあり", "特化非凡", "とっかひぼん"),
}
INMEISAI_ALIASES = ("因名祭", "いんめいさい")


def build_badge_text(entry: dict) -> str:
    """JS の getHorseBadges と同じ 1 文字バッジの並びを返す。"""
    parts = []
    if entry.get("nature"):
        parts.append(entry["nature"][0])
    if entry.get("sex") == "0" and entry.get("rare") == 5:
        char = ABILITY_BADGE_CHAR.get(entry.get("abilityType") or "")
        if char:
            parts.append(char)
    if entry.get("categoryIcon") == INMEISAI_CATEGORY_ICON:
        parts.append("祭")
    return "".join(parts)
```

`build_search_text()` にはバッジ文字と、`ABILITY_ALIASES` / `INMEISAI_ALIASES` を連結する。
`build_display_name()` は現状の文字列タグ形式のまま `[非]` `[弐]` `[特]` `[凡]` `[祭]` を足す
（`displayName` はアプリ実行時には使われないが、JS の `getHorseBaseText()` と一致させておく）。

`entry_to_summary()` の出力に `abilityType` / `categoryIcon` を追加する。

### 5.2 出力 JSON スキーマ

full JSON / summary JSON の**両方に 2 フィールドを追加のみ**。既存フィールドの変更・削除はない。
detail chunk（`descendants` のみ）は変更なし。

```json
{
  "id": "s2614531278",
  "name": "アイスカペイド",
  "subName": "極走",
  "nature": "",
  "sex": "0",
  "rare": 5,
  "abilityType": "none",
  "categoryIcon": "07",
  "factors": ["", "速", "底"],
  "displayName": "[凡]アイスカペイド極走",
  "searchText": "[凡]あいすかぺいど極走|あいすかぺいど|極走|あいすかぺいど|凡|非凡なし|ひぼんなし"
}
```

| フィールド | 値 |
|---|---|
| `abilityType` | `"none"` / `"normal"` / `"double"` / `"focused"` / `null`（牝馬・取得失敗） |
| `categoryIcon` | `"05"` `"07"` `"11"` `"12"` `"13"` `"14"` `"collabo_1017"` … / `null` |

`version` は summary `1` のまま据え置き（後方互換の追加のみ）。

**サイズ影響（実測）**:

| 構成 | 生 | gzip |
|---|---|---|
| 現行 | 1,101,062 B | 114,063 B |
| `abilityType` のみ | 1,162,976 B（+61.9 KB） | 116,266 B（**+2.2 KB / +1.9%**） |
| `abilityType` + `categoryIcon` | 1,220,963 B（+119.9 KB） | 118,671 B（**+4.6 KB / +4.0%**） |

gzip 後で 5 KB 未満の増加なので、初期ロードへの影響は無視できる。

### 5.3 アプリ側: 血統表セル

**(1) `vue/components/pedigree/horse-cell.js`**

ルート div にバッジ列と修飾クラスを足す。PC / スマホの分岐より外側なので**1 箇所で済む**。

```html
<div class="exp-mobile-autocomplete-root" :class="{ 'exp-horse-cell--select': dispCategory % 2 === 0 }">
  <template v-if="dispCategory % 2 === 0">
    <span v-if="cellBadges.length" class="exp-horse-badges">
      <span
        v-for="badge in cellBadges"
        :key="badge.key"
        :class="['exp-horse-badge', badge.className]"
        :title="badge.title"
      >{{ badge.text }}</span>
    </span>
    …（既存の mobile trigger / desktop-horse-autocomplete）…
  </template>
  <memo-cell v-else …></memo-cell>
</div>
```

```js
cellBadges() {
  const horse = this.selected[this.index];
  return horse ? window.Dabimas.logic.horses.getHorseBadges(horse) : [];
},
```

`exp-horse-cell--select` を付けているのは、メモ／子系統モード（`memo-cell` = `v-row`）に
`display:flex` を当てないため。

**(2) スマホのトリガー文言からタグ文字を外す**

`mobileTriggerLabel` は `getHorseSelectedText()`（= `getHorseBaseText`）を返しているので、
バッジと二重に `[颶]` が出る。ここを `getHorseNameText()`（§5.4）へ差し替える。

**(3) PC の `v-autocomplete` は触らない**

§3.5 のとおり `v-slot:selection` を足すと折り返しで背が伸びうる。バッジはルート div 側に置く。
ただし `item-text`（＝選択後に input に入る文字列）はタグ付きだと二重表示になるため、
`getHorseBaseText` → `getHorseNameText` へ差し替える。

### 5.4 アプリ側: `vue/logic/horses/horse-search.js`

```js
  var ABILITY_BADGES = {
    none:    { text: "凡", className: "exp-horse-badge--noability", title: "非凡なし" },
    normal:  { text: "非", className: "exp-horse-badge--normal",    title: "非凡あり" },
    double:  { text: "弐", className: "exp-horse-badge--double",    title: "弐重非凡" },
    focused: { text: "特", className: "exp-horse-badge--focused",   title: "特化非凡" },
  };
  var ABILITY_ALIASES = {
    none:    "非凡なし|ひぼんなし",
    normal:  "非凡あり|ひぼんあり",
    double:  "非凡あり|ひぼんあり|弐重非凡|にじゅうひぼん",
    focused: "非凡あり|ひぼんあり|特化非凡|とっかひぼん",
  };
  var INMEISAI_CATEGORY_ICON = "14";
  var INMEISAI_ALIASES = "因名祭|いんめいさい";

  // 非凡は★5固有。abilityType が無い（旧 snapshot・自家製馬・取得失敗）ときは判定しない。
  function getAbilityType(horse) {
    if (!horse || horse.sex !== "0" || horse.rare !== 5) {
      return "";
    }
    return ABILITY_BADGES[horse.abilityType] ? horse.abilityType : "";
  }

  function isInmeisai(horse) {
    return !!horse && horse.categoryIcon === INMEISAI_CATEGORY_ICON;
  }

  // 画面に出す 1 文字バッジの一覧。血統表セル・候補リストの両方から使う。
  function getHorseBadges(horse, options) {
    if (!horse) return [];
    var hideEditBadge = !!(options && options.hideEditBadge);
    var badges = [];
    if (horse.source === "edit" && !hideEditBadge) {
      badges.push({ key: "edit", text: "E", className: "exp-horse-badge--edit", title: "エディット種牡馬" });
    }
    if (horse.nature) {
      badges.push({
        key: "nature", text: horse.nature.charAt(0),
        className: "exp-horse-badge--nature", title: "天性: " + horse.nature,
      });
    }
    var ability = getAbilityType(horse);
    if (ability) {
      badges.push(Object.assign({ key: "ability" }, ABILITY_BADGES[ability]));
    }
    if (isInmeisai(horse)) {
      badges.push({ key: "inmeisai", text: "祭", className: "exp-horse-badge--inmeisai", title: "因名祭" });
    }
    return badges;
  }

  // バッジを別に出す場所で使う、タグを含まない素の表示名。
  function getHorseNameText(horse) {
    if (!horse) return "";
    return [horse.name || "", horse.subName || ""].filter(Boolean).join("");
  }
```

`getHorseBaseText()` は**現状のまま残す**（`[E][颶]名前補足` を返し、`[非]` 等を足す）。
バッジを出せない場所と、Python 側 `build_display_name()` との一致仕様のために必要。

検索インデックスにはバッジ文字とエイリアスを足す。

```js
  function getHorseSearchIndexText(horse) {
    // …WeakMap キャッシュ判定は現状のまま…
    var ability = getAbilityType(horse);
    var searchText = normalizeSearchText(
      [
        getHorseBaseText(horse),
        horse.name || "",
        horse.subName || "",
        horse.ruby || "",
        horse.nature || "",
        getHorseBadges(horse).map(function (b) { return b.text; }).join(""),
        ability ? ABILITY_ALIASES[ability] : "",
        isInmeisai(horse) ? INMEISAI_ALIASES : "",
      ]
        .filter(Boolean)
        .join("|")
    );
    // …
  }
```

通るクエリ:

| 入力 | 結果 |
|---|---|
| `非` | 普通の非凡 1,025 頭 |
| `弐` / `弐重非凡` / `にじゅうひぼん` | 弐重非凡 10 頭 |
| `特` / `特化非凡` / `とっかひぼん` | 特化非凡 264 頭 |
| `凡` / `非凡なし` / `ひぼんなし` | 非凡なし 572 頭 |
| `非凡あり` / `ひぼんあり` | 非凡持ち 1,299 頭（3 種すべて） |
| `祭` / `因名祭` / `いんめいさい` | 因名祭 60 頭 |
| `ひぼん` | ★5 全 1,871 頭 |
| `颶` | 従来どおり颶風持ち 9 頭 |

**衝突検証**: 現行 `searchText` に `ひぼん` `にじゅう` `とっか` `いんめいさい` を含む馬は
いずれも 0 件。`ぼん` は `ミホノブルボン` 等 10 件、`いんめい` は `ロージズインメイ` 1 件に当たるため、
エイリアスは `ひぼん…` / `いんめいさい` の形（より長い側）にしてある。

### 5.5 アプリ側: 候補リスト・その他

`mobile-horse-picker.js` / `desktop-horse-autocomplete.js` の候補行は、
いま `v-chip.edit-stallion-chip` で `E` だけを出し、名前側は `hideEditTag` で `[E]` を消している。
これを `getHorseBadges(horse)` + `getHorseNameText(horse)` に統一し、
`v-chip` は `.exp-horse-badge--edit` へ置き換える。候補リストは行高が可変なので制約は緩い。

`vue/components/settings/edit-stallion-manager.js` のベース馬選択リストも同じ関数へ寄せる。

`vue/app/methods/horse-loading.js`:

```js
// normalizeHorseSummary()
rare: typeof horse.rare === "number" ? horse.rare : null,
abilityType: typeof horse.abilityType === "string" ? horse.abilityType : null,
categoryIcon: typeof horse.categoryIcon === "string" ? horse.categoryIcon : null,

// createEditStallionSummary()
nature: baseHorse.nature,
abilityType: baseHorse.abilityType,
categoryIcon: baseHorse.categoryIcon,
```

- `createSavedHorseSummary()`（自家製馬）は `rare` を持たないので何もしない → バッジは出ない。
- `stripHorseForStorage()` は `descendants` / `searchText` / `displayName` しか落とさないため、
  新フィールドは localStorage スナップショットに残り、復元後もバッジが出る。

### 5.6 対象外（本仕様でやらないこと）

- 非凡名（`鉄情不羈` 等）の JSON 保持・名前検索。
  §5.1(3) で `HD_ABILITY` は正しく取れるようになるので、必要になった時点で
  `entry["ability"]` を足すだけで実現できる。
- 因名祭以外のカテゴリ（究極配合 `11` / `12`、凄馬 `07`、交換Pt `13`、コラボ各種）のバッジ化。
  `categoryIcon` は生値で持つので、**アプリ側の対応表に 1 行足すだけ**で後から追加できる。
- チェックボックス等による絞り込み UI。本仕様はテキスト検索のみ。
- ★の表示、牝馬側の対応。
- note 取扱説明書（`note-article/`）への反映。仕様確定後に `dabifaku-manual` 側で別途行う。

## 6. 想定リスクと対処

| リスク | 対処 |
|---|---|
| バッジで血統表の行が伸びる | ルート div の flex アイテムとして置き、インラインフローに入れない。§4.4 でバッジ 3 個 × 3 サイズで実測済み（変化 0px） |
| バッジ分だけ馬名の表示幅が減る | 最大 3 個で PC 約 46px / スマホ約 40px。実測のセル幅は最小 168px。通常は 1〜2 個（§3.6） |
| `97` = 弐重非凡 / `98` = 特化非凡 の対応が違っていた | 判定は `ABILITY_TYPE_BY_ICON` の定数表。バッジ文字・エイリアスも定数表なので差し替えは局所的 |
| 全書に新しい非凡アイコンが増える | `unknown_ability_icon` 警告＋`--fail-on-error` で検知。値は `"normal"` に倒すので「凡」の誤表示は起きない |
| メモ／子系統モードのレイアウト崩れ | `exp-horse-cell--select` を付けたときだけ `display:flex` を当てる。§8 で両モードを確認 |
| PC で入力欄のクリック領域が減る | バッジ列に `pointer-events: none` |
| スクショ（html2canvas）にバッジが出ない | ベタ塗り＋`border-radius` のみで構成（`border` / `box-shadow` は使わない）。実測で描画を確認済み |
| 極小画面で `颶` が潰れる | バッジ文字は `clamp(7px, rowHeight*0.66, 11px)`。現行の `[颶]` と同等以下の劣化に留める |
| 旧 localStorage スナップショットに新フィールドが無い | `ABILITY_BADGES` に無い値／`undefined` はバッジ無し。選び直せばマスター由来の値が入る |
| 色が 7 種類あって覚えられない | 意味は文字が担い、色は補助という設計。`title` 属性に日本語名を入れる |

## 7. 同時に直す既存不具合: `HD_ABILITY` が天性名を拾う

現行の `parse_stallion()` は `a_tags[0]` を無条件に非凡とみなしている。
非凡なしの行は `<a>` で囲まれないため、**非凡なし＋天性ありの馬では `a_tags[0]` が天性**になり、
`HD_ABILITY` に天性名が入る。実データで 4 頭該当する
（例: エルバジェ央瓏 → `HD_ABILITY = "飛燕"`。詳細ページで `a` タグが 1 件だけ・
`div.ability img.icon` が `[icon_ability_00, icon_ability_95]` の順であることを実測確認済み）。

`HD_NATURE` 側はフォールバックがあるため結果は正しく、`HD_ABILITY` も JSON へ出力されないので
これまで実害は出ていなかった。本仕様では判定を `HD_ABILITY_ICON` で行うので直接の依存はないが、
併せて §5.1(3) で見出しベースの取得へ直す。

**副作用の注意**: `main()` の連続重複スキップは `(馬名, HD_ABILITY)` を比較している。
上記 4 頭の `HD_ABILITY` が `天性名` → `""` に変わるため、理屈の上ではスキップ判定が変わり得る。
§8 の検証で `written` / `skipped` 件数と全体差分を必ず確認する。

## 8. 検証

### 8.1 スクレイパー

1. **ヘルパー単体**: `find_spec_section` / `extract_ability_icon` / `extract_spec_name` に
   §3.1 の 3 パターン＋「天性のみ」の HTML 断片を与え、期待どおりの URL・能力名が返ることを確認する。
2. **種別変換**: `parse_ability_type()` に `00` / `99` / `98` / `97` / 未知アイコン / 空文字 を与え、
   `"none"` / `"normal"` / `"double"` / `"focused"` / `"normal"`（＋`unknown_ability_icon` 警告）/
   `None`（＋`missing_ability_icon` 警告）になることを確認する。牝馬行は常に `None` かつ無警告。
3. **カテゴリ変換**: `parse_category_icon()` が
   `…/list_icn_cat_14.png` → `"14"`、`…/list_icn_cat_collabo_1017.png` → `"collabo_1017"`、
   空文字 → `None` を返すことを確認する。
4. **表示名・検索テキスト**: `entry_to_summary()` の出力で
   `displayName == "[凡]アイスカペイド極走"`、`searchText` に `凡` `非凡なし` `ひぼんなし` が入ること。
   因名祭の馬で `祭` `因名祭` `いんめいさい` が入ること。
   ★4・非凡なしの馬にバッジ文字／エイリアスが**付かない**こと。
5. **少量実行**: `--limit 30` で走らせ、`abilityType` が全種牡馬で非 `None` であること、
   サイト表示（非凡欄）と一致することを数頭目視で確認する。
6. **全量実行と差分**:
   - `missing_ability_icon` / `unknown_ability_icon` 警告が 0 件
   - `written` / `skipped` が現行と同じ（期待値: 種牡馬 2,375 / 牝馬 498 / 計 2,873）
   - 旧 summary との差分が `abilityType` / `categoryIcon` / `displayName` / `searchText` の 4 つだけ
   - 種別ごとの件数が **none 572（★5）/ normal 1,025 / double 10 / focused 264**、
     `rare <= 4` の 504 件は全て `"none"` でバッジ対象外
   - `categoryIcon === "14"` が **60 件**、その全てが `abilityType === "none"` かつ `nature === ""`
   - §7 の 4 頭で `nature` が従来どおり保持されている

### 8.2 JS ロジック

7. `scripts/verify-horse-candidate-lists.cjs` と同じ形の Node スクリプト
   （`scripts/verify-horse-badges.cjs`）を足し、`horse-search.js` を直接 require して
   - `getHorseBadges` が `E` → 天性 → 非凡 → 祭 の順で返る
   - `rare !== 5` / `sex === "1"` / `abilityType` が `undefined`・不明値では非凡バッジが出ない
   - `categoryIcon` が `"14"` のときだけ `祭` が出る
   - `getHorseNameText` にタグ文字が混ざらない
   - `filterHorse` が `非` `弐` `特` `凡` `祭` `非凡あり` `にじゅうひぼん` `いんめいさい` `颶` で当たる
   - `凡` でバッジ無しの通常馬が当たらない

   を assert する。

### 8.3 レイアウト（最重要）

8. **行高が変わらないこと**を、実際にコードを入れた状態で再測定する。
   §4.4 と同じ 3 サイズ（PC 1280×720 / スマホ 375×667 / スマホ 320×568）＋ 1280×1000 で、
   `.table_main` と `.pedigree-card-table-wrap` の高さが導入前後で一致すること。
9. **32 セル全部にバッジ 3 個が出た最悪ケース**で、スマホの最下行がクリップされないこと。
10. **メモ／子系統モード**（`dispCategory % 2 !== 0`）でレイアウトが崩れないこと。
11. **PC の操作性**: セルをクリックして候補が開くこと、選択後に入力欄へタグ無しの馬名が入り
    バッジがセル左に出ること。バッジをクリックしても何も起きないこと。
12. **スマホの操作性**: トリガー→ダイアログ、候補リストのバッジ表示、選択後のセル表示。
13. **スクリーンショット**: `captureMobileScreenshot` の PNG にバッジが写ること。
14. **旧 snapshot 復元**: 新フィールドを持たない localStorage から復元してもエラーが出ず、
    非凡・因名祭バッジが出ない（天性・E バッジは出る）こと。

## 9. 互換性

| 観点 | 影響 |
|---|---|
| 既存 JSON フィールド | 変更なし（`abilityType` / `categoryIcon` の追加のみ） |
| 旧 JSON × 新アプリ | 新フィールドが `undefined` → `null` に正規化され、該当バッジ・エイリアスが出ない |
| 新 JSON × 旧アプリ | 未知フィールドは無視されるため影響なし |
| localStorage の選択馬 | 旧スナップショットは新フィールドを持たないためバッジが出ない。選び直せば入る |
| エディット種牡馬 | ベース馬から都度組み立てるため、再読み込み時点でバッジが付く |
| ALL 行 NDJSON（`--all-output`） | `ROW_SIZE` が 112 → 113。1〜112 列は不変 |
| 表示の見た目 | `[E]` `[颶]` が文字列からバッジへ変わる（**既存ユーザーには見た目の変更**）。検索は `E` `颶` とも従来どおり通る |

## 10. 変更対象ファイル一覧

| ファイル | 変更 |
|---|---|
| `scripts/build_dabimas_stream.py` | `HD_ABILITY_ICON`(113) / `ROW_SIZE`、`ABILITY_TYPE_BY_ICON`、`find_spec_section` / `extract_ability_icon` / `extract_spec_name` 追加、`parse_stallion()` を見出しベースへ、`parse_ability_type()` / `parse_category_icon()` と警告カウンタ、entry/summary への `abilityType` / `categoryIcon` 出力、`build_display_name` / `build_search_text` の拡張 |
| `vue/logic/horses/horse-search.js` | `getAbilityType` / `isInmeisai` / `getHorseBadges` / `getHorseNameText` 追加、`getHorseSearchIndexText` にバッジ文字・エイリアス追加（`getHorseBaseText` は温存） |
| `vue/components/pedigree/horse-cell.js` | ルート div にバッジ列と `exp-horse-cell--select`、`cellBadges` computed、`mobileTriggerLabel` をタグ無しへ |
| `vue/components/pedigree/desktop-horse-autocomplete.js` | `item-text` を `getHorseNameText` へ、候補行の `v-chip` をバッジへ統一 |
| `vue/components/pedigree/mobile-horse-picker.js` | 候補行・現在の選択表示をバッジ + `getHorseNameText` へ |
| `vue/components/settings/edit-stallion-manager.js` | ベース馬リストをバッジ表示へ |
| `vue/app/methods/horse-loading.js` | `normalizeHorseSummary()` / `createEditStallionSummary()` に新フィールド |
| `css/unified.css`（共通）/ `css/mobile.css`（スマホ上書き） | `.exp-horse-badges` / `.exp-horse-badge` 一式（7 バリアント） |
| `tests/test_build_dabimas_stream.py` | §8.1-1〜4 のテスト追加 |
| `scripts/verify-horse-badges.cjs` | 新規（§8.2） |
| `json/dabimasFactor.json` / `json/dabimasFactor.summary.json` | 再生成 |

`index.html` は変更しない（AGENTS.md の `backup-index-exp` / `verify-index-exp` 手順は不要）。

## 付録: 調査に使ったサンプル URL

| ケース | URL | 馬 / 才能 |
|---|---|---|
| 非凡なし（★5） | `/kouryaku/stallions/2614531278.html` | アイスカペイド極走 |
| 普通の非凡（99） | `/kouryaku/stallions/3315497239.html` | アイアンリージ巌瓏 / 鉄情不羈 |
| 特化非凡（98） | `/kouryaku/stallions/3537931452.html` | アイリッシュリヴァー翔漸 / Torrential |
| 弐重非凡（97） | `/kouryaku/stallions/3452991073.html` | キタサンブラック燕禊 / 覇黒祭祀 |
| 非凡あり＋天性 | `/kouryaku/stallions/3507931482.html` | アメリゴ央天（颶風） |
| 非凡なし＋天性（§7） | `/kouryaku/stallions/6538831422.html` | エルバジェ央瓏（飛燕） |
| 因名祭 | `/kouryaku/stallions/3452611786.html` | アリバイ天煌 |
| 才能ページ（弐重の構造） | `/kouryaku/abilities/3315479266.html` | Torrential（才能詳細：その1／その2） |

いずれも `https://dabimas.jp` 配下。
