# 作業指示書: 奇跡グループ ID の採番を安定化し、古い値の残存を止める（血統マスターパイプライン）

- status: 依頼中
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

<変更した全ファイルと、それぞれ何をしたか。バックアップの置き場所も書く>

### 設計判断

<指示書に書かれていなくて自分で判断したことがあれば、その内容と理由。なければ「なし」>

### 実行した検証と結果

<検証コマンドごとの実行結果。受け入れ基準の番号と対応させる>

### 再正規化の結果（基準4〜8）

<kiseki_group_id のユニーク数・4 件の衝突の解消・audit の件数・出力差分の内訳>

### 残課題・気づき

<スコープ外だが気づいた問題、やり残し。なければ「なし」>
