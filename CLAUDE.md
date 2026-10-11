# ダビふぁく（dabimas-factor）

ダビマスの配合を組むための Web アプリ。Vue 2 ＋ Vuetify 2 をそのまま読み込む構成で、
ビルド工程は無い（`index.html` が `vue/**/*.js` を順に読み込む）。公開先は GitHub Pages の
`https://love-dabimas.github.io/dabimas-factor/` で、**`main` ブランチの内容がそのまま本番**になる。

このファイルは新しいセッションの最初に読まれる。長くしないこと。

## いまの枝と公開状況（2026-10-11 時点）

**統合版（ダビ娘統合＋配合理論補助）は 2026-10-11 に公開した。** 11月の予定を前倒しした。
ダビ娘（`love-dabimas/dabimas-data` の `main`、`https://love-dabimas.github.io/dabimas-data/dist/`）
も公開済みで、ダビふぁくはこれを同一オリジンの iframe で読む。**出す順はダビ娘が先。**

| 枝 | 中身 |
|---|---|
| `main` | 公開中。ここへ push した時点で本番に出る。**機能の枝はここから切り、ここへ戻す** |
| `release/2026-11` | 役目を終えた。中身は `main` に入っている。以後は使わない |
| `feature/musume-integration` | ダビ娘統合。用済み |

**枝の切り方・ダビ娘と合わせたテストの仕方は `docs/branch-strategy.md` にまとめてある。**
ダビ娘に関わる変更をするときは先に読むこと。

`json/` のデータと `service-worker.js` の `CACHE_NAME` は、GitHub Actions
（`.github/workflows/x_post.yml`）が `main` へ自動で更新する。**毎日 11:30 JST**（R2 の
ゲームマスターから、公開開始時刻を過ぎた新馬だけを足す）と、**毎週金曜 18:30 JST**（全書を
全件取得して突き合わせる）の 2 本。差分があるときだけコミットし、X へ更新内容を投稿する。
`CACHE_NAME` は `dabimas-factor-vYYYYMMDD-NN` の形（同じ日に複数回動けば連番）で入るので、
手で上げるときは同じ日付の次の番号にする。運用は `docs/data-update-operations.md`。

## 進め方

- 改善 1 つにつき枝を 1 本。`main` から切って `main` へ戻す
- ダビ娘側も触る改善は、出す順（ダビ娘が先）を守る。`release/2026-11` と
  `feature/musume-integration` では作業しない（どちらも用済み）
- `index.html` を編集するときは `AGENTS.md` の手順（backup → apply_patch → verify）に従う
- コミットメッセージは日本語。push は指示があったときだけ

## 表示テーマ

明るい／暗いは `css/dark.css` が `html.dabimas-dark` の下だけで効く形にしてある。
`css/unified.css` と `css/style.css` は明るい側の値のまま触らない。切り替えと保存は
`vue/logic/theme.js`（localStorage の `dabimasTheme`、既定は `dark`）。設定画面から
ダーク／ライト／端末に合わせる を選べる。**暗い色を足すときは dark.css に書く。**

血統表の色は情報そのもの（緑＝面白枠、黄＝見事枠、紺＝父、臙脂＝母）なので、
暗くするときも色相は動かさず明度だけ落とす。

## 検証

```
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html
node scripts/verify-<名前>.cjs   # scripts/verify-*.cjs を 1 本ずつ実行する
```

`scripts/verify-p2d-common.cjs` は他から読まれる共通部品なので単体では実行しない。
画面の検証はヘッドレス Chrome で行う。リポジトリのルートを配信してから
`scripts/codex-powershell.ps1 dump-dom <URL> 390 844 300000` で結果を読む。配信は
`python scripts/lan_server.py <ポート> --bind 127.0.0.1`（`no-store` を付けるので古い JS が残らない）。
`scripts/smoke-plan-diagnosis.cjs` だけは別で、8771 番の配信とリモートデバッグ有効の Chrome（9222）が要る。

実機（iPhone）で試すときは `start-lan.bat` を起動し、同じ Wi-Fi から
`http://<PC の IP>:8080/index.html` を開く。LAN の http では Service Worker が動かないので、
オフラインの確認だけは公開後にしかできない。

## 主なドキュメント

- `docs/dabimusume-integration-design.md` — ダビ娘統合の設計（公開の順番もここ）
- `docs/dabifaku_unified_spec_draft.md` — カテゴリ・作業枠・ホーム画面の仕様
- `docs/full-sibling-stacking-spec.md` — 全兄妹・積み上げ配合の仕様
- `docs/codex-work-orders/` — Codex への作業指示書。先頭の status で進行中か分かる

## やりたい改善

着手したら枝の名前を添える。終わったらこの一覧から消す。

- （まだ無し）

## 片付け候補

リポジトリのルートに、別プロジェクト（スキル集）のファイルが初回コミットから紛れ込んでいる。
アプリの動作には関わらないが、`README.md` と `package.json` がこのアプリのものではない。
消す場合の対象は `README.md` / `package.json` / `skills/` / `docs/engineering/` /
`docs/productivity/` / `.agents/` / `.changeset/` / `.claude-plugin/` / `.out-of-scope/` /
`scripts/link-skills.sh` / `scripts/list-skills.sh`。
