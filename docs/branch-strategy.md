# 枝の運用（2リポジトリ版）

更新日: 2026-09-13

ダビふぁく単体なら「`main` から切って `main` へ戻す」だけで済んでいたが、
ダビ娘を取り込んでからは**2つのリポジトリにまたがり、公開順に制約がある**。
ここが混乱しやすいので、現状と決まりを1枚にまとめる。

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
| `main` | 公開中 | 本番 |
| `feature/musume-integration` | **未公開**・上流なし | ダビ娘統合（iframe 埋め込み・❤・馬選択） |
| `feature/haigou-theory-assist` | 未公開・上流なし | 配合理論補助の設計書 |
| `chore/repo-workflow` | 未公開・上流なし | この文書と `.gitignore` の修正 |

### ダビ娘

| 枝 | 状態 | 中身 |
| --- | --- | --- |
| `main` | 公開中 | 本番 |
| `feature/embed-mode` | **未公開**・上流なし | 埋め込みモード（`?embed=1` / `?picker=1`） |

`main` との差は1コミットだけ（`7eb0385`）。

## 3. 公開順（ここが一番大事）

```
1. ダビ娘   feature/embed-mode      → main
2. ダビふぁく feature/musume-integration → main
3. ダビ娘   カード項目・絞り込み        → main
4. ダビふぁく 配合理論補助の画面         → main
```

**逆にすると壊れる。** 2を先に出すと、埋め込んだダビ娘に ❤ も馬選択も出ない。
4を先に出すと、絞り込みの結果を受け取る相手がいない。

ダビふぁく側だけを見ていると気づけないので、ダビ娘に関わる変更を出すときは
必ずこの順番を確認する。

## 4. どこから枝を切るか

原則は `CLAUDE.md` のとおり「改善 1 つにつき枝を 1 本、`main` から切る」。
ただし**ダビ娘統合が `main` に入るまでは例外がある。**

| 触るもの | 枝の元 |
| --- | --- |
| ダビ娘に関係しない変更、設計書 | `main` |
| `musume-link.js` / `musume-host.js` / `favorites.js` など | 公開前は `feature/musume-integration`、公開後は `main` |

`main` にはまだ次のファイルが無い。`main` から切って触ろうとすると詰まる。

```
vue/logic/musume-link.js
vue/components/musume/musume-host.js
vue/logic/favorites.js
vue/logic/storage/favorite-repository.js
docs/dabimusume-integration-design.md
```

`feature/musume-integration` から**枝を切ること**と、その枝で**作業すること**は別である。
`CLAUDE.md` が禁じているのは後者。あの枝はときどき `main` を取り込むだけにする
（衝突するのは `CACHE_NAME` の1行だけ）。

**手っ取り早いのは、公開順の1と2を先に済ませてしまうこと。** そうすれば
`main` に全部そろい、以降は例外なしで `main` 起点に戻せる。

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
