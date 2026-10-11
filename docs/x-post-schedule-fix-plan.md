# x_post.yml 定時起動改善プラン

現行の運用は [data-update-operations.md](data-update-operations.md) を参照（2026-10 に日次＋金曜の二本立てへ変更）。

対象: [.github/workflows/x_post.yml](../.github/workflows/x_post.yml)
作成日: 2026-07-03
状態: **案 A を採用・実装済み**（待機ターゲット 18:30 JST、2026-07-03）

## 1. 問題

- 週次バッチを `cron: "15 9 * * 5"`（= 毎週金曜 18:15 JST）で設定しているが、実際の起動は 21:00 JST 前後になる。

## 2. 原因

GitHub Actions の `schedule` トリガーは **起動時刻を保証しないベストエフォート仕様**。

- スケジュール実行は GitHub 側の共有キューに積まれ、混雑時は数十分〜数時間遅延する（GitHub 公式ドキュメントにも「high load 時は遅延・スキップされることがある」と明記）。
- public リポジトリのスケジュール実行は優先度が低い。
- `09:15 UTC` は二重に不利な時間帯:
  - 毎時 0/15/30/45 分は世界中の cron が集中する「キリの良い分」。
  - UTC 午前（欧州の業務時間帯）は GitHub Actions 全体のピーク。
- つまり workflow の設定ミスではなく、GitHub 側のキューイング遅延。**cron の分をずらしても多少マシになる程度で、GitHub の schedule 単体では定時保証はできない。**

## 3. 解決策の比較

| 案 | 定時精度 | 追加インフラ | 運用負担 |
| --- | --- | --- | --- |
| **A. 前倒し起動 + 18:30 まで待機（採用）** | 遅延がバッファ内なら 18:30 ちょうど | なし（GitHub のみ） | なし |
| B. Cloudflare Workers Cron → workflow_dispatch | ほぼ分単位で正確 | Cloudflare Worker × 1 | PAT の期限管理が必要 |
| C. cron の分をずらすだけ | 改善は運次第 | なし | なし |

**推奨は案 A。** 追加インフラ・認証情報の管理が一切不要で、このリポジトリは public のため待機中の runner 時間も無料。案 A で運用してみて、それでも遅延バッファを超える週が頻発するようなら案 B に切り替える、という二段構えがよい。

---

## 4. 案 A（採用・実装済み）: 前倒しスケジュール + 18:30 JST まで待機

### 仕組み

- cron を大幅に前倒しして「遅延バッファ」を確保する（`7 4 * * 5` = 13:07 JST 起動。キリの悪い分にして混雑も回避）。
- ジョブの先頭に「18:30 JST になるまで sleep する」ステップを入れる。
- 起動が 13:07〜18:30 のどこにずれ込んでも、実処理は 18:30 ちょうどに始まる。観測されている遅延（約 2 時間 45 分）に対しバッファは約 5.5 時間。
- 万一バッファを超えて 18:30 以降に起動した場合は待たずに即実行（現状より悪くはならない）。
- 手動実行（workflow_dispatch）のときは待機しない。

### x_post.yml の変更内容

**(1) cron の前倒し:**

```diff
   schedule:
-    # cron は UTC 指定: 毎週金曜 09:15 UTC (= 18:15 JST)
-    - cron: "15 9 * * 5"
+    # cron は UTC 指定: 毎週金曜 04:07 UTC (= 13:07 JST) に前倒し起動し、
+    # ジョブ先頭で 18:30 JST まで待機する（GitHub schedule の遅延対策）。
+    # 詳細: docs/x-post-schedule-fix-plan.md
+    - cron: "7 4 * * 5"
```

**(2) timeout の拡大**（待機最大 ~5.5h + 実処理 1h をカバー。360 が GitHub の上限）:

```diff
   jobs:
     weekly-pipeline:
       runs-on: ubuntu-latest
-      timeout-minutes: 60
+      timeout-minutes: 360
```

**(3) 待機ステップを steps の先頭（`actions/checkout` より前）に追加**（checkout を待機後にすることで、18:30 時点の最新 main を処理できる）:

```yaml
      # 前倒し起動からデータ公開後の 18:30 JST まで待つ。
      # 起動が 18:30 を過ぎるほど遅延した場合は待たずに即実行する。
      - name: Wait until 18:30 JST
        if: github.event_name == 'schedule'
        run: |
          target=$(TZ=Asia/Tokyo date -d 'today 18:30' +%s)
          now=$(date +%s)
          if [ "$now" -lt "$target" ]; then
            echo "Waiting $(( (target - now) / 60 )) minutes until 18:30 JST..."
            sleep $(( target - now ))
          else
            echo "Already past 18:30 JST. Run immediately."
          fi
```

### データ公開時刻（18:00 JST）との関係

- 待機ステップは checkout・`Fetch latest news` より前に置くため、**データ取得を含む実処理はすべて 18:30 JST 以降に走る**。18:00 公開のデータを取り逃すことはない（schedule は遅れることはあっても早く動くことはない）。
- 待機ターゲットは、公開遅延に備えて 30 分マージンを取った **18:30 を採用**（18:15 だとマージン 15 分しかなく、公開が少し遅れた週に `news_changed=false` → 「おやすみです」ツイートを誤投稿するリスクがあった）。
- それでも公開が 18:30 より遅れるケースが観測されたら、`Detect latest news changes` で変化なしの場合に 10 分おきに最大 3 回まで再取得してから判定するリトライを追加する。

