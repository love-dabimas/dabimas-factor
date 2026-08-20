# note記事「統合版ダビふぁく取説」一式

- [chapters/](./chapters) — 記事本文(チャプターごとに1ファイル、00〜10の連番順に掲載)
- [images/](./images) — 記事に埋め込むスクリーンショット13枚(基本はiPhoneサイズ 390×844 @2x、10のみPCサイズ)

## チャプター構成

| ファイル | 内容 |
|---|---|
| chapters/00-hajimeni.md | タイトル・前書き・免責・目次 |
| chapters/01-dabifaku-toha.md | ダビふぁくの紹介と統合版の変更点 |
| chapters/02-home-category.md | ホーム画面・カテゴリ作成・既存データ移行 |
| chapters/03-pedigree.md | 馬の検索・選択・血統表の個別入れ替え |
| chapters/04-header.md | ニトロ・クロス・理論・カメラ/リセットボタン(PC版画面含む) |
| chapters/05-kokeitou-memo.md | 子系統・メモモードの切り替えと使い方 |
| chapters/06-heart-jikasei.md | ハート(手動クロス指定)と自家製馬の因子設定 |
| chapters/07-save-restore.md | 配合の保存・復元ダイアログ |
| chapters/08-workspace.md | 作業枠タブの追加・切替・削除 |
| chapters/09-home-edit.md | ホームの編集モード・カテゴリ削除の注意 |
| chapters/10-faq-owarini.md | よくある質問・締めの挨拶 |

## noteへの掲載手順

1. noteの新規記事エディタに、chapters/ の各ファイルを00から順に貼り付けて1本の記事にする(章ごとに分割連載にしてもOK)
2. `![...](../images/xx.png)` の行を、該当画像のアップロードに差し替える
3. 見出し(`#` / `##`)はnoteの「見出し」スタイルに置き換える

## 画像の対応表

| ファイル | 内容 | 使用章 |
|---|---|---|
| 01-home-empty.png | ホーム画面(初回・空状態) | 第2章 |
| 02-category-dialog.png | カテゴリ追加ダイアログ | 第2章 |
| 03-category-screen.png | カテゴリ画面(作業枠タブ+空の血統表) | 第3章 |
| 04-horse-picker.png | 種牡馬の検索ダイアログ(「キタサン」で検索中) | 第3章 |
| 05-pedigree-filled.png | キタサンブラック×エアグルーヴ(クロス赤字) | 第3章 |
| 06-workspace-added.png | 作業枠2を追加した直後 | 第8章 |
| 07-workspace-restored.png | 作業枠1へ戻って配合が復元された状態 | 第8章 |
| 08-home-cards.png | カテゴリカードが並んだホーム | 第9章 |
| 09-home-edit.png | ホームの編集モード | 第9章 |
| 10-desktop.png | PC版の2カラム表示 | 第4章 |
| 11-memo-mode.png | 子系統・メモモード(メモ入力済み) | 第5章 |
| 12-combination-dialog.png | 配合の保存・復元ダイアログ(保存直後) | 第7章 |
| 13-heart-manual-cross.png | ハートで手動クロス指定(クロス集計に反映) | 第6章 |

## 注意

- 記事は影山優佳さんの文体を模した**ファンメイドのパロディ**という体裁にしてあります。実在の方の名義をかたって公開するとなりすましになるため、冒頭(00)・末尾(10)の断り書きは削らずに掲載してください。
- スクリーンショットはローカルサーバー(`python -m http.server 8766`)+Puppeteerで実アプリを操作して撮影したものです。UIが変わったら撮り直しが必要です。
- 機能説明は実装(`vue/components/`、`vue/logic/theory/compatibility.js`、`vue/CombinationDialog.js`、`docs/dabifaku_unified_spec_draft.md`)を読んで書いています。理論名(面白/見事/よくでき/完璧/超完璧/奇跡/至高)、配合タイトル10文字・保存15件、カテゴリ名12文字などは実装準拠です。
