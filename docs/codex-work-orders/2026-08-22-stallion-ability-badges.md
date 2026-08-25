# 作業指示書: 種牡馬の非凡・天性・因名祭・エディットバッジと検索対応

- status: 依頼中
- 作成日: 2026-08-22
- 依頼元: Codex セッション（`codex-implement` 依頼モード）

## 背景と目的

配合の候補選択中に、種牡馬が持つ非凡な才能の種別、天性、因名祭産、エディット種牡馬であることを、候補一覧と血統表セルの両方で判別できるようにする。同じ属性をテキスト検索からも絞り込めるようにする。

仕様資料は `docs/no-ability-stallion-search-design.md`。この文書は仕様資料と現行コードを照合して実装判断を確定した作業指示書であり、両者に差がある場合はこの作業指示書を優先する。仕様資料内の「実装前に確認したい」という留保は解消済みとして、次の対応を採用する。

| 全書アイコン | `abilityType` | バッジ | 意味 |
|---|---|---|---|
| `icon_ability_00.png` | `"none"` | `凡` | 非凡なし |
| `icon_ability_99.png` | `"normal"` | `非` | 普通の非凡 |
| `icon_ability_98.png` | `"focused"` | `特` | 特化非凡 |
| `icon_ability_97.png` | `"double"` | `弐` | 弐重非凡 |

`list_icn_cat_14.png` は因名祭として扱い、`categoryIcon === "14"` のとき `祭` バッジを出す。全書の現行サンプルページでも `97` / `98` / `00` / category `14` の URL を再確認済みである。

バッジは次の順で返し、表示箇所ごとに判定を複製しない。

```text
E → 天性の先頭1文字 → 非凡（特/弐/非/凡のどれか）→ 祭
```

非凡バッジを表示・検索対象にするのは `sex === "0" && rare === 5` の馬だけとする。★4 以下の種牡馬は JSON 上の `abilityType` が `"none"` でも `凡` を出さない。牝馬、旧 snapshot、自家製馬、取得失敗、未知値では非凡バッジを出さない。

最重要の非機能要件は、バッジ追加後も血統表の可変行高とカード高を変えないこと。馬名と同じインラインフローには置かず、セルのルート要素直下の独立した flex アイテムとして表示する。

## 実装方針

### 1. スクレイパーと JSON

`scripts/build_dabimas_stream.py` を次の方針で変更する。

1. 既存の ALL 1〜112 列は一切動かさず、末尾に `HD_ABILITY_ICON = 113` を追加して `ROW_SIZE = 113` にする。
2. 定数を追加する。
   - `ABILITY_TYPE_BY_ICON`: `00/99/98/97` を上表の値へ変換する。
   - `INMEISAI_CATEGORY_ICON = "14"`
   - `CATEGORY_ICON_RE = re.compile(r"list_icn_cat_(.+)\.png$")`
3. `CONVERSION_WARNING_COUNTS` に `missing_ability_icon` と `unknown_ability_icon` を追加する。`reset_conversion_warning_counts()` の既存ループでリセットされる形を維持する。
4. `detail.find_all("a")` の位置に依存せず、見出しからブロックを探す次のヘルパーを追加する。
   - `find_spec_section(detail, heading)`: 一致する `<h4>` の直後の兄弟要素を返す。
   - `extract_ability_icon(detail)`: 「非凡な才能」セクションの `div.ability img.icon` を `normalize_src()` して返す。
   - `extract_spec_name(detail, heading)`: 対象セクションの `.ability_info p.large` を返し、非凡なし／見つからない場合は空文字を返す。
5. `parse_stallion()` では次の 3 列をヘルパーだけで設定する。既存の `a_tags` 添字と `h4_tags` 件数による能力・天性取得は削除する。
   - `row[HD_ABILITY_ICON] = extract_ability_icon(detail)`
   - `row[HD_ABILITY] = extract_spec_name(detail, "非凡な才能")`
   - `row[HD_NATURE] = extract_spec_name(detail, "天性")`
6. `parse_ability_type(icon_url, sex, identifier)` を追加する。
   - 牝馬 (`sex !== "0"`) は常に `None`、警告なし。
   - 種牡馬で URL が空なら `missing_ability_icon` を加算・警告し、`None`。
   - 既知アイコンは表どおり。
   - 未知アイコンは `unknown_ability_icon` を加算・警告し、誤って `凡` を付けないため `"normal"` へ安全側フォールバックする。