### 注意点

- **料金**: public リポジトリなので GitHub-hosted runner は無料・無制限。待機 5 時間/週も課金されない（private 化する場合は案 B に切り替えること）。
- **スキップ耐性**: GitHub は高負荷時にスケジュール実行自体を落とすことが稀にある。案 A でもこれは防げない（案 B なら防げる）。
- **60 日ルール**: public リポジトリはリポジトリに 60 日間活動がないとスケジュールが自動停止するが、このバッチ自体が毎週 commit するため実質問題なし。
- 既存の `concurrency` グループ設定により多重実行はそのまま防止される。

---

## 5. 案 B（代替）: Cloudflare Workers Cron Trigger から workflow_dispatch を叩く

案 A で運用しても遅延バッファ（約 5 時間）を超える週が頻発する場合の切り替え先。Cloudflare の Cron Trigger はほぼ分単位で正確に発火し、`workflow_dispatch` 起動はスケジュールキューを通らないため即時実行される。

```
Cloudflare Cron (09:30 UTC = 18:30 JST, 正確)
  └─> Worker が POST /repos/dabimastools/dabimasFactor/actions/workflows/x_post.yml/dispatches
        └─> GitHub Actions 即時起動
```

### 重要: 案 B 採用時は GitHub 側の schedule を必ず削除する

併存させると、18:30 に本更新が走った後、遅延した schedule が再実行され、`news_changed=false` 判定になって **「本日のデータ更新はおやすみです」ツイートを二重投稿してしまう**。

### Step 1: GitHub Fine-grained PAT を作成

1. GitHub → Settings → Developer settings → Fine-grained personal access tokens → Generate new token
2. 設定:
   - Repository access: `dabimastools/dabimasFactor` のみ
   - Permissions: **Actions: Read and write**（workflow_dispatch に必要なのはこれだけ）
   - 有効期限: 最長を選び、期限切れ前の更新をカレンダー等に登録

### Step 2: Cloudflare Worker を作成

`cloudflare/x-post-trigger/wrangler.toml`:

```toml
name = "dabimas-x-post-trigger"
main = "src/index.js"
compatibility_date = "2026-07-01"

[triggers]
# Cloudflare の cron も UTC 指定: 毎週金曜 09:30 UTC = 18:30 JST
crons = ["30 9 * * 5"]
```

`cloudflare/x-post-trigger/src/index.js`:

```js
export default {
  async scheduled(event, env, ctx) {
    const res = await fetch(
      "https://api.github.com/repos/dabimastools/dabimasFactor/actions/workflows/x_post.yml/dispatches",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          // GitHub API は User-Agent 必須
          "User-Agent": "dabimas-x-post-trigger",
        },
        body: JSON.stringify({ ref: "main" }),
      }
    );

    // 成功時は 204 No Content が返る
    if (res.status !== 204) {
      const body = await res.text();
      throw new Error(`workflow_dispatch failed: ${res.status} ${body}`);
    }
    console.log("workflow_dispatch triggered successfully");
  },
};
```

### Step 3: デプロイと Secret 登録

```sh
cd cloudflare/x-post-trigger
npx wrangler login              # 初回のみ
npx wrangler deploy
npx wrangler secret put GITHUB_TOKEN   # Step 1 の PAT を貼り付け
```

### Step 4: x_post.yml から schedule を削除

```diff
 on:
   # GitHub Actions 画面から手動実行
+  # 定時起動は Cloudflare Workers Cron Trigger から workflow_dispatch で行う
   workflow_dispatch:
-  schedule:
-    - cron: "15 9 * * 5"
```

### 運用上の注意

- **PAT の有効期限**: 失効すると Worker が 401 で失敗し投稿が止まる。失効時は `npx wrangler secret put GITHUB_TOKEN` で差し替え。
- **失敗検知**: Worker が throw すると Cloudflare の Cron Trigger 実行履歴に Failure として残る。
- **コスト**: 週 1 回の fetch 1 発なので Workers 無料枠で余裕。

---

## 6. 案 C（非推奨）: cron の分をずらすだけ

`15 9 * * 5` → `43 8 * * 5`（17:43 JST 相当を狙う）のように「キリの悪い分 + 早め」に変えるだけの最小変更。混雑ピークを外す分だけ遅延は縮む傾向があるが、**定時保証は一切なく、数時間遅れる週も残る**。恒久対策にはならないため非推奨。

---

## 7. 動作確認（案 A 採用時）

1. 変更を main に push 後、workflow_dispatch で手動実行し、待機ステップがスキップされて従来どおり動くことを確認。
2. 翌週金曜、Actions の実行履歴で以下を確認:
   - 起動時刻が 13:07 JST 以降（遅延しても 18:30 より前）であること
   - `Wait until 18:30 JST` ステップのログで待機時間が出ていること
   - 「Post to X」の実行時刻が 18:30 JST 直後であること
