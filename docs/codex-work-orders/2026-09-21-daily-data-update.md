# 作業指示書: 公開データの日次更新（R2 のゲームマスター起点）と金曜完全更新の併用

- status: 完了（2026-10-10 検収済み。修正なし。main への取り込みは未実施）
- 作成日: 2026-09-21 / **改訂: 2026-10-07（v2）、2026-10-08（v2.1: 繁殖牝馬も日次で足す）**
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 対象リポジトリ: **`dabimasFactor_new`（ダビふぁく）**。画面（`index.html` / `vue/` / `css/`）は触らない
- 作業場所: **`C:\derby\dabimasFactor-daily-update`**（git worktree。枝 `feature/daily-data-update`。`origin/main` の `67d6a18`（2026-10-02 の公開）から作成済み）。
  `C:\derby\dabimasFactor_new` は別作業で汚れているので使わない
- 枝の理由: スケジュール実行は既定枝（`main`）のワークフローしか動かない。画面に触れない基盤の変更なので `release/2026-11` ではなく `main` から切る。
  マージ先も `main`。**マージ・push は Codex がしない**
- 元にした仕様書: 依頼者の手元にある「ダビマスデータ 日次・金曜併用更新 修正仕様書」。Codex は読めなくてよい。**この指示書が優先する。**

## v2 の変更点（v1 を読んだ人向け。Codex は読み飛ばしてよい）

v1 は「日次も全書を見る（行キャッシュで再取得を省く）」設計だった。2026-10-07 に R2 へ `stallion_master.game.json`（開始日時 `display_start_at` を持つ）が上がり、
依頼者が「**日次は 11:30 JST 開始。`time_policy` に沿って R2 から抽出する**」と決めたので、次のように変えた。

- 日次は**全書へ一切アクセスしない**。公開中の `json/` を土台に、R2 のマスターから「その時刻までに開始した新しい種牡馬」を足し、血統を洗い替える。
- v1 の行キャッシュ（`actions/cache`、`--rows-cache`、`--refresh-rows`）は**不要になったので作らない**。
- 新馬の `id` は全書 URL から作れない（全書の URL 番号は不規則な数字で、ゲームの ID と対応しない）。新しい名前空間を作り、金曜に全書が追いついても **id を変えない**仕組みを入れる。

**v2.1（2026-10-08）**: 依頼者が、開始日時（`display_start_at`）を持つ新しい `broodmare_master.game.json`（schema v6、2026-10-06 の dump）を持ってきた。
v2 では「牝馬は開始日時が無いので日次では足せない」としていたが、**牝馬も種牡馬と同じ方式で日次に足せる**ことを実データで確かめたので、v2 のその部分を改めた
（牝馬の新しい名前空間 `bg{game_broodmare_id}`、牝馬用の行の構築、`--broodmare-master-file`）。モジュール名も `stallion_master_source.py` から **`game_master_source.py`** に改めた。

## 背景と目的

ダビふぁくの公開データ（`json/`）は、GitHub Actions の `.github/workflows/x_post.yml` が **毎週金曜**に作り直して `main` へ push し、X へ投稿している。いまの流れ:

1. 金曜 04:07 UTC（13:07 JST）に起動し、18:30 JST まで待つ（GitHub の定時実行が遅れる対策。`docs/x-post-schedule-fix-plan.md`）
2. `scripts/fetch_latest_news.py` が全書（`https://dabimas.jp/kouryaku/`）の新着情報の先頭 1 行を取り、前回の `.github/state/latest_news_snapshot.txt` と違えば「更新あり」
3. 更新ありのとき、`scripts/build_dabimas_stream.py` が全書の一覧 2 ページから詳細ページ URL を集め、**全頁を取得**して `json/` 一式を作る。血統 ID は Cloudflare R2 の血統マスター（`pedigree_master.json` / `pedigree_master.game.json`）から付ける
4. `service-worker.js` の `CACHE_NAME` を上げ、commit・push し、新着情報から作った画像つきで X へ投稿する
5. 更新なしのときは「おやすみ」を X へ投稿する

これを次のように変える。

- **毎日 11:30 JST に「日次更新」、毎週金曜 18:30 JST に「金曜完全更新」を走らせる。**
- **日次**: 全書を見ない。R2 のマスターで、`display_start_at <= 11:30 JST` の新しい種牡馬・繁殖牝馬を足し、全馬の血統を洗い替える。
- **金曜**: 従来どおり全書を全件取得する（全書側だけで直された内容・日次の取りこぼしを拾う保険）。日次で足した馬は消さない。
- どちらも、**生成した公開データが現行の公開版と違うときだけ** commit・push・X 投稿する（「おやすみ」投稿は廃止）。
- 処理が失敗したら、公開データは動かさず、X へエラーを通知する（連投はしない）。

### 目的の具体例（依頼者の言葉）

2026-10-13 の日次（11:30 JST 時点）では、`ダノンレジェンド-央瓏-`（開始 10/13 **00:00** JST）は対象になり、`アドミラルドレイク-瞬闘-`（開始 10/13 **12:00** JST）は対象にならない。
アドミラルドレイクは、10/13 が火曜で金曜更新（18:30）が無いので、翌 10/14 11:30 の日次で出る。

### 現行の出力（変えない）

`build_dabimas_stream.py` の出力は次の 4 種。**形式・項目・キーの並び順・馬の並び順・既存馬の `id` は一切変えない**（フロントと保存済みデータが依存している）。

| ファイル | 内容 |
|---|---|
| `json/dabimasFactor.json` | 全馬。`descendants`（男系 15 枠）を含む。**`mares` は含まない** |
| `json/dabimasFactor.summary.json` | 軽量版。`detailChunk` を持つ |
| `json/dabimasFactor-details/dabimasFactor.details.NNN.json` | 128 頭ごとの `descendants` と `mares`（牝馬 15 枠） |
| `json/pedigreeNodes.json` | 血統辞書。`datasetVersion` を持つ |

現在（`67d6a18`）2,957 頭（種牡馬 2,457 / 繁殖牝馬 500）、detail は 24 ファイル、`pedigreeNodes.json` の `datasetVersion` は `2026-10-02T062857Z+raw.a40f6d8f0952`。

## 検証済みの事実（実装の前提。再検証しなくてよいが、受け入れ基準で再現する）

