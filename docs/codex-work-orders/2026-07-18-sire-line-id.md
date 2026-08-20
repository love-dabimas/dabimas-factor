# 作業指示書: 系統ID（親系統・子系統）・レア度付与（スクレイパー＋アプリ側パススルー）

- status: 完了（2026-07-18 検収済み・同日 JSON 全量再生成済み）
- 作成日: 2026-07-18
- 依頼元: Claude Code セッション

## 背景と目的

- 相性（ニックス）診断（`docs/dabifaku_unified_spec_draft.md` §25。**本指示書のスコープ外**）の前提として、馬データに親系統ID・子系統ID・種牡馬レア度を付与する。
- **詳細設計は `docs/sire-line-id-design.md` を正とする**。変更内容・IDマスターの全量（付録の表）・互換性方針はすべて同設計書に従う。設計書と現行コードに矛盾を見つけた場合は、勝手に解釈せず実装を止めて完了報告に書くこと。
- 本件は連続する 3 件の指示書の 2 件目（1 件目 `2026-07-18-save-horse-status-bar.md` は検収済み）。3 件目（相性表示）は本件の検収後に別途依頼する。
- **重要な作業分担**: この環境からダビマス全書（dabimas.jp）への実スクレイピングは行わない。Codex の担当は「スクレイパーのコード変更＋オフラインで検証可能なユニットテスト＋アプリ側パススルー」まで。全量実行と JSON 再生成（設計書 §6 の 2〜5）はユーザーが後日実施する。

## 実装方針

設計書 §4 の変更内容を、以下の現行コードのアンカーに沿って実装する。

1. **IDマスター CSV 新規作成**: `scripts/data/sire_line_bases.csv`（15行）と `scripts/data/sire_lines.csv`（58行、`base_abbr` 列含む）。内容は設計書「付録: IDマスター表」が正。UTF-8 BOMなし・ヘッダー行あり（設計書 §4.1）。
   - 既存の `data/sire_lines_public.json`（`sireLines[]`: id / name / sireLineBaseId / baseName / baseAbbr）と id・name・対応関係が完全一致することを機械照合すること（相性診断側はこの JSON を参照するため、ズレは事故になる）。
2. **スクレイパー変更** `scripts/build_dabimas_stream.py`（現行 935 行）:
   - 起動時 CSV 読込 → `SIRE_LINE_DICT`（子系統名 → sonId / parentLineId / abbr）構築（設計書 §4.2-1）。
   - `PARENTAL_LINE_DICT`（`:99` の58件ハードコード辞書）廃止。**削除前に** (名前, 略号) 58件が CSV と完全一致することを機械確認し、結果を完了報告に記録する（設計書 §4.2-2 / §6-1）。`get_parent_line_name()`（`:224`）は descendants 用にそのまま残す。
   - `all_row_to_dabifac_entry()`（`:587`）: 自身に `parentLineId` / `sonId` / `rare` を追加、descendants ループ（15件、`son` 名から解決）にも `parentLineId` / `sonId` を追加（設計書 §4.2-3/5/7。descendants の `parentLine` 略号は既存の `get_parent_line_name()` 由来のまま変えない）。
   - `entry_to_summary()`（`:659`）: `parentLineId` / `sonId` / `rare` を追加（設計書 §4.2-4/7）。
   - 未知系統名・不正レア度の警告と集計（設計書 §4.2-6/7）: 出力は継続しつつ `[warn] unknown sire line: <系統名> (<識別子>)` / `[warn] invalid rare: <値> (<識別子>)` を記録・カウントし、`--fail-on-error`（`:763`）指定時は 1 件でもあれば終了コード 1。識別子は `HD_HORSE_ID` の値でよい。空文字の系統名は警告なしで null。牝馬の `rare` は警告なしで null 固定。
