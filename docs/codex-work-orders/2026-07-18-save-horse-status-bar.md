# 作業指示書: 配合の種牡馬・繁殖牝馬保存／配合ステータスバー（統合版仕様 §24）

- status: 完了（2026-07-18 検収済み。実機・実画面の操作確認は残（完了報告の「未検証」項目参照））
- 作成日: 2026-07-18
- 依頼元: Claude Code セッション

## 背景と目的

- ブランチ `feature/dabifaku-unified` には、統合版（カテゴリ・作業枠）ラッパー本体（`docs/dabifaku_unified_spec_draft.md` §1〜§23）が**未コミットの作業ツリー変更として実装済み**である。この未コミット変更は正常なベースラインなので、壊さない・巻き戻さない・再フォーマットしないこと。
- 本指示書は統合版仕様の追補 §24「配合の種牡馆・繁殖牝馬保存／配合ステータスバー」を実装する。
- **詳細設計は `docs/save-as-horse-and-status-bar-design.md` を正とする**。本指示書はその実装依頼であり、実装内容・データ形式・受入条件はすべて同設計書に従う。設計書と現行コードに矛盾を見つけた場合は、勝手に解釈せず実装を止めて完了報告に書くこと（設計書 §0.1）。
- 本件は連続する 3 件の指示書の 1 件目である。後続の指示書で「系統ID・レア度付与（`docs/sire-line-id-design.md`）」「相性ニックス表示（統合版仕様 §25）」を別途依頼する。したがって本件では **`affinity.js` は null を返すスタブのまま**とし、相性計算を先取り実装しない。

## 実装方針

1. 最初に `docs/save-as-horse-and-status-bar-design.md` を**全文**読む。特に §2（現状の事実）→ §3（データ設計）→ §4.3（descendants マッピング表。本設計の核心）→ §8（変更・新規ファイル一覧）→ §10（実装順序）→ §11（受入条件）。
2. 実装は設計書 §10 の順序（builder → 保存ダイアログ → 候補リスト統合 → ☆馬の本体挙動 → ステータスバー → service worker → 検証）に従う。
3. 触ってよいファイルは設計書 §8 の一覧に列挙されたものだけ。それ以外のファイル変更が必要になったら、実装せず完了報告に理由を書く。
4. **§4.3 のマッピング検証で 1 件でもズレた場合は実装を止めて報告する**（設計書 §12-1。マッピング表と本体エンジンのどちらが正かは人間が判断する）。

### 変更対象ファイル（設計書 §8 の転記。詳細は設計書を正とする）

新規:

- `vue/logic/horses/saved-horse-builder.js` — `buildSavedHorseRecord(kind, title, cells)` 純関数（設計書 §4.3）
- `vue/logic/theory/affinity.js` — 相性値計算スタブ（設計書 §6.3。null 返しのまま）
- `vue/components/header/combination-status-bar.js` — 配合ステータスバー（設計書 §6.1）

変更:

- `vue/CombinationDialog.js` — 保存種別トグル・保存フロー・一覧バッジ・削除連動・`saved-horse-created` / `saved-horse-removed` emit
- `vue/logic/pedigree/pedigree-builder.js` — `generateUuid` のエクスポート 1 行追加のみ
- `vue/logic/pedigree/pedigree-selection.js` — rowState に `factorLocked` 追加
- `vue/components/pedigree/pedigree-row.js` — `isStarSelection` に factorLocked 条件追加
- `vue/logic/inbreed/inbreed-detector.js` — ☆をクロス判定除外に追加
- `vue/app/methods/pedigree-cells.js` — 薄め名生成で先頭☆除去
- `vue/app/app-state.js` — `savedHorseSummaries: []` 追加
- `vue/app/methods/horse-loading.js` — `loadSavedHorseSummaries()` 追加・`buildHorseLists()` への合成
- `vue/app/methods/bootstrap.js` — `restoreInputData()` / `initializer()` の候補合成に保存馬を追加
- `vue/app/app-computed.js` — `affinityScore` / `affinityDisplayText` 追加
- `index.html` — `<combination-status-bar>` 挿入・イベント紐付け・script タグ 3 本追加（挿入位置は設計書 §8「script タグの挿入位置」）
- `css/unified.css` — `.combination-status-bar` 系スタイル追記
- `service-worker.js` — 新規 3 ファイルを `urlsToCache` へ追加・`CACHE_NAME` bump（1 回だけ）

