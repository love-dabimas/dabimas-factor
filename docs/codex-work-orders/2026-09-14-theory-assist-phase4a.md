# 作業指示書: 自家製馬と理論マップを送る（配合理論補助 Phase 4a・ダビふぁく側）

- status: 実装済み（検証完了）
- 作成日: 2026-09-14
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 対象リポジトリ: **`dabimasFactor_new`（ダビふぁく）**
- 枝: **`feature/theory-assist-phase4`**（`release/2026-11` から作成済み。作業前に checkout すること）
- 上位仕様: `docs/haigou-theory-assist-design.md` の §1.2 / §1.3 / §3.3 / §4.5 / §5
- 対になる指示書: ダビ娘側の Phase 4b（`C:/derby/dabimas-data/docs/codex-work-orders/2026-09-14-theory-assist-phase4b.md`）。
  **メッセージ仕様（§3.3）で切ってあるので、相手の実装を待たずに進められる。**

---

## この Phase でやること・やらないこと

配合理論補助（`vue/components/assist/assist-screen.js`、Phase 2 で作成）の
**種牡馬選びを、いまの `v-autocomplete` からダビ娘に差し替える。** あわせて、
ダビ娘が理論で絞り込めるように次の2つを送る。

1. 自家製馬（`dabimas:custom-horses`）
2. いまの繁殖牝馬と組んだときに成立する理論の対応表（`dabimas:theory-map`）

**至高と危険は扱わない。** 完璧・超完璧・奇跡だけを計算し、至高チップは
`pending: true` で送る（設計書 §7「至高・危険を Phase 5 に送る理由」）。

---

## 1. メッセージを足す（`vue/logic/musume-link.js`）

`readMessage` が通す type に **`dabimas:candidates`** を足す。既存の4つは変えない。

`fromMusume(horseId, gender)` は今 `/^\d+$/` しか通さない。自家製馬の `HorseId` は
`ch_` で始まるので、次のようにする。

- `ch_` で始まるときは、`ch_` を除いた残りがダビふぁく側の自家製馬 ID そのものになる。
  つまり `fromMusume("ch_a1b2", "0")` は `"a1b2"` を返す。
- 数字だけのときは今までどおり `"s"`/`"b"` を付けて返す。
- それ以外は `null`。

逆向きの `toMusumeKey(id)` も、自家製馬の ID を `ch_<id>-<gender>` に変換できるようにする。
`isMasterHorseId` は変えない（判定の意味が変わってしまう）。

## 2. 自家製馬を送る（`vue/components/musume/musume-host.js`）

`hello` への返事で `dabimas:favorites` を送っている場所の直後に、
`dabimas:custom-horses` を送る。中身の形は設計書 §3.3 のとおり。

送る馬は `this.$root.savedHorseSummaries`（自家製馬）である。エディット種牡馬
（`source === "edit"`）は**送らない** — ベース馬がマスターに居るので二重に出てしまう。

1頭ぶんを組み立てるのに `descendants` が要る（系統コードは盤面から取る）ので、
`this.$root.ensureHorseDetail(horse)` を通してから `expandHorseBoard` を呼ぶ。
組み立ては新しいファイル **`vue/logic/musume/custom-horse-payload.js`** に置く
（`window.Dabimas.logic.musume.buildCustomHorsePayload`）。DOM も Vue も触らない純粋関数にする。

系統コードの取り方（設計書 §1.2・§1.3 で実データ確認済み）。

| 送る値 | 盤面のセル |
| --- | --- |
| `paternalT` | 1 |
| `paternalJik` | セル3のコード ＋ セル7のコード（4文字） |
| `paternalHt` | 5 |
| `paternalMig` | 種牡馬は 9・11・13・15、**繁殖牝馬は 9・13・15**（11 を使わない） |

`pedigree` は15行で、`[名前, 子系統, 系統コード, 因子コード配列]` の並び。
血統表はダビ娘のカードにそのまま出るので、ダビ娘の `PedigreeEntry` と同じ順にすること
（`C:/derby/dabimas-data/src/features/horses/model/types.ts` を見る）。

自家製馬が増減したとき（`savedHorseSummaries` が変わったとき）も送り直す。

## 3. 理論マップを作って送る

### 3.1 候補の系統を受け取る

ダビ娘から `dabimas:candidates` が届いたら、`rows` を保持する。
1回しか来ないので、届くまでは理論マップを送れない。

### 3.2 判定

`vue/logic/theory/theory-session.js`（Phase 1）の `createTheorySession` をそのまま使う。
`sires` は `rows` から作る。

- `omoshiro` = `[t, jik.slice(0,2), ht, jik.slice(2,4)]`
- `migoto` = `mig` を2文字ずつに割ったもの

