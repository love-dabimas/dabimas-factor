# 作業指示書: 因子・クロス・至高・危険を出す（配合理論補助 Phase 5）

- status: 実装・機能検証済み（パート2の性能基準7-a・7-cは未達）
- 作成日: 2026-09-16
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 対象リポジトリ: **`dabimasFactor_new`（ダビふぁく）**。ダビ娘側は触らない
- 枝: **`feature/theory-assist-phase5`**（`release/2026-11` から作成済み。作業前に checkout すること）
- 上位仕様: `docs/haigou-theory-assist-design.md` の §1.4 / §4.5 / §4.6 / §7

この指示書は **パート1（選んだ1組）** と **パート2（候補一覧）** の2本立てである。
先にパート1を仕上げて検証まで通し、そのあとパート2へ進むこと。
パート1だけでも単体で成立する（パート2が未着手でも画面は壊れない）。

---

# パート1 — 選んだ1組の因子・クロス・至高・危険

## 直すもの

配合理論補助で種牡馬を選ぶと、いまはこう出る（実機で指摘された）。

```
因子             → 「未計算」
クロスの詳細     → 「クロスの詳細 — 未計算」
```

Phase 2 で置いた仮の表示のまま実装されていない。**ここを実際に計算して出す。**

計算そのものは既存の関数でできる。**新しい判定ロジックを書かない。**

---

## 1. 判定をまとめる純粋関数を作る

新規 **`vue/logic/plan/assist-diagnosis.js`**（`window.Dabimas.logic.plan.diagnoseStep`）。
DOM も Vue も触らない。既存の関数を呼んで結果を組み立てるだけにする。

```js
diagnoseStep(sireBoard, mareBoard, { inbreedExceptions, nodeTable, resolver })
// → { nitro, crossFactor, crosses, count, dangerous }
```

手順は本体の配線（`vue/app/methods/inbreed-ui.js` の `judgeInbreed` /
`performInbreedFactorCounts`）と同じものを、インスタンス状態から切り離して並べる。

1. `plan.buildStepSelected(sireBoard, mareBoard)` で32セルの `selected` を作る。
2. `inbreed.judgeInbreed(selected, inbreedExceptions, nodeTable, resolver)` を呼ぶ。
   返り値の `sameNameGroups` / `siblingGroups` / `inbreedList` / `count` / `dangerous` を使う。
3. `inbreed.buildInbreedFactorCounts(sameNameGroups, siblingGroups, inbreedList)` で
   クロスぶんの `factorCd` を得る。**引数は3つ。** `selected` を渡す形ではない。
4. `factor.dispFactorCounts(factorCd)` でクロスの本数（14個の文字列配列）にする。
5. ニトロ（全因子）の本数は、**2つの盤面のセルが持つ因子から32×3の `factorCd` を組んで**
   同じ `dispFactorCounts` に通す。本体は `this.factorCd` をセルを埋めるたびに
   育てているが、ここでは盤面から一度に組めばよい。

**注意**: `dispFactorCounts` に `selected` をそのまま渡しても全部 `"00"` になる。
渡すのは「セルごとの因子コード3つ」の配列である。ここは実際に間違えたので明記する。

`resolver` と `nodeTable` は無くても動く（名前一致に落ちる）。`$root` にあるものを
渡す。無ければ `null` を渡して落ちないこと。

## 2. 表示する

`vue/components/assist/assist-screen.js` の「未計算」を置き換える。

### 因子

**ダビふぁく本体のヘッダにあるニトロ／クロスの表と同じ見た目**にする
（`vue/components/header/factor-summary-header.js` が出しているもの）。
利用者が確認済みの形である。ただし**そのまま流用しない** —
あの部品はカメラボタン・工程診断ボタン・系統カウントまで抱えていて、この画面には要らない。

**新規 `vue/components/assist/assist-factor-table.js`** を作り、必要な2行だけを描く。