7. `parse_category_icon(icon_url)` を追加し、`list_icn_cat_14.png` → `"14"`、`list_icn_cat_collabo_1017.png` → `"collabo_1017"`、不一致／空文字 → `None` とする。
8. `all_row_to_dabifac_entry()` の full entry に `abilityType` と `categoryIcon` を追加する。カテゴリアイコンは因名祭専用の boolean に潰さず、生の識別子を保持する。
9. `entry_to_summary()` に同じ 2 フィールドを追加する。summary `version` は 1 のまま据え置く。detail chunk は `id` と `descendants` のみの現行スキーマを変えない。
10. Python 側の `displayName` / `searchText` を JS と一致させる。
    - 表示タグの順序は `[天性][非凡][祭]馬名補足`。full/summary のベース馬には `source: edit` がないので `[E]` は不要。
    - `displayName` は例として非凡なし★5なら `[凡]アイスカペイド極走`、因名祭なら `[凡][祭]...` となる。
    - 検索にはバッジ文字に加え、次のエイリアスを入れる。

| 種別 | エイリアス |
|---|---|
| none | `非凡なし`, `ひぼんなし` |
| normal | `非凡あり`, `ひぼんあり` |
| double | `非凡あり`, `ひぼんあり`, `弐重非凡`, `にじゅうひぼん` |
| focused | `非凡あり`, `ひぼんあり`, `特化非凡`, `とっかひぼん` |
| 因名祭 | `因名祭`, `いんめいさい` |

11. `--fail-on-error` の終了条件と完了ログに `missing_ability_icon` / `unknown_ability_icon` を組み込む。
12. 既存の「馬名 + `HD_ABILITY`」による連続重複スキップは維持する。見出しベース化で「非凡なし＋天性あり」の 4 頭の `HD_ABILITY` が天性名から空文字へ直るため、全量実行時に `written` / `skipped` と ID 集合が変わらないことを確認する。

### 2. 共通のバッジ・表示名・検索ロジック

`vue/logic/horses/horse-search.js` をバッジ判定の単一定義元にする。

1. 次の定数を追加する。
   - `ABILITY_BADGES`: `none/normal/double/focused` ごとの `text`, `className`, `title`。
   - `ABILITY_ALIASES`
   - `INMEISAI_CATEGORY_ICON = "14"`
   - `INMEISAI_ALIASES`
2. 次の純粋関数を追加し、既存の公開方法と同じく `window.Dabimas.logic.horses` へ公開する。
   - `getAbilityType(horse)`
   - `isInmeisai(horse)`
   - `getHorseBadges(horse, options)`
   - `getHorseNameText(horse)`
3. `getHorseBadges()` は新しい配列と badge object を返し、順序は `E → 天性 → 非凡 → 祭`。`options.hideEditBadge` が true の場合だけ E を省く。既存の `hideEditTag` と名前を混同しない。
4. `getHorseNameText()` はタグなしの `name + subName` だけを返す。
5. `getHorseBaseText()` は、バッジを別 DOM で描画できない場所と Python の `displayName` 互換のため残す。`[E][天性][非凡][祭]馬名補足` を返すよう拡張し、既存の `options.hideEditTag` も維持する。
6. `getHorseSearchIndexText()` に次を追加する。WeakMap キャッシュの仕組みは維持する。
   - `getHorseBadges(horse)` の文字列
   - ability エイリアス
   - 因名祭エイリアス
7. `filterHorse()` の部分一致、正規化、disabled 除外は変えない。

### 3. 血統表セルと候補リスト

#### `vue/components/pedigree/horse-cell.js`

1. ルート `.exp-mobile-autocomplete-root` に、選択モード時だけ `exp-horse-cell--select` を付ける。`dispCategory % 2 !== 0` のメモ／子系統モードへ flex レイアウトを当てない。
2. 選択モードの PC/スマホ分岐より外側、ルートの先頭の子として `cellBadges` を描画する。
3. `cellBadges` computed は `selected[index]` を `getHorseBadges()` へ渡す。badge の key/class/title/text をそのまま DOM へ反映する。
4. `mobileTriggerLabel` は `getHorseNameText()` を使い、文字列タグを重ねて表示しない。
5. PC の `v-autocomplete` に `v-slot:selection` は追加しない。selection DOM が折り返して入力欄を高くするため禁止する。