3. **アプリ側パススルー** `vue/app/methods/horse-loading.js` の `normalizeHorseSummary()`（`:25`）: 設計書 §4.4 のスニペットどおり `rare` / `parentLineId` / `sonId` を追加（number 以外は null に正規化）。full JSON フォールバック経路・descendants 経路は変更不要（設計書 §4.4 に理由記載）。
4. **ユニットテスト追加** `tests/test_build_dabimas_stream.py`（既存 8 件・importlib でモジュール読込する流儀に合わせる）:
   - CSV マスターの整合性（58件・id 一意・親系統 id 有効・`data/sire_lines_public.json` と一致）
   - 自身・descendants への `parentLineId` / `sonId` 付与（既知系統名の ALL 行フィクスチャで検証）
   - 未知系統名 → null ＋ カウント、空文字 → null・警告なし
   - 種牡馬 `rare` 1〜5 の整数化、範囲外 → null ＋ カウント、牝馬 → null 固定
   - summary への 3 フィールド反映

### 変更対象ファイル（設計書 §7 と同一）

- `scripts/data/sire_line_bases.csv` — 新規（IDマスター）
- `scripts/data/sire_lines.csv` — 新規（IDマスター）
- `scripts/build_dabimas_stream.py` — CSV読込・辞書置換・entry/summary への ID・rare 出力・警告集計
- `vue/app/methods/horse-loading.js` — `normalizeHorseSummary()` パススルー追加
- `tests/test_build_dabimas_stream.py` — テスト追加

## 制約

- `AGENTS.md` の Safety Rules に従うこと。
- 既存 JSON フィールドの変更・削除・リネームをしない（**追加のみ**。設計書 §4.3 / §5）。summary / detail の `version` は据え置き。
- 系統名→略号（`parentLine`）の解決結果が 1 件でも変わってはならない（設計書 §4.2-2）。
- 新規 CSV・変更ファイルは UTF-8 BOM なし。
- git の commit / branch / restore / stash 操作を一切行わない。作業ツリーの既存未コミット変更（統合版＋前指示書の実装）に触れない。

## スコープ外（やらないこと）

- **ネットワークアクセス・実スクレイピング・`json/` 配下のデータ再生成**（全量実行はユーザーが実施）。
- 相性診断ロジック（統合版仕様 §25）: `vue/logic/nicks/`・`vue/logic/theory/affinity.js`・`assets/`・`data/` に触れない（`data/sire_lines_public.json` は**読み取り照合のみ**）。
- アプリ側への系統マスター同梱・名前→ID再解決フォールバック（3 件目の指示書の担当。設計書 §4.4 末尾に予告があるが実装しない）。
- 牝馬のレア度の仕様化（設計書 §4.2-7 のとおり null 固定のみ）。
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

1. `python -m pytest -q` が既存分含め**全件成功**する（追加テストは上記 4 の観点を網羅していること）。
2. 旧 `PARENTAL_LINE_DICT` と `scripts/data/sire_lines.csv` の (名前, 略号) 58 件の完全一致確認が、削除**前**に機械的に実行され、結果（一致件数）が完了報告に記録されている。
3. `scripts/data/sire_lines.csv` ⇔ `data/sire_lines_public.json` の id・name・親系統対応の完全一致がテストまたは照合スクリプトで確認されている。
4. `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp index.html` が `[verify] OK` を返す。
5. 旧形式 summary（ID なし）でもアプリが従来どおり起動する: ローカル配信＋ `dump-dom`（VirtualTimeBudget **30000**。既定の 12000 では Vue マウント前の DOM しか取れないことがある）でマウント後の DOM が取得でき、血統表・ステータスバーの DOM が存在する。
6. `--limit` 付きの実行手順（ユーザーが後日行う全量実行・検証手順。設計書 §6 の 2〜5 に対応するコマンド列）が完了報告に整理されている。

## 検証コマンド

```powershell
# ユニットテスト
python -m pytest -q

# アプリ側ガード
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp index.html

# 起動回帰（リポジトリルートで配信してから）
python -m http.server 8080
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 dump-dom http://localhost:8080/index.html 390 844 30000
```

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。

### 変更ファイル一覧

- 新規: `scripts/data/sire_line_bases.csv`（親系統15件）
- 新規: `scripts/data/sire_lines.csv`（子系統58件）
- 変更: `scripts/build_dabimas_stream.py`（CSVマスター読込、ID・レア度出力、警告集計、`--fail-on-error` 連動）
- 変更: `vue/app/methods/horse-loading.js`（summary の `rare` / `parentLineId` / `sonId` パススルー）
- 変更: `tests/test_build_dabimas_stream.py`（マスター・変換・警告・CLIテストを5件追加、合計13件）
- 完了報告記入: `docs/codex-work-orders/2026-07-18-sire-line-id.md`

