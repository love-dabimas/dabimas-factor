# 作業指示書: 奇跡グループ ID の採番を安定化し、古い値の残存を止める（血統マスターパイプライン）

- status: 完了（2026-09-03 検収済み。修正なし。実機 dump + R2 配置まで確認）
- 作成日: 2026-09-03
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- **対象リポジトリ: `C:\derby\data\pedigree_r2_pipeline`**（ダビふぁく本体とは別。この作業指示書だけ本体リポジトリに置いてある）
- 関連: `docs/pedigree-master-integration-design.md` §2.3 / §7.2.5
- **稼働影響:** R2 の血統マスターを作り直す必要がある。ダビふぁく側は `json/` の再生成が要る

## 背景と目的

`pedigree_master.json` の `kiseki_group_id`（奇跡グループ）に、**別々の実馬が同じ ID を持つ組が 4 件**ある。

```text
group 279  グリーングラス   (父インターメゾ・母ダーリングヒメ)
           グランディ       (父Great Nephew・母Word From Lundy)
group 292  サイテーション   (父ブルリー・母Hydroplane)
           Fair Copy       (父Fairway・母Composure)
group 302  Charlottesville (父Prince Chevalier・母Noorani)
           ジャイプール     (父ナスルーラ・母Rare Perfume)
group 317  エスケンデレヤ   (父Giant's Causeway・母Aldebaran Light)
           キタサンブラック  (父ブラックタイド・母シュガーハート)
```

**ゲーム側にこんなグループは存在しない。** 生ダンプ（`runs/<run>/raw/attempt-1/kiseki_groups.game.json`）を見ると、該当グループのメンバーは全部「同じ馬の通常版 + 覇煌」である。

```text
group 292  1941 = Fair Copy(通常)       + 15991 = Fair Copy-瞬煌
group 302  2640 = Charlottesville(通常) + 15990 = Charlottesville-覇煌
group 317  10724 = エスケンデレヤ(通常)  + 15983 = エスケンデレヤ-順覇
```

正しくはそれぞれ **1 グループ＝1 実馬**である。混入している 4 頭は、**古い採番のまま取り残された値**を持っている。

| 馬 | 出力の id | 正しい id（生ダンプ） |
|---|---:|---:|
| グリーングラス | 279 | **280** |
| サイテーション | 292 | **294** |
| ジャイプール | 302 | **305** |
| キタサンブラック | 317 | **321** |

### 原因は 2 か所

**原因1: 採番が位置依存である。** `agents/dump_pedigree_master_game.js` の `buildKisekiGroups()` は、ユニークなグループ集合を `members[0]` でソートしたあと **`i + 1` の連番**を振っている。

```js
groups.sort((a,b) => (a.members[0]-b.members[0]) || ...);
groups.forEach((g,i) => { const gid = i + 1; g.kiseki_group_id = gid; ... });
```

グループが 1 つ増えるだけで、それ以降の ID が全部ずれる。実際、ずれ幅の分布は `+1: 12件 / +2: 9件 / +3: 14件 / +4: 158件` で、過去に新グループが順次挿入されたことを示している。

**原因2: 古い値を上書きしない。** `src/normalize.py` の 943 行付近が、R2 の現行ファイルにある値と新ダンプの値が食い違ったとき、**現行値を残して audit に記録するだけ**になっている。

```python
for field in ("kiseki_group_id", "sire_line_id", "parent_sire_line", "child_sire_line"):
    raw_values = _unique([row.get(field) for row in raw_rows if row.get(field) not in (None, 0)])
    if len(raw_values) > 1:
        raise RuntimeError(...)
    if raw_values and pedigree.get(field) in (None, 0):
        pedigree[field] = raw_values[0]
    elif raw_values and pedigree.get(field) != raw_values[0]:
        audit["shared_field_differences"].append(entry)   # ← 記録するだけ。古い値のまま
```