#### `vue/components/pedigree/desktop-horse-autocomplete.js`

1. `item-text` を `getHorseNameText` へ変更し、選択後 input にはタグなしの馬名だけを入れる。
2. 候補行の `v-chip.edit-stallion-chip` を廃止し、`getHorseBadges(data.item)` の全バッジを共通マークアップで描画する。
3. 候補名も `getHorseNameText()` を使う。既存の因子表示は維持する。
4. 検索の `filterHorse()` 呼び出しと選択イベントは変えない。

#### `vue/components/pedigree/mobile-horse-picker.js`

1. 候補行の E 専用 chip を、`getHorseBadges(horse)` の全バッジへ置換する。
2. 候補名は `getHorseNameText()` を使う。因子バッジ、IME、最大件数、選択処理は変えない。
3. 「現在の選択」も同じバッジ列 + タグなし馬名で描画する。
4. `mobileCurrentSelectionLabel` / `getHorseSelectedText` による `[E]` `[颶]` 文字列の二重表示を残さない。

#### `vue/components/settings/edit-stallion-manager.js`

1. ベース種牡馬 autocomplete の候補 item slot に `getHorseBadges(horse)` と `getHorseNameText(horse)` を使う。
2. 選択後の input はタグなし馬名にする。
3. 登録済みエディット種牡馬行の E 専用 chip も共通バッジへ寄せる。ベース馬が見つかる場合は `source: "edit"` とベース馬属性を組み合わせ、E・天性・非凡・祭を同じ順序で表示する。ベース馬不明なら少なくとも E のみを表示する。
4. 登録・編集・削除、因子バッジ、入力検証のロジックは変えない。

### 4. ロード・snapshot 互換

`vue/app/methods/horse-loading.js` を変更する。

1. `normalizeHorseSummary()` で次のように正規化する。
   - `abilityType`: string ならその値、そうでなければ `null`
   - `categoryIcon`: string ならその値、そうでなければ `null`
2. `createEditStallionSummary()` は `rare` と同様に、`abilityType` / `categoryIcon` をベース馬から継承する。
3. `createSavedHorseSummary()` は `rare` を持たない現行仕様のまま。自家製馬には非凡バッジを出さない。
4. `stripHorseForStorage()` は現行どおり `descendants` / `searchText` / `displayName` だけを落とし、新フィールドを snapshot に残す。
5. 新フィールドがない旧 snapshot はエラーなく復元でき、非凡・因名祭バッジだけが出ないこと。天性と E は従来データから表示する。

### 5. CSS と行高

共通 CSS は `css/unified.css`、スマホ上書きは `css/mobile.css` に置く。

共通クラス:

```css
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
```

色:

| class | 背景色 |
|---|---|
| `exp-horse-badge--edit` | `#5b4b8a` |
| `exp-horse-badge--nature` | `#00796b` |
| `exp-horse-badge--focused` | `#a67c00` |
| `exp-horse-badge--double` | `#01579b` |
| `exp-horse-badge--normal` | `#c62828` |
| `exp-horse-badge--noability` | `#8d9aa5` |
| `exp-horse-badge--inmeisai` | `#ad1457` |

セルの PC レイアウト:

```css
.table_main .exp-horse-cell--select {
  display: flex;
  align-items: center;
  min-width: 0;
}
.table_main .exp-horse-cell--select > .v-input {
  flex: 1 1 auto;
  min-width: 0;
}
```

スマホ上書き:

```css
.exp-mobile-layout .exp-horse-badges { gap: 1px; padding-left: 2px; }
.exp-mobile-layout .exp-horse-badge {
  height: calc(var(--exp-mobile-row-height) * 0.80);
  min-width: calc(var(--exp-mobile-row-height) * 0.80);
  padding: 0 1px;
  border-radius: 2px;
  font-size: clamp(7px, calc(var(--exp-mobile-row-height) * 0.66), 11px);
}
```

縦 `margin`、`border`、`box-shadow` は使わない。バッジを馬名と同じインラインフローへ入れない。既存 `.edit-stallion-chip` の参照がなくなった場合だけ、その専用 CSS を削除する。

### 6. Service Worker