### 設計判断

- `sire_lines.csv` は `scripts/build_dabimas_stream.py` からの相対位置ではなく `__file__` 基準で読み込み、実行時カレントディレクトリに依存しないようにした。
- 旧 `PARENTAL_LINE_DICT` を削除する前に、CSVとの `(系統名, 略号)` 集合を機械照合し、**58/58件完全一致**を確認した。既知系統の `parentLine` はCSVの `base_abbr`、未知・空欄は既存 `get_parent_line_name()` フォールバックを使うため、既存略号の解決結果を維持する。
- 未知系統と不正レア度は出力を継続しつつモジュール内カウンタへ集計し、CLI開始時にリセットする。`--fail-on-error` は取得/解析エラーに加えて両警告カウンタも終了コード1の条件にした。
- 種牡馬の `rare` だけを1〜5へ整数化し、牝馬は入力値を読まず常に null とした。
- アプリ側は設計スニペットどおり `typeof ... === "number"` の値だけを通し、旧summaryの欠損値・文字列値は null に正規化する。
- git の commit / branch / restore / stash は実行していない。ネットワークアクセス、実スクレイピング、`json/` 再生成も実行していない。

### 実行した検証と結果

- 旧 `PARENTAL_LINE_DICT` と `scripts/data/sire_lines.csv`: `(名前, 略号)` **58/58件完全一致**（辞書削除前に実行）。
- CSVマスターテスト: 親系統15件、子系統58件、ID一意、親ID有効、親略号整合、`data/sire_lines_public.json` の id / name / sireLineBaseId / baseName / baseAbbr と全58件完全一致。
- 変換テスト: 自身とdescendants 15件への `parentLineId` / `sonId`、既存 `parentLine` 略号、summary 3フィールドを確認。
- 警告テスト: 自身・descendants の未知系統は null＋警告＋カウント、空文字は null・警告なし。不正レア度4種は null＋警告＋カウント、種牡馬1〜5は整数、牝馬は常に null・警告なし。
- CLIモックテスト: 警告があってもJSON出力を継続し、`--fail-on-error` ありは終了コード1、なしは0になることをオフライン確認。
- `python -m pytest -q`: **13 passed**。
- `verify-index-exp index.html`: `[verify] OK`。
- 旧形式summaryでの起動回帰: 390×844、VirtualTimeBudget 30000 の `dump-dom` で Vue マウント後の `data-app`、血統表 `.table_main`、`.combination-status-bar` を確認。TypeError / ReferenceError / Vue warn なし。
- Python/JavaScript構文、`git diff --check`、対象5ファイルのUTF-8 BOMなしを確認。
- TDD後の Standards / Spec 自己レビュー: 指摘0件。

### ユーザー向け: 全量実行・検証手順（設計書 §6 の 2〜5）

1. まず20件だけ取得し、警告0で完了することを確認する。

```powershell
New-Item -ItemType Directory -Force .\tmp\sire-line-check | Out-Null
python .\scripts\build_dabimas_stream.py `
  --limit 20 `
  --output .\tmp\sire-line-check\dabimasFactor.limit20.json `
  --summary-output .\tmp\sire-line-check\dabimasFactor.summary.limit20.json `
  --details-output-dir .\tmp\sire-line-check\details `
  --all-output .\tmp\sire-line-check\all.limit20.ndjson `
  --workers 4 `
  --delay 0.3 `
  --fail-on-error
```

終了行が `errors=0, unknown_sire_lines=0, invalid_rares=0` で、終了コード0であることを確認する。

2. 少量出力の自身・descendants・summary/detailを機械確認する。