| 行 | 中身 |
| --- | --- |
| ニトロ | 短 速 底 長 走 中 強 雷 堅 難 適 丈 早 晩 の14列に本数 |
| クロス | 同じ14列にクロスぶんの本数 |

見出しの並び・色・セル幅は本体の表に合わせる。CSS を新しく作らず、
既存のクラス（`css/` にある本体のヘッダ表のもの）を使えるなら使う。
使えない場合だけこの画面用のスタイルを足す。**カメラボタンは出さない。**

### クロスの詳細

**既定で畳む。** 「クロスの詳細（N件）」のようにボタンに件数を出し、
押すと中身が開く。工程ごとに独立した開閉状態を持つ。

中身は `judgeInbreed` の返り値から出せるもの（クロスした馬の名前と代数）を並べる。
本体の表示（`vue/components/plan/plan-diagnosis-panel.js` などが出しているもの）を
見て、同じ言い回しにすること。

**クロスが0件のときは「クロスなし」と出す。** ボタンは出すが開いても空にしない。

### 危険な配合

`dangerous` が真のときは、成立した配合理論のところに**危険であることを出す**。
`breedingTheories` の `DANGEROUS` は優先度999で他をすべて上書きするので、
`selectDisplayedTheory` に `context` を渡し直せば「危険な配合」が出る。
いまの `assist-plan.js` は `context` を渡していない（`{}` を渡している）ので、
**クロスの判定結果を渡すようにする。**

```js
theory.detectMatchedTheories(sireOperands, dam, {
  sameNameSpecialChecks: cross.sameNameSpecialChecks,
  selected: selected,
  dangerous: cross.dangerous === true,
})
```

これで至高（`SUPREME`）も出るようになる。**至高が出たらそう表示する。**

## 3. いつ計算するか

**種牡馬を選んだ直後に1回**でよい。1組だけなら `judgeInbreed` は 0.5〜0.7ms
（初回だけ12ms程度）で、画面が固まる心配はない（設計書 §1.4）。

**候補一覧の全頭に対しては絶対に流さない。** 1.3〜1.7秒かかる（Phase 5b で扱う）。

工程を選び直したら、その工程と後続の結果を捨てる。いまの `clearSire` と同じ扱いにする。

---

## パート1の制約

- IIFE ＋ `window.Dabimas` 名前空間、classic script、Vue2 / Vuetify2、ビルド工程なし、
  **新しいライブラリを足さない。**
- 新規ファイルは `index.html` の script タグと `service-worker.js` の `urlsToCache` に
  追加し、`CACHE_NAME` を上げる。`index.html` を編集するときは `AGENTS.md` の手順に従う。
- **`vue/logic/inbreed/inbreed-detector.js` と `vue/logic/factor/*.js` を変えない。** 呼ぶだけ。
- **`vue/components/header/factor-summary-header.js` を変えない。** 本体のヘッダが壊れる。
- **ダビ娘側（`C:/derby/dabimas-data`）を触らない。**
- コミットメッセージは日本語。**push しない。`main` にマージしない。**

## パート1のスコープ外（やらないこと）

- 候補一覧の至高チップと危険の除外は**パート2**で扱う。パート1では触らない。
- パート1では全候補へのクロス判定をしない。
- 因子の手動クロス（本体のクロスボタン）をこの画面に持ち込まない。表示だけにする。
- 周辺のリファクタリングをしない。気づいた別の問題は直さず、完了報告に書く。

---

## パート1の受け入れ基準

1. `verify-index-exp .\index.html` が OK を返す。

2. `scripts/verify-*.cjs`（`verify-p2d-common.cjs` を除く20本）がすべて通る。