今回変更する JS/CSS/summary JSON はすべて `service-worker.js` の precache 対象である。`urlsToCache` の項目は追加・削除せず、初回実装で `CACHE_NAME` を `dabimas-factor-v20260802-02` から `dabimas-factor-v20260822-01` へ更新し、2026-08-23 のアイコン対応修正で `dabimas-factor-v20260823-01`、保存データ復元を優先する起動順序整理で `dabimas-factor-v20260823-02` へ再更新する。旧キャッシュの JS/CSS/JSON 混在を防ぐため、この変更を省略しない。

### 7. テスト

#### Python

`tests/test_build_dabimas_stream.py` の既存 importlib パターンへテストを追加する。このファイルは `.gitignore` の `tests` 規則で無視されているため、変更が `git status` に出なくても、必ず実ファイルを更新し完了報告へ明記する。勝手に `.gitignore` を変更しない。

最低限、次を自動テストする。

1. 「普通の非凡」「非凡なし」「非凡＋天性」「非凡なし＋天性」の HTML 断片で、見出しヘルパーが正しいアイコン・能力名・天性名を返す。
2. `parse_ability_type()` の `00/99/98/97/未知/空/牝馬` と警告カウンタ。
3. `parse_category_icon()` の `14` / `collabo_1017` / 空。
4. entry/summary の `abilityType` / `categoryIcon`、`displayName`、検索エイリアス。
5. ★4、牝馬、未知値では表示用の非凡タグ／エイリアスを付けない。
6. `--fail-on-error` が新しい 2 警告でも 1 を返す。

#### JavaScript

`scripts/verify-horse-badges.cjs` を新規作成する。`scripts/verify-horse-candidate-lists.cjs` と同じ `global.window` 準備方法で `horse-search.js` を直接 require し、Node の strict assert で次を確認する。

1. `getHorseBadges()` の順序が E → 天性 → 非凡 → 祭。
2. `rare !== 5`、牝馬、`abilityType` 欠落・不明値では非凡バッジがない。
3. `categoryIcon === "14"` のときだけ祭がある。
4. `getHorseNameText()` にタグ文字が混ざらない。
5. `getHorseBaseText()` と Python summary のタグ順が一致する。
6. `filterHorse()` が `非`, `弐`, `特`, `凡`, `祭`, `非凡あり`, `にじゅうひぼん`, `とっかひぼん`, `いんめいさい`, `颶` で期待する fixture に一致する。
7. `凡` で★4以下・牝馬・旧 snapshot が誤一致しない。
8. `normalizeHorseSummary()` / `createEditStallionSummary()` の新フィールド継承と旧データ互換。

同じスクリプトに生成済み `json/dabimasFactor.summary.json` の集計チェックも持たせるか、別の一時検証を実行して、完了報告に次の件数を記載する。

- 全 2,873 件 = 種牡馬 2,375 / 牝馬 498
- ★5種牡馬: none 572 / normal 1,025 / double 10 / focused 264
- `rare <= 4` の種牡馬 504 件は全て `abilityType === "none"` だが、バッジ対象外
- `categoryIcon === "14"` は 60 件で、全て none かつ `nature === ""`
- `missing_ability_icon` / `unknown_ability_icon` は 0

### 変更対象ファイル

- `scripts/build_dabimas_stream.py` — DOM 解析、列 113、変換・警告、entry/summary
- `vue/logic/horses/horse-search.js` — バッジ・タグなし名前・検索の単一定義元
- `vue/components/pedigree/horse-cell.js` — セル左のバッジ列
- `vue/components/pedigree/desktop-horse-autocomplete.js` — PC 候補バッジとタグなし名前
- `vue/components/pedigree/mobile-horse-picker.js` — スマホ候補・現在選択のバッジ
- `vue/components/settings/edit-stallion-manager.js` — ベース候補・登録済み行のバッジ
- `vue/app/methods/horse-loading.js` — 新フィールド正規化・継承
- `css/unified.css` — 共通バッジ CSS
- `css/mobile.css` — スマホ行高追随 CSS
- `tests/test_build_dabimas_stream.py` — Python テスト（git ignored だが更新必須）
- `scripts/verify-horse-badges.cjs` — JS・生成データ検証
- `json/dabimasFactor.json` — 全量再生成
- `json/dabimasFactor.summary.json` — 全量再生成
- `service-worker.js` — `CACHE_NAME` の 1 回 bump