この結果、**193 件の pedigree が古い ID を持ち続けている**（`runs/20260901T052449Z/audit.json` の `shared_field_differences` は 193 件すべて `kiseki_group_id`）。そのうち 4 件がたまたま他の馬の現行 ID と衝突した。

### なぜ直す必要があるか

ダビふぁく側は段階6 で奇跡の配合の判定を「馬名の文字列比較」から「`nodeId` / `kiseki_group_id` の一致」へ移す予定である。**いまのデータのまま `kiseki_group_id` を使うと、グリーングラスとグランディが「同じ馬」として奇跡判定に通る。**

現状は幸い実害ゼロである（この 4 ペアが奇跡判定の対象位置に同時に立つ組合せは全 120 万通り中 0 件）。しかしデータが増えれば踏む。**アプリ側は暫定的に `kiseki_group_id` を使わない方針にするので、こちらを直してから解禁したい。**

## 実装方針

### 変更対象ファイル

- `agents/dump_pedigree_master_game.js` — 採番を安定キーへ
- `src/normalize.py` — `kiseki_group_id` は新ダンプを正とする
- `tests/test_pipeline.py` — 回帰テストを追加

### 1. 採番を `members[0]` にする（`dump_pedigree_master_game.js`）

グループは「ゲーム内 pedigree id の集合」で、`members` は昇順ソート済み・重複除去済みである。**`members[0]`（そのグループの最小 ID）はグループを一意に識別できる。** 実データで検算済み。

```text
生ダンプ: group_count 475 / conflicts 0
  members[0] のユニーク数: 475 / 475  → 一意
  members[0] の範囲: 4 〜 20440
```

`conflicts` が 0（＝1 つの game id が 2 つのグループに属することがない）なので、`members[0]` が衝突することはない。

```js
groups.forEach((g) => {
  // 位置依存の連番だと、グループが1つ増えるだけで以降のIDが全部ずれる。
  // members は昇順ソート済みで、conflicts が 0 である限り members[0] は
  // グループを一意に識別できるので、これを安定キーとして使う。
  const gid = g.members[0];
  g.kiseki_group_id = gid;
  ...
});
```

- **ソート順は変えない。** `groups` の並び自体は現行のままでよい。
- `conflicts` の検出ロジックは現行のまま残す。**`conflicts` が空でないときは `members[0]` の一意性が保証されないので、そのときはエラーで停止すること**（現在は配列に貯めるだけ）。
- `id_policy` の文言を実態に合わせて更新する（`deterministic sequential local ID` ではなくなる）。

この変更で、既存の全 ID が 1 回だけ大きく変わる（1..475 → 4..20440）。**これは想定内**である。`kiseki_group_id` を永続化しているものは無い。

### 2. `kiseki_group_id` は新ダンプを正とする（`normalize.py`）

`kiseki_group_id` については、現行値と食い違ったら **`raw` を採用する**。ゲームのダンプが正であり、こちらに人手の訂正を入れる仕組みは無い。

```python
for field in ("kiseki_group_id", "sire_line_id", "parent_sire_line", "child_sire_line"):
    raw_values = _unique([row.get(field) for row in raw_rows if row.get(field) not in (None, 0)])
    if len(raw_values) > 1:
        raise RuntimeError(f"同一pedigree_id内で{field}が不一致です: {pid}")
    if not raw_values:
        continue
    if pedigree.get(field) in (None, 0):
        pedigree[field] = raw_values[0]
    elif pedigree.get(field) != raw_values[0]:
        entry = {"pedigree_id": pid, "field": field, "current": pedigree.get(field), "raw": raw_values[0]}
        if field == "kiseki_group_id":
            # ゲームのダンプが正。古い採番を残すと、別々の実馬が同じ
            # グループIDを持つ状態になる（2026-09-03 に 4 件発生）。
            pedigree[field] = raw_values[0]
            audit["applied_shared_field_changes"].append(entry)
        else:
            audit["shared_field_differences"].append(entry)
```

