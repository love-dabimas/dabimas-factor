# 作業指示書: 配合保存・復元ダイアログの「復元する・削除する」ボタンを固定フッター化する

- status: 実装・自動検証完了（手動スモーク待ち）
- 作成日: 2026-07-24
- 依頼元: Claude Code セッション

## 背景と目的

配合の保存・復元ダイアログ（`combination-dialog` コンポーネント）では、
「復元する」「削除する」ボタンが `v-card-text` 内の最下段の `v-row`
（`combination-button-area`）に置かれている。

スマホ（縦積みレイアウト）では、保存済み配合リストが増えるほどボディ全体が
縦に伸び、ボタン行がスクロールしないと見えない位置に流れてしまう。
実機のスクリーンショットでは、保存済み配合が 3 件の時点で既に
「復元する」ボタンが画面下端にわずかに見える程度になっている（最大 15 件保存できる）。

これを、**保存済み配合が何件あっても「復元する」「削除する」ボタンが
スクロールなしで常に見える**構造に変更する。

## 実装方針

Vuetify 2 の `v-dialog` に `scrollable` が既に付いているので、その標準挙動を使う:
`v-card` の直下に `v-card-title` / `v-card-text` / `v-card-actions` を並べると、
**タイトルとアクション行は固定され、`v-card-text` だけがスクロールする**。

つまり、ボタン行を `v-card-text` の内側から外に出して `v-card-actions` に
移すだけで、PC・スマホの両方でボタンが常時表示になる。新しい画面分割や
ページングは導入しない（1 画面のまま）。

変更後の構造（イメージ）:

```
<v-dialog scrollable ...>
  <v-card>
    <v-card-title>   … 固定ヘッダー（既存のまま）
    <v-card-text>    … スクロール領域: 新規保存フォーム + 保存済みリスト
    <v-card-actions> … 固定フッター: [復元する] [削除する]  ← 新設
  </v-card>
  <v-snackbar ...>   … 既存のまま触らない
</v-dialog>
```

### 変更対象ファイル

- `vue/CombinationDialog.js` — template 内のボタン行を移動する。
  1. `<v-row class="combination-button-area">` から `</v-row>` までのブロック
     （復元する・削除するの 2 ボタンを含む）を `<v-container>` / `</v-card-text>`
     の内側から削除する。
  2. `</v-card-text>` と `</v-card>` の間に以下を新設する。
     `v-row` / `v-col` のグリッドはやめ、2 つの `v-btn` を直接並べる
     （固定フッター内では常に横並び 50:50 にするため。従来のスマホ縦積みは廃止）:

     ```html
     <v-card-actions class="combination-dialog-actions">
       <v-btn
         color="primary"
         :disabled="!selectedId"
         @click="restoreConfig"
         :loading="restoring"
         class="combination-action-btn"
       >
         <v-icon left small>mdi-reload</v-icon>
         復元する
       </v-btn>
       <v-btn
         color="error"
         :disabled="!selectedId"
         @click="deleteConfig"
         :loading="deleting"
         class="combination-action-btn"
       >
         <v-icon left small>mdi-delete</v-icon>
         削除する
       </v-btn>
     </v-card-actions>
     ```

     `block` プロパティは付けない（横並びのため。幅は CSS の flex で均等にする）。
     色・アイコン・`:disabled` / `:loading` / `@click` のバインディングは
     既存のものを変えない。
- `css/combinationDialog.css` — スタイルの付け替え。
  1. `.combination-button-area` 系のルールを**全て削除**する
     （基本ルール 2 つと、`@media (max-width: 960px)` 内の 2 つ）。
  2. 代わりに固定フッターのスタイルを追加する:

     ```css
     /* 固定フッター（復元・削除ボタン）。v-card-text の外にあるので
        リストが増えてもスクロールで隠れない */
     .combination-dialog-actions {
       display: flex;
       gap: 12px;
       padding: 12px 20px !important;
       border-top: 2px solid #e9ecef;
     }

     .combination-dialog-actions .combination-action-btn.v-btn {
       flex: 1 1 0;
     }
     ```

  3. スマホ用メディアクエリ（960px 以下）に、フッターの余白詰めを追加する:

     ```css
     .combination-dialog-actions {
       gap: 8px;
       padding: 10px 14px !important;
     }
     ```

  4. スマホ用メディアクエリ内の `.combination-saved-list` の
     `max-height` 上書き（960px 以下: 240px、600px 以下: 220px、
     400px 以下: 200px）を**削除**し、960px 以下では
     `max-height: none; overflow-y: visible;` を指定する。
     これらの上限は「削除ボタンが見えるようリストを縮める」ための回避策で、
     フッター固定化により不要になる。むしろ残すと
     「リスト内スクロール + v-card-text スクロール」の二重スクロールになるので、
     スマホではリストを流し込みにして v-card-text の 1 スクロールに統一する。
     該当箇所の「削除ボタンが見えるよう高さを抑える」等のコメントも
     新しい理由に書き換えること。
     **PC 用の基本ルール（`max-height: 350px; overflow-y: auto;`）は残す**
     （PC は 2 カラムで左カラムの高さに揃えたいため）。