依頼者が 2026-10-07 に採取した R2 のマスター 5 ファイル（`dataset_version` = `2026-10-07T123420Z+raw.0ecfb7053e97`）が
**`tmp/masters-20261007/`**（worktree 内。`.gitignore` 済み。**コミットしない**）に置いてある。元は `C:\derby\data\pedigree_r2_pipeline\runs\20261007T121737Z\output\`。
同じディレクトリに、**別の dump（2026-10-06）の v6 牝馬マスター** `broodmare_master.v6-20261006.game.json` もある（上の 5 ファイルの `broodmare_master.game.json` は v5 で、開始日時を持たない）。

| 事実 | 実測 |
|---|---|
| 5 ファイルの版 | `pedigree_master.json` / `pedigree_master.game.json` / `stallion_master.game.json`(schema v7) / `broodmare_master.game.json`(**v5**) / `ability_master.game.json`(v3) が、**`dataset_version` と `source.sha256` ともに同一**。**R2 にいま載っている牝馬マスターは v5 で、開始日時を持たない**（下の v6 は依頼者の手元の別の dump で、まだ R2 に無い） |
| R2 のキー | バケット `dabimas-data` の**直下**。pedigree 2 ファイルは既存の `validate_bundle`（V01〜V11）を通る |
| 配置の順 | ability → broodmare → stallion → pedigree.game → pedigree の順に PUT する。**pedigree が最後**なので、PUT の合間に読むと 5 ファイルの版が食い違う |
| `time_policy` | `stallion_master.game.json` の先頭に `{"display_start_at_raw":"Unix seconds","display_start_at":"UTC ISO 8601","eligible_when":"display_start_at <= current time"}` |
| 開始日時の分布 | 2,532 頭中、`display_start_at_raw` が **0（制限なし）734**、設定あり 1,798。0 の 734 頭は**全員が公開中の json に居る**（ディープインパクト等）。ゆえに **0 / null は「開始日の制限なし = 常に対象」**。仕様書の「0 は公開しない」は誤り |
| 番兵 | `2030-01-01 00:00 JST`（raw `1893423600`）が 5 頭。比較で自然に未来扱いになるので特別扱いは要らない |
| 時刻 | 開始は 00:00 JST が 1,303 件、**12:00 JST が 399 件**、他は少数。`display_start_at` は `display_start_at_raw` の UTC ISO で、全件一致 |
| 公開済みとの一致 | 開始済み（0 を含む）の 2,521 頭のうち、**公開中の json に node が無いのは 4 頭だけ**。10/07 開始の 3 頭（`シーフュリュー-央燕-` / `キタサンブラック-央漸-` / `ナオキ-煌魂-`）と、`ホワイクインテット`（id 300011、開始は 2019 年だが公開中の json に居ない。除外リストで扱う）。未来開始の 6 頭は公開中に 1 頭も居ない。公開中の種牡馬でマスターに無いものは 0 |
| 牝馬（v6） | 依頼者が 2026-10-08 に持ってきた `broodmare_master.game.json`（**schema v6**、`dataset_version` = `2026-10-06T121526Z+raw.f170ac29a6e9`、507 頭）が **`tmp/masters-20261007/broodmare_master.v6-20261006.game.json`** にある。v5 と同じ 507 頭・同じ `node_id`（507 / 507）で、各レコードに **`display_start_at`（UTC の ISO 文字列。例 `2029-12-31T15:00:00Z`）** が加わる。**設定の無い馬ではキーそのものが無い**（0 や null ではない）。先頭の `display_start_at_field_map` は `status: "verified"`（取得元 `BroodmareModelAccessor::canDisplay` / `CollectionMasterBroodmare +0xa0`）、`dated_count: 135`、`unset_count: 372`。種牡馬のような `time_policy` ブロックは無い |
| 牝馬の開始日時の分布 | 507 頭中、**未設定 372**、設定あり 135（うち番兵 7）。公開中の牝馬 500 頭は**全員**「未設定 372 + 開始済み 128」に収まる。**公開中に無い 7 頭は全員、番兵 `2029-12-31T15:00:00Z`（= 2030-01-01 00:00 JST）**（`game:` node の ワンダーメルシャン / コンモベドール / ユイレポート / ローブチェイサー / セットクラクション / カインスレード / リズウェンディ）。未来開始（番兵以外）の牝馬は、いまは 1 頭も居ない。ゆえに **未設定 = 制限なし**（種牡馬の 0 と同じ）で、この方針は公開中の 500 頭を過不足なく再現する。直近の開始は `フレッシュメープル`（2026-09-19 00:00 JST、公開済み）。時刻は 00:00 JST と 12:00 JST が大半 |
| 牝馬の重複 | マスターの `node_id` の重複は 0（公開側も 0）。牝馬は node の一致で「公開済み」を判断してよい |
| node の重複 | マスターの種牡馬 2,532 件のうち 67 件は、同じ `node_id` を持つ別のゲーム ID（例: ディープインパクト 1 と 330）。全書は重複を畳むので、**node の一致だけで「公開済み」と判断する** |

### マスターから種牡馬の行を作る規則（公開中の種牡馬 2,377 頭〔マスターと 1 対 1 で対応するもの〕で全項目の一致を確認済み）

`s` = `stallion_master` の 1 件、`node` = `pedigree_master.game.json` の `s.node_id`、`ped` = `pedigree_master.json` の `s.pedigree_id`。

| 項目 | 規則 | 一致 |
|---|---|---|
| `name` / `subName` | `s.name`（例 `アドミラルドレイク-瞬闘-`）を、`all_row_to_dabifac_entry` と**同じ正規表現 `SUB_NAME_RE`** で分ける（`subName` = 最初の一致、`name` = それを除いて `-` も除く） | 2,377 / 2,377 |
| `ruby` | `to_hiragana_ruby(name)` | 2,377 / 2,377 |
| `sex` / `rare` | `"0"` / `s.rarity` | 2,377 / 2,377 |
| `nature` | `s.sub_ability_id` が `"0"` なら `""`、それ以外は `ability_master` の `game_ability_id == sub_ability_id` の `name` | 2,377 / 2,377 |
| `abilityType` | `s.nonordinary_ability_id` が `"0"` なら `"none"`。それ以外は `ability_master` の該当レコードの **`effect_group_id_raw`**: `99`→`"normal"`、`98`→`"focused"`、`97`→`"double"`。それ以外の値は**エラー** | 2,377 / 2,377（非凡あり 1,338 頭で完全に決まる。`ability_type_raw` は使えない） |
| `categoryIcon` | `s.header_badge.asset_key`（例 `list_icn_cat_05.png`）に既存の `CATEGORY_ICON_RE` をかけた結果（`05` / `collabo_1017` など）。`asset_key` が無ければ `null` にして警告 | 2,377 / 2,377 |
| `parentLine` / `parentLineId` / `son` / `sonId` | `PedigreeMasterSource.sire_line(pedigree_id)` の `name` を `SIRE_LINE_DICT`（`scripts/data/sire_lines.csv`）で引く | 2,957 / 2,957（牝馬含む） |
| `factors` | `node.pedigree_effect_ids` を `FACTOR_SHORT_DICT` で文字にし、**並びを逆順にして**、右詰めで 3 枠にする（1 件なら `["","","X"]`、2 件なら `["","A","B"]`）。**`node.variant_type == "year"` で `pedigree_effect_ids` が空なら、同じ pedigree の `-00` node の値を使う**。4 件以上はエラー | 2,377 / 2,377 |
| `nodeId` / `pedigreeId` | `s.node_id` / `s.pedigree_id` | |
| `mares` | `PedigreeMasterSource.mare_slots(pedigree_id)`（既存） | |
| `descendants[15]` の `nodeId` / `pedigreeId` | `PedigreeMasterSource.sire_slots(pedigree_id)`（既存）の代表 node と、その `pedigree_id` | 44,352 / 44,355（残り 3 枠は公開側が null、マスターは解決済み） |
| 〃 `parentLine` / `parentLineId` / `son` / `sonId` | 祖先の `pedigree_id` を `sire_line()` → `SIRE_LINE_DICT` | 44,352 / 44,355（同上） |
| 〃 `factors` | 祖先の代表 node に、上の `factors` の規則を適用 | 44,355 / 44,355 |
| 〃 `name` | 下の「祖先の表示名」 | ゲーム表示名・`canonical_name` の 2 段だけで 44,304 / 44,355。残り 51 枠のうち 12 枠は 2 段目の「前回公開の名前」で解消し、**39 枠はゲームのほうが新しい**（後述） |

**祖先の表示名**（`descendants[].name`）の優先順位:

1. その祖先の**ゲーム上の表示名**: 代表 node（無ければ同じ pedigree の `-00` node、無ければ同じ pedigree の任意の種牡馬）に対応する `stallion_master` の `name` を `SUB_NAME_RE` で分けた `name` 部分。複数あれば最頻値
2. 無ければ、**前回公開した json の祖先名**（前回の全馬の `descendants` を `pedigreeId` で引いた最頻値）
3. それも無ければ `canonical_name`

理由: マスターの `canonical_name` は英語表記（`Great Nephew`）や綴り違い（`le lavanstell`）のことがあり、そのまま使うと全書の `Le Levanstell` から劣化する。ゲーム上の表示名はカタカナで、全書より新しいことがある
（全書は `Admiral Drake`、ゲームは `アドミラルドレイク` など約 40 枠）。この差は**意図した更新**として公開側へ反映する。

### マスターから牝馬の行を作る規則（公開中の牝馬 500 頭〔マスターと 1 対 1〕で確認済み）

`b` = `broodmare_master`（v6）の 1 件。公開中の牝馬は、`rare` / `abilityType` が `null`、`nature` / `subName` が `""`、`factors` が `["","",""]` で固定。

| 項目 | 規則 | 一致 |
|---|---|---|
| `id` | **`"bg" + game_broodmare_id`** | |
| `name` | **`b.name` をそのまま使う**（種牡馬のように `SUB_NAME_RE` で分けない。`-` も除かない）。`subName` は常に `""` | 499 / 500 |
| `ruby` | `to_hiragana_ruby(name)` | 499 / 500 |
| `sex` / `rare` / `abilityType` / `nature` / `factors` | `"1"` / `null` / `null` / `""` / `["","",""]` | 500 / 500 |
| `categoryIcon` | `b.broodmare_grade.code` から: **`U`→`sale_08`、`V`→`sale_07`、`W`→`sale_06`、`X`→`sale_05`、`Y`→`sale_09`**。それ以外のコード、または `broodmare_grade.mapping_status != "verified"` は**エラー**（推測しない） | 500 / 500 |
| `parentLine` / `parentLineId` / `son` / `sonId` | 種牡馬と同じ（`sire_line(pedigree_id)` → `SIRE_LINE_DICT`） | 500 / 500 |
| `nodeId` / `pedigreeId` / `mares` / `descendants[15]` | 種牡馬と同じ（`rebuild_pedigree_fields` と同じ規則） | |

不一致の 1 頭は `ヨ－クダリア`（公開側は全角のダッシュ `－`、ゲームは ASCII の `-`）。**既存の行は日次では根の項目を変えない**ので影響しない。
新しい牝馬の名前は、ゲームの表示のまま使う。（種牡馬の分け方を牝馬に使うと、名前の `-` が消える。**使わないこと。**）

等級のラベル（参考）: `U` 無印 54 / `V` 可 133 / `W` 良 45 / `X` 優 47 / `Y` 名牝 228（v6 の 507 頭）。

## 仕様書からの変更点（設計判断とその根拠）

**Codex は判断を変えない。** 疑問があれば実装せず完了報告の「残課題・気づき」に書く。

| # | 仕様書 | この指示書 | 理由 |
|---|---|---|---|
| 1 | 日次の公開可否はゲームの `display_start_at` で決める | 同じ。ただし **0 / null は常に対象** | 上の実測（0 の 734 頭が全員公開済み）。仕様書の「0 は公開しない」だと既存馬が全部対象外になる |
| 2 | 日次の公開条件に「全書に掲載済み」も加える | **日次は全書を見ない**（依頼者の決定） | 全書に載る前の新馬も、ゲームで開始したら出す。代わりに全書に無い馬を拾いうる（`ホワイクインテット`）ので除外リストを設ける（下記） |
| 3 | 公開集合は「前回 ∪ 今回承認 ∪ 金曜確認」 | 日次は**前回公開 ∪ 新規**（削除しない）。金曜は**全書 ∪ 日次で足した馬のうち、マスターでまだ開始済みのもの** | 日次で足した馬を、全書がまだ載せていない金曜に消さない。全書に載ったら全書の行になる |
| 4 | `stallion_master.game.json` で、レア度・能力・適性等も取る | 公開 json に出る項目（上の表）だけ使う | 公開 json に距離・成長・脚質などは出ない |
| 5 | 新馬の `id` は現行の URL 由来を維持 | 新馬は **`sg{game_stallion_id}`**。**一度公開した id は変えない**。金曜に全書の行と対応したら `sg…` を引き継ぐ | 全書の URL 番号はゲームの ID と対応しない。id が変わると保存済み配合・作業枠・自家製馬の参照が切れる |
| 6 | 変更検知に `dabimas_update_state.json`（`last_success_at` 入り） | **状態ファイルは作らない**。生成物と現行 `json/` を直接比べる | 毎回書くと毎日差分が出て「変更なしなら commit しない」と矛盾する |
| 7 | 実行日時などを除いた SHA-256 で比較 | 4 つの成果物を JSON として読んで比べる。**`pedigreeNodes.json` の `datasetVersion` は比較から除く** | 採取パイプラインは手動で頻繁に回り、`datasetVersion` が変わるたびに「更新しました」と X に出てしまう。フロントは保持するだけで判定に使わない |
| 8 | エラー通知の連投抑止に状態を保持 | **直前に完了した run の結論が `failure` でなければ通知する**（`gh run list`） | 状態の置き場が要らず、回復後は自然に再通知できる |
| 9 | 日次 `0 3 * * *`（12:00 JST）、金曜 `30 9 * * 5` | **日次 11:30 JST、金曜 18:30 JST。どちらも前倒し起動 + 待機**。日次 `47 0 * * *`（09:47 JST 起動）、金曜 `7 4 * * 5`（現行のまま） | GitHub の定時実行は数時間遅れる。待機で目標時刻に揃える（`docs/x-post-schedule-fix-plan.md`）。キリの良い分は混む |
| 10 | 公開可否の基準は実行時の現在時刻 | **予定の時刻に固定した `as_of`**（日次 = 当日 11:30 JST、金曜 = 当日 18:30 JST） | 起動が遅れても結果が変わらない。遅れて 12:05 に走ったときに `アドミラルドレイク` が混ざる、をなくす |
| 11 | 一時ファイルへ出力して検証後に置換 | 同じ。置き場は runner 上の `build_out/`（commit しない） | 現行は `json/` へ直接書くので、検証を挟めるよう分ける |
| 12 | 更新の有無だけを見る | 同日 2 回公開しても `CACHE_NAME` が変わる（`-01` → `-02`） | 金曜は日次（11:30）と完全更新（18:30）の両方が同じ日に公開しうる。現行は常に `-01` |
| 13 | 記載なし | R2 の版が食い違ったら、数回再取得してからエラーにする | 配置が 5 ファイルの順次 PUT なので、配置の合間に読むと食い違う。本物のエラーと区別する |
| 14 | 記載なし | 手動実行に `dry_run` と `as_of` を足す。未来の `as_of` は `dry_run` のときだけ許す | 受入テストと「10/13 の日次」の予行に必要。現行の手動実行は本当に投稿する |
| 15 | 記載なし | 全書の一覧が 0 件・急減のとき（金曜）は失敗させる | 現行は、一覧のマークアップが変わるなどで URL が 0 件になっても終了コード 0 で、空の JSON を push する |
| 16 | 牝馬の公開開始判定に使えるゲーム内項目が未確定（仕様書 §13-3）。v2 は「牝馬は日次で足せない」 | **牝馬も日次で足す。** 条件は種牡馬と同じ（未設定 = 制限なし、設定あり = `<= as_of`）。新しい牝馬は `bg{game_broodmare_id}`。**牝馬マスターが schema v6 未満（開始日時を持たない）のときは足さず、警告だけ出して続行する** | v6 の実測で、公開中の 500 頭を過不足なく再現する（上の表）。R2 のいまの牝馬マスターは v5 なので、採取パイプラインが v6 を R2 へ載せるまでは牝馬は金曜の全書だけが頼りになる。v5 で「全部制限なし」と扱うと、未開始の牝馬 7 頭が混ざるので、足さないのが安全 |
| 17 | 記載なし | v6 の牝馬マスターは **`display_start_at_field_map` の整合**（`status == "verified"`、`dated_count` = キーを持つレコード数、`unset_count` = 持たないレコード数）を確かめ、崩れていたらエラー | 抽出に失敗して全馬が「未設定」になると、未開始の牝馬が全員公開されてしまう。件数の食い違いで検出する |

## 実装方針

### 全体の流れ

```
起動（日次 or 金曜 or 手動）
 → モード・as_of・待機目標を決める → 目標時刻まで待機（schedule のみ）
 → checkout・依存導入
 → build_dabimas_stream.py で build_out/ へ生成（--mode daily|weekly）
      daily : 前回の json/ を読む → R2 のマスターで全馬の血統を洗い替え
              → マスターから「as_of までに開始した新しい種牡馬・繁殖牝馬」を足す
              （全書へアクセスしない）
      weekly: 全書を全件取得 → R2 のマスターで血統を洗い替え
              → 日次で足した馬（sg… / bg…）のうち、全書が追いついたものは id を引き継ぎ、
                まだ追いついていないものはマスターから作り直して残す
 → verify_dabimas_outputs.py で整合性検証（失敗したら停止）
 → diff_dabimas_outputs.py で現行 json/ と比較 → content_changed
 → changed のとき: 更新画像を作る
      dry_run でなければ: build_out/ を json/ へ反映 → CACHE_NAME を上げる → commit・push → X へ投稿
 → 失敗したとき: 通知の要否を判定して X へエラー投稿