- **他の 3 フィールド（`sire_line_id` / `parent_sire_line` / `child_sire_line`）の挙動は変えない。** 実データではこの 3 つが食い違った実績が 1 件も無く（193 件すべて `kiseki_group_id`）、変える根拠が無い。ただし食い違ったときに気づけるよう、**`logger.warning` を 1 行足す**こと。
- `audit` に `applied_shared_field_changes` を新設し、上書きした件数が後から分かるようにする。

### 3. 回帰テストを追加（`tests/test_pipeline.py`）

既存の `unittest` スタイルに合わせる。

1. **`kiseki_group_id` が一意であること**: 正規化後の `pedigrees` について、`kiseki_group_id` が非 null のレコードで ID が重複しないこと。
2. **古い値が上書きされること**: 現行 master に古い `kiseki_group_id` を持つ pedigree を用意し、新ダンプに別の値を入れて正規化すると、出力が新ダンプ側の値になり `applied_shared_field_changes` に記録されること。
3. **他 3 フィールドは上書きされないこと**: 同じ状況を `sire_line_id` で作り、現行値が保たれて `shared_field_differences` に記録されること。
4. **`members[0]` 採番**: `buildKisekiGroups` 相当の入力から、グループ ID が `members[0]` になること。JS 側を Python から直接呼べないなら、`kiseki_groups.game.json` を読む側で「`kiseki_group_id == members[0]`」を検証するテストにしてよい。

## 制約

- **このリポジトリは git 管理下に無い。** 編集前に対象ファイルをコピーしてバックアップを取ること（`normalize.py.bak.<日付>` など）。作業後にバックアップを消さないこと。
- 端末からの再 dump は行わない。**既存の raw dump を使って検証する**（下記）。
- `pedigree_id` / `node_id` / `variant_code` の採番規則には触らない。
- R2 へのアップロードを勝手に行わない。検証は必ず `--dry-run`（または `--skip-upload`）で行う。
- 既存の検証（`validate.py` の E01〜E15）を弱めない。
- `runs/` 配下の過去の実行結果を書き換えない。

## スコープ外（やらないこと）

- 実際の R2 への再配置（依頼者が判断・実行する）
- ダビふぁく本体（`C:\derby\dabimasFactor_new`）の変更
- `sire_line_id` / `parent_sire_line` / `child_sire_line` の上書き挙動の変更（警告ログの追加だけ）
- 端末からの再 dump
- 過去 run の再生成
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

1. `python -m pytest tests/ -q`（または `python -m unittest`）が全件成功する。
2. 追加した回帰テスト 4 件が成功する。
3. **既存の raw dump を使った再正規化が成功する。** 端末は不要。

```bash
python run_pipeline.py --dry-run \
  --raw-dump runs/20260901T052449Z/raw/attempt-1 \
  --current-master runs/20260901T052449Z/current/pedigree_master.json \
  --current-game runs/20260901T052449Z/current/pedigree_master.game.json
```

4. **生成された `pedigree_master.json` で `kiseki_group_id` が一意になる。**
   - 現状: `kiseki` を持つ pedigree 475 件 / ユニーク ID 471 件 / 重複 `[279, 292, 302, 317]`
   - 修正後: **475 件 / ユニーク 475 件 / 重複なし**
5. **4 件の衝突が解消していること**を名前で確認する。グリーングラスとグランディ、サイテーションと Fair Copy、Charlottesville とジャイプール、エスケンデレヤとキタサンブラックが、**それぞれ別の `kiseki_group_id`** を持つこと。
6. **`audit.json` の `shared_field_differences` が 0 件になる**（193 件 → 0 件）。代わりに `applied_shared_field_changes` に上書き件数が出ること。
7. `kiseki_group_id` の値が `kiseki_groups.game.json` の各グループの `members[0]` と一致すること。
8. **他の出力が壊れていないこと。** 再正規化した `pedigree_master.json` / `pedigree_master.game.json` を、`runs/20260901T052449Z/output/` の同名ファイルと比較し、**差分が `kiseki_group_id` と `dataset_version` / `generated_at` 系だけ**であること。`pedigree_id` / `node_id` / `variant_code` / 父母参照 / 因子が 1 件も変わらないこと。
9. `validate.py` の検証（E01〜E15）が全部通ること。

