# note記事「統合版ダビふぁく取説」一式

- [chapters/](./chapters) — 記事本文(チャプターごとに1ファイル、00〜14の連番順に掲載)
- [images/](./images) — 記事に埋め込むスクリーンショット27枚(基本はiPhoneサイズ 390×844 @2x、10のみPCサイズ 1280×860)

## チャプター構成

| ファイル | 内容 |
|---|---|
| chapters/00-hajimeni.md | タイトル・前書き・免責・目次 |
| chapters/01-dabifaku-toha.md | ダビふぁくの紹介と統合版・今回のアップデートの変更点 |
| chapters/02-home-category.md | ホーム画面(馬を探す／配合帳)・配合帳の作成・既存データ移行 |
| chapters/03-pedigree.md | 馬の検索・選択・バッジ・血統表の個別入れ替え |
| chapters/04-musume.md | ダビ娘(条件検索・絞り込み・非凡・選択の2段階・お気に入り) |
| chapters/05-header.md | ニトロ・クロス・理論・危険な配合・ヘッダーのボタン(PC版画面含む) |
| chapters/06-koutei-shindan.md | 工程診断(段階配合の途中工程の危険チェック) |
| chapters/07-assist.md | 配合理論補助(3代先までの積み上げ・理論チップ・画像を保存) |
| chapters/08-kokeitou-memo.md | 子系統・メモモード、系統サマリー、相性 |
| chapters/09-heart-jikasei.md | ハート(手動クロス指定)と★の馬の因子設定 |
| chapters/10-save-restore.md | 配合の保存・復元と☆の馬 |
| chapters/11-workspace.md | 配合タブの追加・切替・削除 |
| chapters/12-home-edit.md | ホームの編集モード・配合帳削除の注意 |
| chapters/13-settings.md | 設定(エディット種牡馬・ダビ娘の血統表・表示テーマ・子系統カラー) |
| chapters/14-faq-owarini.md | よくある質問・締めの挨拶 |

## noteへの掲載手順

1. noteの新規記事エディタに、chapters/ の各ファイルを00から順に貼り付けて1本の記事にする(章ごとに分割連載にしてもOK)
2. `![...](../images/xx.png)` の行を、該当画像のアップロードに差し替える
3. 見出し(`#` / `##`)はnoteの「見出し」スタイルに置き換える

## 画像の対応表

| ファイル | 内容 | 使用章 |
|---|---|---|
| 01-home-empty.png | ホーム画面(初回・空状態) | 第2章 |
| 02-category-dialog.png | 配合帳の追加ダイアログ | 第2章 |
| 03-category-screen.png | 配合帳の画面(配合タブ+空の血統表) | 第3章 |
| 04-horse-picker.png | 種牡馬の検索ダイアログ(「キタサン」で検索中) | 第3章 |
| 05-search-ability.png | 「非凡あり」でバッジ検索 | 第3章 |
| 06-pedigree-filled.png | キタサンブラック×エアグルーヴ(クロス赤字) | 第3章 |
| 07-musume-search.png | ダビ娘の単体画面(「キタサンブラック」で検索・❤つき) | 第4章 |
| 08-musume-filter.png | ダビ娘の「絞り込み」パネル | 第4章 |
| 09-musume-picker-sheet.png | 血統表のマスから開いた「ダビ娘で探す」シート | 第4章 |
| 10-desktop.png | PC版の2カラム表示 | 第5章 |
| 11-danger-combination.png | 危険な配合の警告(父・母父ともキタサンブラック) | 第5章 |
| 12-plan-diagnosis-panel.png | 工程診断の結果パネル(4工程・危険2件) | 第6章 |
| 13-plan-diagnosis-warn.png | 危険な工程の種牡馬に付く⚠マーク | 第6章 |
| 14-assist-step1.png | 配合理論補助のSTEP 1(完璧が成立) | 第7章 |
| 15-assist-theory-chips.png | 配合理論補助の種牡馬選び(完璧3頭で絞り込み中) | 第7章 |
| 16-assist-result-dialog.png | 配合結果ダイアログ(32セル) | 第7章 |
| 17-memo-mode.png | 子系統・メモモード(メモ入力済み) | 第8章 |
| 18-heart-manual-cross.png | ハートで手動クロス指定(クロス集計に反映) | 第9章 |
| 19-combination-dialog.png | 配合の保存・復元ダイアログ(保存済み1件) | 第10章 |
| 20-saved-horse-search.png | 保存した☆の馬が「自」バッジ付きで検索候補に出る | 第10章 |
| 21-workspace-added.png | 配合2を追加した直後 | 第11章 |
| 22-workspace-restored.png | 配合1へ戻って血統表が復元された状態 | 第11章 |
| 23-home-cards.png | 配合帳のカードが並んだホーム | 第12章 |
| 24-home-edit.png | ホームの編集モード | 第12章 |
| 25-settings-menu.png | 設定メニュー(4項目) | 第13章 |
| 26-edit-stallion-dialog.png | エディット種牡馬の登録ダイアログ(因名から因子が自動セット) | 第13章 |
| 27-sire-line-colors.png | 子系統カラーの設定画面(色を割り当てた状態) | 第13章 |

## 注意

- 記事は影山優佳さんの文体を模した**ファンメイドのパロディ**という体裁にしてあります。実在の方の名義をかたって公開するとなりすましになるため、冒頭(00)・末尾(14)の断り書きは削らずに掲載してください。
- スクリーンショットはローカルサーバー(`python scripts/lan_server.py 8766 --bind 127.0.0.1`)+Puppeteerで実アプリを操作して撮影したものです。**表示テーマの既定がダークになったため、全27枚をダークで撮り直しています。** UIが変わったら撮り直しが必要です。
- 機能説明は実装(`vue/components/`、`vue/logic/`、`vue/CombinationDialog.js`、`docs/dabifaku_unified_spec_draft.md`、`docs/dabimusume-integration-design.md`、`docs/haigou-theory-assist-design.md`)を読んで書いています。理論名(面白/見事/よくでき/完璧/超完璧/奇跡/至高)、配合タイトル10文字・保存15件、配合帳の名前12文字・アイコン12種、エディット種牡馬100件・因名3文字、子系統58・9色・ラベル10文字などは実装準拠です。