```

### 変更対象ファイル

- `scripts/pedigree_master_fetch.py` — 種牡馬・牝馬・能力マスターの取得、5 ファイルの版そろえ、食い違いの再取得
- `scripts/pedigree_master_source.py` — `PedigreeMasterSource` に公開の取得口（node・pedigree の参照）を足す。**private 属性を外から触らない**
- `scripts/game_master_source.py` — **新規**。開始日時の判定、新馬（種牡馬・牝馬）の選定、マスターからの行の構築、血統の洗い替え
- `scripts/build_dabimas_stream.py` — `--mode daily|weekly` と周辺の引数。**既存の全書の取得・解析のコードは変えない**
- `scripts/data/game_exclusions.json` — **新規**。日次・金曜の持ち越しで足さない馬のゲーム ID（種牡馬・牝馬）
- `scripts/verify_dabimas_outputs.py` / `scripts/diff_dabimas_outputs.py` / `scripts/bump_cache_name.py` — **新規**
- `.github/workflows/x_post.yml` — 書き換え
- `tests/test_pedigree_master_fetch.py` / `tests/test_build_dabimas_stream.py` — 追記
- `tests/test_game_master_source.py` / `tests/test_verify_dabimas_outputs.py` / `tests/test_diff_dabimas_outputs.py` / `tests/test_bump_cache_name.py` / `tests/test_workflow_x_post.py` — **新規**
- `tests/fixtures/daily-update/` — **新規**。手で作った小さなマスター（下記）
- `docs/data-update-operations.md` — **新規**。運用の 1 枚もの

**`.gitignore` に `tests` の行があり、`tests/` 配下の新規ファイルは無視される。** 新規のテストとフィクスチャは `git add -f` で加えること（既存の 14 ファイルはそうして追跡されている）。

**進め方**: 段階 1 → 5 の順に、段階ごとに `python -m pytest tests -q` を通して日本語メッセージで commit する（push はしない）。

---

### 段階 1: マスターの取得層（`pedigree_master_fetch.py`）

- `PedigreeMasterError` を継承した `PedigreeMasterVersionMismatch` を足し、`validate_bundle` の **V03（dataset_version 不一致）と V04（source.sha256 不一致）だけ**をこれで送出する。メッセージの文面は変えない（既存テストが見ている）。
- 新規 `@dataclass(frozen=True) GameMasterBundle`: `pedigree: PedigreeMasterBundle`、`stallion: dict`、`ability: dict`、`broodmare: dict | None`。
- 新規 `load_game_masters(*, endpoint=None, bucket=None, master_key=..., game_nodes_key=..., stallion_key="stallion_master.game.json", ability_key="ability_master.game.json", broodmare_key="broodmare_master.game.json", cache_dir=".cache/pedigree", expected_dataset_version=None, client=None, mismatch_retries=0, mismatch_retry_wait=60.0, sleep=time.sleep) -> GameMasterBundle`。
  既存の `_fetch_object` で **5 ファイル**を取り、`validate_game_masters` を通す。
  **`PedigreeMasterVersionMismatch`（5 ファイルの版・sha の食い違い）のときだけ**、`mismatch_retry_wait` 秒待って 5 ファイルを取り直し、`mismatch_retries` 回まで繰り返す。超えたら例外。V05（期待版との不一致）・その他の検証エラー・通信エラーは再試行しない。再試行のたびに標準エラーへ `[warn]` を出す。
  既存の `load_pedigree_master` は**変えない**（既存テストと既存の呼び出しのため）。
- 新規 `validate_game_masters(pedigree_master, pedigree_game, stallion, ability, broodmare=None, expected_dataset_version=None, allow_mixed_versions=False)`:
  - 既存の `validate_bundle`（pedigree 2 ファイル）を呼ぶ。
  - 渡された全ファイル（4 つ、`broodmare` があれば 5 つ）の `dataset_version` と `source.sha256` が**すべて同一**（違えば `PedigreeMasterVersionMismatch`。メッセージに全部の値を入れる）。2026-10-07 の実データでは 5 ファイルとも `source` が辞書で `sha256` を持つ（`tmp/masters-20261007/` で確かめること）。`source` が辞書でない・`sha256` が無いファイルは**エラー**にする（版の取り違えを黙って通さない）。
    **`allow_mixed_versions=True` のときだけ、この版の一致を検査しない**（ローカルのファイルで、別の dump の v6 牝馬マスターを試すためだけの逃げ道。R2 から読む経路では**決して `True` にしない**）。
  - `stallion.schema == "dabimas-stallion-game-master"` かつ **`schema_version >= 7`**、`ability.schema == "dabimas-ability-game-master"` かつ `schema_version >= 3`（**`==` にしない**。採取側が版を上げるたびに失敗して X へエラー投稿が出るのを避ける。必要な項目が無ければ、その項目名を挙げてエラーにする）。
  - `stallion.time_policy` が、`display_start_at_raw == "Unix seconds"` かつ `eligible_when == "display_start_at <= current time"` であること（**方針が変わったら公開しない**ための番人）。
  - `stallion_count == len(stallions)`、`game_stallion_id` に重複が無い、全 `node_id` が `pedigree_game.nodes` に存在する、`display_start_at_raw` が整数（0 を含む）。
  - **牝馬マスター**（`broodmare` があるとき）: `schema == "dabimas-broodmare-game-master"` かつ `schema_version >= 5`、`broodmare_count == len(broodmares)`、`game_broodmare_id` に重複が無い。
    **`schema_version >= 6` のときだけ**さらに次を検査する（v5 は開始日時を持たないので、これらを要求せず「牝馬を日次で足さない」扱いになる。`GameMasterBundle` から `broodmare_start_dates_available: bool` で分かるようにする）:
    全 `node_id` が `pedigree_game.nodes` に存在する、`display_start_at_field_map.status == "verified"`、`dated_count` が「`display_start_at` キーを持つレコード数」と、`unset_count` が「持たないレコード数」と一致する、`display_start_at` が `Z` または `+hh:mm` つきの ISO 8601 として読める。
  - 違反は既存の `_raise_violations` の書き方（件数 + 先頭 5 件）に合わせる。
- CI の runner は毎回まっさらで `.cache/pedigree` が無いので、**R2 の取得に失敗したときはキャッシュへ逃げずに例外になる**（現行のまま）。コードは変えず、ワークフローのコメントにその旨を書く。

### 段階 2: ゲームマスター層（新規 `scripts/game_master_source.py`）

`PedigreeMasterSource` に、次の公開メソッドを足してよい（private 属性を外から触らないため）: `node(node_id) -> dict | None`、`pedigree(pedigree_id) -> dict | None`、`nodes_of(pedigree_id) -> list[dict]`、`base_node(pedigree_id) -> dict | None`（`{pedigree_id}-00`）。

`game_master_source.py` が提供するもの:

```python
JST = timezone(timedelta(hours=9))     # zoneinfo は使わない（Windows に tzdata が無くても動くように）
STALLION_ID_PREFIX = "sg"
BROODMARE_ID_PREFIX = "bg"
GRADE_CATEGORY_ICON = {"U": "sale_08", "V": "sale_07", "W": "sale_06", "X": "sale_05", "Y": "sale_09"}

def parse_as_of(text: str) -> int:
    """タイムゾーン付き ISO 8601 を epoch 秒にする。タイムゾーンが無ければ ValueError。"""

def parse_iso_epoch(text: str) -> int:
    """牝馬マスターの display_start_at（`Z` または `+hh:mm` つき）を epoch 秒にする。Python 3.11 の fromisoformat で読める形に直してから読む。"""

def is_eligible(start: int | None, as_of: int) -> bool:
    """None / 0 は True（制限なし）。それ以外は start <= as_of。等しいときは True。"""

def load_exclusions(path: Path) -> tuple[set[str], set[str]]:   # (game_stallion_ids, game_broodmare_ids)

class StallionMasterSource:
    def __init__(self, stallion_master: dict, ability_master: dict, pedigree_source: PedigreeMasterSource): ...

    def select_new(self, as_of: int, known_node_ids: set[str], exclusions: set[str]) -> Selection: ...
    def build_entry(self, record: dict, name_hints: dict[str, str]) -> dict: ...
    def rebuild_pedigree_fields(self, entry: dict, name_hints: dict[str, str]) -> None: ...
    def find_record(self, game_stallion_id: str) -> dict | None: ...

class BroodmareMasterSource:
    """牝馬。インターフェースは StallionMasterSource と同じ。rebuild_pedigree_fields は共通の実装を使う（重複して書かない）。"""
    def __init__(self, broodmare_master: dict, pedigree_source: PedigreeMasterSource): ...
    def start_dates_available(self) -> bool: ...           # schema_version >= 6 かつ display_start_at_field_map がある
    def select_new(self, as_of: int, known_node_ids: set[str], exclusions: set[str]) -> Selection: ...
    def build_entry(self, record: dict, name_hints: dict[str, str]) -> dict: ...
    def find_record(self, game_broodmare_id: str) -> dict | None: ...
```

**`select_new`**（返り値 `Selection`: `selected` / `skipped_future` / `skipped_duplicate_node` / `excluded` / `skipped_inactive`、各 `(game_id, name, display_start_at)` のリスト）:

1. `active` が偽なら対象外（`skipped_inactive`）。
2. `is_eligible(開始日時, as_of)` が偽なら `skipped_future`。開始日時は、種牡馬は `display_start_at_raw`（整数。0 は制限なし）、牝馬は `display_start_at`（ISO 文字列を `parse_iso_epoch` で。**キーが無ければ制限なし**）。
3. ゲーム ID が `exclusions` にあれば `excluded`。
4. `node_id` が `known_node_ids`（前回公開の全馬の `nodeId`）にあれば**「公開済み」として何もしない**（同じ node の別ゲーム ID も同様）。
5. 残りのうち同じ `node_id` が複数あれば、種牡馬は `(rarity, nonordinary_ability_id, sub_ability_id)` ごとに、牝馬は 1 つにつき、**ゲーム ID が最小の 1 件**だけ残し、他は `skipped_duplicate_node`。
6. `selected` は `(開始日時の epoch（制限なしは 0）, int(ゲーム ID))` の昇順。

牝馬の `select_new` は、`start_dates_available()` が偽なら**呼ばれない**（呼び出し側で `[warn]` を出してスキップする。段階 3）。

**`build_entry`**: 上の「マスターから種牡馬の行を作る規則」「マスターから牝馬の行を作る規則」の表どおりに 1 頭分の dict を作る。**キーの並びは `all_row_to_dabifac_entry` の出力と同じ**
（`id, name, ruby, subName, nature, sex, rare, abilityType, categoryIcon, parentLine, parentLineId, son, sonId, factors, descendants`、続けて `nodeId, pedigreeId, mares`）。
`descendants` の各要素のキー順は `name, parentLine, parentLineId, son, sonId, factors, nodeId, pedigreeId`。`id` は種牡馬が `"sg" + game_stallion_id`、牝馬が `"bg" + game_broodmare_id`。
`SIRE_LINE_DICT` に無い系統名は既存の `resolve_sire_line` を使い（警告・集計がそのまま働く）、`parentLine` 等は `null` / 空にする。祖先の枠が `None`（マスターに祖先が居ない）なら、
新馬では `{"name":"","parentLine":"","parentLineId":null,"son":"","sonId":null,"factors":["","",""],"nodeId":null,"pedigreeId":null}` とする。

**`gameId` を全部の行に持たせる（2026-10-09 追加）**: `build_entry` で作る新馬も、`rebuild_pedigree_fields` で洗い替える既存の行も、
`nodeId` の直前に `gameId`（文字列。種牡馬は `game_stallion_id`、牝馬は `game_broodmare_id`）を入れる。
マスターの行と結び付かない馬（全書にしか居ない等）は `gameId` を `null` にする。

この項目はダビ娘との突き合わせに使う。ダビ娘は R2 を正本にしたため、同じ馬でも両者の `id` がずれることがある
（ダビ娘は `r…` / `rb…`、ダビふぁくは全書由来の番号や `sg…`）。ゲーム本体の番号なら採取や全書の更新のタイミングに
左右されないので、これを第一の鍵にする。受け口はダビふぁく側に実装済み（`vue/logic/musume-link.js` の `gameKey` /
`resolveId`、`vue/components/musume/musume-host.js`）。**`gameId` が入った時点で自動的に効くので、受け口側の変更は要らない。**

**`rebuild_pedigree_fields`**（既存の行の血統を洗い替える。日次では全馬、金曜では全書の行にも使う）: `entry["nodeId"]` が現行マスターの node として存在すればそのまま使い、無ければ既存の `source.resolve(name, subName, 祖先名)` で引き直す
（既存の `attach_pedigree_ids` と同じ集計・警告）。解決できなければ従来どおり `nodeId` / `pedigreeId` / `mares` を `null` にして `unresolved_node` を数える。
解決できたら `nodeId` / `pedigreeId` / `mares` と、`descendants` の 15 枠（`nodeId` / `pedigreeId` / `name` / `parentLine` / `parentLineId` / `son` / `sonId` / `factors`）を表の規則で**上書き**する。
祖先の枠が `None` のときは、その枠の既存の値（全書由来の名前など）を保ち、`nodeId` / `pedigreeId` だけ `null` にする（現行の挙動）。
**行の根の項目（`name` / `nature` / `rare` / `abilityType` / `categoryIcon` / `factors` / `parentLine`…）は触らない。**

`name_hints` は「祖先の表示名」の 2 番目の規則用（`{pedigree_id: 前回公開の祖先名}`）。`build_name_hints(entries)` を用意する。

### 段階 3: ビルド本体（`build_dabimas_stream.py`）

追加する引数（既存の引数は変えない）:

```
--mode {weekly,daily}              既定 weekly（従来の動作）
--as-of ISO8601                    タイムゾーン付き。既定は現在時刻。タイムゾーンが無い値は [error] で終了コード 1
--previous-json-dir DIR            現行の公開 json/（dabimasFactor.json を読む）。daily では必須
--stallion-master-key / --ability-master-key / --broodmare-master-key
                                   既定 stallion_master.game.json / ability_master.game.json / broodmare_master.game.json