3. **`scripts/verify-theory-assist-phase5a.cjs` を新規に作る。** `vm` で読み込んで確認する。

   a. `diagnoseStep` が、本体の配線（`judgeInbreed` →
      `buildInbreedFactorCounts` → `dispFactorCounts`）と**同じ値**を返す。
      実在馬の組で、本体と同じ手順を素で書いたものと突き合わせること。

   b. ニトロの本数が全部 `"00"` にならない。実在馬の組で、因子を持つ祖先が
      いる組み合わせを選び、期待値を直接書いて突き合わせる。

   c. クロスが0件の組と、1件以上ある組の両方を通す。

   d. `dangerous` が真になる組で、成立した理論が「危険な配合」になる。

   e. `resolver` と `nodeTable` を `null` にしても落ちない。

4. **画面の確認。** ヘッドレス Chrome で配合理論補助を開き、次を示す。

   a. 種牡馬を選ぶと「未計算」が消え、ニトロとクロスの本数が出る。

   b. クロスの詳細が畳まれていて、押すと開く。件数がボタンに出ている。

   c. 選び直すと、その工程の結果が組み直され、後続が消える。

   d. 375px 幅で横スクロールが出ない。

5. 1組の `diagnoseStep` にかかる時間を測り、完了報告に書く。**50ms を超えたら報告すること。**

---

## パート1の検証コマンド

```
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html
node scripts/verify-theory-assist-phase5a.cjs
node scripts/verify-theory-assist-screen.cjs
python scripts/lan_server.py 8790 --bind 127.0.0.1
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 dump-dom http://127.0.0.1:8790/index.html 390 844 300000
```

---

# パート2 — 候補一覧の至高チップと、危険の除外

**パート1が終わって受け入れ基準を満たしてから着手すること。**

## 直すもの

ダビ娘の候補一覧に出る配合理論のチップは、いま3つしかない。

```
完璧  超完璧  奇跡
```

至高が無い。また、**危険な配合になる組み合わせが完璧・超完璧・奇跡に数え込まれている**
（設計書 §7 の「Phase 4 の時点での既知の穴」）。どちらもクロス判定（`judgeInbreed`）が
要るため Phase 4 では入れなかった。ここで入れる。

## なぜ重いのか、どう逃げるか

いまのチップは**系統コードだけ**で判定していて、2,480頭で 25ms しかかからない
（`vue/logic/musume/theory-map.js`）。至高と危険は違う。

- 至高 ＝ `judgeInbreed` の `sameNameSpecialChecks` が空でないこと
  （`vue/logic/theory/compatibility.js:53`）
- 危険 ＝ `judgeInbreed` の `dangerous`。中身は
  `crosses.some((cross) => cross.bloodVolume >= 50000)`
  （`vue/logic/inbreed/inbreed-detector.js:1008`）

どちらも候補1頭ごとに 32 セルの盤面を組んで `judgeInbreed` を通す必要があり、
全候補で **1.3〜1.7 秒**かかる（設計書 §1.4）。

**これを同期で回すと画面が固まる。** そこで次の形にする。

1. **軽い判定はいままでどおり即座に送る**（いまの `buildTheoryMap`）。
   利用者はすぐに完璧・超完璧・奇跡で絞り込める。
2. **重い判定は後から追いかけて、2通目の `dabimas:theory-map` で上書きする。**
   分割して回すので画面は固まらない。
3. 至高チップは1通目で `pending: true`（押せない・計算中の見た目）、
   2通目で `pending: false` にする。

詳細チャンク（2.7MB・23本）は起動時に `prefetchHorseDetails` が裏で読み込み済みなので、
**ここで新たに fetch を足す必要はない**。ただし未読込のチャンクがあり得るので、
`ensureHorseDetail` を通して取ること（勝手に fetch を書かない）。

## 1. 重い判定の純粋関数を作る

新規 **`vue/logic/musume/theory-map-heavy.js`**
（`window.Dabimas.logic.musume.refineTheoryMapStep`）。DOM も Vue も触らない。

```js
refineTheoryMapStep(state)
// state = { map, boards, mareBoard, options, cursor, limit }
// → { cursor, done, map }   // limit 頭ぶんだけ進めて返す
```

