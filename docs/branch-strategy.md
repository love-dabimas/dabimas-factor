# 枝の運用（2リポジトリ版）

更新日: 2026-09-13

ダビふぁく単体なら「`main` から切って `main` へ戻す」だけで済んでいたが、
ダビ娘を取り込んでからは**2つのリポジトリにまたがり、公開順に制約がある**。
さらに**統合版の本番稼働は 2026年11月**で、それまで2か月ぶんの成果を未公開で
持ち続けることになる。ここが混乱しやすいので、現状と決まりを1枚にまとめる。

## 0. 要点

- 統合版（ダビ娘統合＋配合理論補助）の公開は **11月**。それまで `main` へは出さない。
- 溜める先は **`release/2026-11` の1本**。ここが統合点になる。
- **機能の枝は `release/2026-11` から切り、そこへ戻す。** `main` からは切らない。
- `main`（本番）は週次でデータが自動更新されるので、**週に一度 `release/2026-11` へ取り込む**。
- 11月に `release/2026-11` → `main` を一回で行う。ダビ娘側を先に公開する（§3）。

## 1. 何が本番か

| リポジトリ | 本番 | URL |
| --- | --- | --- |
| `love-dabimas/dabimas-factor`（ダビふぁく） | `main` | `https://love-dabimas.github.io/dabimas-factor/` |
| `love-dabimas/dabimas-data`（ダビ娘） | `main` | `https://love-dabimas.github.io/dabimas-data/dist/` |

どちらも**`main` へ push した時点で本番に出る**。ステージング環境は無い。
公開前の確認方法は §5。

## 2. いまの枝（2026-09-13 時点）

### ダビふぁく

| 枝 | 状態 | 中身 |
| --- | --- | --- |
| `main` | 公開中 | 本番。週次でデータと `CACHE_NAME` が自動更新される |
| **`release/2026-11`** | **統合点** | 11月に出すものを溜める。`feature/musume-integration` から作成 |
| `feature/musume-integration` | 取り込み済み | ダビ娘統合。`release/2026-11` の元。以後はこちらを触らない |
| `feature/haigou-theory-assist` | 未公開 | 配合理論補助の設計書 |
| `chore/repo-workflow` | 未公開 | この文書と `.gitignore` の修正 |

設計書と運用文書（`feature/haigou-theory-assist` / `chore/repo-workflow`）は
コードを含まないので、11月を待たず `main` へ入れてよい。

### ダビ娘

| 枝 | 状態 | 中身 |
| --- | --- | --- |
| `main` | 公開中 | 本番 |
| `feature/embed-mode` | **未公開**・上流なし | 埋め込みモード（`?embed=1` / `?picker=1`） |

`main` との差は1コミットだけ（`7eb0385`）。

## 3. 公開順（11月にこの順でやる）

溜めたものを出すのは11月。そのとき**この順番を守る。**

```
1. ダビ娘   （embed-mode ＋ カード項目・絞り込み）→ main
2. ダビふぁく（release/2026-11）           → main
```

**逆にすると壊れる。** ダビふぁくを先に出すと、埋め込んだダビ娘に ❤ も馬選択も
絞り込みも出ない。ダビ娘を先に出しても、単体で開いたときの見た目は変わらないので
（埋め込みの挙動はクエリで切り替わる）、先に出して困ることはない。

ダビふぁく側だけを見ていると気づけないので、公開のときは必ずこの順番を確認する。

## 4. どこから枝を切るか

11月の統合版に入るものは、**すべて `release/2026-11` から切って、そこへ戻す。**

| 触るもの | 枝の元 | 戻す先 |
| --- | --- | --- |
| 11月の統合版に入る変更 | `release/2026-11` | `release/2026-11` |
| 設計書・運用文書など、コードを含まないもの | `main` | `main` |
| 本番の不具合修正（11月を待てないもの） | `main` | `main`（その後 `release/2026-11` へ取り込む） |

`main` から切ってはいけない理由は、`main` に次のファイルがまだ無いためである。
`main` 起点で触ろうとすると詰まる。

```
vue/logic/musume-link.js
vue/components/musume/musume-host.js
vue/logic/favorites.js
vue/logic/storage/favorite-repository.js
docs/dabimusume-integration-design.md
```

`feature/musume-integration` は `release/2026-11` の元になったので、**以後は触らない**。
続きの作業は `release/2026-11` 側で行う。

### 週に一度やること

`main` は毎週金曜の GitHub Actions で `json/` のデータと `CACHE_NAME` が更新される。
放っておくと11月に大きな差になるので、**週に一度 `main` を `release/2026-11` へ取り込む。**

```
git checkout release/2026-11
git merge main
```

衝突するのは `service-worker.js` の `CACHE_NAME` の1行だけ。
`main` 側の `dabimas-factor-vYYYYMMDD-01` を採り、手で上げるときは同じ日付の `-02` 以降にする。

`release/2026-11` では**作業しない**。取り込みと、機能の枝のマージ先として使うだけにする。

## 5. 本番へ出さずに統合版を試す

iframe は同一オリジンでないと動かないので、ダビ娘のビルドをダビふぁくの下に置いて
1つのサーバーから配信する。

```
# ダビ娘側（本番の週次ワークフローと同じベースパス）
VITE_BASE_PATH=/dabimas-data/dist/ npm run build

# ビルド結果を dabimas-data/dist/ へコピーしてから、ダビふぁくのルートで
start-lan.bat
```

同じ Wi-Fi の実機から `http://<PC の IP>:8080/index.html`。
Service Worker とオフラインは LAN の http では確認できない（PC の `127.0.0.1` なら可）。
詳細は `docs/haigou-theory-assist-design.md` §9。

**`dabimas-data/` はコミットしない。** `.gitignore` に入れてある。
以前はこの端末の `.git/info/exclude` にしか無く、別の端末では未追跡として見えていた。
気づかずコミットすると 7.4MB のダビ娘のビルドが本番へ出る。

## 6. 片付けたい枝

上流が消えている（マージ済みか破棄済み）。中身を確認してから消す。

```
feature/index-split-completion
feature/json-split-initial-load
fix/mobile-stallion-search-ime-freeze
perf/speed-improvement
claude/elastic-rosalind
```

ワークツリーも2つ残っている。

| 場所 | 枝 | 状態 |
| --- | --- | --- |
| `.claude/worktrees/busy-chandrasekhar-992237` | `claude/busy-chandrasekhar-992237` | 用済みなら削除 |
| `C:/derby/dabimasFactor-main-merge` | `main-merge` | `main` から169コミット遅れ |

リモートには `origin/feature/dabifaku-unified` も残っている。

いずれも消すかどうかは中身を見てから判断する。ここでは一覧に留める。