--stallion-master-file / --ability-master-file      R2 を使わないとき。--pedigree-master-file / --pedigree-game-nodes-file と 4 つ揃えて指定
--broodmare-master-file            任意（上の 4 つに加えて指定すると牝馬も扱う。指定しなければ牝馬は足さない）
--allow-mixed-master-versions      ローカルのファイルを指定したときだけ有効。5 ファイルの版の一致を検査しない。R2 と一緒に指定したら [error]
--exclusions-file                  既定 scripts/data/game_exclusions.json
--pedigree-mismatch-retries N      既定 0
--pedigree-mismatch-wait SEC       既定 60
--audit-output PATH                監査用 JSON（下記）
```

**後方互換**: 種牡馬・能力マスターを指定しない実行（`--r2-endpoint` なし、またはローカル 2 ファイルだけ）は**これまでと出力もログも同じ**。新しい挙動はすべて「種牡馬マスターがあるとき」だけ働く。既存テストは 1 つも変えずに通ること。
R2 を使う実行（`--r2-endpoint` あり）は `load_game_masters` を使う（牝馬マスターも読む）。

**牝馬の扱い**: 牝馬マスターが無い（`--broodmare-master-file` を指定していない）、または `start_dates_available()` が偽（schema v5 など、開始日時を持たない）ときは、
**牝馬を足さず**、`[warn] mares: ...（理由）` を 1 行出し、監査に `mares_disabled_reason` を残して**続行する**（エラーにしない）。
R2 のいまの牝馬マスターは v5 なので、採取パイプラインが v6 を R2 へ載せるまではこの経路になる。**この経路でも種牡馬は通常どおり足す。**

**`--mode daily`**（`--previous-json-dir`・種牡馬マスターが必須。無ければ `[error]` で終了コード 1）:

1. **全書へ一切アクセスしない**（`Fetcher` を作らない。`--urls-file` / `--limit` を一緒に指定したら `[error]`）。
2. 前回の `dabimasFactor.json` の全馬を、**前回の並びのまま**読む（空・読めないときは `[error]`）。
3. 各馬に `rebuild_pedigree_fields` を適用する。
4. `known_node_ids` = 3 の後の全馬（種牡馬も牝馬も）の `nodeId`。種牡馬、続けて牝馬（上の「牝馬の扱い」が使えるとき）の順に `select_new(as_of, known_node_ids, exclusions)` で新馬を選び、`build_entry` で行を作って**末尾に追加**する（種牡馬 → 牝馬の順。それぞれ `select_new` の返す順）。
5. 以降の出力（full / summary / details / pedigreeNodes）は既存の書き出し関数を使う。`pedigreeNodes.json` には、**最終的な全馬の** `pedigreeId`（根と祖先と牝馬枠）を渡す。
6. **日次は馬を削除しない。**

**`--mode weekly`**（従来どおり全書を全件取得）:

1. 全書の取得・解析・重複スキップは**現行のまま**。各行に `attach_pedigree_ids` → 種牡馬マスターがあれば続けて `rebuild_pedigree_fields`。
2. **id の引き継ぎ**（`--previous-json-dir` があるとき）: 前回公開の **`sg` / `bg` で始まる id の馬**と、全書の行を対応づけ、一致したら全書の行の `id` を**その `sg…` / `bg…` に置き換える**（それ以外の id は引き継がない。全書の URL 由来の id は変えない）。
   対応づけの鍵は、**種牡馬が `(nodeId, name, subName)`、牝馬が `nodeId` だけ**（牝馬は node が一意で、名前の字（全角 `－` と `-` など）が全書とゲームで違うことがあるため）。比べる前に、前回の `sg…` / `bg…` の行にも `rebuild_pedigree_fields` を適用して `nodeId` を現行マスターに合わせる。
3. **持ち越し**: 前回公開の `sg…` / `bg…` の馬のうち 2 で引き継がれなかったものは、`find_record(ゲーム ID)` でマスターを引き、**マスターに有り・`active`・`is_eligible(…, as_of)` が真**なら `build_entry` で作り直して**末尾に**足す（前回の相対順）。マスターに無い・未来開始に戻った・`active` でないときは足さず、監査に `dropped` として残す。
   **牝馬マスターが使えない（上の「牝馬の扱い」）ときは、前回の `bg…` の行を作り直さず、そのまま残す**（落とさない）。
4. 以降は日次と同じ。

どちらのモードも終了時に `done: ...` の行に加えて `mode=... as_of=... added=N carried_sg=N carried_bg=N adopted_ids=N` を出す。

**`--audit-output`**（JSON、UTF-8・LF・キーはソートしない）: `mode` / `as_of_utc` / `as_of_jst` / `dataset_version` / `previous_count` / `output_count` /
`added`（`id`, `kind`（`stallion` / `broodmare`）, `name`, `subName`, `game_id`, `display_start_at`）/ `skipped_future`（先頭 50 件。種牡馬・牝馬それぞれ）/ `skipped_duplicate_node` / `excluded` / `adopted_ids`（旧 → 新）/ `carried_sg` / `carried_bg` / `dropped` /
`mares_disabled_reason`（牝馬を足さなかったときの理由。使えたときは `null`）/
`ancestor_name_updates`（`pedigree_id`, 旧, 新。件数の上限は設けず、洗い替えで祖先名が変わった枠を 1 枠 1 行）。

**`scripts/data/game_exclusions.json`**（初期値）:

```json
{
  "game_stallion_ids": ["300011"],
  "game_broodmare_ids": [],
  "reasons": {"300011": "ホワイクインテット: 開始は 2019 年だが公開中の json に居ない（＝全書の一覧に無い。2026-10-07 時点）。日次で公開すると従来より増えるため除外"}
}
```

### 段階 4: 検証・比較・キャッシュ名の 3 スクリプト

#### 4-1. `scripts/verify_dabimas_outputs.py`

```
python scripts/verify_dabimas_outputs.py --staging build_out --published json [--max-drop 10]
```

`--staging` は 4 種の成果物が入ったディレクトリ。`--published` は現行の `json/`（無ければ C05 を飛ばす）。成功なら `[verify] OK (N horses)`、失敗なら違反ごとに `[verify] NG Cxx: ...`（先頭最大 5 件の例つき）を出して終了コード 1。

| コード | 検証 |
|---|---|
| C01 | full と summary の件数が同じ。details に載っている馬の総数も同じ |
| C02 | `id` が重複しない。summary の `id` の並びが full と同じ |
| C03 | summary の各 `id` が、`detailChunk` の示す chunk（`dabimasFactor.details.NNN.json`）にちょうど 1 回だけある。`chunkIndex` がファイル名の番号と一致。chunk は 0 から連番で欠番も余りも無く、その数は `ceil(件数 / chunkSize)`。details にあって summary に無い `id` が無い |
| C04 | full の各馬の `nodeId` / `pedigreeId` が **null でなく**、`pedigreeNodes.json` の `nodes` / `pedigrees` に存在し、`nodes[nodeId][0]` が `pedigreeId` と一致する。`descendants` は 15 件で、null でない `nodeId` は `nodes` に存在する。details の `mares` は 15 件で、null でない要素は `nodes` に存在する |
| C05 | 性別（`sex`）ごとに、`published` の件数 − `staging` の件数が `--max-drop`（既定 10）を超えない。`staging` が 0 件なら常に NG |
| C06 | summary の各項目が、現行の項目集合（`id, detailChunk, name, ruby, subName, nature, sex, rare, abilityType, categoryIcon, parentLine, parentLineId, son, sonId, factors, displayName, searchText, nodeId, pedigreeId`）をすべて持つ |
| C07 | `pedigreeNodes.json` の `version` が 2、`datasetVersion` が空でない文字列、`nodes` の各 `pedigreeId` が `pedigrees` に存在する |
| C08 | `id` の先頭が性別と合う（`sex == "0"` なら `s`、`"1"` なら `b`）。`sg` で始まる id は `^sg\d+$` に、`bg` で始まる id は `^bg\d+$` に合う。`sg…` の馬の `sex` は `"0"`、`bg…` の馬は `"1"` |

**現行の `json/`（`67d6a18`）は全項目を満たす**（2,957 件、chunk 不一致 0、参照欠落 0 を確認済み）。実データで NG が出たら、検証側の書き間違いを疑うこと。
`descendants` の `nodeId` が null の枠は現行データに**ある**（マスターに祖先が居ない枠）。C04 は「null でないものが `nodes` に存在すること」だけを見る。

#### 4-2. `scripts/diff_dabimas_outputs.py`

```
python scripts/diff_dabimas_outputs.py --staging build_out --published json --text-out update_lines.txt [--json-out update_stats.json]
```

- 4 種の成果物を JSON として読み、`pedigreeNodes.json` から **`datasetVersion` だけを除いて**、現行と完全に比べる。1 つでも違えば `content_changed=true`。
- 環境変数 `GITHUB_OUTPUT` があればそのファイルへ `content_changed=true|false` を追記する（`scripts/post_to_x.py` の `set_github_output` と同じ書き方）。標準出力にも件数の要約を出す。
- `--text-out` へ、**X の画像に載せる行**を UTF-8（BOM なし・LF）で書く。親ディレクトリが無ければ作る。`content_changed` のときは必ず 1 行以上にする（`txt_to_png.py` は空入力で失敗する）。分類できない差分だけのときは `データを更新しました` の 1 行にする。`false` のときはファイルを作らない、または空にする。
- 標準出力・ファイルへの書き込みは `encoding="utf-8"` を明示し、`sys.stdout.reconfigure(encoding="utf-8")` を呼ぶ（Windows のコンソールで日本語が落ちないように）。

行の内容は、`id` をキーに現行と今回の full を比べて分類する。

| 見出し | 対象 | 1 行の書き方 |
|---|---|---|
| `【追加 N頭】` | 今回だけにある `id` | 種牡馬 `★{rare} {name}-{subName}-`（`subName` が空なら `★{rare} {name}`）、繁殖牝馬 `牝 {name}` |
| `【変更 N頭】` | 両方にあり、次のいずれかが違う: `name` `ruby` `subName` `nature` `rare` `abilityType` `categoryIcon` `parentLine` `parentLineId` `son` `sonId` `factors`（**`id` が違うだけの馬は無い**: 引き継ぎで同じ id になる） | `{表示名}: {変わった項目のラベル}`。ラベルは 馬名 / ふりがな / 副題 / 天性 / レア度 / 非凡 / カテゴリ / 系統 / 因子。`name` と `subName` は `旧 → 新` も添える |
| `【血統表の更新 N頭】` | 上の項目は同じで、`nodeId` `pedigreeId` `descendants`、または details の `mares` が違う | 件数だけ（馬名は並べない） |
| `【血統辞書の更新 N件】` | `pedigreeNodes.json` の `pedigrees` / `nodes` で、追加・削除・変更されたキーの数 | 件数だけ |
| `【削除 N頭】` | 現行にだけある `id` | 追加と同じ書き方 |

- 1 つの馬が「変更」と「血統表の更新」の両方に当てはまるときは「変更」に入れ、「血統表の更新」には数えない。
- 該当のない見出しは出さない。並びは今回の full の並び（削除は現行の並び）。
- 画像が読める量に収めるため、**1 見出しあたり `追加`・`削除` は 20 行、`変更` は 10 行まで**とし、超えた分は `ほか N頭` の 1 行にまとめる。全体でも 40 行を超えない。

出力の例（件数は説明用）:

```
【追加 3頭】
★5 ダノンレジェンド-央瓏-
★5 ブリガディアジェラード-巌漸-
★5 ジャワゴールド-燕順-
【血統表の更新 41頭】
【血統辞書の更新 40件】
```

#### 4-3. `scripts/bump_cache_name.py`

```
python scripts/bump_cache_name.py [--file service-worker.js] [--date YYYYMMDD] [--dry-run]
```

- `service-worker.js` の `var CACHE_NAME = '...';`（行頭、1 か所）を探す。無ければ例外で終了コード 1。
- 現在の名前が `dabimas-factor-v{今日}-NN` なら **NN を 1 増やす**（`-01` → `-02`、桁は 2 桁以上でゼロ埋め）。日付が違う、または形式が違うなら `dabimas-factor-v{今日}-01`。
- 「今日」は JST（`timezone(timedelta(hours=9))`。`zoneinfo` は使わない）。`--date` で上書きできる。
- 新しい名前を標準出力に出す。`--dry-run` のときはファイルを書かない。改行コードなど、名前の行以外は 1 バイトも変えない。

### 段階 5: ワークフローと運用文書

#### 5-1. `.github/workflows/x_post.yml` の書き換え

ファイル名は変えない（他の文書が参照している）。`name:` は `Dabimas Data Update` にする。**次は骨組みである。`if:` の書き方やコンテキスト名は、構文の誤りがないよう自分で確かめて仕上げること。**

```yaml
on:
  workflow_dispatch:
    inputs:
      mode:
        description: "daily = 前回の json を土台に R2 のマスターから足す / weekly = 全書を全件取り直す"
        type: choice
        options: [daily, weekly]
        default: daily
      as_of:
        description: "公開可否の基準時刻（例 2026-10-13T11:30:00+09:00）。空 = 現在時刻。未来の値は dry_run のときだけ"
        type: string
        default: ""
      dry_run:
        description: "true = 生成・検証・差分の確認だけ。commit・push・X 投稿をしない"
        type: boolean
        default: false
  schedule:
    - cron: "47 0 * * *"   # 日次: 09:47 JST 起動 → 11:30 JST まで待機
    - cron: "7 4 * * 5"    # 金曜: 13:07 JST 起動 → 18:30 JST まで待機