- `map` はパート2で拡張した `buildTheoryMap` の戻り値（至高チップ込み）
- `boards[i]` は候補 i の 32 セル用の種牡馬側盤面（呼び出し側が用意する）
- 1回の呼び出しで `limit` 頭ぶんだけ処理し、`cursor` を進めて返す

候補1頭ぶんの処理はパート1の `diagnoseStep` と同じ手順にする。**同じ関数を呼ぶこと。**
判定ロジックを2箇所に書かない。

結果の反映:

| 判定 | やること |
| --- | --- |
| `dangerous` が真 | **その候補のビットを全部落とす**（どのチップにも出さない） |
| `sameNameSpecialChecks.length > 0` | 至高のビットを立てる |

`dangerous` の扱いは「チップから除く」で正しい。危険な配合は組んではいけないので、
完璧で絞り込んだ一覧に混ざっていると事故になる。

### 飛ばしてよい候補（任意）

至高も危険も**クロスが1つも無ければ起こらない**（上の2つの定義より）。
32セルに同じ馬が2回以上出てこない候補は `judgeInbreed` を呼ばずに飛ばせる。

やるなら、**飛ばした場合と飛ばさない場合で結果が完全に一致することを証明してから**にする
（受け入れ基準 8）。一致しなければ**この最適化は入れない**。
クロスは同名だけでなく全兄妹や nodeId でも成立するので、名前の重複だけ見る判定が
十分条件になっているとは限らない。

## 2. チップを4つにする

`vue/logic/musume/theory-map.js` の絞り込みを変える。

```js
["PERFECT", "SUPER_PERFECT", "MIRACLE"]          // いま
["PERFECT", "SUPER_PERFECT", "MIRACLE", "SUPREME"]  // これから
```

至高チップは1通目では `pending: true` にする。`DANGEROUS` はチップにしない
（絞り込む対象ではなく、除外の理由なので）。

## 3. 分割して回す

`vue/components/musume/musume-host.js` の `sendCustomAndTheory` が理論マップを送っている。
1通目を送ったあと、重い判定を**分割して**進める。

- 1スライスあたりの頭数は、**1スライスが 16ms を超えないように**決める。
  固定値で決め打ちせず、実測して決めた値を完了報告に書くこと。
- スライスの間は `setTimeout(..., 0)` で譲る。`requestIdleCallback` は
  シートを開いた直後に走らないことがあるので使わない。
- 全部終わったら2通目の `dabimas:theory-map` を送る。**途中では送らない**
  （チップが何度も切り替わって落ち着かない）。

### 途中でやめる条件

- 起点の繁殖牝馬が変わった（`mareKey` が変わった）
- シートが閉じた
- 別の工程の候補を開いた

いずれも**進行中の計算を捨てる**。捨てたぶんの結果は送らない。
パート1で `clearSire` が後続工程を捨てるのと同じ考え方にする。

### 結果を使い回す

`mareKey` ごとに完成した `map` を持っておき、同じ母で開き直したときは
**再計算せずにそのまま2通目として送る**。親は iframe を作り直さないので、
同じ母で何度も開くことがある。

## 4. ダビ娘側の受け取り

ダビ娘は `dabimas:theory-map` を受けると `receiveTheoryMap` で状態を置き換える
（`src/features/embed/lib/embedBridge.ts`）。**2通目で上書きされることを確認する。**

上書きされない作りだった場合は、**ダビ娘側は直さずに完了報告へ書く**。
ダビ娘は別リポジトリで、この指示書の対象外である。

---

## パート2の制約

- パート1の制約をすべて引き継ぐ。
- **`vue/logic/inbreed/inbreed-detector.js` と `vue/logic/theory/*.js` を変えない。** 呼ぶだけ。
- **ダビ娘側（`C:/derby/dabimas-data`）を触らない。** 送る側だけで完結させる。
- メッセージの型（`dabimas:theory-map`）を増やさない。2通目も同じ型で送る。
- `dangerous` の候補を「チップに出すが印を付ける」形にしない。**落とす。**

