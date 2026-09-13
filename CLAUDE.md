# ダビふぁく（dabimas-factor）

ダビマスの配合を組むための Web アプリ。Vue 2 ＋ Vuetify 2 をそのまま読み込む構成で、
ビルド工程は無い（`index.html` が `vue/**/*.js` を順に読み込む）。公開先は GitHub Pages の
`https://love-dabimas.github.io/dabimas-factor/` で、**`main` ブランチの内容がそのまま本番**になる。

このファイルは新しいセッションの最初に読まれる。長くしないこと。

## いまの枝と公開状況（2026-09-13 時点）

| 枝 | 中身 |
|---|---|
| `main` | 公開中。ここへ push した時点で本番に出る |
| `feature/musume-integration` | ダビ娘統合（iframe 埋め込み・❤・馬選択）。**公開待ち** |
| `feature/haigou-theory-assist` | 配合理論補助の設計書（`docs/haigou-theory-assist-design.md`） |

**枝の切り方・公開順・統合版のテスト方法は `docs/branch-strategy.md` にまとめてある。**
ダビ娘に関わる変更をするときは先に読むこと。2リポジトリにまたがり公開順に制約があるため、
ダビふぁく側だけ見ていると順番を間違える。

`json/` のデータと `service-worker.js` の `CACHE_NAME` は、毎週金曜の GitHub Actions
（`.github/workflows/x_post.yml`）が `main` へ自動で更新する。`CACHE_NAME` は
`dabimas-factor-vYYYYMMDD-01` の形で入るので、手で上げるときは同じ日付の `-02` 以降にする。

## 進め方

- 改善 1 つにつき枝を 1 本、`main` から切る。終わったら `main` へ入れて公開する
- `feature/musume-integration` では作業しない。ときどき `main` を取り込むだけにする
  （衝突するのは `CACHE_NAME` の 1 行だけ）
- `index.html` を編集するときは `AGENTS.md` の手順（backup → apply_patch → verify）に従う
- コミットメッセージは日本語。push は指示があったときだけ

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