permissions:
  contents: write
  actions: read            # 直前の run の結論を読む（エラー通知の連投抑止）

concurrency:
  group: dabimas-data-update
  cancel-in-progress: false
```

ジョブは 1 本（`timeout-minutes: 360`、`R2_*` の env は現行のまま）。ステップの流れ:

1. **`ctx`**（`id: ctx`）: `mode` / `dry_run` / `as_of` / `wait` を出力にする。
   - `workflow_dispatch`: 入力値をそのまま使う。`as_of` が空なら現在時刻（`TZ=Asia/Tokyo date +%Y-%m-%dT%H:%M:%S+09:00`）。`dry_run` が偽で `as_of` が**現在より未来**なら、メッセージを出して失敗にする。`wait` は空。
   - `schedule` が `7 4 * * 5`: `mode=weekly`、`wait=18:30`、`as_of` = 当日 18:30 JST（`TZ=Asia/Tokyo date -d 'today 18:30' +%Y-%m-%dT%H:%M:%S+09:00`）。
   - それ以外の `schedule`: `mode=daily`、`wait=11:30`、`as_of` = 当日 11:30 JST。
   - schedule のとき `dry_run=false`。**expression を `run:` の中へ直接埋めず、`env:` 経由で渡す。**
2. **待機**: `wait` が空でないとき。現行の待機ステップと同じ計算で、目標を `steps.ctx.outputs.wait` から取る。目標を過ぎていれば待たない（`as_of` は固定なので、遅れて走っても結果は変わらない）。
3. `actions/checkout@v5` → `actions/setup-python@v5`（3.11）→ 依存導入（**`id: deps`**）。
4. **生成**（`id: build`）: `build_out/` へ出力する。

   ```bash
   python scripts/build_dabimas_stream.py \
     --mode "$MODE" --as-of "$AS_OF" --previous-json-dir json \
     --output build_out/dabimasFactor.json \
     --summary-output build_out/dabimasFactor.summary.json \
     --details-output-dir build_out/dabimasFactor-details \
     --pedigree-nodes-output build_out/pedigreeNodes.json \
     --audit-output build_out/audit.json \
     --r2-endpoint "$R2_ENDPOINT_URL" \
     --pedigree-mismatch-retries 2 --pedigree-mismatch-wait 60 \
     --detail-chunk-size 128 --progress 200 --fail-on-error
   ```

   `--pedigree-dataset-version` は現行と同じく渡さない（R2 が更新されるたびに落ちるため）。
5. **検証**: `verify_dabimas_outputs.py --staging build_out --published json`。
6. **比較**（`id: diff`）: `diff_dabimas_outputs.py ... --text-out update_lines.txt`。あわせて `$GITHUB_STEP_SUMMARY` へ、変更ありなら `update_lines.txt` と `build_out/audit.json` の要約（モード・`as_of`・追加数・持ち越し・破棄）、なしなら `変更なし（mode=..., as_of=...）` を書く（更新のない日は X にも何も出ないので、Actions 画面で分かるようにするため）。
7. **更新画像**: `content_changed == 'true'` のとき `scripts/txt_to_png.py --input update_lines.txt --output update_summary.png --font-path fonts/NotoSansCJKjp-Regular.otf --title "ダビふぁく 更新内容 YYYY-MM-DD"`（日付は `TZ=Asia/Tokyo date +%Y-%m-%d`）。`dry_run` でも作る。
8. **反映**: `content_changed == 'true'` かつ `dry_run != 'true'` のとき、`json/dabimasFactor-details` を消して `build_out` の同名ディレクトリで置き換え、`dabimasFactor.json` / `.summary.json` / `pedigreeNodes.json` をコピーし、`bump_cache_name.py` を実行する。
9. **commit と push**（**`id: push`**）: 同じ条件。`git add` は `json/dabimasFactor.json` `json/dabimasFactor.summary.json` `json/dabimasFactor-details` `json/pedigreeNodes.json` `service-worker.js` だけ（`build_out/` などを巻き込まない）。**`content_changed` なのに `git diff --cached --quiet` が真なら、失敗にする**（比較と git の見方が食い違っている。投稿だけしてはいけない）。メッセージは `Update json/dabimasFactor.json and CACHE_NAME (YYYY-MM-DD, <mode>)`。push が失敗したら 1 回だけ `git pull --rebase origin main` して再試行する（開発者が同時に `main` へ push していることがある）。
10. **X へ更新を投稿**（`id: post_update`）: `if: steps.push.outcome == 'success'`。`scripts/post_to_x.py` を、`X_MEDIA_PATH: update_summary.png` つきで呼ぶ。本文:

    ```
    ダビふぁくのデータを更新しました。
    追加・更新内容は添付画像をご確認ください。
    #ダビマス
    ```
11. **dry_run の成果物**: `dry_run == 'true'` のとき `actions/upload-artifact@v4` で `build_out/`（`audit.json` を含む）`update_lines.txt` `update_summary.png` を上げる。
12. **エラー通知の要否**（`id: err_gate`）: 次を**すべて**満たすときだけ実行する。

    - `failure()`
    - `steps.deps.outcome == 'success'`（投稿に必要な Python と依存が入っている）
    - `steps.push.outcome != 'success'`（**push が済んでいたら公開データは更新済みなので「前回成功版のまま」とは書けない。X 側の失敗は Actions の失敗として残すだけにする**）
    - `steps.ctx.outputs.dry_run != 'true'`

    `env: GH_TOKEN: ${{ github.token }}` で `gh run list --workflow x_post.yml --status completed --limit 1 --json conclusion --jq '.[0].conclusion'` を実行し、**結果が `failure` でなければ `notify=true`** を出力する。`gh run list` が失敗したときも `notify=true` にする（通知しそこなうより、重複のほうがまし）。
13. **X へエラーを投稿**（`id: post_error`）: `steps.err_gate.outputs.notify == 'true'`。`X_MEDIA_PATH` は渡さない。本文（日時は JST の `YYYY-MM-DD HH:mm`）:

    ```
    ダビふぁくのデータ更新処理でエラーが発生しました。
    公開中のデータは前回成功版のままです。
    発生日時: YYYY-MM-DD HH:mm JST
    #ダビマス
    ```

    本文は直前のステップで組み立て、`$GITHUB_ENV`（複数行は区切り文字つき）経由で `X_TWEET_TEXT` に渡す。
    **本文にも、それを作る過程のログにも、R2 のエンドポイント・バケット名・キー・ローカルパス・例外の全文を出さない。**
14. **リフレッシュトークンの保存**: 現行の `always()` のステップを引き継ぎ、`post_update` と `post_error` のどちらの `new_refresh_token` も拾う。

**廃止するもの**: `Fetch latest news` / `Detect latest news changes` / `Render latest stallions image` / `Post no-change notice to X`。`scripts/fetch_latest_news.py` と `.github/state/latest_news_snapshot.txt` は**削除せずそのまま残す**（ワークフローから呼ばなくなるだけ）。

ワークフローの冒頭コメントに、次を書くこと: 2 本の cron の意味（JST への換算）、待機の理由（`docs/x-post-schedule-fix-plan.md`）、日次が全書を見ず R2 だけで動くこと、`dry_run` と `as_of` の使い方、R2 の取得失敗はキャッシュへ逃げずに失敗になること。

#### 5-2. 運用文書（新規 `docs/data-update-operations.md`）

1 ページに収める。書くこと:

- 日次（11:30 JST、全書を見ない）と金曜（18:30 JST、全書を全件取得）の違い、スケジュールと前倒し起動 + 待機の理由
- **`as_of` は予定時刻に固定される**こと。`display_start_at <= as_of` で足すので、12:00 JST 開始の馬は、その日の日次（11:30）には入らず**翌日の日次**で出ること。0 / null は制限なし
- 日次が出せるのは **R2 のマスターに載っている馬だけ**であること（マスターは採取パイプラインを手動で回さない限り更新されない）。マスターに無い馬は金曜の全書で拾う
- **牝馬**: 牝馬マスターが schema v6 以上（開始日時あり）のときだけ日次で足す。**v5 のとき（R2 に v6 が載るまで）は足さず、警告だけ出す**。どちらの状態かは Actions のログと `audit.json` の `mares_disabled_reason` で分かること
- `sg…`（種牡馬）・`bg…`（牝馬）の id の意味と、金曜に全書が追いついたときに id を引き継ぐこと
- `game_exclusions.json` の意味と使い方
- 何が「更新あり」になるか（`datasetVersion` は除く）、エラー通知が出る条件と連投しない仕組み
- `dry_run` の使い方: `gh workflow run x_post.yml --ref <枝> -f mode=daily -f dry_run=true -f as_of=2026-10-13T11:30:00+09:00`
- 手動で全書を取り直したいとき: `-f mode=weekly`

`docs/x-post-schedule-fix-plan.md` の冒頭には「現行の運用は `docs/data-update-operations.md`（2026-10 に日次＋金曜の二本立てへ変更）」と 1〜2 行だけ足す。

---

## 制約

- `AGENTS.md` の Safety Rules に従うこと（この作業は `index.html` を触らない）。
- **出力の形式・項目・キーの並び順・馬の並び順を変えない。既存馬の `id` を変えない。** `json/` の中身をこの枝で変更しない（`git diff --stat 67d6a18 -- json service-worker.js` が空であること。動作確認は `tmp/`（`.gitignore` 済み）や一時ディレクトリで行う。`build_out/` は `.gitignore` の対象ではないので、作った場合は commit に含めないこと）。
- 既存の `--fail-on-error` の判定（未知の系統・不正レア度・非凡アイコン警告・血統 ID の未解決/曖昧/祖先不一致・取得エラー）を弱めない。
- **種牡馬マスターを指定しない実行の出力とログを変えない**（既存の 52 件のテストが 1 つも変わらずに通る）。
- 秘密情報（R2 / X の認証情報）をコード・テスト・文書・ログに書かない。本物の R2 や X へは接続しない（認証情報も無い）。テストは差し替え（`monkeypatch`・`FakeFetcher`・`client` 引数。既存の `tests/test_build_dabimas_stream.py` と `tests/test_pedigree_master_fetch.py` の書き方に合わせる）で行う。
- 全書（`dabimas.jp`）へ実際にアクセスするテストは書かない。**日次のテストでは `Fetcher` を呼んだら失敗する差し替えを入れ、日次が全書へ触れないことを確かめる。**
- `tmp/masters-20261007/` の 6 ファイル（計約 20MB）を**コミットしない**。リポジトリに入れるフィクスチャは、手で作った小さなもの（pedigree 数件・種牡馬・牝馬数件）にする。実データを使う受け入れ基準は、ファイルが無い環境では `pytest.skip` にする。
- 新しい依存を `scripts/requirements.txt` へ足さない。YAML を読むテストは `pytest.importorskip("yaml")` で PyYAML が無ければ飛ばす。
- Python は 3.11（CI）と 3.12（手元）の両方で動くこと。パスは `pathlib`、ファイルは UTF-8（BOM なし）、JSON は `newline="\n"` で書く（既存の書き方に合わせる）。
- **push・マージ・GitHub 上のワークフロー実行はしない。**

## スコープ外（やらないこと）

- `race_master` の読み込み。牝馬の等級（`broodmare_grade`）の `categoryIcon` 以外への利用、牝馬の `header_badge`（未検証）の利用
- 種牡馬の距離・成長・脚質・各適性など、公開 json に出ない項目の出力
- 公開 json への項目追加（`gameStallionId` など）。画面側（`index.html` / `vue/` / `css/`）の変更
- `C:\derby\data\pedigree_r2_pipeline`（採取パイプライン）の変更。R2 への書き込み
- `scripts/fetch_latest_news.py`・`.github/state/latest_news_snapshot.txt`・`.github/workflows/build-dabimas-stream.yml`・`.github/workflows/python-ci.yml` の変更や削除
- `CLAUDE.md` と `docs/branch-strategy.md` の更新（検収側で行う）
- 一覧に載らなくなった馬の「廃止判定」。マスター遅れのときに新規の馬だけを保留して他を公開する仕組み（現行どおり、解決できない馬があればビルドごと失敗させる）
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

### 段階 1（取得層）

1. `python -m pytest tests -q` が全件成功する（着手前は 52 件成功）。既存のテストの文面が変わらない。
2. `tests/test_pedigree_master_fetch.py`: 5 ファイルの版・sha の食い違いで `PedigreeMasterVersionMismatch`（牝馬だけ食い違う場合も）。`mismatch_retries` 回まで再取得し、途中で揃えば成功する。上限を超えたら例外。V05・その他の検証エラー・通信エラーは再試行しない（`sleep` は差し替えて実際には待たない）。`source` が辞書でない・`sha256` が無いファイルは NG。`stallion` の `time_policy` が違う・`schema_version` が 6・必要な項目の欠落・`node_id` が pedigree に無い・`game_stallion_id` の重複、がそれぞれ NG になる。**`schema_version` が 8 でも通る**。
   牝馬マスター: **v5（開始日時なし）は通り、`start_dates_available` が偽になる**。v6 で `display_start_at_field_map.status` が `verified` でない・`dated_count` / `unset_count` が実際の件数と違う・`display_start_at` が読めない・`node_id` が pedigree に無い・`game_broodmare_id` の重複、がそれぞれ NG。`allow_mixed_versions=True` のときだけ版の不一致が通る（R2 経路では `True` にならないことも確かめる）。

### 段階 2（ゲームマスター層）

3. **時刻の判定**（`tests/test_game_master_source.py`）: `is_eligible(0, x)` / `is_eligible(None, x)` は真。`start == as_of` は真、`start == as_of + 1` は偽。`parse_as_of("2026-10-13T11:30:00")`（タイムゾーン無し）は `ValueError`。`parse_iso_epoch("2026-10-13T03:00:00Z")` と `parse_iso_epoch("2026-10-13T12:00:00+09:00")` が同じ値。
4. **依頼者の例**（手で作ったフィクスチャ。値は実データのもの）:

   | ゲーム ID | 名前 | `display_start_at_raw` | JST |
   |---|---|---:|---|
   | 101325 | ダノンレジェンド-央瓏- | 1791817200 | 2026-10-13 00:00 |
   | 1063 | アドミラルドレイク-瞬闘- | 1791860400 | 2026-10-13 12:00 |
   | 101319 | シーフュリュー-央燕- | 1791298800 | 2026-10-07 00:00 |
   | 1 | ディープインパクト | 0 | （制限なし） |

   `as_of = 2026-10-13T11:30:00+09:00` では 101325 が選ばれ、1063 は選ばれない（`skipped_future`）。`11:59:59+09:00` でも 1063 は選ばれず、`12:00:00+09:00` で選ばれる。`2026-10-12T23:59:59+09:00` では 101325 が選ばれない。
   ディープインパクトの node が `known_node_ids` にあれば選ばれない（公開済み）。除外リストに入れたゲーム ID は選ばれず `excluded` に出る。同じ node の複数候補は、`(rarity, nonordinary_ability_id, sub_ability_id)` ごとに最小のゲーム ID 1 件になる。
   **牝馬**（手で作ったフィクスチャ。値は実データのもの）:

   | ゲーム ID | 名前 | `display_start_at` | 備考 |
   |---|---|---|---|
   | 1 | ウマガアウカラ | （キーなし） | 制限なし |
   | 491 | フレッシュメープル | `2026-09-18T15:00:00Z`（= 2026-09-19 00:00 JST） | 開始済み |
   | 283 | ワンダーメルシャン | `2029-12-31T15:00:00Z`（= 2030-01-01 00:00 JST） | 番兵 |
   | （作る） | テスト牝馬 | `2026-10-13T03:00:00Z`（= 2026-10-13 12:00 JST） | 12:00 開始 |

   `as_of = 2026-10-13T11:30:00+09:00` ではテスト牝馬が選ばれず、`12:00:00+09:00` で選ばれる。ワンダーメルシャンは `2029-12-31T23:59:59+09:00` では選ばれず、`2030-01-01T00:00:00+09:00` で選ばれる。キーの無い牝馬は node が `known_node_ids` に無ければ選ばれる（制限なし）。`known_node_ids` にあれば選ばれない。
5. **規則の再現**（フィクスチャ）: `build_entry` が、「マスターから種牡馬の行を作る規則」の各行を満たす。**牝馬は「マスターから牝馬の行を作る規則」の各行を満たす**（等級コード `U`〜`Y` と `categoryIcon`、未知のコード・`mapping_status` が `verified` でない場合のエラー、`name` が `-` を含んでもそのまま残る、`rare` / `abilityType` が `null`、`nature` / `subName` が `""`、`factors` が `["","",""]`、キーの並び）。特に `abilityType`（`effect_group_id_raw` の 99 / 98 / 97 / 他はエラー）、`factors` の逆順と右詰め・年号 node の通常版への代替・4 件でエラー、`nature`、`categoryIcon`、キーの並び、祖先の枠が `None` のときの空枠。
   祖先名は 3 段（ゲーム表示名 → 前回公開の名前 → `canonical_name`）の優先順位どおりに選ばれる。`rebuild_pedigree_fields` は根の項目を変えず、`nodeId` が現行マスターに無ければ引き直し、解決できなければ `null` と集計になる。
6. **実データでの照合**（`tmp/masters-20261007/` と `json/`（`67d6a18`）。無ければ skip）: 公開中の種牡馬のうち、マスターと 1 対 1 で対応する **2,377 頭**（node が公開側でもマスター側でも 1 件だけのもの）について、`build_entry` の結果が、**`id` を除く根の項目（`name` `ruby` `subName` `nature` `sex` `rare` `abilityType` `categoryIcon` `parentLine` `parentLineId` `son` `sonId` `factors`）で全件一致**する。
   同じ 2,377 頭の `descendants` が、**`name` と、公開側の `nodeId` が null でマスターが解決済みの枠（3 枠の見込み）を除いて**全枠一致する。
   `name` が違うのは「ゲーム表示名が全書より新しい枠」だけで、その件数と内訳（祖先名・旧・新）を完了報告に書く（約 40 枠の見込み）。null の枠は、公開側のその枠の他の項目も併せて報告する。
   **牝馬**（`tmp/masters-20261007/broodmare_master.v6-20261006.game.json` と `json/`。無ければ skip）: 公開中の牝馬 **500 頭**（マスターと node で 1 対 1）について、`build_entry` の結果が `id` を除く根の項目（`name` `ruby` `subName` `nature` `sex` `rare` `abilityType` `categoryIcon` `parentLine` `parentLineId` `son` `sonId` `factors`）で一致する。
   **例外は `ヨ－クダリア` の `name` と `ruby` の 1 頭だけ**（公開側は全角 `－`、ゲームは ASCII `-`）。この 1 頭を完了報告に書く。`descendants` は種牡馬と同じ基準（`name` と、公開側の `nodeId` が null の枠を除いて一致）。
   牝馬マスター v6 の `display_start_at_field_map` の検査（`dated_count == 135`、`unset_count == 372`）が実ファイルで通る。

### 段階 3（ビルド本体）

7. **日次**（`tests/test_build_dabimas_stream.py`、手作りの小さなマスターと前回 json）: `--mode daily` が全書へ触れない（`Fetcher` を作る・呼ぶと失敗する差し替えでも通る）。前回の全馬が前回の順で残り、末尾に新馬が（種牡馬 → 牝馬の順に、それぞれ `select_new` の順で）付く。新馬の `id` は種牡馬が `sg{ゲーム ID}`、牝馬が `bg{ゲーム ID}`。既存馬の `id` と根の項目が 1 つも変わらない。`--as-of` を進めると新馬が増え、戻すと減る（ただし**前回公開に入った馬は削除されない**）。
   `--previous-json-dir` が無い・空・`--as-of` にタイムゾーンが無い・`--urls-file` との併用は、いずれも `[error]` で終了コード 1。
   **牝馬マスターが無い（`--broodmare-master-file` なし）・v5 のときは、種牡馬は通常どおり足され、牝馬は 1 頭も足されず、`[warn] mares: ...` と `mares_disabled_reason` が出て、終了コードは 0。**
8. **金曜**（同上）: 全書の行が `sg…` の馬と `(nodeId, name, subName)` で、`bg…` の馬と `nodeId` だけで一致したら、その `sg…` / `bg…` の id になり、全書の URL 由来の id は変わらない。全書に無く、マスターで開始済み・`active` の `sg…` / `bg…` は末尾に残り、マスターに無い・未来開始に戻った・`active` でないものは落ちて `audit.json` の `dropped` に出る。牝馬マスターが使えないときは `bg…` の行がそのまま残る。
9. **後方互換**: 種牡馬マスターを指定しない実行の出力が、これまでと**バイト単位で一致**する（既存のテストがそのまま通る）。
10. **実データの通し**（`tmp/masters-20261007/` と `json/`（`67d6a18`）。無ければ skip）: ローカルの 4 ファイル（`--pedigree-master-file` など 4 つ。牝馬なし）と `--previous-json-dir json` で `--mode daily` を `build_out`（一時ディレクトリ）へ実行する。**終了コード 0**。`scripts/verify_dabimas_outputs.py` が `[verify] OK`。
    牝馬マスターを指定していないので、`[warn] mares: ...` が出て牝馬は 0 頭（`mares_disabled_reason` が入る）。

    | `--as-of` | 新しく付く馬（`audit.json` の `added`） |
    |---|---|
    | `2026-10-07T22:00:00+09:00` | **3 頭**: `sg101319` シーフュリュー-央燕-、`sg101320` キタサンブラック-央漸-、`sg101321` ナオキ-煌魂- |
    | `2026-10-13T11:30:00+09:00` | **6 頭**: 上の 3 頭 + `sg101324` ブリガディアジェラード-巌漸-、`sg101325` ダノンレジェンド-央瓏-、`sg101326` ジャワゴールド-燕順- |
    | `2026-10-13T12:00:00+09:00` | **9 頭**: 上の 6 頭 + `sg1062` ルアール-覇煌-、`sg1063` アドミラルドレイク-瞬闘-、`sg1064` ケープクロス-瞬走- |

    **`ホワイクインテット`（300011）はどの `as_of` でも付かず、`excluded` に出る。** 2 行目で `アドミラルドレイク-瞬闘-` が付かず `skipped_future` に出る。
    出力の馬数は 2,957 + 追加数。新馬の `rare` は 5、`categoryIcon` が null でなく、`nodeId` / `pedigreeId` が null でなく、`mares` が 15 枠、`descendants` が 15 枠。

    **牝馬を含む通し**（`tmp/masters-20261007/` の上の 4 ファイル + **v6 牝馬マスター `broodmare_master.v6-20261006.game.json`** + `--broodmare-master-file ... --allow-mixed-master-versions`。v6 は別の dump なので版が合わない。そのための指定）:

    | `--as-of` | 新しく付く**牝馬**（`audit.json` の `added` のうち `kind == "broodmare"`） |
    |---|---|
    | `2026-10-08T11:30:00+09:00` | **0 頭**（未開始の 7 頭は `skipped_future`） |
    | `2029-12-31T23:59:59+09:00` | **0 頭** |
    | `2030-01-01T00:00:00+09:00` | **7 頭**: `bg283` ワンダーメルシャン、`bg285` コンモベドール、`bg287` ユイレポート、`bg329` ローブチェイサー、`bg343` セットクラクション、`bg345` カインスレード、`bg346` リズウェンディ |

    3 行目の新しい牝馬は `categoryIcon` が `sale_05`（`bg283` `bg287` `bg329` `bg343` `bg345` `bg346`）または `sale_07`（`bg285`）、`rare` / `abilityType` が `null`、`nature` が `""`、`factors` が `["","",""]`、`mares` と `descendants` が 15 枠。
    （この行は 2030 年の時刻なので、種牡馬の番兵 5 頭も開始済みになる。種牡馬の追加数は検査しない。）
    `--allow-mixed-master-versions` を付けずに同じ 5 ファイルを渡すと、版の不一致で `[error]`（終了コード 1）。**R2 を使う指定（`--r2-endpoint`）と `--allow-mixed-master-versions` を一緒に指定しても `[error]`。**

### 段階 4（検証・比較・キャッシュ名）

11. **検証スクリプト**: 現行の `json/` に対して次が `[verify] OK (2957 horses)` で終了コード 0。

    ```
    python scripts/verify_dabimas_outputs.py --staging json --published json
    ```

    C01〜C08 の違反をそれぞれ 1 つずつ作ったテストで、該当コードの NG になる（`--max-drop` の境界: ちょうど 10 件減は OK、11 件減は NG）。
12. **比較スクリプト**: 現行の `json/` どうしの比較は `content_changed=false`。`pedigreeNodes.json` の `datasetVersion` だけを変えたものも `false`。
    追加・変更（馬名 / 因子など）・血統表の更新・血統辞書の更新・削除を 1 種類ずつ作ったテストで、`true` になり、上の表どおりの見出しと行が出る。上限（20 / 10 / 全体 40 行）を超えるときは `ほか N頭` にまとまる。`GITHUB_OUTPUT` に `content_changed=...` が追記される。
13. **`bump_cache_name.py`**: 同日なら連番が増える（`-01` → `-02` → `-09` → `-10`）、日付が違えば `-01` に戻る、形式が違えば `-01`、`--dry-run` ではファイルが変わらない、名前の行以外が 1 バイトも変わらない。
14. **更新画像**: 40 行のサンプルテキストから `scripts/txt_to_png.py --title "ダビふぁく 更新内容 2026-10-13"` で PNG が作れ、5MB 未満。

### 段階 5（ワークフローと文書）

15. **ワークフロー**（`tests/test_workflow_x_post.py`。PyYAML があるときだけ実行）: YAML として読める。schedule が上の 2 本（`47 0 * * *` と `7 4 * * 5`）だけ。`workflow_dispatch` の入力が `mode` / `as_of` / `dry_run` の 3 つ。`commit と push` / `X へ更新を投稿` / `X へエラーを投稿` の各ステップの `if` が、それぞれ「`dry_run` のときは動かない」ことを満たす（条件式に `dry_run` または `push.outcome` / `err_gate` が入っている）。`permissions` に `actions: read` がある。**`actions/cache` を使っていない**。旧ステップ（`no-change` 投稿・`Fetch latest news` など）が残っていない。
16. **文書**: `docs/data-update-operations.md` を作成し、`docs/x-post-schedule-fix-plan.md` の冒頭へ案内を足した。
17. **差分の確認**: `git diff --stat 67d6a18 -- json service-worker.js index.html vue css` が空。`tmp/` 以外で `git status` に「無視されて未追跡」のファイルが残っていない（新規のテスト・フィクスチャは `git add -f` で追跡されている）。`tmp/masters-20261007/` がコミットに含まれていない。

### 運用シナリオ（テストで確かめる対応表）

| シナリオ | 期待 | 受け入れ基準 |
|---|---|---|
| 10/13 11:30 の日次 | `ダノンレジェンド-央瓏-` は出る。`アドミラルドレイク-瞬闘-` は出ない | 4, 10 |
| 10/14 11:30 の日次 | `アドミラルドレイク-瞬闘-` も出る（前日に出た馬は削除されない） | 7, 10 |
| 日次が 12:05 に遅れて起動 | `as_of` は固定（当日 11:30）なので結果は同じ | 3（`as_of` の固定は `ctx` ステップ） |
| 何も変わらない日 | commit も X 投稿もしない。Actions 画面に「変更なし」 | 12, 15 |
| マスターを更新していない日 | 新馬は増えず、血統の洗い替えだけ。差分が無ければ何も出ない | 7, 12 |
| 牝馬の開始日時が 11:30 以降（例 12:00 JST）の日 | その日の日次には入らず、翌日の日次で出る | 4, 10 |
| 牝馬マスターが v5（R2 に v6 が載るまで） | 種牡馬だけ足す。牝馬は足さず警告。終了コード 0 | 7, 10 |
| 開始日時が未設定の牝馬（`display_start_at` キーなし） | 制限なし。node が公開済みなら何もしない | 4, 6 |
| 金曜に、日次で足した馬を全書がまだ載せていない | 馬は消えず、マスターから作り直して残る（`sg…` / `bg…`） | 8 |
| 金曜に、全書が日次で足した馬を載せた | 全書の行になるが `id` は `sg…` / `bg…` のまま | 8 |
| 全書だけが既存馬を修正 | 金曜で反映。日次は反映しない | 8 |
| R2 の版が食い違う（配置の途中） | 数回再取得。それでも揃わなければ失敗 → エラー投稿 | 2, 15 |
| R2 が取れない | キャッシュへ逃げず失敗 → エラー投稿 | （ワークフローのコメント） |
| 全書の一覧が 0 件・急減（金曜） | 公開せず失敗 → エラー投稿 | 8, 11 |
| 手動 `dry_run` + 未来の `as_of` | 生成・検証・差分・画像まで。commit・push・投稿なし | 10, 15 |
| 手動（`dry_run` でない）+ 未来の `as_of` | `ctx` で失敗 | （ワークフロー） |

## 検証コマンド

作業場所（`C:\derby\dabimasFactor-daily-update`）で実行する。

```bash
# 依存（未導入なら）
python -m pip install -r scripts/requirements.txt pytest pyyaml