## パート2のスコープ外

- Worker 化しない。まず分割で足りるかを実測する（足りなければ完了報告に書く）。
- 候補一覧のカードに危険の印を出さない（ダビ娘側の変更になる）。
- 至高の内訳（どのクロスで成立したか）を出さない。チップで絞り込めれば足りる。
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

---

## パート2の受け入れ基準

6. **`scripts/verify-theory-assist-phase5b.cjs` を新規に作る。** `vm` で読み込んで確認する。

   a. `refineTheoryMapStep` を `limit` を変えて（1頭ずつ／全部まとめて）回し、
      **どちらも同じ `map` になる**。

   b. `dangerous` が真になる候補が、完璧・超完璧・奇跡の**どのビットからも消えている**。
      実在馬で危険になる組を1つ以上使い、期待値を直接書いて突き合わせる。

   c. `sameNameSpecialChecks` が空でない候補に、至高のビットが立っている。

   d. 途中でやめたとき、`map` が書きかけのまま残らない。

7. **実機相当の計測を完了報告に書く。** ヘッドレス Chrome で CPU を4倍遅くして、
   候補 2,000 頭超に対し次を測る。

   a. 1スライスの最長時間（**16ms を超えていないこと**）
   b. 全部終わるまでの時間
   c. その間に 250ms を超える長いタスクが出ていないこと

8. 「飛ばしてよい候補」を入れた場合のみ: **飛ばした結果と飛ばさない結果が、
   候補 2,000 頭超で完全に一致する。** 一致しなければ最適化を外す。

9. **画面の確認。** ヘッドレス Chrome で配合理論補助から種牡馬を選ぶ画面を開き、次を示す。

   a. 開いた直後、チップが4つ出ていて、至高だけ押せない見た目になっている。

   b. しばらくすると至高が押せるようになり、押すと候補が絞り込まれる。

   c. 至高で絞り込んだ結果が、6-c で期待した頭数と一致する。

   d. 計算が終わる前に「戻る」で閉じても、コンソールにエラーが出ない。

10. パート1の受け入れ基準1〜5が**引き続き**通る。

## パート2の検証コマンド

```
node scripts/verify-theory-assist-phase5b.cjs
node scripts/verify-theory-assist-phase5a.cjs
node scripts/verify-musume-logic.cjs
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html
```

---

## 完了報告（Codex が記入する）

### 変更ファイル一覧

- `vue/logic/plan/assist-diagnosis.js`（新規）: 1組のクロス・因子集計。
- `vue/logic/plan/assist-plan.js`: 診断結果、危険・至高の理論表示、工程ごとの開閉状態と解除。
- `vue/components/assist/assist-factor-table.js`（新規） / `assist-screen.js`: 本体と同じ14列の表、クロス詳細、危険表示、候補検索への母盤面の受け渡し。
- `vue/logic/musume/theory-map-heavy.js`（新規） / `theory-map.js`: 至高の計算待ちチップ、分割判定、危険候補の全ビット除外。
- `vue/components/musume/musume-host.js`: 2段階送信、実測による処理頭数調整、中断、母別結果・種牡馬盤面キャッシュ。
- `index.html` / `service-worker.js`: 新規3ファイルの登録、キャッシュを `v20260916-07` に更新。
- `scripts/verify-theory-assist-phase5a.cjs` / `phase5b.cjs`（新規）: 実データ・純粋関数の検証。
- `scripts/verify-theory-assist.cjs` / `verify-theory-assist-screen.cjs` / `verify-theory-assist-phase4a.cjs`: 新依存の読込と4チップへの期待値更新。
- `scripts/fixtures/theory-assist-phase5.html` / `scripts/measure-theory-assist-phase5.cjs`（新規）: 375px画面検証、CPU4倍のCDP計測。
- `scripts/codex-powershell.ps1` / `scripts/run-headless-chrome.ps1`: 任意のデバッグポート指定。通常のスクリーンショット・DOM取得は従来どおり。指定時は仮想時間による終了を止め、CDP接続用にChromeを維持する。