`json/dabimasFactor-details/*.json` は同じ生成コマンドで再生成するが、スキーマも内容も変更対象外であり、既存データと同じなら diff を残さない。ライブデータの変化で内容差分が出た場合は、勝手に受け入れず完了報告の「残課題・気づき」に記載する。

## 制約

- `AGENTS.md` の Safety Rules に従うこと。
- `index.html` / `index.exp.html` は変更しない。したがって今回 `backup-index-exp` は不要。検証として `verify-index-exp .\index.html` は実行する。
- 現在の作業ツリーにはユーザー所有の `D out.txt` と `?? docs/no-ability-stallion-search-design.md` がある。復元・削除・内容変更・ステージングをしない。
- この作業指示書も完了報告の追記以外は書き換えない。
- 既存 ALL 列 1〜112、既存 JSON フィールド、summary version、detail chunk schema、公開済み検索関数の既存挙動を壊さない。
- 新しい判定を各 Vue コンポーネントへ複製せず、`horse-search.js` の公開関数を使う。
- PC の `v-autocomplete` に `v-slot:selection` を追加しない。
- バッジに `border` / `box-shadow` / 縦 margin を使わない。
- UI 検証で Chrome を直接起動せず、`scripts/codex-powershell.ps1 screenshot ...` / `dump-dom ...` を使う。
- データ再生成前に `json/dabimasFactor.json`、summary、details の比較用コピーを `tmp/stallion-badges-baseline/` へ保存する。
- 実装はコミットしない。ユーザーの既存変更をステージングしない。

## スコープ外（やらないこと）

- 非凡名（例: 鉄情不羈）の JSON 保存・名前検索
- 因名祭以外のカテゴリ（究極配合、凄馬、交換Pt、コラボ等）のバッジ化
- チェックボックス等の新しい絞り込み UI
- ★表示、牝馬への非凡バッジ
- `note-article/` の取扱説明書更新
- summary version の bump、detail chunk schema の変更
- 候補検索、IME、血統計算、保存・復元、エディット種牡馬 CRUD の周辺リファクタリング
- 仕様資料 `docs/no-ability-stallion-search-design.md` の編集
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

1. `python -m pytest -q` が既存分と追加分を含め全件成功する。
2. `node scripts/verify-horse-badges.cjs` と `node scripts/verify-horse-candidate-lists.cjs` が成功する。
3. 変更した全 JS と `service-worker.js` に対する `node --check` が成功する。
4. `--limit 30 --fail-on-error` の予行で種牡馬の `abilityType` が非 null、警告 0、サンプルの `00/99/98/97` と category `14` がサイト表示と一致する。
5. 全量再生成が exit 0。`written=2873`、種牡馬 2,375、牝馬 498、未知／欠落 ability icon 警告 0 である。
6. 全量 summary の件数が none 572 / normal 1,025 / double 10 / focused 264、因名祭 60。★4以下と牝馬に非凡バッジ・エイリアスが付かない。
7. 旧 summary と新 summary を ID で比較し、既存 ID 集合と既存フィールド値が不変。差分フィールドは `abilityType` / `categoryIcon` の追加と `displayName` / `searchText` の更新だけである。detail chunk は差分なし。
8. `HD_ABILITY` の既存不具合対象 4 頭で `nature` が保持され、非凡なし＋天性の馬の `HD_ABILITY` は空文字になる。連続重複スキップの結果は変わらない。
9. PC 1280×720 / 1280×1000、スマホ 375×667 / 320×568 で、バッジ 3 個を 32 セルすべてに置いた最悪ケースでも `.table_main` と `.pedigree-card-table-wrap` の高さが導入前から変化しない。最下行がクリップされない。
10. メモ／子系統モード (`dispCategory % 2 !== 0`) のレイアウトが変わらない。
11. PC でセルクリック→候補表示→検索→選択ができ、候補とセル左にバッジ、input にはタグなし馬名が出る。バッジ自体はクリック動作を持たない。
12. スマホでトリガー→ダイアログ→候補検索→選択ができ、候補、「現在の選択」、選択後セルにバッジが出る。`[E]` / `[颶]` 等の文字列タグが二重表示されない。
13. `captureMobileScreenshot` の出力 PNG にバッジのベタ塗り色と文字が写る。
14. 新フィールドを持たない旧 localStorage snapshot からエラーなく復元できる。非凡・因名祭バッジは出ず、既存の天性・E は出る。
15. `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html` が `[verify] OK` を返す。
16. `service-worker.js` の `CACHE_NAME` が `dabimas-factor-v20260823-02` で、アイコン対応修正・起動順序整理時にも bump されている。precache 一覧は変更していない。
17. `git diff --check` が今回の変更に対して問題を報告しない。ユーザー所有の既存差分は変更していない。