```powershell
@'
import csv, json
from pathlib import Path

root = Path("tmp/sire-line-check")
full = json.loads((root / "dabimasFactor.limit20.json").read_text(encoding="utf-8"))["horseLists"]
summary = json.loads((root / "dabimasFactor.summary.limit20.json").read_text(encoding="utf-8"))["horseLists"]
with Path("scripts/data/sire_line_bases.csv").open(encoding="utf-8", newline="") as fp:
    base_abbr = {int(row["id"]): row["abbr"] for row in csv.DictReader(fp)}

assert full and len(full) == len(summary)
assert all(h["parentLineId"] is not None and h["sonId"] is not None for h in full)
assert all(h["parentLine"] == base_abbr[h["parentLineId"]] for h in full)
assert all(d["parentLineId"] is not None and d["sonId"] is not None for h in full for d in h["descendants"])
assert all(d["parentLine"] == base_abbr[d["parentLineId"]] for h in full for d in h["descendants"])
assert all(all(key in h for key in ("rare", "parentLineId", "sonId")) for h in summary)

detail_horses = []
for path in sorted((root / "details").glob("dabimasFactor.details.*.json")):
    detail_horses.extend(json.loads(path.read_text(encoding="utf-8"))["horseDetails"])
assert {h["id"] for h in detail_horses} == {h["id"] for h in summary}
assert all(all("parentLineId" in d and "sonId" in d for d in h["descendants"]) for h in detail_horses)
print(f"limit verification OK: {len(full)} horses")
'@ | python -
```

3. 少量検証が通った後、全量を本番JSONパスへ再生成する。実行前に必要なら既存JSONを別途退避する。

```powershell
python .\scripts\build_dabimas_stream.py `
  --output .\json\dabimasFactor.json `
  --summary-output .\json\dabimasFactor.summary.json `
  --details-output-dir .\json\dabimasFactor-details `
  --all-output .\tmp\sire-line-check\all.full.ndjson `
  --workers 8 `
  --delay 0.3 `
  --fail-on-error
```

終了行が `errors=0, unknown_sire_lines=0, invalid_rares=0` かつ終了コード0であることを確認する。

4. 全量JSONのID・レア度・summary/detail反映を検証する。

```powershell
@'
import csv, json
from pathlib import Path

full = json.loads(Path("json/dabimasFactor.json").read_text(encoding="utf-8"))["horseLists"]
summary_obj = json.loads(Path("json/dabimasFactor.summary.json").read_text(encoding="utf-8"))
summary = summary_obj["horseLists"]
with Path("scripts/data/sire_line_bases.csv").open(encoding="utf-8", newline="") as fp:
    base_abbr = {int(row["id"]): row["abbr"] for row in csv.DictReader(fp)}

assert summary_obj["version"] == 1
assert all(h["parentLineId"] is not None and h["sonId"] is not None for h in full)
assert all(h["parentLine"] == base_abbr[h["parentLineId"]] for h in full)
assert all(d["parentLineId"] is not None and d["sonId"] is not None for h in full for d in h["descendants"])
assert all(d["parentLine"] == base_abbr[d["parentLineId"]] for h in full for d in h["descendants"])
assert all(isinstance(h["rare"], int) and 1 <= h["rare"] <= 5 for h in full if h["sex"] == "0")
assert all(h["rare"] is None for h in full if h["sex"] == "1")
assert {h["id"] for h in full} == {h["id"] for h in summary}
assert all(all(key in h for key in ("rare", "parentLineId", "sonId")) for h in summary)

detail_count = 0
for path in sorted(Path("json/dabimasFactor-details").glob("dabimasFactor.details.*.json")):
    obj = json.loads(path.read_text(encoding="utf-8"))
    assert obj["version"] == 1
    for horse in obj["horseDetails"]:
        assert all(d["parentLineId"] is not None and d["sonId"] is not None for d in horse["descendants"])
        detail_count += 1