## 検証コマンド

```bash
# バックアップ
copy src\normalize.py src\normalize.py.bak.20260903
copy agents\dump_pedigree_master_game.js agents\dump_pedigree_master_game.js.bak.20260903

# テスト
python -m pytest tests/ -q

# 既存 raw dump で再正規化（端末不要・R2 へ上げない）
python run_pipeline.py --dry-run \
  --raw-dump runs/20260901T052449Z/raw/attempt-1 \
  --current-master runs/20260901T052449Z/current/pedigree_master.json \
  --current-game runs/20260901T052449Z/current/pedigree_master.game.json
```

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。status は「依頼中」のまま変えないこと（完了への遷移は検収側が行う）。

### 変更ファイル一覧

- `C:\derby\data\pedigree_r2_pipeline\agents\dump_pedigree_master_game.js`: `members[0]` を奇跡グループの安定IDとして採用し、重複所属を検出した場合はdumpをエラー停止するようにした。出力2か所の `id_policy` も更新した。
- `C:\derby\data\pedigree_r2_pipeline\src\normalize.py`: `kiseki_group_id` の不一致だけraw値で上書きし、`applied_shared_field_changes` へ記録するようにした。他3フィールドは現行値を保持し、audit記録に加えてwarningを出すようにした。
- `C:\derby\data\pedigree_r2_pipeline\tests\test_pipeline.py`: 奇跡ID一意性、古い値の上書き、他共有フィールドの保持と警告、`members[0]` 採番と重複時停止の回帰テスト4件を追加した。
- `docs/codex-work-orders/2026-09-03-pipeline-kiseki-group-id.md`: 本完了報告を記入した。
- 編集前バックアップ: `C:\derby\data\pedigree_r2_pipeline\src\normalize.py.bak.20260903`、`C:\derby\data\pedigree_r2_pipeline\agents\dump_pedigree_master_game.js.bak.20260903`。指示どおり削除していない。
- dry-run成果物: `runs/20260902T213207Z/`（既存rawをそのまま使用）、`runs/20260902T213334Z/`（新ダンパー相当の安定IDを反映した一時rawを使用）。過去runは変更していない。

### 設計判断

- Frida端末なしでJS採番を回帰テストできるよう、採番と重複検査を純粋関数 `assignKisekiGroupIds()` に分離した。Node実行時だけCommonJS exportし、Frida上の `rpc.exports` とdump経路は維持した。
- `normalize.py` はlogger引数を受け取らないため、既存APIを変更せずモジュールloggerで他共有フィールドの不一致を警告した。
- 指示書例の `--raw-dump runs/.../attempt-1` はディレクトリだが、CLIは単一JSONを `read_json()` する実装なので、実行時は `runs/.../attempt-1/pedigree_master.game.json` を指定した。
- 既存rawは旧連番採番の成果物であり、端末からの再dumpは禁止されている。そのため、既存 `kiseki_groups.game.json` の475グループ集合から各 `members[0]` を既存rawのコピーへ反映した一時JSONを作り、新ダンパー相当の入力として2回目のdry-runを行った。一時JSONは検証後に削除した。

### 実行した検証と結果