自家製馬ぶんは `savedHorseSummaries` から同じ形で作り、`rows` の後ろに足す。

`damLines` は、いまの工程の繁殖牝馬の4枠である。`assist-plan.js` の
`step.mareLines` がそれなので、そこから取る（1代目は実在の母、2代目以降は仮想産駒）。

`countsByTheory` は使わない。**件数はダビ娘が数える**（設計書 §3.3）。
親が送るのは「どの馬がどの理論に該当するか」だけである。

### 3.3 送る形

設計書 §3.3 の `dabimas:theory-map` のとおり。要点だけ再掲する。

- `chips` は 完璧 / 超完璧 / 奇跡 / 至高 の4つを**この順**で。ビットは 1 / 2 / 4 / 8。
  至高だけ `pending: true` にする。
- `entries` は**4つのうち1つ以上に該当する馬だけ**。値はビットの論理和。
  該当しない馬は載せない（載せないことが「該当なし」を意味する）。
- `mareKey` は工程が変わるたびに変える。実在の母は `toMusumeKey` の値、
  仮想産駒は `"virtual-<工程番号>-<母の識別>"` のように、母が変われば必ず変わる文字列にする。

理論のキーは `window.Dabimas.constants.breedingTheories` の `PRIORITY` のキー
（`PERFECT` / `SUPER_PERFECT` / `MIRACLE` / `SUPREME`）を使う。**新しく定義し直さない。**

## 4. 選択入口をダビ娘に差し替える

### 4.1 `musume-host.js` の `openSearch` を拡張する

いまの引数は `{ index, label, select }` で、`index` から性別を決めている
（`link.allowedSexForCell`）。配合理論補助は血統表のセルではないので、
**`sex` を直接受け取れるようにする。**

- `sex` が渡されたらそれを使う。無ければ今までどおり `index` から決める
  （`vue/components/pedigree/mobile-horse-picker.js` の呼び出しは変えない）。
- `theoryMap` が渡されたら、`hello` への返事のあとにそれを送る。
- 選択されたときの照合（`link.allowedSexForCell(this.target.index)` を使っている箇所）は、
  `index` が無い呼び出しでも動くようにする。

### 4.2 `assist-screen.js` の `openPicker` を差し替える

いまの `v-dialog` ＋ `v-autocomplete`（`pickerOpen` / `selectedCandidate` /
`candidates` / `pickerTitle` / `candidateName` / `filterHorse`）を消し、
`this.$root.$emit("musume:open-search", {...})` に置き換える。

- 繁殖牝馬を選ぶとき（`stepNo === 0`）は `sex: "1"`、`theoryMap` は**渡さない**
  （まだ母が決まっていないので理論を出しようがない）。
- 種牡馬を選ぶとき（`stepNo >= 1`）は `sex: "0"` と、その工程の `theoryMap`。
- `select` コールバックには、いまの `confirmSelection` の中身（`ensureHorseDetail` →
  `createAssistPlan` / `selectSire`）をそのまま渡す。**非同期の打ち切り
  （`requestVersion`）とエラー表示は今の実装を維持すること。**

### 4.3 Phase 2 の宿題も片付ける

このタイミングでしか触らない場所なので、あわせて直す。

- **`sireLines` の二重管理をやめる。** いま `assist-screen.js` は
  `plan.steps[i].sire` とは別に `sireLines[i]` を持っており、選び直しのたびに
  両方を手で揃えている。`assist-plan.js` 側に持たせるか、`step.sire` から
  その場で導くかにして、**画面側に同じ情報の2つ目の置き場を作らない。**
- **`expandHorseBoard` が1回の選択で2回走っている。**
  `confirmSelection` で `prepareSireOperands(expandHorseBoard(...))` を呼び、
  そのあと `plan.selectSire` の中でもう一度呼んでいる。1回にする。

---

## 制約

- IIFE ＋ `window.Dabimas` 名前空間、classic script、Vue2 / Vuetify2、ビルド工程なし、
  **新しいライブラリを足さない。**
- 新規ファイルは `index.html` の script タグと `service-worker.js` の `urlsToCache` に
  追加し、`CACHE_NAME` を上げる。`index.html` を編集するときは `AGENTS.md` の手順に従う。
- **ダビ娘側（`C:/derby/dabimas-data`）のファイルに触らない。** 相手側は Phase 4b。
- `vue/logic/theory/compatibility.js` と `vue/logic/inbreed/inbreed-detector.js` を変えない。
- コミットメッセージは日本語。**push しない。`main` にマージしない。**

## スコープ外（やらないこと）