assert detail_count == len(full)
print(f"full verification OK: {len(full)} horses")
'@ | python -
```

5. ★1〜★4の種牡馬を数件サイト表示と目視照合した後、新JSONでアプリ回帰を確認する。

```powershell
python -m http.server 8080
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 dump-dom http://localhost:8080/index.html 390 844 30000
```

血統表・ステータスバーの描画に加え、候補検索、種牡馬/繁殖牝馬の選択、配合理論判定が従来どおり動くことをPC・モバイルで確認する。

### 残課題・気づき

- 指示どおり実サイトへのアクセス、`--limit 20`、全量スクレイピング、JSON再生成は未実施。上記手順をネットワーク利用可能な環境で実行する必要がある。
- ★1〜★4種牡馬のサイト表示との目視照合、新JSONを使ったPC・モバイル操作回帰も全量生成後の検収項目として残る。
- 設計書と現行コードの矛盾、旧58件辞書とCSVの差異、公開JSONとの差異は見つからなかった。

---

## 検収記録（Claude、2026-07-18）

- 受け入れ基準 1: `python -m pytest -q` を再実行 → 13 passed。追加テストは指示書の 4 観点（マスター整合・ID付与・警告挙動・レア度・CLI の fail-on-error 連動）を網羅していることをコードレビューで確認。
- 受け入れ基準 2: 旧 `PARENTAL_LINE_DICT` を `git show HEAD:` から独自に復元し、`sire_lines.csv` の (name, base_abbr) と照合 → **58/58 完全一致**（Codex の報告を独立に再確認）。
- 受け入れ基準 3: `sire_lines.csv` ⇔ `data/sire_lines_public.json` の id / name / sireLineBaseId / baseAbbr を独自スクリプトで照合 → **58/58 完全一致**。CSV の id 一意性・親系統 id 有効性・略号整合も確認。
- 受け入れ基準 4: `verify-index-exp index.html` 再実行 → `[verify] OK`。
- 受け入れ基準 5: ローカル配信＋`dump-dom 390×844 30000` 再実行 → Vue マウント済み DOM（`data-app`）・ステータスバー DOM を確認、ReferenceError / TypeError なし。
- 受け入れ基準 6: 全量実行手順が記載され、手順中の CLI フラグ（`--summary-output` / `--details-output-dir` / `--all-output`）が実在することを確認。
- コードレビュー: スクレイパーの変更は設計書 §4.2 に忠実（略号は CSV 優先＋既存フォールバック維持、descendants の略号経路は不変、牝馬 rare は null 固定、警告カウンタは CLI 開始時リセット）。`normalizeHorseSummary()` は設計書 §4.4 のスニペットどおり。差し戻し事項なし。
- 気づき（Codex の責ではない既存事情）:
  - `.gitignore` の `tests/*` により `tests/test_build_dabimas_stream.py` は git 管理外。**コミット時は `git add -f tests/test_build_dabimas_stream.py` が必要**（さもないと追加テストがリポジトリに残らない）。
  - `scripts/__pycache__/*.pyc` が git 追跡されており、テスト実行で diff が発生する（実害なし。いずれ `.gitignore` 追加を検討）。
- 残: ユーザーによる全量実行（完了報告の手順 1〜5）と、★数のサイト目視照合・新 JSON でのアプリ回帰。

## 全量再生成の実施記録（Claude、2026-07-18）

- 旧 JSON を `tmp/json-backup-20260718/` へ退避したうえで、完了報告の手順 1〜5 を実施した。
- **予行（--limit 20）で既存の潜在バグを検出・修正**: `parse_stallion()` の星数カウントが同一 td 内の因子アイコン画像も数えており、レア度が 6〜8 になる馬が 18 頭中 10 頭発生（`--fail-on-error` が設計どおり検知）。実ページの DOM を取得して原因を確認し、`stallion_list_star.png` の画像のみを数えるよう `scripts/build_dabimas_stream.py` を修正（星数は従来「重複スキップ判定」にしか使われておらず、既存出力への影響はない）。修正後の予行は警告 0・exit 0。pytest 13 件成功維持。
- 全量実行: 2,873 頭（種牡馬 2,375）、`errors=0, unknown_sire_lines=0, invalid_rares=0`、exit 0。
- 全量検証スクリプト: 全アサーション通過。レア度分布 {★1:61, ★2:39, ★3:167, ★4:237, ★5:1871}、牝馬は全件 null。DOM 目視で★5 と確認した馬（s3315497239）の `rare=5` 一致。
- 新 JSON でのアプリ起動回帰: `dump-dom 390×844` で Vue マウント・ステータスバー描画・エラーなしを確認。PC・モバイルの実操作回帰は引き続きユーザー確認事項。