- 基準1: `python -m pytest tests/ -q` → **38 passed / 1 skipped / 1 failed**。失敗は変更前にも再現した既存の `RunLockTest.test_orphan_process_lock_is_recovered` 1件で、本変更とは無関係。Windowsでは `os.kill(99999999, 0)` が `ProcessLookupError` ではなく `OSError(WinError 87)` となり、既存 `src/run_lock.py` がロックをstale扱いしないことが原因。スコープ外のため変更していない。したがって基準1の「全件成功」は未達。
- 基準1の切り分け: `python -m pytest tests/ -q -k "not test_orphan_process_lock_is_recovered"` → **38 passed / 1 skipped / 1 deselected**。
- 基準2: 追加した回帰テスト4件を指定実行 → **4 passed**。各機能を実装する前に、古い奇跡IDの残存、warning不在、JS採番関数不在の失敗を確認してからgreenにした。
- 基準3: 既存rawを単一JSONパスで指定した `run_pipeline.py --dry-run` → 終了コード0、run `20260902T213207Z`。端末接続・R2配置なし。
- 基準3・7: 既存グループ集合から `members[0]` を反映した一時rawによる `run_pipeline.py --dry-run` → 終了コード0、run `20260902T213334Z`。raw各game pedigreeから正規化後pedigreeへの奇跡ID不一致は0件。
- 基準9: 両dry-runとも `output_validation.errors=0`。E01〜E15のエラーなし。既存警告W08が1件ある。
- 追加確認: `python -m py_compile src/normalize.py tests/test_pipeline.py`、`node --check agents/dump_pedigree_master_game.js` → 成功。
- Standardsレビュー: 明確な規約違反0件、重大スメル0件。Specレビュー: 実装要件の欠落・誤実装・スコープクリープ0件。下記の指示書／既存テスト上の制約のみ指摘された。

### 再正規化の結果（基準4〜8）

既存rawをそのまま使ったrun `20260902T213207Z` では、奇跡IDを持つpedigreeが **475件 / ユニーク475件 / 重複なし**になった。`shared_field_differences` は **0件**、`applied_shared_field_changes` は **193件**。

- グリーングラス `280` / グランディ `279`
- サイテーション `294` / Fair Copy `292`
- Charlottesville `302` / ジャイプール `305`
- エスケンデレヤ `317` / キタサンブラック `321`

このrunを `runs/20260901T052449Z/output/` と比較すると、masterの差分195件は `kiseki_group_id` 193件とtop-levelの `dataset_version` / `generated_at` だけだった。gameの差分16189件は全nodeの `last_seen_at` とtop-levelの `dataset_version` / `generated_at` だけで、`pedigree_id` / `node_id` / `variant_code` / 父母参照 / 因子の差分は0件。

新しい `members[0]` 採番を反映したrun `20260902T213334Z` では、奇跡IDが **475件 / ユニーク475件 / 範囲4〜20440 / 重複なし**。`shared_field_differences` は **0件**、`applied_shared_field_changes` は **475件**、rawから出力へのID不一致は **0件**だった。

- グリーングラス `1266` / グランディ `1254`
- サイテーション `2276` / Fair Copy `1941`
- Charlottesville `2640` / ジャイプール `2707`
- エスケンデレヤ `10724` / キタサンブラック `10732`

旧出力との差分はmasterが `kiseki_group_id` 475件と生成時刻/version、gameが全nodeの `last_seen_at` と生成時刻/versionだけで、識別子・父母参照・因子の差分は0件。端末再dumpを行っていないため、実在する旧 `kiseki_groups.game.json` は依然として旧連番（`kiseki_group_id == members[0]` は0/475）だが、純粋関数の回帰テストと上記派生rawのdry-runで新ダンパーが生成する契約を検証した。

### 残課題・気づき

- 既存のWindows用RunLockテスト1件が失敗するため、受け入れ基準1の全件成功は未達。`src/run_lock.py` のWindowsにおける不存在PID判定は別作業で修正が必要。
- 新しい `kiseki_groups.game.json` 実物の確認には、次回の許可された端末dumpが必要。今回は禁止事項に従い実施していない。
- 指示書の検証コマンドは `--raw-dump` にディレクトリを渡しており、そのままでは実行できない。実際には `pedigree_master.game.json` のファイルパスが必要。
- validationのW08（牝馬として参照される一部pedigreeに標準nodeがない）が1件残るが、本変更前からの既存警告である。