## 制約

- `AGENTS.md` の Safety Rules に従うこと（`index.html` は apply_patch 限定・編集前 backup・編集後 verify・BOM 禁止）。
- 新規 JS は既存の `vue/components/header/factor-summary-header.js` と同じ流儀: classic script（IIFE + `window.Dabimas` 名前空間）、UTF-8 BOM なし。ES Modules にしない。
- 設計書 §8「変更してはいけないもの（禁止事項）」を厳守（`DabifacCombinationDB` の version・localStorage 6 キー・`configData` ロジック・`setDataForPedigree` 等の詰め替えエンジン・統合版コード・`applyMobileViewportLayout` の計算式・mobile-horse-picker の IME まわり・旧レコードのマイグレーション禁止）。
- `affinity.js` の `calculateAffinity(context)` が相性計算の唯一の差し込み口になる構造を保つ（設計書 §12-4）。
- git の commit / branch / restore / stash 操作を一切行わない。作業ツリーの既存未コミット変更に触れない。

## スコープ外（やらないこと）

- 統合版仕様 §25（相性ニックス表示・WASM）: `vue/logic/nicks/`・`assets/`・`data/` に触れない。相性は「--」表示のままでよい。
- `docs/sire-line-id-design.md` の実装（スクレイパー変更・`sonId` / `rare` 付与）。
- `docs/settings-and-edit-stallion-design.md` の実装。
- 統合版コード（`vue/logic/workspace-sync.js`・`vue/logic/storage/`・`vue/components/home/`・`vue/components/workspace/`）のリファクタリング・修正。
- リポジトリ直下の `out.txt`・`note-article/`・`skills/`・`docs/`（本指示書の完了報告記入を除く）への変更。
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

1. `powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp index.html` が `[verify] OK` を返す。
2. `dump-dom`（390×844）の出力に `combination-status-bar` の DOM（「相性」ラベル・「--」値・`data-html2canvas-ignore` 付き保存ボタン）が含まれる。※初期状態の起動はホーム画面になるが、本体 header は `v-show` なので DOM には常に存在する。
3. `buildSavedHorseRecord` の出力が設計書 §4.3 のマッピング表と**機械的に**一致確認されている。方法は問わない（Node がある場合: window シムを与えて IIFE を読み込む一時スクリプトで 32 セルのダミー入力→15 件の descendants を表と照合。ない場合: 全 15 行の突き合わせ表を完了報告に記載）。ズレが 1 件でもあれば実装を止めて報告。
4. `service-worker.js` の `urlsToCache` に新規 3 ファイルが追加され、`CACHE_NAME` が 1 回 bump されている。
5. 設計書 §11 の受入条件 **A-1〜A-11 / B-1〜B-6 / C-1〜C-3 の全項目**について、完了報告に「実装箇所」「確認方法と結果」を 1 行ずつ記録している。ヘッドレス環境で操作再現できない項目（実機タップ・IME・PWA 再起動など）は「未検証（検収時に確認）」と明記する — 無言のスキップは不可。

## 検証コマンド

```powershell
# index.html 編集前（必須）
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 backup-index-exp index.html

# index.html 編集後（必須）
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp index.html

# ローカル配信（リポジトリルートで。service worker 込みで動かすため file:// は使わない）
python -m http.server 8080

# DOM 確認（受け入れ基準 2）
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 dump-dom http://localhost:8080/index.html 390 844

# スクリーンショット（起動時はホーム画面が写る。エラー表示が出ていないことの確認用）
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 screenshot http://localhost:8080/index.html tmp/unified-home.png 390 844
```

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。

### 変更ファイル一覧

- 新規: `vue/logic/horses/saved-horse-builder.js`、`vue/logic/theory/affinity.js`、`vue/components/header/combination-status-bar.js`
- 変更: `vue/CombinationDialog.js`、`vue/logic/pedigree/pedigree-builder.js`、`vue/logic/pedigree/pedigree-selection.js`、`vue/components/pedigree/pedigree-row.js`、`vue/logic/inbreed/inbreed-detector.js`、`vue/app/methods/pedigree-cells.js`
- 変更: `vue/app/app-state.js`、`vue/app/methods/horse-loading.js`、`vue/app/methods/bootstrap.js`、`vue/app/app-computed.js`
- 変更: `index.html`、`css/unified.css`、`service-worker.js`
- 完了報告記入: `docs/codex-work-orders/2026-07-18-save-horse-status-bar.md`