- **至高と危険の計算をしない**（Phase 5）。至高は `pending: true` で送るだけ。
- ダビ娘側の画面（チップ・カード）を作らない（Phase 4b）。
- 理論マップをストレージに保存しない。画面を開いているあいだだけ持てばよい。
- クロス（`judgeInbreed`）を候補全部に対して回さない。1.3〜1.7秒かかる（§1.4）。
- 周辺のリファクタリングをしない。気づいた別の問題は直さず、完了報告に書く。

---

## 受け入れ基準

1. `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html`
   が OK を返す。

2. `scripts/verify-*.cjs`（`verify-p2d-common.cjs` を除く19本）がすべて通る。1本ずつ実行する。

3. **`scripts/verify-theory-assist-phase4a.cjs` を新規に作り、次を確かめる。**
   画面を立てずに、`vm` でロジックを読み込んで確認する
   （`scripts/verify-theory-assist.cjs` が同じやり方をしているので参考にする）。

   a. `buildCustomHorsePayload` が、自家製の種牡馬から `paternalMig` を4コードで、
      自家製の繁殖牝馬から3コードで組む。セルは種牡馬 9/11/13/15、牝馬 9/13/15。

   b. `paternalJik` がセル3＋セル7の4文字になり、`omoshiro` に展開し直すと
      `[セル1, セル3, セル5, セル7]` に戻る。

   c. 実在馬で作った理論マップが、`createTheorySession` の結果と一致する。
      具体的には、スターベガ（繁殖牝馬）を母にしたとき、
      **完璧に該当する種牡馬がちょうど6頭で、すべてスターアルタイルの系統**である
      （設計書 §1.1 で確認済みの値）。

   d. `entries` に、4つの理論のどれにも該当しない馬が載っていない。

   e. `chips` が 完璧・超完璧・奇跡・至高 の順で、ビットが 1・2・4・8。
      至高だけ `pending: true`。

   f. `fromMusume("ch_a1b2", "0")` が自家製馬の ID を返し、
      `fromMusume("1774722353", "0")` が今までどおり `"s1774722353"` を返す。

4. **画面の確認。** ヘッドレス Chrome で配合理論補助を開き、次を示す。
   手順は `CLAUDE.md` の「検証」にある（`python scripts/lan_server.py <ポート> --bind 127.0.0.1`
   で配信し、`scripts/codex-powershell.ps1 dump-dom <URL> 390 844 300000`）。

   a. 「＋ 繁殖牝馬を選ぶ」でダビ娘のシートが開く（`v-autocomplete` は出ない）。

   b. 1代目の種牡馬を選ぶときも同じシートが開き、親から `dabimas:theory-map` が
      送られている（`postMessage` を横取りして中身を出す）。`mareKey` が母のキーになっている。

   c. 繁殖牝馬を選び直すと `mareKey` が変わり、2代目以降が組み直しになる（Phase 2 の挙動を壊していない）。

5. **選択の非同期境界が壊れていないこと。** 詳細取得の途中で画面を離れる・別の馬を
   選び直す場合に、古い結果が反映されない。`scripts/verify-theory-assist-screen.cjs`
   が見ている境界なので、これが通り続けること。

6. Phase 2 の宿題2件（`sireLines` の二重管理、`expandHorseBoard` の二重呼び出し）が
   直っていること。直したことが分かるように、完了報告に変更前後の呼び出し回数を書く。

---

## 検証コマンド

```
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html
node scripts/verify-theory-assist-phase4a.cjs
node scripts/verify-theory-assist.cjs
node scripts/verify-theory-assist-screen.cjs
python scripts/lan_server.py 8790 --bind 127.0.0.1
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 dump-dom http://127.0.0.1:8790/index.html 390 844 300000
```

---

## 完了報告（Codex が記入する）

### 変更ファイル一覧

- `vue/logic/musume-link.js` — candidates の受信許可、自家製 ID の双方向変換。
- `vue/logic/musume/custom-horse-payload.js`（新規）— 盤面からカード用の系統・15行の血統を生成。
- `vue/logic/musume/theory-map.js`（新規）— 既存セッションで判定し、4チップと該当馬だけのビット表を生成。
- `vue/components/musume/musume-host.js` — hello 後の自家製馬送信、保存馬変更時の再送、候補受信、理論マップ送信、性別指定、古い非同期処理の抑止。
- `vue/components/assist/assist-screen.js` — ダビ娘へ選択を委譲し、母・工程の判定入力を渡す。
- `vue/logic/plan/assist-plan.js` — `sireLines` を計画に集約。
- `index.html` / `service-worker.js` — 新規 script・キャッシュ登録、キャッシュ名を `dabimas-factor-v20260914-02` へ更新。
- `scripts/verify-theory-assist-phase4a.cjs` / `scripts/verify-theory-assist-phase4a-ui.html`（新規）— ロジック・通信・画面検証。
- `scripts/verify-theory-assist-screen.cjs` / `scripts/verify-theory-assist-ui.html` — 既存の非同期境界・3世代画面検証を新しい選択入口へ更新。
- `CLAUDE.md` — 完了した作業を「やりたい改善」から削除。