# 全テスト
python -m pytest tests -q

# 現行の json/ が新しい検証を通ること（実データでの確認）
python scripts/verify_dabimas_outputs.py --staging json --published json

# 現行どうしの比較は「変更なし」になること
python scripts/diff_dabimas_outputs.py --staging json --published json --text-out tmp/lines.txt

# 実データの日次（R2 に触れず、ローカルの 4 ファイルで。牝馬なし。10/13 11:30 の予行）
python scripts/build_dabimas_stream.py --mode daily --as-of 2026-10-13T11:30:00+09:00 \
  --previous-json-dir json \
  --pedigree-master-file tmp/masters-20261007/pedigree_master.json \
  --pedigree-game-nodes-file tmp/masters-20261007/pedigree_master.game.json \
  --stallion-master-file tmp/masters-20261007/stallion_master.game.json \
  --ability-master-file tmp/masters-20261007/ability_master.game.json \
  --output tmp/out/dabimasFactor.json --summary-output tmp/out/dabimasFactor.summary.json \
  --details-output-dir tmp/out/dabimasFactor-details --pedigree-nodes-output tmp/out/pedigreeNodes.json \
  --audit-output tmp/out/audit.json --detail-chunk-size 128 --fail-on-error
python scripts/verify_dabimas_outputs.py --staging tmp/out --published json
python scripts/diff_dabimas_outputs.py --staging tmp/out --published json --text-out tmp/out/update_lines.txt