## 検証コマンド

実装前に比較用コピーを取る。

```powershell
New-Item -ItemType Directory -Force .\tmp\stallion-badges-baseline\details | Out-Null
Copy-Item -LiteralPath .\json\dabimasFactor.json -Destination .\tmp\stallion-badges-baseline\dabimasFactor.json
Copy-Item -LiteralPath .\json\dabimasFactor.summary.json -Destination .\tmp\stallion-badges-baseline\dabimasFactor.summary.json
Copy-Item -Path .\json\dabimasFactor-details\*.json -Destination .\tmp\stallion-badges-baseline\details\
python -m pytest -q
node .\scripts\verify-horse-candidate-lists.cjs
```

実装後の静的・単体検証。

```powershell
python -m pytest -q
node .\scripts\verify-horse-badges.cjs
node .\scripts\verify-horse-candidate-lists.cjs
node --check .\vue\logic\horses\horse-search.js
node --check .\vue\components\pedigree\horse-cell.js
node --check .\vue\components\pedigree\desktop-horse-autocomplete.js
node --check .\vue\components\pedigree\mobile-horse-picker.js
node --check .\vue\components\settings\edit-stallion-manager.js
node --check .\vue\app\methods\horse-loading.js
node --check .\service-worker.js
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html
```

少量の実サイト予行。出力先は `tmp/` に限定する。

```powershell
New-Item -ItemType Directory -Force .\tmp\stallion-badges-limit30\details | Out-Null
python .\scripts\build_dabimas_stream.py `
  --output .\tmp\stallion-badges-limit30\dabimasFactor.json `
  --summary-output .\tmp\stallion-badges-limit30\dabimasFactor.summary.json `
  --details-output-dir .\tmp\stallion-badges-limit30\details `
  --all-output .\tmp\stallion-badges-limit30\all.ndjson `
  --limit 30 `
  --workers 4 `
  --delay 0.3 `
  --progress 10 `
  --fail-on-error
```

`--limit 30` は先頭 URL だけなので、`00/99/98/97/category 14` の全種類を含む保証はない。単体テストに加え、必要なら仕様資料の付録 URL を一時 `--urls-file` に並べて全種類を確認する。作業対象外の永続 URL ファイルは追加しない。

全量再生成。

```powershell
python .\scripts\build_dabimas_stream.py `
  --output .\json\dabimasFactor.json `
  --summary-output .\json\dabimasFactor.summary.json `
  --details-output-dir .\json\dabimasFactor-details `
  --all-output .\tmp\stallion-badges-all.ndjson `
  --workers 8 `
  --delay 0.3 `
  --progress 100 `
  --fail-on-error