---

## 検収記録（2026-09-03・Claude Code）

### 判定

**合格。修正なし。** 受け入れ基準を再実行・独立検証した。基準1 だけ形式上は未達だが、原因は本作業と無関係な既存不具合で、完了報告の切り分けが正しかった。

**検収中に、実機 dump を伴う本番 run が完了して R2 へ配置されていることを確認した。** これにより、机上検証にとどまっていた基準7 が実データで裏付けられた。

### 受け入れ基準の検証結果

| # | 内容 | 結果 |
|---|---|---|
| 1 | テスト全件成功 | **形式上は未達**。38 passed / 1 skipped / **1 failed**。失敗は `RunLockTest::test_orphan_process_lock_is_recovered` で、本変更と無関係な既存の Windows 固有不具合（下記） |
| 2 | 追加した回帰テスト 4 件 | 合格。`test_normalized_kiseki_group_ids_are_unique` / `test_raw_kiseki_group_id_replaces_stale_current_value` / `test_non_kiseki_shared_field_keeps_current_value_and_warns` / `test_kiseki_group_assignment_uses_minimum_member_and_rejects_overlap` |
| 3 | 既存 raw での再正規化 | 合格。2 つの dry-run がどちらも `status: succeeded` / `published: false` |
| 4 | `kiseki_group_id` の一意性 | 合格。**475 件 / ユニーク 475 / 重複なし**（現状 471・重複 `[279,292,302,317]` から解消） |
| 5 | 4 件の衝突解消 | 合格（下記） |
| 6 | `shared_field_differences` が 0 | 合格。**193 → 0**、`applied_shared_field_changes` に振り替え |
| 7 | `kiseki_group_id == members[0]` | **合格。実機 dump で 475/475**（下記） |
| 8 | 出力差分の内訳 | 合格。差分は `kiseki_group_id` 475 件と `dataset_version` / `generated_at` / `last_seen_at` だけ（下記） |
| 9 | `validate.py` の検証 | 合格。3 つの run すべて `output_validation.errors = 0` |

### 基準1 の未達は本作業と無関係

`src/run_lock.py` は今回**変更されていない**（mtime 08-29、変更 3 ファイルは 09-03）。失敗の原因も再現確認した。

```text
Windows: os.kill(99999999, 0) → OSError(WinError 87, errno 22)
run_lock.py:59  except OSError: pass   ← stale と判定せず素通り
```

Linux なら `ProcessLookupError` が飛んで stale 判定できるが、Windows では OSError になるためロックが残る。**このテストは Linux 前提で、Windows では通らない。** 本作業のスコープ外という完了報告の判断は妥当。

ただし**実害はある**。プロセスが落ちた場合、`state/pipeline.lock` が 12 時間残り、その間パイプラインを再実行できない。同ファイルにある `test_reused_pid_owned_by_other_command_is_recovered` は `/proc` の有無で skip しているので、**この test も同様に Windows では skip するか、`run_lock.py` 側を Windows 対応にする**のが筋。別件として起票を勧める。

### 基準5: 4 件の衝突は解消した

| 馬 | 修正前 | 修正後（本番 run） |
|---|---:|---:|
| グリーングラス | 279 | **1266** |
| グランディ | 279 | **1254** |
| サイテーション | 292 | **2276** |
| Fair Copy | 292 | **1941** |
| Charlottesville | 302 | **2640** |
| ジャイプール | 302 | **2707** |
| エスケンデレヤ | 317 | **10724** |
| キタサンブラック | 317 | **10732** |

### 基準7 は実機 dump で裏が取れた