# 牝馬を含む日次（v6 牝馬マスター。別の dump なので --allow-mixed-master-versions が要る。2030-01-01 00:00 JST で牝馬 7 頭）
python scripts/build_dabimas_stream.py --mode daily --as-of 2030-01-01T00:00:00+09:00 \
  --previous-json-dir json \
  --pedigree-master-file tmp/masters-20261007/pedigree_master.json \
  --pedigree-game-nodes-file tmp/masters-20261007/pedigree_master.game.json \
  --stallion-master-file tmp/masters-20261007/stallion_master.game.json \
  --ability-master-file tmp/masters-20261007/ability_master.game.json \
  --broodmare-master-file tmp/masters-20261007/broodmare_master.v6-20261006.game.json \
  --allow-mixed-master-versions \
  --output tmp/out-mares/dabimasFactor.json --summary-output tmp/out-mares/dabimasFactor.summary.json \
  --details-output-dir tmp/out-mares/dabimasFactor-details --pedigree-nodes-output tmp/out-mares/pedigreeNodes.json \
  --audit-output tmp/out-mares/audit.json --detail-chunk-size 128 --fail-on-error
python scripts/verify_dabimas_outputs.py --staging tmp/out-mares --published json

# CACHE_NAME の連番（書き込まない）
python scripts/bump_cache_name.py --file service-worker.js --date 20261002 --dry-run

# ワークフローが YAML として読めること
python -c "import yaml; yaml.safe_load(open('.github/workflows/x_post.yml', encoding='utf-8')); print('yaml ok')"