node .\scripts\verify-horse-badges.cjs
```

ローカル配信は別ターミナルで行い、fresh port を使う。VirtualTimeBudget は 30000 を指定する。

```powershell
python -m http.server 8766
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 dump-dom http://localhost:8766/index.html 390 844 30000
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 screenshot http://localhost:8766/index.html .\tmp\stallion-badges-1280x720.png 1280 720 30000
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 screenshot http://localhost:8766/index.html .\tmp\stallion-badges-1280x1000.png 1280 1000 30000
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 screenshot http://localhost:8766/index.html .\tmp\stallion-badges-375x667.png 375 667 30000
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 screenshot http://localhost:8766/index.html .\tmp\stallion-badges-320x568.png 320 568 30000
```

画面検証では、実データ選択または `tmp/` 配下だけの一時ハーネス／snapshot seed を使い、通常 1〜2 個と最悪 3 個×32セルの両方を確認する。一時検証物を変更対象へ含めない。各サイズで `.table_main` / `.pedigree-card-table-wrap` の導入前後の computed height、最下行、PC/スマホの操作結果、スクリーンショットへの描画を完了報告へ数値付きで記載する。

最後に差分を確認する。

```powershell
git status --short
git diff --check
git diff --stat
git diff -- . ':(exclude)out.txt' ':(exclude)docs/no-ability-stallion-search-design.md'
```

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。

### 変更ファイル一覧

- `scripts/build_dabimas_stream.py`: 非凡アイコン列（113）とカテゴリアイコンを解析し、`abilityType` / `categoryIcon`、バッジ付き `displayName`、検索エイリアスを full / summary に出力する処理と警告・fail-fast 条件を追加した。
- `tests/test_build_dabimas_stream.py`（git ignored）: 見出し基準の HTML 解析、非凡種別、警告、天性との分離、summary 生成を回帰テストした。
- `scripts/verify-horse-badges.cjs`: バッジ順序・表示除外・検索エイリアス・旧 snapshot 互換・保存復元・全量集計・Python/JS 表示名一致を検証する回帰スクリプトを追加した。
- `.gitattributes`: CRLF を維持する Python 変換スクリプトについて、Git の行末 CR を空白不備として誤検出しないパス限定規則を追加した。
- `vue/logic/horses/horse-search.js`: バッジ分類、馬名だけの表示、因名祭判定、非凡・因名祭検索エイリアスを一元化した。
- `vue/app/methods/horse-loading.js`: summary と編集種牡馬で新フィールドを正規化・継承・保存するようにした。
- `vue/app/boot.js`, `vue/app/app-lifecycle.js`: Service Worker登録を即時実行せず、IndexedDBによる保存データ復元の完了後に開始するよう起動順序を直した。
- `vue/app/methods/ui-viewport.js`: 320x568 でも32セルの最終行を収めるよう、カード外枠を変えずに collapsed table の内部予算を調整した。
- `vue/components/pedigree/horse-cell.js`: 選択可能セルに E / 天性 / 非凡 / 因名祭バッジを表示し、メモ・因子系統モードからは除外した。
- `vue/components/pedigree/desktop-horse-autocomplete.js`: PC の候補行をバッジ＋タグなし馬名表示にした。
- `vue/components/pedigree/mobile-horse-picker.js`: スマホの現在選択と候補行をバッジ＋タグなし馬名表示にした。
- `vue/components/settings/edit-stallion-manager.js`: 編集種牡馬の元馬候補・一覧で同じバッジ表示を使用し、入力値はタグなしにした。
- `css/unified.css`, `css/mobile.css`: 共通の小型バッジと、32セルを伸ばさない選択セル用レイアウトを追加した。
- `json/dabimasFactor.json`, `json/dabimasFactor.summary.json`: 固定した既存 2,873 ID から新フィールド・表示名・検索文字列を再生成した。
- `service-worker.js`: 初回実装で `CACHE_NAME` を `dabimas-factor-v20260822-01` に更新し、アイコン対応修正で `dabimas-factor-v20260823-01`、起動順序整理で `dabimas-factor-v20260823-02` に再更新した。precache 一覧は変更していない。
- `scripts/verify-storage-boot-order.cjs`: データ復元中はService Worker登録0回、復元完了後に1回となる起動順序の回帰テストを追加した。
- `docs/no-ability-stallion-search-design.md`: 確定した `98` = 特化非凡 / `97` = 弐重非凡の対応と集計値へ設計資料を訂正した。
- `docs/codex-work-orders/2026-08-22-stallion-ability-badges.md`: この完了報告を記入した。

### 設計判断

- 全量取得時点のライブ一覧は 2,909 件で、旧データに対して追加 46 / 欠落 10 のドリフトがあった。今回の目的外の馬追加・削除を混ぜないため、旧 full の 2,873 ID から URL 一覧を `tmp/` に作り、欠落していた10 URLも個別取得できることを確認してから、その固定集合で再生成した。永続的な URL ファイルは追加していない。
- 初期設計では才能詳細の本数から `98` を弐重と推定していたが、2026-08-23 のユーザー確認を正として `98` = 特化、`97` = 弐重へ訂正した。今後はページ構造から種別名を推定せず、確定済みのアイコン対応を回帰テストで固定する。
- ローカル確認中の `UnknownError` / `AbortError` はアプリのDBスキーマや起動競合ではなく、10日間残っていた65個のChromeプロセス内のStorage/QuotaManager不整合が原因だった。新規ポートでも任意DB・StorageManager・Service Workerが一括して失敗し、`chrome://restart` 後はアプリ変更なしでIndexedDB復元とService Worker登録が成功した。アプリ側では診断性と復元優先のため、Service Worker登録を保存データ復元後に行う順序だけ維持する。
- Python 側と JS 側で表示・検索の責務は重なるが、summary は静的配信時にも利用するため、同じ順序規約を回帰スクリプトで全 2,873 件照合する構成にした。
- `320x568` の最終行クリップは既存相当状態でも発生していたが、受け入れ基準9がクリップなしを明示しているため、カード全体を伸ばさずに viewport 行高計算の内部予算を調整した。collapsed table の小数 px 丸めを実測し、行高 13.46875 px で table / wrap が同じ 230.5 px になる値を採用した。

