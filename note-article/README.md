# note記事「統合版ダビふぁく取説」一式

- [chapters/](./chapters) — 記事本文(チャプターごとに1ファイル、00〜14の連番順に掲載)
- [images/](./images) — 記事に埋め込むスクリーンショット31枚(基本はiPhoneサイズ 390×844 @2x、10のみPCサイズ 1280×860)。表示テーマはライト

## チャプター構成

| ファイル | 内容 |
|---|---|
| chapters/00-hajimeni.md | タイトル・前書き・免責・目次 |
| chapters/01-dabifaku-toha.md | ダビふぁくの紹介と統合版・今回のアップデートの変更点 |
| chapters/02-home-category.md | ホーム画面(馬を探す／配合)・配合の作成・既存データ移行 |
| chapters/03-pedigree.md | 馬の検索・選択・バッジ・血統表の個別入れ替え・候補の血統表・馬のメモ |
| chapters/04-musume.md | ダビ娘(条件検索・絞り込み・非凡・選択の2段階・お気に入り) |
| chapters/05-header.md | ニトロ・クロス・理論のマス(押す・長押し)・危険な配合・戻る/保存/リセット(PC版画面含む) |
| chapters/06-koutei-shindan.md | 工程診断(自動診断・種牡馬側の工程を含む) |
| chapters/07-assist.md | 配合理論補助(3代先までの積み上げ・理論チップ・画像を保存) |
| chapters/08-kokeitou-memo.md | 子系統・メモモード、系統サマリー、相性 |
| chapters/09-heart-jikasei.md | ハート(手動クロス指定)と★の馬の因子設定 |
| chapters/10-save-restore.md | 配合の保存・復元・メモと☆の馬 |
| chapters/11-duplicate.md | 配合の複製(プランを並べる) |
| chapters/12-home-edit.md | ホームの編集モード・配合削除の注意 |
| chapters/13-settings.md | 設定(エディット種牡馬・ダビ娘の血統表・工程診断の自動・表示テーマ・馬名の文字の大きさ・子系統カラー) |
| chapters/14-faq-owarini.md | よくある質問・締めの挨拶 |

## noteへの掲載手順

1. `paste/index.html` をブラウザで開く(リポジトリのルートを `python scripts/lan_server.py <ポート> --bind 127.0.0.1` で配信して開くと画像も出ます)
2. 黄色い説明の下の線より後ろを全部選んでコピーし、noteの本文に貼る。先頭のタイトル1行はタイトル欄へ移す
3. ピンクの点線の枠が画像の場所。枠の文字を消して、書かれたファイルを `images/` または `paste/` からアップロードする(第8章の表3つは、noteに表が無いので `paste/table-01〜03.png` の画像で入れる)
4. 章の見出し(第◯章)が大見出し、その中が小見出しになっているか確かめる。崩れていたら付け直す
5. エディタの「＋」から目次を入れ、プレビューで冒頭と末尾の断り書きが残っているかを見てから公開する

章を直したら `python note-article/build_paste.py note-article` で `paste/index.html` を作り直す(表の画像は作り直さないので、表を変えたときは撮り直す)。

## 画像の対応表

| ファイル | 内容 | 使用章 |
|---|---|---|
| 01-home-empty.png | ホーム画面(初回・空状態) | 第2章 |
| 02-category-dialog.png | 配合の追加ダイアログ | 第2章 |
| 03-category-screen.png | 配合の画面(集計ヘッダー+空の血統表) | 第3章 |
| 04-horse-picker.png | 種牡馬の検索ダイアログ(「キタサン」で検索中) | 第3章 |
| 05-search-ability.png | 「非凡あり」でバッジ検索 | 第3章 |
| 06-pedigree-filled.png | キタサンブラック×エアグルーヴ(クロス赤字) | 第3章 |
| 07-musume-search.png | ダビ娘の単体画面(「キタサンブラック」で検索・❤つき) | 第4章 |
| 08-musume-filter.png | ダビ娘の「絞り込み」パネル | 第4章 |
| 09-musume-picker-sheet.png | 血統表のマスから開いた「ダビ娘で探す」シート | 第4章 |
| 10-desktop.png | PC版の2カラム表示 | 第5章 |
| 11-danger-combination.png | 危険な配合の警告(ドゥラメンテ×エアグルーヴ) | 第5章 |
| 12-plan-diagnosis-panel.png | 工程診断の結果パネル(自動で開いた状態) | 第6章 |
| 13-plan-diagnosis-warn.png | 危険な工程の種牡馬に付く⚠マーク | 第6章 |
| 14-assist-step1.png | 配合理論補助のSTEP 1(完璧が成立) | 第7章 |
| 15-assist-theory-chips.png | 配合理論補助の種牡馬選び(完璧3頭で絞り込み中) | 第7章 |
| 16-assist-result-dialog.png | 配合結果ダイアログ(32セル) | 第7章 |
| 17-memo-mode.png | 子系統・メモモード(メモ入力済み) | 第8章 |
| 18-heart-manual-cross.png | ハートで手動クロス指定(クロス集計に反映) | 第9章 |
| 19-combination-dialog.png | 配合の保存・復元ダイアログ(保存済み1件・メモつき) | 第10章 |
| 20-saved-horse-search.png | 保存した☆の馬が「自」「牡」バッジ・メモ付きで検索候補に出る | 第10章 |
| 21-home-duplicate.png | 編集モードで複製し、コピーが隣に並んだホーム | 第11章 |
| 22-duplicate-opened.png | コピーを開いて父をオルフェーヴルに差し替えた状態 | 第11章 |
| 23-home-cards.png | 配合のカードと「配合を追加」カードが並んだホーム | 第12章 |
| 24-home-edit.png | ホームの編集モード(複製・×・並び替え) | 第12章 |
| 25-settings-menu.png | 設定メニュー(6項目) | 第13章 |
| 26-edit-stallion-dialog.png | エディット種牡馬の登録ダイアログ(因名から因子が自動セット) | 第13章 |
| 27-sire-line-colors.png | 子系統カラーの設定画面(色を割り当てた状態) | 第13章 |
| 28-reset-confirm.png | リセットの確認(消えるもの・残るもの) | 第5章 |
| 29-picker-memo.png | 選ぶ画面の鉛筆とメモの1行目 | 第3章 |
| 30-cell-memo-bubble.png | 血統表のマスを長押しして出るメモの吹き出し | 第3章 |
| 31-picker-pedigree.png | 候補の行を長押しして開いた5代血統表 | 第3章 |

## 注意

- スクリーンショットはローカルサーバー(`python scripts/lan_server.py 8766 --bind 127.0.0.1`)+Puppeteerで実アプリを操作して撮影したものです。**表示テーマの既定がライトに戻ったため、ライトで撮り直しています。** UIが変わったら撮り直しが必要です。
- 機能説明は実装(`vue/components/`、`vue/logic/`、`vue/CombinationDialog.js`、`docs/dabifaku_unified_spec_draft.md`、`docs/dabimusume-integration-design.md`、`docs/haigou-theory-assist-design.md`)を読んで書いています。理論名(面白/見事/よくでき/完璧/超完璧/奇跡/至高)、配合タイトル10文字・保存200件・メモ100文字、配合の名前12文字・アイコン12種、エディット種牡馬100件・因名3文字、子系統58・9色・ラベル10文字などは実装準拠です。