### 設計判断

- `toMusumeKey(id, gender)` は既存マスター呼び出しを維持し、自家製の場合だけ性別を必要とする。
- 本人・祖先の漢字因子は既存 `factorMap` でダビ娘の2桁コードへ変換する。空欄は空文字のまま送る。
- 画面からホストへ渡す `theoryMap` は `{ mareKey, damLines }` の計算入力。候補到着・自家製馬詳細取得が揃ったホストが完成メッセージを作る。完成済み `entries` を持つメッセージも渡せる。
- 母のキーは実在馬ならマスターキー、自家製なら `ch_` キー。仮想産駒は工程番号・起点の母・先行種牡馬の ID 列から作る。
- 母・性別が変わる検索は iframe を作り直し、前の理論チップを残さない。同じ検索の再表示は iframe を再利用して送信し直す。
- 自家製馬の詳細取得 Promise は共有し、保存一覧の変更時に無効化。古い Promise・選択対象・iframe の結果は送信しない。エディット種牡馬は除く。
- 種牡馬1回の選択について、`expandHorseBoard` は変更前 **2回** → 変更後 **1回**、`prepareSireOperands` も **2回 → 1回**。画面側の `sireLines` は削除し、計画の `step.sireLines` のみを保持する。

### 実行した検証と結果

- `backup-index-exp` は既定の `index.exp.html` が存在しないため、実ファイルの `index.html` を明示して実行。その後 apply_patch で編集し、`verify-index-exp .\index.html` は OK。
- `verify-p2d-common.cjs` を除く `scripts/verify-*.cjs` **全20本（既存19本＋新規1本）を1本ずつ実行、すべて成功**。
- Phase 4a 新規検証: 牡4コード／牝3コード、Jik・血統順、スターベガの完璧6頭、セッションとの全件一致、ゼロ該当の除外、チップ順・pending、自家製 ID、hello／候補受信順、編集馬除外、保存馬削除、実際の性別照合、古い母への送信抑止が成功。
- 既存画面の Node 検証: 3世代、選び直し、取得失敗、破棄後の完了、旧コールバック、種牡馬選択の盤面展開1回が成功。
- `python scripts/lan_server.py 8790 --bind 127.0.0.1` で配信し、`dump-dom <検証ページURL> 390 844 300000` を実行。
  - `scripts/verify-theory-assist-phase4a-ui.html`: **OK**。ダビ娘シート、母選択時のマップなし、送信された完璧6頭、実在／仮想 mareKey、母変更後のキー更新と後続破棄、390px 横スクロールなし、実行時エラーなし。
  - `scripts/verify-theory-assist-ui.html`: **OK**。375px、3世代の選択と解除、縦スクロール、画面復元、ホーム→カテゴリ→血統表の既存遷移。
- 画面の受信メッセージは実 iframe から契約どおりに流し、`postMessage` を捕捉して送信内容を確認した。Phase 4b のチップ UI 自体の検証は含めない。
- ローカル証跡（Git対象外）: `artifacts/phase4a/ui-result.html`、`artifacts/phase4a/regression-ui-result.html`。
- 最終修正後、Phase 4a・画面境界・既存ダビ娘ロジックの3本を再実行して成功。`artifacts/phase4a/sheet.png` を撮影し、ダビ娘シートと検証結果 OK を目視確認。
- ダビ娘のローカル実データ 2,979 行も候補受信の検証条件に全件適合。`git diff --check` は成功。

#### Standards レビュー

修正必須の指摘なし。IIFE・名前空間・責務分離・系統の一元管理・非同期処理の照合を確認。

#### Spec レビュー

本人・祖先の因子コード変換漏れを1件指摘。既存 `factorMap` による変換を追加し、漢字因子14種類と空欄の回帰テストで修正を確認。再レビューで解消を確認、追加指摘なし。

### 残課題・気づき

- Phase 4b と結合した実際のカード操作・チップ絞り込みは別途確認が必要。ダビ娘側ファイルの変更はしていない。
- 至高は pending、危険は未判定という Phase 4 の仕様どおり。Phase 5 で扱う。
- `feature/theory-assist-phase4` にコミット。push・main へのマージは行っていない。