### 実行した検証と結果

- 基準 1〜3, 15: `python -m pytest -q` は 18 passed、`node scripts/verify-horse-badges.cjs` と `node scripts/verify-horse-candidate-lists.cjs` はともに OK。変更 JS / `service-worker.js` の `node --check` は全件成功し、`verify-index-exp .\index.html` は `[verify] OK`。
- アイコン対応修正: 先に単体テストを `98` = focused / `97` = double へ直して失敗を再現し、変換定数を修正後に成功した。全量データでは `s3537931452`（98）が focused、`s3452991073`（97）が double であることも回帰スクリプトで固定した。
- 起動順序整理: `node scripts/verify-storage-boot-order.cjs` は修正前に即時登録1回で失敗し、修正後は復元中0回・復元後1回で `storage boot order regression: OK`。Chrome完全再起動後、`http://localhost:8773/` で保存領域のエラーなし・Service Worker登録成功をユーザー環境で確認した。
- 基準 4: `--limit 30 --fail-on-error` は target 30 / written 28 / skipped 2 / errors 0、missing / unknown ability icon 警告はいずれも 0。付録7 URLで `00/99/98/97` と category `14` の対応を確認した。
- 基準 5〜8, 14: 固定 2,873 URL の全量再生成は written 2,873 / skipped 0 / errors 0 / 警告 0。種牡馬 2,375 / 牝馬 498、★5 は none 572 / normal 1,025 / double 10 / focused 264、★4以下 504 は全頭 none、因名祭 60 は全頭 none・天性空。旧 full / summary の ID 集合・順序と既存フィールドは不変で、detail 23 ファイルも byte-identical。旧 snapshot は新バッジを出さず E・天性を保持した。`HD_ABILITY` 対象外4頭は能力名空・天性保持・`icon_ability_00.png` を確認した。
- 基準 9〜10: 最悪ケース（E＋天性＋非凡）を32セルへ配置。`1280x720` は `.table_main` / wrap が前後とも 626.5 / 628.5 px、`1280x1000` は 906.5 / 908.5 px、`375x667` は table / wrap とも 280 / 280 px、`320x568` は 230.5 / 230.5 pxで、全サイズともバッジ表示前後の高さ増加 0 px。最終行・最終行内コンテンツは4サイズすべて表示・クリック可能で、320 は下端オーバーフロー -0.5 px。メモ・因子系統モードも最終行まで表示され、バッジ 0、選択用 class 0 で高さ不変。
- 基準 11〜12: PC はセルクリック→候補表示→検索→選択、スマホはトリガー→ダイアログ→現在選択 / 候補表示→検索→選択→閉じる、の各操作に成功。候補・セルにはバッジ、input にはタグなし馬名が表示され、バッジクリックでも操作を妨げなかった。
- 基準 13: 修正後の `captureMobileScreenshot` 実 PNG は `375x667`（131,163 bytes）と `320x568`（109,606 bytes）で生成でき、バッジ背景色の実画素をそれぞれ edit 3,420 / nature 1,436 / normal 1,840、edit 1,951 / nature 504 / normal 688 pixel 検出した。ブラウザ全体の最終スクリーンショットも4サイズで再生成（221,302 / 197,569 / 89,004 / 71,827 bytes）し、PC・スマホともバッジと最終行を目視確認した。
- 基準 16〜17: cache 名の変更箇所は1箇所、precache 差分なし。元と同じ CRLF・UTF-8 BOMなしを保持し、素の `git diff --check` は問題なし。ユーザー所有の `out.txt` 削除には触れず、設計資料は今回確定したアイコン対応に関係する記述だけ訂正した。

### 残課題・気づき

- ライブ一覧には旧データ比で追加 46 / 欠落 10 のドリフトがあった。今回は固定した旧 2,873 ID を用いて除外したため、別タスクでライブ一覧更新の要否を判断する必要がある。