### 設計判断

- §4.3 の取得元15セルと `setDataForPedigree` の配置先15セルを実装前に機械照合し、全件一致を確認してから実装した。
- 候補再合成は `refreshCandidateLists()` に集約し、起動時は保存馬ロードを本体 summary fetch と並行実行したうえで、`c4()` 後に選択中セル由来候補を保って再合成する。
- 保存直後の候補反映では `saveCustomHorse()` が付与した `createdAt` / `updatedAt` を含むレコードを emit し、IndexedDB 再読込なしで detail cache と候補先頭を更新する。
- 相性計算は `calculateAffinity(context)` の null 返却スタブのみとし、§25 の計算処理は実装していない。
- 作業指示の「git 操作禁止」を優先し、commit / branch / restore / stash は実行していない。

### 実行した検証と結果

- `verify-index-exp index.html`: `[verify] OK`（編集直後と最終ゲートの2回）。`index.html` と新規3 JS の UTF-8 BOM なしも確認。
- Node 機械テスト: 32ダミーセルからの15 descendants、因子配列コピー、`setDataForPedigree` 配置先を全件照合して成功。繁殖牝馬の `sex` と欠損セル例外も成功。
- Node モックテスト: 馬レコード→configs の保存順、configs 失敗時 rollback、localStorage 6キー不変、作成/削除 emit、候補の性別別先頭合成、createdAt 降順ロードと detail cache を確認して成功。
- Node 挙動テスト: factorLocked 投影、☆/★クロス除外と通常馬クロス維持、`★１薄めタイトル` 生成、相性 null/数値/例外表示を確認して成功。
- service worker 照合: `index.html` の Vue script 53本が全て cache 対象。新規3ファイルを確認。作業開始時の `v20260705-02` から `v20260705-03` へ1回 bump。
- `dump-dom http://localhost:8080/index.html 390 844`: 描画後の `.combination-status-bar`、「相性」、「--」、保存ボタンの `data-html2canvas-ignore="true"` を確認。
- `screenshot ... 390 844`: 初期ホーム画面がエラー表示なく描画されることを確認（ステータスバーは category 画面側なので画像には非表示）。
- `node --check`: 対象14 JS 全て成功。`git diff --check`: 成功。
- `python -m pytest`: 8件すべて成功。

### 受入条件チェックリスト（設計書 §11 全項目）