完了報告は「端末の再 dump をしていないので、実在する `kiseki_groups.game.json` は旧連番のまま（0/475）。純粋関数の回帰テストと合成 raw で契約を検証した」と留保していた。これは誠実な報告である。

検収中に確認したところ、**端末 dump を伴う本番 run `20260903T071003Z` が 2026-09-03 16:13 JST に完了していた**。その raw を見ると留保は解消している。

```text
runs/20260903T071003Z/raw/attempt-1/kiseki_groups.game.json
  475 / 475 が members[0] 採番
  id_policy: "stable game pedigree ID of minimum group member"
  conflicts: 0
```

出力側も `kiseki` 保持 475 件 / ユニーク 475 / 重複なし / 範囲 4〜20440、`shared_field_differences` 0 件、`output_validation.errors` 0 件。

### 基準8: 出力差分の内訳

`runs/20260902T213334Z/output` と `runs/20260901T052449Z/output` を全レコード比較した。

```text
pedigree_master.json
  top-level 差分      : dataset_version / generated_at のみ
  pedigree_id 集合の差 : 0
  レコード差分         : kiseki_group_id 475 件のみ（他フィールドの差分 0）

pedigree_master.game.json
  node_id 集合の差 : 0
  レコード差分      : last_seen_at 16187 件のみ
```

**`pedigree_id` / `node_id` / `variant_code` / 父母参照 / 因子は 1 件も変わっていない。** 採番方式を変える変更で巻き添えが出ていないことを確認できた。

### 受け入れた設計判断

- **採番と重複検査を純粋関数 `assignKisekiGroupIds()` へ分離し、Node からも呼べるよう CommonJS export を足した。** Frida 実行時の `rpc.exports` と dump 経路は維持されている。端末なしで採番を回帰テストできるようになったのは良い改善。
- **`conflicts` が空でないときに例外で停止するようにした。** 指示書どおり。`members[0]` の一意性が崩れたまま出力するより落ちるほうが安全。
- **他 3 フィールドは現行値保持のまま、`logger.warning` を追加。** 指示書どおりで、実データでの発生も 0 件。
- **指示書の検証コマンドの誤りを実行時に修正した。** `--raw-dump` にディレクトリを書いていたが、CLI は単一 JSON を読む実装だった。指示書側の誤り。

### 重要な申し送り: R2 が更新された

本番 run が **R2 へ配置済み**である。

```text
dataset_version : 2026-09-03T071324Z+raw.bfe55ddd0585
pedigree_count  : 14780
node_count      : 16190   （前回 16187 から +3）
published       : true
```

したがって**ダビふぁく本体の `json/` は古い**。次のことが要る。

1. `json/` を再生成する（GitHub Actions の Build Dabimas Stream を `--pedigree-dataset-version 2026-09-03T071324Z+raw.bfe55ddd0585` で実行）。
2. `json/pedigreeNodes.json` の `datasetVersion` が上記に変わるので、`service-worker.js` の `CACHE_NAME` も上げる。
3. これまでの実測値（クロス群の平均など）は `2026-09-01T052756Z+raw.f7018232c481` 基準なので、段階5・6 の指示書を書くときは新しい版で測り直す。

### 段階6 への影響

`kiseki_group_id` が正しくなったので、**段階6 で奇跡判定に `kiseki_group_id` を使う道が開いた**。ただし新データでの再確認が要る。

- 修正前の測定では、4 ペアが奇跡判定の対象位置に同時に立つ組合せは全 120 万通り中 0 件だった。
- 修正後は 4 ペアが別 ID になったので、そもそも「別の実馬が同じグループ」という状態自体が消えた。**設計資料 §2.3 の「`pedigree_id` では代用不可」という主張は、この修正で根拠を失う。**
- 段階6 の指示書を書くときに、新しい R2 データで「475 グループがすべて 1 pedigree か」を測り直し、そのうえで `kiseki` を使うか `pedigreeId` で足りるかを決めること。