### 設計判断

- 判定本体・因子本体・既存ヘッダ・ダビ娘側は変更していない。重い候補判定も `diagnoseStep` を呼ぶ。
- 現行 `judgeInbreed` は `inbreedList` を返さないため、未返却時は本体が判定前に初期化するのと同じ空の32枠を渡す。手動クロスは持ち込まない。
- 仮想母は保存台帳に存在しない固定のcustom IDではなく、既存 `composeVirtualMareBoard` の親参照つきimplied参照を使い、後工程でも両親を解決できるようにした。
- `refineTheoryMapStep` の `boards[i]` は16セルの種牡馬盤面。対応する送信キーは `options.candidateKeys[i]` で渡す。入力mapは変更せず、中断時に送信済みの軽い結果や完成済みキャッシュを汚さない。
- スライスは初回1頭から開始し、実測最大時間から `max(1, floor(8 / maxPerHorse))` を決める。次の1頭で8ms予算に届く場合は `setTimeout(..., 0)` へ譲る。4倍CPUの実測では1頭/スライスまで下がった。
- 保存馬の変更・候補集合の変更時は完成mapを無効化。詳細取得後にも中断判定を行う。取得できない詳細を0件として完成扱いにせず、エラーを表示する。ダビふぁくに対応しないマスター候補のビットは落とす。
- 名前重複だけで判定を飛ばす最適化は入れていない（受け入れ基準8は対象外）。

### 実行した検証と結果

- パート1を先に実装し、既存20本＋phase5aの21本と375pxの画面検証を通してからパート2に着手。
- 最終の `verify-*.cjs` は共通部品を除く **22本すべてPASS**。その後追加したphase5bの実データ2,433頭の期待件数検証もPASS。
- `verify-index-exp .\\index.html`: PASS。index編集前のbackup、各編集後のverifyを実行。`git diff --check` と計測スクリプトの構文チェックもPASS。
- phase5a: スターベガ×スターアルタイル（瓏覇）の集計が本体と一致。ニトロの期待値は `01,17,12,04,03,01,00,00,01,01,00,00,00,00`。実在するクロス0件/ありの組、エアグルーヴ×トニービンの危険表示、resolver/nodeTableなしを確認。
- 1組の診断時間（Node、同じ実データ、nodeTable/resolverあり）: 初回 **42.51ms**、100回平均 **15.61ms**。この測定の初回は50ms以内。4倍CPUでは候補1頭でも50msを超えるスライスあり。
- phase5b: limit=1と一括の結果一致、実在父娘の危険候補の全ビット除外、至高の合成盤面1頭、入力map不変を確認。実マスター2,433頭×スターベガでは至高0頭で、画面の絞り込み件数とも一致。
- Chrome画面: ニトロ/クロス表示、詳細の初期折り畳みと開閉、件数、選び直しによる後続解除、375pxでの画面内横スクロールなしを確認。至高は計算中disabled、完了後クリック可能で「0件・該当なし」を表示。同じ母の再表示で再計算なし、計算途中の閉鎖でジョブ破棄を確認。計測中に未捕捉のJavaScript例外は観測されなかった。
- ダビ娘の `src/features/embed/store/useEmbedStore.ts` を読み取り確認。`receiveTheoryMap` は2通目で `theoryMap` を置き換える。ダビ娘側の変更なし。
- 規約/仕様の独立レビュー: 各0件の修正必須指摘。性能は下記の実測で別途判定。

#### CPU4倍の測定結果（詳細を事前取得、候補2,480頭、母スターベガ）

