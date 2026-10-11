# 枝の運用（2リポジトリ版）

更新日: 2026-10-11

ダビふぁく単体なら「`main` から切って `main` へ戻す」だけで済んでいたが、
ダビ娘を取り込んでからは**2つのリポジトリにまたがり、公開順に制約がある**。
**統合版は 2026-10-11 に公開した**（11月の予定を前倒しした）。溜める枝は役目を
終えたが、2リポジトリにまたがる決まりは残るので、現状をまとめ直す。

## 0. 要点

- 統合版（ダビ娘統合＋配合理論補助）は **2026-10-11 に公開済み**。`release/2026-11` は役目を終えた。
- **機能の枝は `main` から切り、`main` へ戻す。** 溜める枝はもう無い。
- **ダビ娘とダビふぁくの両方を触るときは、ダビ娘を先に出す**（§3）。
- 公開前に手元で通しで試す方法は §5。ここは公開後も変わらない。

## 1. 何が本番か

| リポジトリ | 本番 | URL |
| --- | --- | --- |
| `love-dabimas/dabimas-factor`（ダビふぁく） | `main` | `https://love-dabimas.github.io/dabimas-factor/` |
| `love-dabimas/dabimas-data`（ダビ娘） | `main` | `https://love-dabimas.github.io/dabimas-data/dist/` |

どちらも**`main` へ push した時点で本番に出る**。ステージング環境は無い。
公開前の確認方法は §5。

## 2. いまの枝（2026-10-11 時点）

### ダビふぁく

| 枝 | 状態 | 中身 |
| --- | --- | --- |
| `main` | 公開中 | 本番。統合版が入っている。日次（11:30 JST）と週次（金 18:30 JST）でデータと `CACHE_NAME` が自動更新される |
| `release/2026-11` | 公開済み | 統合版の統合点だった。`main` へマージ済みで、以後は使わない |
| `feature/musume-integration` | 公開済み | ダビ娘統合。`release/2026-11` の元。触らない |

配合理論補助・ダビ娘統合の機能の枝はすべて `release/2026-11` 経由で `main` に入った。
残っている枝の整理は §6。

### ダビ娘

| 枝 | 状態 | 中身 |
| --- | --- | --- |
| `main` | 公開中 | 本番。埋め込みモードを含む |
| `feature/r2-source` | 公開済み | R2 のゲームマスターからのデータ生成。`main` と同じ位置 |
| `feature/embed-mode` | 公開済み | 埋め込みモード（`?embed=1` / `?picker=1`） |

## 3. 公開順（両方を触るときは毎回この順）

2026-10-11 の統合版公開もこの順で行った（ダビ娘 → ダビふぁく）。
以後も両リポジトリにまたがる変更では**この順番を守る。**

```
1. ダビ娘   （dabimas-data）→ main
2. ダビふぁく（dabimas-factor）→ main
```

**逆にすると壊れる。** ダビふぁくを先に出すと、埋め込んだダビ娘に ❤ も馬選択も
絞り込みも出ない。ダビ娘を先に出しても、単体で開いたときの見た目は変わらないので
（埋め込みの挙動はクエリで切り替わる）、先に出して困ることはない。

ダビふぁく側だけを見ていると気づけないので、公開のときは必ずこの順番を確認する。

## 4. どこから枝を切るか

**`main` から切って、`main` へ戻す。** 統合版の公開で `release/2026-11` は役目を終えたので、
溜める先はもう無い。`release/2026-11` と `feature/musume-integration` では作業しない。

`main` は日次（毎日 11:30 JST）と週次（毎週金曜 18:30 JST）の GitHub Actions で `json/` の
データと `CACHE_NAME` が更新される。枝が長くなるとここで衝突するので、長引く作業では
ときどき `main` を取り込む。衝突するのは `service-worker.js` の `CACHE_NAME` の1行だけで、
`main` 側の `dabimas-factor-vYYYYMMDD-NN` を採り、手で上げるときは同じ日付の次の番号にする。

## 5. 本番へ出さずに統合版を試す

iframe は同一オリジンでないと動かないので、ダビ娘のビルドをダビふぁくの下に置いて
1つのサーバーから配信する。

```
# ダビ娘側（本番の週次ワークフローと同じベースパス）。
# --outDir を必ず付けて、リポジトリの dist/ の外へ出す（下の注意）
VITE_BASE_PATH=/dabimas-data/dist/ npm run build -- --outDir "$env:TEMP/musume-embed"

# 出来たものを dabimasFactor_new/dabimas-data/dist/ へコピーしてから、
# ダビふぁくのルートで
start-lan.bat
```

**`--outDir` を省くと、ダビ娘リポジトリの `dist/` を上書きする。** `dist/` は
git で追跡されていて（週次ワークフローがコミットする）、しかもこのビルドは
ベースパスが `/dabimas-data/dist/` なので**本番用としては壊れている。**
そのままコミットすると次の公開で本番が動かなくなる。`npm run build` のあとに
`git status` で `dist/` が汚れていないかを見ること。

**Git Bash（MSYS）でこれを打つと壊れる。** `/dabimas-data/dist/` が Windows のパスだと
みなされ、`C:/Program Files/Git/dabimas-data/dist/` に化ける。ビルドは成功するが
`index.html` の script の src がその化けたパスになり、**ダビ娘が iframe の中で
真っ白になる**（エラーも出ない）。Git Bash で打つときは前に `MSYS_NO_PATHCONV=1` を付ける。
PowerShell なら `$env:VITE_BASE_PATH='/dabimas-data/dist/'` としてから `npm run build`。

**置き換えは一気にやること。** `dabimas-data/dist/` を消してからコピーすると、その
数秒のあいだに読み込んだ端末には index.html か assets のどちらかが 404 で返り、
**ダビ娘が真っ白になる**（エラーも出ない）。トンネル越しに実機で確認してもらって
いる最中はこれを踏みやすい。別名で作ってから入れ替える。

```
cp -r "$TEMP/musume-embed" dabimas-data/dist.new
ls dabimas-data/dist.new/index.html   # 出来ているか確かめてから
mv dabimas-data/dist dabimas-data/dist.old && mv dabimas-data/dist.new dabimas-data/dist
rm -rf dabimas-data/dist.old
```

ダビ娘は `/dabimas-data/dist/` を scope に**自前の Service Worker** を登録する
（`src/main.tsx`）。index.html は network-first なので、入れ替え後は再読み込みで
新しい assets を取りに行く。ダビふぁく側の SW は `/dabimas-data/` に手を出さない。

化けていないかは、コピー後に配信して確かめられる。

```
curl -s http://127.0.0.1:8080/dabimas-data/dist/index.html | grep -o 'src="[^"]*"'
# → src="/dabimas-data/dist/assets/index-XXXX.js" ならOK
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