## 制約

- `AGENTS.md` の Safety Rules に従うこと。
- `vue/CombinationDialog.js` の `<script>` 部分（data / computed / methods）は
  一切変更しない。変更は template 文字列と CSS のみ。
- ボタンの文言・色・アイコン・活性条件（`!selectedId` で disabled）は変えない。
- `v-snackbar`（トースト）と `v-card-title`（ヘッダー）は触らない。

## スコープ外（やらないこと）

- 保存済み配合のページング・件数上限変更・複数画面化はしない。
- 新規保存フォーム側（種牡馬トグル、因子セレクト、タイトル入力、保存ボタン）は
  レイアウト含め一切触らない。
- `index.html` および他の Vue コンポーネントは触らない。
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

1. `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp`
   が [verify] OK を返す。
2. `vue/CombinationDialog.js` の template 内で、`combination-button-area` という
   文字列が存在しなくなり、`</v-card-text>` の後・`</v-card>` の前に
   `<v-card-actions class="combination-dialog-actions">` が存在する
   （`Select-String` 等で確認できる）。
3. `css/combinationDialog.css` に `combination-button-area` の記述が残っていない。
4. 手動スモーク（ブラウザでアプリを開いて確認。ヘッドレス screenshot は
   ダイアログを開く操作ができないため使わない）:
   - スマホ幅（DevTools で 390×844 程度）で配合の保存・復元ダイアログを開き、
     保存済み配合を 5 件以上にした状態で、**スクロールせずに**
     「復元する」「削除する」ボタンが横並びでダイアログ下端に見える。
   - その状態でボディ（フォーム + リスト）をスクロールしても、
     ヘッダーとボタン行は動かない。
   - PC 幅（1280×900 程度）で 2 カラムレイアウトが崩れておらず、
     リストは従来どおり 350px でリスト内スクロールし、ボタン行は下端に固定表示される。
   - 未選択時はボタンが disabled、選択後に「復元する」で復元 + トースト表示 +
     ダイアログが閉じる、「削除する」で確認ダイアログが出る（従来挙動のまま）。

## 検証コマンド

1. `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp`
2. `Select-String -Path vue\CombinationDialog.js, css\combinationDialog.css -Pattern "combination-button-area"`
   → ヒット 0 件であること
3. `Select-String -Path vue\CombinationDialog.js -Pattern "combination-dialog-actions"`
   → 1 件ヒットすること
4. 受け入れ基準 4 の手動スモーク（実施した内容と結果を完了報告に書く）

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。

### 変更ファイル一覧

- `vue/CombinationDialog.js`
  - 復元・削除ボタンを `v-card-text` 内のグリッドから、`v-card` 直下の
    `v-card-actions` へ移動した。
- `css/combinationDialog.css`
  - 旧ボタン行のスタイルを固定フッター用スタイルへ置き換えた。
  - 960px 以下では保存済みリスト単体のスクロールを解除し、
    `v-card-text` のスクロールへ統一した。
  - 600px / 400px 以下のリスト高さ上書きを削除した。
- `docs/codex-work-orders/2026-07-24-combination-dialog-sticky-actions.md`
  - この完了報告を追記した。

### 設計判断

- 指示書どおり、Vuetify 2 の `scrollable` ダイアログの標準レイアウトを利用し、
  独自の sticky 指定やページングは追加していない。
- PC の保存済みリストは従来の `max-height: 350px; overflow-y: auto;` を維持した。
- `data` / `computed` / `methods`、ヘッダー、トースト、新規保存フォームには
  変更を加えていない。

### 実行した検証と結果

- RED 確認:
  - 変更前は `combination-button-area` が 5 件、
    `combination-dialog-actions` が 0 件で契約テストが失敗することを確認した。
- GREEN 確認:
  - `combination-button-area` は JS / CSS 合計 0 件。
  - `combination-dialog-actions` は template 内に 1 件。
  - `v-card-actions` が `</v-card-text>` より後、次の `</v-card>` より前にある。
  - ボタンの色・アイコン・文言・disabled / loading / click バインディング、
    CSS の PC / スマホ指定を静的契約テストで確認した。
- `node --check vue/CombinationDialog.js`: 成功。
- `git diff --check -- vue/CombinationDialog.js css/combinationDialog.css`: 成功。
- `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html`:
  `[verify] OK`。
- `pytest -q`: 13 passed。
- 2 軸コードレビュー:
  - Standards: 指摘 0 件。
  - Spec: 指摘 0 件。
- 手動スモーク:
  - この実行環境では利用可能なブラウザセッションがなかったため未実施。

### 残課題・気づき

- 受け入れ基準 4 のスマホ幅（390×844 程度）と PC 幅（1280×900 程度）の
  手動スモークが必要。
- 指示書記載の引数なし `verify-index-exp` は、現在存在しない
  `index.exp.html` を既定対象にするため `Target file not found` で失敗する。
  現行ファイルを明示した `verify-index-exp .\index.html` では `[verify] OK` を確認済み。