| 項目 | 再測定結果 | 判定 |
| --- | ---: | --- |
| 最長スライス | **82.1ms** | 16ms以内を満たさない |
| 全処理時間 | **73,041.3ms** | 記録値 |
| 計算開始以降の最長タスク | **425ms** | 250ms超なしを満たさない |
| シート起動等も含む観測区間の最長タスク | 588ms | 参考 |
| 至高の結果 | 0頭 | テスト・画面と一致 |

初回測定も最長72.7ms・全体69,734.1msで、16msを超えた。再測定では通常テスト全件の実行完了後に確認した。単一候補の既存同期判定は途中で分割できず、1頭/スライスでもこの環境の条件を満たせない。**受け入れ基準7-a/7-cは未達であり、性能面を合格扱いにしない。** Worker化・判定本体の変更は今回の対象外のため未実施。

再現手順（統合検証用のダビ娘ビルドが `dabimas-data/dist/` に必要）:

```powershell
python scripts/lan_server.py 8794 --bind 127.0.0.1
# 別ターミナル。DebugPort指定時はChromeを維持する。
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 dump-dom "http://127.0.0.1:8794/scripts/fixtures/theory-assist-phase5.html?heavy" 375 844 300000 9224
# さらに別ターミナル
node scripts/measure-theory-assist-phase5.cjs
```

計測結果は `tmp/phase5-metrics.txt` に保存される。画面検証のPASSと性能基準の合否は別で、数値を上の閾値と比較する。

### 残課題・気づき

- 性能基準7-a/7-cの達成には、Worker化または判定関数内部を中断可能にするなど、今回の制約を超える対応の検討が必要。
- 詳細未取得時は `ensureHorseDetail` の非同期待ちもスライスの経過時間に含む。上表は事前取得後の値であり、通信待ちだけが超過理由ではない。
- 長いタスクは埋め込み画面の処理も含む観測値。425msのすべてを診断関数自身の実行時間とは断定していない。
- `main` へのマージ、push、ダビ娘側の編集は行っていない。


---

# 差し戻し（2026-09-16 検収）

## パート1 — 合格

受け入れ基準1〜5を検収側で再実行し、すべて満たしていることを確認した。

- 基準1: `verify-index-exp` PASS
- 基準2: 共通部品を除く `verify-*.cjs` **22本すべて PASS**
- 基準3: `verify-theory-assist-phase5a.cjs` を読んだ。本体の手順（`judgeInbreed` →
  `buildInbreedFactorCounts` → `dispFactorCounts`）を素で書いたものと突き合わせており、
  a〜e を満たしている。ニトロの期待値を直接書いている点もよい
- 基準4: 375px のヘッドレス Chrome で再実行。a〜d すべて満たす。JS エラーなし
  - 未計算が消え、ニトロ `02 08 06 09 00 00 00 00 01 05 00 01 00 02` が出る
  - 「クロスの詳細（1件）」が畳まれており、押すと「トニービン 1 × 2 危険」が出る
  - 2代目を選び直すと3代目の診断が消える
  - 横スクロールなし（中身 375px ／ 画面 375px）
- 基準5: 検収側の実測で初回 27.3ms・100回平均 9.2ms。50ms 以内

`inbreedList` を32個の null で渡している点も正しい。本体（`inbreed-ui.js:34`）は
`judgeInbreed` の直前に `this.inbreedList` を32個の null で初期化しており、
`performInbreedFactorCounts` はその状態で呼ばれる。手動クロスの反映はその後なので、
この画面の「表示だけ」という要件と一致する。

## パート2 — 差し戻し。ただし原因はこちらの設計にある

**基準7（性能）が未達である点は、Codex の報告どおりである。** 実装の問題ではない。
**指示書に書いた前提の数字が間違っていた。**

### 何が間違っていたか