- A-1: `saveConfig()` → `saved-horse-created` → `handleSavedHorseCreated()` → `refreshCandidateLists()` を実装。モックで種牡馬サマリが種牡馬候補先頭に入ることを確認。実画面保存操作は未検証（検収時に確認）。
- A-2: `sex: "1"` の繁殖牝馬サマリを性別別に合成。モックで繁殖牝馬候補先頭だけに入ることを確認。実画面保存操作は未検証（検収時に確認）。
- A-3: `saved-horse-builder.js` と `pedigree-builder.js`。取得元 `[0,1,2,4,5,3,6,7,17,18,20,21,19,22,23]` と配置先15セル、馬名・因子コピーを Node で全件一致確認済み。
- A-4: broodmare record の `sex: "1"`、descendants 15件を Node で確認。セル16からの実画面選択は未検証（検収時に確認）。
- A-5: `inbreed-detector.js`。☆/★は除外、通常馬の同名クロスは維持されることを Node で確認。ニトロ・理論・子系統を含む実画面の通し操作は未検証（検収時に確認）。
- A-6: `pedigree-selection.js` / `pedigree-row.js`。factorLocked が rowState に伝わり、既存 `isStarSelection` 経路を無効化することを Node とコード経路で確認。実機タップは未検証（検収時に確認）。
- A-7: `pedigree-cells.js`。☆タイトルを深い世代へ置く入力で `★１薄めタイトル` が生成されることを Node で確認済み。
- A-8: `CombinationDialog.js`。configData 6キー構築と既存復元処理を変更せず、追加フィールドのみ付与。6キー不変をモック確認。新旧レコードの実画面復元は未検証（検収時に確認）。
- A-9: `deleteConfig()` / `handleSavedHorseRemoved()`。configs→customHorses 削除、remove emit、候補再合成をモック確認済み。配置済みセルを含む実画面操作は未検証（検収時に確認）。
- A-10: `loadSavedHorseSummaries()` と `dbinitializer()`。kind filter・createdAt降順・起動後再合成を機械確認。PWA再起動と作業枠切替の実機操作は未検証（検収時に確認）。
- A-11: 既存 `collectCustomHorseIds` / `readCustomHorses` / `writeCustomHorses` を変更せず、新保存馬も同じ `source: "custom"` / `customHorseId` 経路に接続。サイトデータ削除相当の実機復元は未検証（検収時に確認）。
- B-1: `combination-status-bar.js` / `unified.css` / `index.html`。高さ24pxの描画済みDOMを390×844 dumpで確認。PC実表示は未検証（検収時に確認）。
- B-2: `@open-save="handleCombinationCellClick"` をDOMで確認。実際のPC・モバイルクリックは未検証（検収時に確認）。
- B-3: `affinity.js` / `app-computed.js`。null→`--`、数値42→`42`、例外→`--` を Node で確認済み。
- B-4: header内最下段に固定24pxバーを配置し、既存 `applyMobileViewportLayout()` は未変更。390×844 DOM描画は成功。category画面での32行収まりは未検証（検収時に確認）。
- B-5: 相性表示には除外属性を付けず、保存ボタンだけに `data-html2canvas-ignore` があることをDOM確認。category画面の実スクリーンショットは未検証（検収時に確認）。
- B-6: 初期ホーム画面の390×844スクリーンショットと、非表示category header内の描画済みDOMを確認。作業枠作成・切替を伴う実操作は未検証（検収時に確認）。
- C-1: 通常馬用の選択・削除・メモ・手動クロス・復元エンジンは変更していない。既存 pytest 8件成功。通常配合の実画面回帰一式は未検証（検収時に確認）。
- C-2: `configKindLabel()` は kindなしを「配合」にし、復元処理は既存のまま。旧IndexedDBレコードでの実画面表示・復元は未検証（検収時に確認）。
- C-3: `mobile-horse-picker.js` は未変更。IME・フリック検索の実機操作は未検証（検収時に確認）。

### 残課題・気づき

- 上記で「未検証（検収時に確認）」としたPC/モバイル実操作、IME、PWA再起動、作業枠切替、サイトデータ削除相当の確認が残る。
- 設計書と現行コードの矛盾、および §4.3 マッピングのズレは見つからなかった。

---

## 検収記録（Claude、2026-07-18）

- 受け入れ基準 1: `verify-index-exp index.html` を再実行 → `[verify] OK`。
- 受け入れ基準 2: ローカル配信＋`dump-dom 390×844`（VirtualTimeBudget 30000）を再実行 → マウント済み DOM に `.combination-status-bar`（label / value=`--` / spacer / save）と保存ボタンのみの `data-html2canvas-ignore="true"` を確認。※既定の budget 12000 では Vue マウント前の DOM しか取れないことがある（次回以降の指示書に反映）。
- 受け入れ基準 3: 独自の Node スクリプトで `buildSavedHorseRecord` を再照合 → descendants 15 件の取得元・name/subName/parentLine/factors/factorLocked 全件一致、broodmare の sex="1"、欠損セル throw も確認。
- 受け入れ基準 4: `service-worker.js` の diff で新規 3 ファイル追加と `CACHE_NAME` bump（v20260705-02 → -03、Codex 分は 1 回）を確認。
- 受け入れ基準 5: チェックリスト全 20 項目記入・未検証項目の明示を確認。
- コードレビュー: 変更ファイルは設計書 §8 の一覧と完全一致。§4.1/4.2/4.5/4.6/§5/§6 とも設計どおり。禁止事項（combination-storage / 詰め替えエンジン / 統合版コード / ui-viewport / mobile-horse-picker）への変更なし。`python -m pytest` 8 件成功、対象 JS の `node --check` 成功。差し戻し事項なし。
- 残: 実機・実画面での操作確認（保存→☆馬選択の再現、モバイル行高、IME、PWA 再起動、旧レコード復元）。