# json/ と画面側を変えていないこと（出力が空であること）
git diff --stat 67d6a18 -- json service-worker.js index.html vue css
```

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。status は「依頼中」のまま変えないこと（完了への遷移は検収側が行う）。

### 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `scripts/pedigree_master_fetch.py` | 5 マスターの検証、版不一致専用例外、再取得、牝馬 v5 / v6 判別 |
| `scripts/pedigree_master_source.py` | node / pedigree / nodes_of / base_node の公開取得口 |
| `scripts/game_master_source.py` | 開始時刻判定、種牡馬・牝馬の行構築、血統再構築、ID引き継ぎ・持ち越し、監査、10/09 追記の gameId |
| `scripts/build_dabimas_stream.py` | daily / weekly と追加引数、全書を使わない日次経路、summary の gameId |
| `scripts/data/game_exclusions.json` | ホワイクインテットの初期除外設定 |
| `scripts/verify_dabimas_outputs.py` | 公開前検証 C01〜C08 |
| `scripts/diff_dabimas_outputs.py` | 成果物比較、更新一覧、GitHub Output |
| `scripts/bump_cache_name.py` | JST 日付・同日連番、dry-run、名前以外のバイト保持 |
| `.github/workflows/x_post.yml` | 2 本の schedule、固定 as_of、staging 検証、変更時のみ反映・投稿、エラー通知抑止、dry_run artifact |
| `docs/data-update-operations.md` | 日次・金曜・手動実行・ID・エラー通知の運用説明 |
| `docs/x-post-schedule-fix-plan.md` | 現行運用への案内 |
| `tests/test_pedigree_master_fetch.py` | 検証・版不一致・再取得の追加テスト（既存テストは維持） |
| `tests/test_game_master_source.py` | 時刻境界・変換規則・実データ 2,377 / 500 頭の照合 |
| `tests/test_daily_build.py` | 日次・金曜のビルドと実データ6ケース。既存のビルドテストを変更せず別ファイルへ追加 |
| `tests/test_game_id.py` | 新馬・既存馬・summary・未解決・牝馬 v5・重複nodeの gameId |
| `tests/test_verify_dabimas_outputs.py` | C01〜C08 と減少上限・chunk 整合 |
| `tests/test_diff_dabimas_outputs.py` | 差分分類・優先順位・行数上限・GitHub Output |
| `tests/test_bump_cache_name.py` | 連番・日付・dry-run・バイト保持 |
| `tests/test_workflow_x_post.py` | YAML、条件式、ctx の時刻判定、40行画像生成 |
| `tests/fixtures/daily-update/{pedigree_master.json,pedigree_master.game.json,stallion_master.game.json,ability_master.game.json,broodmare_master.game.json,start_dates.json}` | 小さな手作りマスターと時刻境界例（実マスターは含まない） |
| この指示書 | 最新の依頼内容を保持して完了報告を記入 |

### 設計判断

- 10/09 の `gameId` 追加を、従来の「項目を変えない」制約に対する明示的な追加仕様として反映した。full と summary の `nodeId` 直前に置き、ゲームマスターを使わない従来経路は変更しない。details は根の nodeId を持たない既存形式のまま。
- 同一 node に複数のゲームIDがある場合、対応する既知の gameId または sg / bg の番号を優先する。未設定の場合は名前・副題（NFKC比較）・レア度・非凡種別・天性で候補を絞る。同一能力の重複IDなら最小番号を使い、異なる非凡IDが残って識別できない場合は null にする。実データのカズタカイザー・ユキオー・スペシャルウィーク2行はこの理由で null。対応するマスターがない場合も null。牝馬 v5 も既存牝馬の gameId 付与には使用するが、新馬の追加には使用しない。
- 新規の5マスター取得経路は通信エラー時のキャッシュ代替を明示的に無効にした。初回取得で版が不一致になると、その時点でキャッシュが作られるため、「CIはキャッシュがない」という前提だけでは再試行時の通信障害を隠すことが分かった。304のキャッシュ再利用と、旧 `load_pedigree_master` の挙動は維持する。
- 日次と金曜の調整処理を `GameUpdate` にまとめ、血統欄の構築は `PedigreeFields` を両性で共有した。
- 新しいビルドテストは `tests/test_daily_build.py` に分離した。既存52件のテスト本文と公開データを変更せずに検証するため。

### 実行した検証と結果

- 基準1〜13、15: `python -m pytest tests -q` — **168 passed in 81.59s**（Python 3.12、2026-10-10 最終確認）。段階1は91件、段階2は103件、段階3は120件、段階4は150件、仕様追加・ワークフローまで164件、レビューの回帰テスト追加後に168件で成功。
- 基準11: `python scripts/verify_dabimas_outputs.py --staging json --published json` — `[verify] OK (2957 horses)`。
- 基準12: 現行同士の `diff_dabimas_outputs.py` — `content_changed=false`。datasetVersion のみの差もテストで false。
- 基準10: 指定の4マスター・日次ビルドは3時刻とも終了コード0、生成物の C01〜C08 検証も成功。

  | as_of（JST） | added |
  |---|---|
  | 2026-10-07 22:00 | 3頭: sg101319 / sg101320 / sg101321 |
  | 2026-10-13 11:30 | 6頭: 上記 + sg101324 / sg101325 / sg101326 |
  | 2026-10-13 12:00 | 9頭: 上記 + sg1062 / sg1063 / sg1064 |

  300011 はいずれも excluded。11:30では sg1063 は skipped_future。牝馬マスターなしでは mares_disabled_reason と警告を確認。
  11:30 の CLI 通しでも `[verify] OK (2963 horses)`、差分は追加6頭・根の変更0頭・血統表141頭・血統辞書137件。

  | v6牝馬ありの as_of（JST） | 牝馬 added |
  |---|---|
  | 2026-10-08 11:30 | 0頭 |
  | 2029-12-31 23:59:59 | 0頭 |
  | 2030-01-01 00:00 | 7頭: bg283 / bg285 / bg287 / bg329 / bg343 / bg345 / bg346 |

  牝馬を含む2030年のCLI通しは終了コード0、合計2,977頭（種牡馬13頭＋牝馬7頭追加）で `[verify] OK (2977 horses)`。

- 基準6: 種牡馬2,377頭の指定された根の全項目が一致。牝馬500頭は `ヨ－クダリア` の name / ruby（公開: `ヨ－クダリア` / `よ－くだりあ`、ゲーム: `ヨ-クダリア` / `よ-くだりあ`）のみ例外で、残りは一致。日次で既存馬の根の表記は変更しない。
  男系祖先は名前と既存nullの3枠を除き一致。名前の変更は種牡馬40枠・牝馬4枠（計44枠）。指示書の見込み39枠に対し、採用した名前優先順位で実測した値を記録する。

  | pedigree_id | 旧 → 新 | 種牡馬の枠数 | 牝馬の枠数 |
  |---|---|---:|---:|
  | 0000334078 | Admiral Drake → アドミラルドレイク | 31 | 0 |
  | 0000335864 | Explodent → イクスプロウデント | 4 | 1 |
  | 0000334331 | Le Haar → ルアール | 3 | 3 |
  | 0000372708 | Giant's Causeway → ジャイアンツコーズウェイ | 1 | 0 |
  | 0000719305 | Harlan's Holiday → ハーランズホリデー | 1 | 0 |

  新たに解決したnullの3枠は以下。いずれも名前・系統・因子は不変で、nodeId / pedigreeId のみ設定される。

  | 馬ID | 祖先名 | parentLine / parentLineId / son / sonId | factors | 新nodeId / pedigreeId |
  |---|---|---|---|---|
  | s7665243173 | Sky-rocket | Ec / 1 / エクリプス系 / 1 | `["","",""]` | 0000336979-00 / 0000336979 |
  | s3315487267 | Symington | Ha / 11 / ハンプトン系 / 35 | `["","",""]` | 0000338273-00 / 0000338273 |
  | s3315487267 | Loved One | He / 15 / ヘロド系 / 55 | `["","",""]` | 0000337751-00 / 0000337751 |

- 基準13: `python scripts/bump_cache_name.py --file service-worker.js --date 20261002 --dry-run` — `dabimas-factor-v20261002-02`。実ファイルは変更なし。
- 基準14: 40行から `txt_to_png.py` でPNG生成、5MB未満をテストで確認。実際の6頭追加の画像も生成して表示確認済み。
- 基準15: PyYAMLで読み込み成功。ctx の実コードをテストし、12:05開始でも11:30固定、未来指定はdry_runのみ、タイムゾーンなしは拒否を確認。
- 基準16、17: 運用文書を作成。`git diff --stat 67d6a18 -- json service-worker.js index.html vue css` は空。小さなテスト・フィクスチャのみ強制追加し、実マスター・一時成果物は追跡していない。

### 残課題・気づき

実環境の R2 / X / 全書への接続、GitHub 上のワークフロー実行、push・マージは指示どおり行っていない。CI の Python 3.11 実行は未実施（手元は3.12、使用APIは3.11対応）。R2 側の牝馬 v6 の公開は採取側の作業であり、この変更には含めない。

### 最終レビュー

`code-review` スキルの指定に従い、`git diff 67d6a18...HEAD` を規約・仕様の2軸で独立レビューした。

#### Standards

規約違反1件: 実マスターが一部だけ配置されている環境の skip 判定不足。必要なファイルをすべて確認するよう修正。
判断事項2件: 日次と持ち越しの書き出し重複、および根の構築関数の多数の位置引数。書き出しの共有とキーワード専用引数化で対処。

#### Spec

誤実装3件: 同じnodeの非凡あり・なしを取り違える gameId、版不一致後の通信エラーをキャッシュが隠す問題、金曜のID引継ぎ後に既知gameIdが反映されない問題。上記の絞り込み・キャッシュ代替無効化・ID引継ぎ直後のgameId再付与で修正し、再現ケースのテストを追加。
エルコンドルパサー100082・キタサンブラック100061・ナリタブライアン100172・ハイセイコー100179の照合を実データで確認。

再レビューでは Standards の3指摘（規約違反1・判断事項2）、Spec の3指摘とも解消を確認。両軸の残件は0。

最終コードで `tmp/out`（2,963頭）と `tmp/out-mares`（2,977頭）を再生成し、両方の検証が成功。Python 3.11 の構文解析も成功。実マスターや一時成果物はコミット対象外。

---

## 検収記録

- 検収日: 2026-10-10（Claude Code セッション）
- 実装コミット: `b502161`〜`ff187c8`（8 本）

### 再実行した検証

| 基準 | 確かめ方 | 結果 |
|---|---|---|
| 1〜13・15 | `python -m pytest tests -q` | **168 passed**（60 秒） |
| 11 | `verify_dabimas_outputs.py --staging json --published json` | `[verify] OK (2957 horses)` |
| 12 | `diff_dabimas_outputs.py`（現行どうし） | `content_changed=false` |
| 10 | 実データで日次を 2 通り（10/13 11:30 と 12:00） | 終了コード 0。追加 **6 頭 / 9 頭**（指示書の想定どおり）。どちらも `[verify] OK`、既存馬の根の変更 0 |
| 追加仕様（gameId） | 生成物を直接確認 | summary・full とも全行にキーがあり、`searchText` と `nodeId` の間に入っている。新馬は `sg101319` など、値もゲーム内 ID と一致 |
| 実環境 | 枝を push し、`x_post.yml` を `dry_run=true`・`as_of=2026-10-13T11:30` で実行（run 38043550573） | **success**。生成・検証・差分・画像まで成功し、反映・push・X 投稿は正しく飛ばされた。成果物の summary は 2,963 頭で、**gameId が 2,959 行**（null は識別不能な種牡馬 4 頭のみ） |

牝馬の `gameId` は、R2 の牝馬マスターを渡す実環境では付く。手元で 4 ファイルだけを渡した通しでは牝馬 500 頭が null になるが、これは渡し方の違いで実装の問題ではない。

### 判定

**合格。** 修正は入れていない。完了報告の数値（168 件、+6 / +9、`[verify] OK`、名前の変更 44 枠）はいずれも再現した。

### 検収側で直したもの

- `CLAUDE.md`: データ更新の説明を「毎週金曜」から「日次 11:30 ＋ 週次 金 18:30」に更新し、`CACHE_NAME` の連番と運用文書への参照を追記
- `docs/branch-strategy.md`: 同じく 3 か所

### 本件とは別に見つかったこと

- **既存の週次更新が 3 週連続で失敗している**（9/25・10/02・10/09）。データの生成・コミット・push までは成功していて、落ちているのは X 投稿の手前で `RuntimeError: Missing env: X_CLIENT_ID`。リポジトリの Secret が外れている。新しいワークフローでも同じ経路なので、`X_CLIENT_ID` を入れ直さない限り失敗が続く
- 定期実行は 09:47 に起動して 11:30 まで眠る作りになっている。公開リポジトリなので費用はかからないが、1 回あたり 100 分ほど実行枠を占有する。GitHub の定期実行は遅れることはあっても早まらないので、cron 自体を 11:30 にして待機を省く手もある（`as_of` は固定なので結果は変わらない）

### 残っていること（着地の判断）

- この枝は `origin/main` より遅れている（`3aa18f7` を含んでいない）。取り込むと `json/` と `CACHE_NAME` が衝突するので、解消してから `main` へ入れる
- `main` に入れた時点で日次が有効になる。`release/2026-11`（11 月の UI 公開）とは独立した基盤の変更なので、**`main` へ直接入れるのが筋**だと考える。ダビ娘側は 2026-10-09 に公開済みで、`gameId` が入れば両者の突き合わせがすぐ効き始める