指示書と設計書 §1.4 は「1組 0.5〜0.7ms、全候補で 1.3〜1.7 秒」と書いていた。
検収側で条件を切り分けて測り直した（このPC・CPU等倍）。

| 測るもの | nodeTable / resolver なし | あり |
| --- | ---: | ---: |
| `judgeInbreed` 1組 | 0.90 ms | **7.13 ms** |
| `diagnoseStep` 1組 | 1.41 ms | **10.23 ms** |
| 全候補 2,433 頭に換算 | 3.4 秒 | **24.9 秒** |

**設計書の数字は nodeTable も resolver も渡さずに測ったものだった。**
実アプリは同一馬の別バージョンを見分けるために両方を渡すので、8倍近く重い。
CPU4倍の実測で 73 秒だった Codex の値は、この 24.9 秒とよく一致する。

24.9 秒は分割では解決しない。**分割で逃げられるという指示書の前提が誤りだった。**

### どう変えるか

検収側で、軽い判定がチップを立てる候補の数を数えた（実データ 2,433 頭の種牡馬、母6頭）。

```
アイウィルフォロー   1 頭   アイムファウンダー  0 頭
アイシテマース      3 頭   アイムホーム       0 頭
アイスサイレント     0 頭   アイラブエンバク    0 頭
```

**平均1頭。** つまり「完璧・超完璧・奇跡のどれかが立っている候補」だけに重い判定を
かければ、**10ms 程度で終わる。**

そこでパート2を次のように作り直す。

1. **重い判定は、軽い判定でビットが立った候補だけに回す。** 全候補には回さない。
   分割も中断も要らない（10ms なら1回で終わる）。スライス制御・進捗・キャッシュの
   仕組みは不要になるので、**入れたものを外す。**

2. **危険な候補をチップから落とす。** ここは今の実装のままでよい。
   実害（完璧で絞った一覧に危険な配合が混ざる）はこれで消える。

3. **至高チップは出さない。3つに戻す。**
   至高は軽い判定と無関係に成立するので、上の絞り込みでは見つけられない。
   全候補に回すと 25 秒かかるため、チップとしては成立しない。
   至高は**選んだ1組**については パート1 が出しており（実機で確認済み）、
   利用者が実際に必要とする場面はそちらで満たせている。

4. 2通目の `dabimas:theory-map` は**やめてよい**。1通目を送る前に重い判定まで
   終わらせられる（軽い判定 25ms ＋ 重い判定 10ms）。

`vue/logic/musume/theory-map-heavy.js` は残してよいが、`cursor` / `limit` / `done` の
分割インターフェースは不要になる。**候補の配列を受け取って一度に返す形に単純化する。**

### あわせて直すもの（軽微）

- `vue/components/assist/assist-factor-table.js` がレイアウトを `style` 属性で
  書いている。この構成では CSS ファイルに置くのが通例なので、`css/unified.css` へ
  移す（暗い側が要るなら `css/dark.css` へ）。
- `scripts/codex-powershell.ps1` / `run-headless-chrome.ps1` の `DebugPort` 追加は
  そのまま残してよい。既定 0 で従来どおりに動くことを検収側で確認した。
  本来はスコープ外だが、こちらが要求した基準7の計測に必要だったもので、
  後方互換なので受け入れる。

### 作り直しの受け入れ基準

11. チップが3つ（完璧・超完璧・奇跡）に戻り、`pending` がすべて `false`。
    `verify-theory-assist-phase4a.cjs` の期待値も3つに戻す。

12. 危険な候補がどのビットからも落ちている（基準6-b をそのまま使う）。

13. 理論マップの生成（軽い判定＋重い判定）にかかる時間を実測し、完了報告に書く。
    **実データ 2,433 頭・CPU4倍で 500ms を超えたら報告すること。**

14. 重い判定に回した候補の数を数えられるようにし、実データの母3頭ぶんを完了報告に書く。

15. 基準1〜5（パート1）が引き続き通る。
