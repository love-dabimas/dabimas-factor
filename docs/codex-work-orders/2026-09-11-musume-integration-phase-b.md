# 作業指示書: ダビ娘をダビふぁくに組み込む（ダビ娘統合 Phase B）

- status: 実装完了・検収待ち
- 作成日: 2026-09-11
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 上位仕様: `docs/dabimusume-integration-design.md` v1.4（以下「設計書」）の §4・§5・§6・§7.1・§12
- 前提: ダビ娘側（Phase A）は `dabimas-data` リポジトリのブランチ `feature/embed-mode`（`7eb0385`）に実装済みで、まだ公開していない。そのビルドを、このリポジトリの `dabimas-data/dist/` にローカル検証用として置いてある（git の管理外）
- **公開の順番:** この変更は、Phase A が本番に出るまで本番に出してはいけない。本番のダビ娘には埋め込みモードがなく、❤ も馬選択も動かない。push はしないこと

---

## 背景と目的

ダビふぁく（このリポジトリ。本番は `/dabimas-factor/`）とダビ娘（`dabimas-data` リポジトリ。本番は `/dabimas-data/dist/`）は、同じ GitHub Pages のオリジンで動く別々のアプリである。ダビ娘は馬を条件で探すサイトで、使っている人が案外多い。これをダビふぁくの中に同一オリジンの iframe で組み込み、次の 3 つを実現する。

1. ダビ娘の検索結果のカードに ❤ を付け、お気に入りの馬をダビふぁくに保存する
2. 血統表の馬選択で「お気に入りのみ」に絞れるようにする。スマホの馬選択ダイアログからは「条件で探す」でダビ娘を開き、選んだ馬をそのままセルに入れられる
3. ホーム画面からダビ娘を単体で開ける

ダビ娘側の準備（Phase A）は終わっている。ダビ娘は URL のクエリで埋め込みモードになり（単体は `?embed=1`、馬選択は `?picker=1&sex=0|1|any`）、親のダビふぁくと `postMessage` でやり取りする。この指示書は、ダビふぁく側（Phase B）のすべてを扱う。

画面の見た目と操作は、iPhone で 7 ラウンド触ったプロトタイプで決まっている（設計書 §6 と付録 A）。プロトタイプの親側のコードは `docs/dabimusume-integration/host-prototype.js` にある。挙動を確かめる参考にはなるが、登録済みコンポーネントのテンプレートを文字列で差し替えるなど、本実装には使えない書き方をしている。メッセージ名も古い（`dabimas-proto:`）。コードは写さないこと。

### ダビ娘とのメッセージ（Phase A の実装から写したもの）

設計書 §4 と同じ内容で、ダビ娘側はこの形で実装済みである。形を 1 文字も変えないこと。

| 向き | type | 中身 | いつ |
|---|---|---|---|
| ダビ娘 → 親 | `dabimas:hello` | `{ v, mode: "embed" \| "picker" }` | 検索画面が出たとき |
| 親 → ダビ娘 | `dabimas:favorites` | `{ v, supportedKeys?, favoriteKeys?, favoritesOnly? }` | hello への返事（`supportedKeys` 付き）と、お気に入りか「お気に入りのみ」が変わるたび |
| ダビ娘 → 親 | `dabimas:favorite-toggle` | `{ v, horseId, gender }` | ❤ が押されたとき |
| ダビ娘 → 親 | `dabimas:favorites-only` | `{ v, value }` | ダビ娘の「お気に入りのみ」が押されたとき |
| ダビ娘 → 親 | `dabimas:select` | `{ v, horseId, gender, name }` | 馬選択の下部バーで「この馬を入れる」が押されたとき |
| 親 → ダビ娘 | `dabimas:reset-pick` | `{ v }` | 別のセル用に開き直したとき、馬を入れ終わったとき |

- `v` は常に `1`。`horseId` は数字だけの文字列（例 `"3315497239"`）、`gender` は `"0"`（種牡馬）か `"1"`（繁殖牝馬）
- ダビ娘側の馬のキーは `"<HorseId>-<Gender>"`（例 `"3315497239-0"`）。ダビふぁくの id は `s`（種牡馬）か `b`（繁殖牝馬）に HorseId を続けたもの（例 `"s3315497239"`）。変換は親（ダビふぁく）だけが行う
- ダビ娘は、親から届くメッセージのうち、`event.origin` が自分と同じで `event.source === window.parent` のものだけを受け取る。`dabimas:favorites` は、入っている項目だけを上書きする（省いた項目は前の値のまま）
- ダビ娘は `supportedKeys` が届くまで ❤ を出さず、届いた後も `supportedKeys` にない馬には出さない。ダビふぁくのデータにいない 65 頭に ❤ を付けさせないため

---

## 実装方針

### 全体の流れ

```
ホームのタイル ── $root.currentScreen = "musume" ──→ <musume-host> の単体画面（iframe ?embed=1）
馬選択ダイアログの「条件で探す」── $root.$emit("musume:open-search") ──→ <musume-host> のシート（iframe ?picker=1&sex=…）

ダビ娘（iframe） ⇄ postMessage ⇄ <musume-host> ⇄ window.Dabimas.favorites ⇄ repository（IndexedDB）
馬選択ダイアログ・PC の入力欄 ── 読む・切り替える ──→ window.Dabimas.favorites.state
```

- お気に入りの正本は IndexedDB `dabifaku_unified` に置く。ダビ娘は親から配られた写しを表示するだけで、DB には触らない
- iframe を持ち、メッセージを受け、トーストを出すのは、新しいコンポーネント `<musume-host>` の 1 か所だけにする

### 設計書からの補足（Claude が決めたもの）

実装に入る前に、設計書を読んだうえで次を決めた。設計書と食い違って見えても、この指示書に従うこと。設計書は検収のときに Claude が直す。

1. **iframe への配信は `musume-host` が持つ。** 設計書 §7.1 は `favorites.js` に「iframe への配信」を置いているが、`favorites.js` は DOM を知らないほうが Node で検証できる。`musume-host` が `favorites.state` を監視して配る
2. **`vue/logic/musume-link.js` を足す。** セルの性別の規則、ID の変換、メッセージの検査を、DOM も Vue も使わない関数にまとめ、Node で検証できるようにする
3. **シートの見出しのセル名は、馬選択ダイアログの副題と同じにする**（例「種牡馬検索 ⑩」）。設計書 §6.4 の例「種牡馬側・祖先1」は `index % 16` の番号で、画面の丸数字と一致しない（index 3 は ⑩）
4. **Service Worker は `/dabimas-data/` へのリクエストに手を出さない。** 理由はパート 10
5. **スマホのホームをスクロールできるようにする。** 理由はパート 11
6. **PC の入力欄で「お気に入りのみ」をオンにしても、そのセルで選択中の馬は候補に残す。** 理由はパート 8
7. **起動時にダビ娘へ着地するときも、カテゴリの読み込みは今までどおり行う。** 理由はパート 4

### 変更対象ファイル

新規:

- `vue/logic/storage/favorite-repository.js` — `favorites` ストアの読み書き（パート 1）
- `vue/logic/musume-link.js` — ダビ娘との取り決め。URL、セルの性別、ID の変換、メッセージの検査（パート 2）
- `vue/logic/favorites.js` — お気に入りのメモリ上の状態と保存（パート 3）
- `vue/components/musume/musume-host.js` — 単体画面・シート・メッセージの受け口・トースト（パート 5）
- `scripts/verify-musume-logic.cjs` — Node での検証（受け入れ基準 B）
- `scripts/verify-musume-ui.html` — ヘッドレス Chrome での検証（受け入れ基準 C）

変更:

- `vue/logic/storage/unified-db.js` — version 3、`favorites` ストア（パート 1）
- `vue/logic/storage/app-meta-repository.js` — 先頭コメントのキー一覧だけ（パート 1）
- `vue/app/main.js` — お気に入りを読み終えてから `new Vue`（パート 4）
- `vue/logic/workspace-sync.js` — 起動時のダビ娘への着地、`rememberScreen()`（パート 4）
- `vue/components/home/home-page.js` — 見出し 2 つとタイル（パート 6）
- `vue/components/pedigree/mobile-horse-picker.js` — 「条件で探す」「お気に入りのみ」（パート 7）
- `vue/components/pedigree/desktop-horse-autocomplete.js` — 候補一覧の先頭の「お気に入りのみ」（パート 8）
- `index.html` — `<musume-host>` と script タグ（パート 9）
- `service-worker.js` — キャッシュ一覧、`CACHE_NAME`、`/dabimas-data/` の除外（パート 10）
- `css/unified.css` — ホーム、単体画面、シート、「お気に入りのみ」（パート 11）

### パート 1: 保存（`unified-db.js`、`favorite-repository.js`、`app-meta-repository.js`）

- `unified-db.js`: `DB_VERSION` を `3` にし、`FAVORITE_STORE_NAME = "favorites"` を足して公開する。`onupgradeneeded` に、既存のストアと同じく `db.objectStoreNames.contains` で守った分岐を足し、`db.createObjectStore("favorites", { keyPath: "id" })` を作る（インデックスは作らない）。先頭コメントの「4ストア」も直す
- `favorite-repository.js`（新規）: `edit-stallion-repository.js` と同じ形で書き、`window.Dabimas.repositories.favorites` に次を公開する
  - `getAll()` — レコードの配列 `[{ id, createdAt }]` を返す
  - `add(id)` — `{ id, createdAt: Date.now() }` を put する
  - `remove(id)` — delete する
- `appMeta` に足すキーは 2 つ。値の形だけを決め、DB の版は上げない
  - `favoritesOnly` — `true` / `false`
  - `lastScreen` — `"home"` / `"category"` / `"settings"` / `"musume"`
- `app-meta-repository.js` はコードを変えず、先頭コメントのキー一覧に上の 2 つを足すだけにする

### パート 2: `vue/logic/musume-link.js`（新規）

DOM と Vue を使わない関数だけを置き、`window.Dabimas.logic.musumeLink` に公開する。

| 名前 | 中身 |
|---|---|
| `BASE_URL` | `"/dabimas-data/dist/"`。iframe の URL の土台は、コード全体でここ 1 か所にだけ書く |
| `embedUrl()` | `BASE_URL + "?embed=1"` |
| `pickerUrl(index)` | `BASE_URL + "?picker=1&sex=" + allowedSexForCell(index)` |
| `allowedSexForCell(index)` | `index === 16` なら `"1"`、`index % 16` が 3・5・7・9・11・13・15 なら `"any"`、それ以外は `"0"`。`vue/components/pedigree/horse-cell.js` の `lists()` と同じ規則 |
| `isMasterHorseId(id)` | `/^[sb]\d+$/.test(id)`（文字列でなければ false） |
| `toMusumeKey(id)` | `"s3315497239"` → `"3315497239-0"`、`"b1234"` → `"1234-1"` |
| `fromMusume(horseId, gender)` | `("3315497239", "0")` → `"s3315497239"`、`("1234", "1")` → `"b1234"`。`horseId` が `^\d+$` でないとき、`gender` が `"0"`・`"1"` でないときは `null` |
| `readMessage(event, sources, expectedOrigin)` | 受け取ってよいメッセージなら `event.data` を、そうでなければ `null` を返す。条件は次のすべて: `event.origin === expectedOrigin`／`sources`（iframe の `contentWindow` の配列）に `event.source` が含まれる／`event.data` がオブジェクトで `v === 1`／`type` が `dabimas:hello`・`dabimas:favorite-toggle`・`dabimas:favorites-only`・`dabimas:select` のどれか |

### パート 3: `vue/logic/favorites.js`（新規）

`window.Dabimas.favorites` に次を公開する。

- `state` — `Vue.observable({ ready: false, available: true, only: false, count: 0, version: 0 })`
  - お気に入りの集合そのものは、モジュールの中の `Set`（ダビふぁくの id）で持ち、Vue に監視させない。集合が変わるたびに `version` を 1 増やし、`count` を合わせる
  - 画面側の computed は、`state.only` と `state.version` を読むことで再計算される。`Set` を読むだけでは再計算されない
- `load()` — `favorites` の全件と `appMeta.favoritesOnly` を読んで `state` に入れ、`ready = true` にする。**失敗しても reject しない。** `available = false`・`ready = true` にして `console.warn` を出し、resolve する
- `has(id)`、`ids()`（配列のコピーを返す）
- `toggle(id)` — メモリを先に切り替えて `version`・`count` を更新し、repository の `add` / `remove` を呼ぶ。書き込みに失敗したらメモリを元に戻し、`version` をもう一度増やして reject する。`available === false` のときは何も変えずに reject する
- `setOnly(value)` — `state.only` を `value === true` に変え、`appMeta.favoritesOnly` に保存する。保存の失敗は `console.warn` だけにし、画面の状態は戻さない
- `passesFavoritesOnly(horse)` — `musumeLink.isMasterHorseId(horse.id)` のときだけ `has(horse.id)` を返す。それ以外の馬（自家製馬 `ch_…`、編集種牡馬 `es_…`、id のない馬）は常に `true` を返す。設計書 §5.3 の「自家製馬と編集種牡馬は、お気に入りのみでも常に出す」を、この規則で満たす

### パート 4: 起動と画面の記憶（`main.js`、`workspace-sync.js`）

- `main.js`: `new Vue` を、`workspaceSync.boot()` と `favorites.load()` の両方が終わるまで待つ（`Promise.all`）。`favorites.load()` は reject しないので、お気に入りが読めなくてもアプリは起動する。先頭コメントにこのことを 1 行足す
- `workspace-sync.js` の `boot()`: 移行直後（`justMigrated`）でなく、`appMeta.lastScreen === "musume"` のときは、着地画面を `"musume"` にする。このとき**カテゴリの読み込み（`lastOpenedCategoryId` を見て `loadCategoryIntoState()`）は今までどおり行い、画面の名前だけを差し替える。** ダビ娘からホームへ戻ってカテゴリを開いたときの状態を、今の起動と同じにするため。`lastScreen` がそれ以外か未設定なら、今までと同じ
- `workspace-sync.js` に `rememberScreen(screen)` を足して公開する。`"home"`・`"category"`・`"settings"`・`"musume"` 以外の値のとき、`state.dbUnavailable` のときは何もしない。`appMeta.lastScreen` に書き、失敗は `console.warn` だけにする。呼ぶのは `musume-host`（パート 5）
  - ファイル先頭の「本体側に新しいメソッドは追加しない」は root app の話なので、`workspaceSync` 自身の公開 API を足すことは差し支えない

### パート 5: `vue/components/musume/musume-host.js`（新規）

`Vue.component("musume-host", …)` として登録し、既存のコンポーネントと同じく `window.Dabimas.components.MusumeHost` にも置く。`index.html` に 1 つだけ置き、どの画面でも常にマウントされている。

テンプレートの骨組み（クラス名はこのとおりにする。CSS はパート 11）:

```html
<div class="musume-host">
  <!-- 単体画面（ホームのタイルから）。一度作ったら消さず、v-show で隠す -->
  <div v-if="screenOpened" v-show="isMusumeScreen" class="musume-screen">
    <div class="musume-frame-header">
      <button type="button" class="musume-frame-back" @click="leaveScreen">‹ ホーム</button>
      <span class="musume-frame-title">ダビ娘</span>
    </div>
    <iframe ref="screenFrame" :src="embedUrl" class="musume-iframe musume-iframe--fill" title="ダビ娘"></iframe>
  </div>

  <!-- 馬選択ダイアログの「条件で探す」から。ダイアログの上に重ねる -->
  <v-bottom-sheet v-model="sheetOpen" content-class="musume-sheet-dialog">
    <v-sheet class="musume-sheet">
      <div class="musume-sheet-grip"></div>
      <div class="musume-frame-header">
        <button type="button" class="musume-frame-back" @click="sheetOpen = false">‹ 戻る</button>
        <span class="musume-frame-title">ダビ娘で探す<small>{{ targetLabel }}</small></span>
      </div>
      <iframe v-if="sheetSrc" ref="sheetFrame" :src="sheetSrc" class="musume-iframe musume-iframe--sheet" title="ダビ娘で探す"></iframe>
    </v-sheet>
  </v-bottom-sheet>

  <v-snackbar v-model="snackbar.show" :timeout="3500" top color="error">{{ snackbar.text }}</v-snackbar>
</div>
```

**単体画面**

- `$root.currentScreen` を `immediate: true` で監視し、`"musume"` になったら `screenOpened = true` にする。起動時に `"musume"` へ着地したときも、これで開く
- 同じ監視で、値が変わるたびに `workspaceSync.rememberScreen(screen)` を呼ぶ。`immediate` の初回には呼ばない
- 「‹ ホーム」は `workspaceSync.goHome()`

**シート**

- `created` で `this.$root.$on("musume:open-search", this.openSearch)`、`beforeDestroy` で `$off` する
- `openSearch({ index, label, select })`:
  1. `target = { index, label, select }` を覚える（`targetLabel` は `target.label`）
  2. `src = musumeLink.pickerUrl(index)`。`src !== sheetSrc` なら `sheetSrc = src` にする（iframe が読み直され、選択中の馬も消える）。同じ URL で、前回と別のセル（`lastTargetIndex !== index`）なら、シートの iframe に `dabimas:reset-pick` を送る。同じセルなら何もしない（検索結果と選択中の馬を残す）
  3. `lastTargetIndex = index`、`sheetOpen = true`
- 馬選択ダイアログは閉じない。「‹ 戻る」とシートの外側のタップは、シートを下げるだけにする（`v-model` の既定の動きで足りる）。ダイアログを閉じて開き直す方式にしないのは、`openMobileEditor()` の `focus()` で、戻るたびに iPhone のキーボードが出るため

**メッセージの受け口**

`created` で `window.addEventListener("message", this.onMessage)`、`beforeDestroy` で外す。`onMessage` は最初に `musumeLink.readMessage(event, <今ある iframe の contentWindow の配列>, window.location.origin)` を呼び、`null` なら何もしない。

- `dabimas:hello` — 馬のデータが読めていれば、送ってきた iframe（`event.source`）にすぐ返事をする。まだなら送り先を覚えておき、読めた時点でまとめて返す。返事は `{ type: "dabimas:favorites", v: 1, supportedKeys, favoriteKeys, favoritesOnly }`
  - **馬のデータが読めたかは `$root.stallionsBase.length > 0` で判定する。** `$root.horsesBase` は `vue/app/app-state.js` の data になく、リアクティブでないので監視できない。`stallionsBase` は data にあり、同じ `buildHorseLists()`（`vue/app/methods/horse-loading.js:109`）の中で `horsesBase` の直後に代入される
  - `supportedKeys` は、`$root.horsesBase` のうち `isMasterHorseId` を満たす id を `toMusumeKey` で変換した配列（実データで 2,914 件）。`favorites.state.available === false` のときは空配列にし、❤ を出させない。この配列と、元の id の `Set` は、馬のデータが読めた後に 1 度作れば使い回してよい
  - `favoriteKeys` は `favorites.ids().map(toMusumeKey)`、`favoritesOnly` は `favorites.state.only`
- `dabimas:favorite-toggle` — `id = fromMusume(horseId, gender)`。`null` のとき、`supportedKeys` の元の id に含まれないときは無視する。通れば `favorites.toggle(id)` を呼ぶ。reject されたらトースト「お気に入りを保存できませんでした」
- `dabimas:favorites-only` — `favorites.setOnly(data.value === true)`
- `dabimas:select` — シートの iframe から来たもので、`target` があるときだけ処理する。設計書 §4 の順に確かめる
  1. `id = fromMusume(horseId, gender)`、`summary = $root.findSummaryHorse({ id })`（`id` が `null` なら `summary` も `null` とみなす）。見つからなければ、トースト「『＜name＞』はダビふぁく未対応の馬です」を出して終わる。シートは閉じない
  2. `allowedSexForCell(target.index)` が `"any"` でなく `gender` と違えば、トーストを出して終わる。必要なのが `"0"` なら「このセルには種牡馬しか入りません」、`"1"` なら「このセルには繁殖牝馬しか入りません」
  3. 通れば `sheetOpen = false` にし、シートの iframe に `dabimas:reset-pick` を送り、`target.select(summary)` を呼ぶ。`select` は馬選択ダイアログの `selectMobileHorse` で、ここから先は既存の経路（ダイアログを閉じる → `horse-change` → `onChange`）でセルに入る

**配り直し**

`favorites.state.version` と `favorites.state.only` を監視し、どちらかが変わったら、今ある iframe（単体・シート）すべてに `{ type: "dabimas:favorites", v: 1, favoriteKeys, favoritesOnly }` を送る。`supportedKeys` は付けない。

送るときは必ず `contentWindow.postMessage(message, window.location.origin)` とし、送り先に `"*"` は使わない。

### パート 6: ホーム画面（`home-page.js`）

`</v-app-bar>` の直後、空状態（`v-if`）と格子（`v-else`）の**前**に次を入れる。`v-if` と `v-else` の間には入れない。

```html
<div class="dabimas-home-section-title">馬を探す</div>
<div class="dabimas-musume-tile-wrap">
  <v-card outlined ripple class="dabimas-musume-tile" @click="openMusume">
    <v-icon size="28" color="primary">mdi-magnify</v-icon>
    <div class="dabimas-musume-tile__text">
      <div class="dabimas-musume-tile__title">ダビ娘</div>
      <div class="dabimas-musume-tile__sub">馬を探す・お気に入りを付ける</div>
    </div>
    <v-icon color="grey">mdi-chevron-right</v-icon>
  </v-card>
</div>
<div class="dabimas-home-section-title">カテゴリ</div>
```

- `openMusume()` は `this.$root.currentScreen = "musume"`（既存の `openSettings()` と同じやり方）
- 格子の `<v-container v-else fluid>` に `class="dabimas-category-grid"` を足す
- タイルは編集モードでも見た目を変えず、削除・並べ替えのボタンを付けない
- アプリバーは変えない（🔍 のボタンは足さない。設計書 §6.1）
- 先頭コメントの役割に、ダビ娘の入口を持つことを 1 行足す

### パート 7: スマホの馬選択ダイアログ（`mobile-horse-picker.js`）

変えるのは次の 3 か所だけにする。ファイル先頭のコメントにある IME まわりの不変条件には触れない。

1. **「条件で探す」:** ヘッダの `<div class="exp-mobile-picker-actions">` の先頭に次のボタンを足す
   ```html
   <button type="button" class="exp-mobile-picker-action exp-mobile-picker-action--musume" @click="openMusumeSearch">条件で探す</button>
   ```
   `openMusumeSearch()` は `this.$root.$emit("musume:open-search", { index: this.index, label: this.mobileDialogContextLabel, select: this.selectMobileHorse })`
2. **「お気に入りのみ」:** 本文の `<div class="exp-mobile-picker-body">` の先頭（「候補を検索」のラベルより上）に次を足す
   ```html
   <div class="exp-mobile-fav-only-row">
     <button
       type="button"
       class="exp-mobile-fav-only-chip"
       :class="{ 'is-on': favoritesOnly }"
       :aria-pressed="favoritesOnly ? 'true' : 'false'"
       @click="toggleFavoritesOnly"
     ><i :class="['mdi', favoritesOnly ? 'mdi-heart' : 'mdi-heart-outline']"></i> お気に入りのみ（{{ favoriteCount }}）</button>
   </div>
   ```
   computed の `favoritesOnly`・`favoriteCount` は `window.Dabimas.favorites.state` の `only`・`count` を返す。`toggleFavoritesOnly()` は `favorites.setOnly(!favorites.state.only)`。ハートは文字の「♥」ではなく MDI のアイコンにする（端末のフォントで形が変わるため。設計書 §6.5 と同じ理由）
3. **`filteredMobileLists`:** 繰り返しの中で、`disabled` の判定の直後、検索語の判定の前に、`favorites.passesFavoritesOnly(horse)` が false の馬を飛ばす。上限はオンなら無制限、オフなら今のまま（検索語ありで 80、なしで 60）。computed の先頭で `state.only` と `state.version` を読むこと

`window.Dabimas.favorites` は、ファイルの読み込み時に変数へ取らず、使うときに参照する。このファイルは `favorites.js` より前に読み込まれる。

### パート 8: PC の入力欄（`desktop-horse-autocomplete.js`）

- `:items="lists"` を `:items="candidateItems"` に替える
- computed `candidateItems`: `state.only` がオフなら `this.lists` をそのまま返す（新しい配列を作らない）。オンなら `this.lists.filter(...)` で、`passesFavoritesOnly(horse)` が true の馬と、**このセルで選択中の馬**を残す。選択中の判定は `getHorseKey(horse) === getHorseKey(this.selected[this.index])`（`window.Dabimas.logic.horses.getHorseKey`。選択中が `null` なら対象なし）。ここでも `state.version` を読む
  - 選択中の馬を残す理由: `v-autocomplete` は、`items` の中に値と一致するものがないと、入力欄に何も表示しない（`vue/vuetify.js` の `setSelectedItems` が `allItems` から探すため）。残さないと、お気に入りでない馬が入っているセルが、オンにした途端に空に見える
  - Claude がローカルの保存データ（馬の入ったセル 12 個）で確かめたところ、どのセルにも `getHorseKey` が選択中の馬と一致する候補がちょうど 1 つあった。この判定で受け入れ基準 21 を満たせないときは、満たせる判定に変え、完了報告の「設計判断」に書く
- `<template v-slot:item="data">` の前に次を足す
  ```html
  <template v-slot:prepend-item>
    <v-list-item dense class="exp-fav-only-item" :class="{ 'is-on': favoritesOnly }" @mousedown.prevent @click="toggleFavoritesOnly">
      <v-list-item-content>
        <v-list-item-title>
          <v-icon small class="exp-fav-only-icon">{{ favoritesOnly ? 'mdi-heart' : 'mdi-heart-outline' }}</v-icon>
          お気に入りのみ（{{ favoriteCount }}）
        </v-list-item-title>
      </v-list-item-content>
    </v-list-item>
    <v-divider></v-divider>
  </template>
  ```
  `@mousedown.prevent` で、押しても一覧が閉じないようにする。`favoritesOnly`・`favoriteCount`・`toggleFavoritesOnly` はパート 7 と同じ
- `window.Dabimas.favorites` の参照のしかたもパート 7 と同じ

### パート 9: `index.html`

`AGENTS.md` の手順（backup → apply_patch → verify）で編集する。

- `<settings-page v-if="currentScreen === 'settings'"></settings-page>` の直後に `<musume-host></musume-host>` を 1 つ置く
- script タグを 4 本足す
  - `./vue/logic/storage/edit-stallion-repository.js` の直後（「dabifaku_unified への接続はこの層のみが持つ」の層の中）に `./vue/logic/storage/favorite-repository.js`
  - `./vue/components/workspace/workspace-tab-bar.js` の直後に、コメント `<!-- ダビ娘の組み込み（お気に入り・検索） -->` と、`./vue/logic/musume-link.js`・`./vue/logic/favorites.js`・`./vue/components/musume/musume-host.js` をこの順で
- ほかは変えない

### パート 10: `service-worker.js`

- `urlsToCache` に新しい 4 ファイルを、`index.html` と同じ並びの位置で足す
- `CACHE_NAME` を上げる。毎日の自動更新が `main` で上げるので、2026-09-11 時点の `origin/main` は `dabimas-factor-v20260911-01` になっている。それより新しい値にする（例 `dabimas-factor-v20260911-02`）。`main` へ取り込むときの衝突は検収側で解く
- `fetch` ハンドラの先頭、`isSameOriginGetRequest` の判定の直後に、パスが `/dabimas-data/` で始まるリクエストには手を出さない（`respondWith` せずに `return` する）分岐を足し、理由をコメントに書く
  - 本番では scope（`/dabimas-factor/`）の外なので、この分岐は何もしない
  - ローカルでリポジトリのルートを配信すると scope が `/` になり、ダビ娘の iframe の読み込みもこの SW を通る。`getCacheKey()` はナビゲーションを全部 app shell のキー（`index.html`）で保存するので、ダビふぁくの `index.html` のキャッシュがダビ娘の HTML で上書きされる。Claude が localhost で、scope `/` の SW が登録されていることを確かめた
  - ダビ娘は自前の SW を持つ別アプリなので、ダビふぁくの SW はそのリクエストに関わらない

### パート 11: `css/unified.css`

値は設計書 §6.1〜§6.4 と、プロトタイプを iPhone で見て決めたもの。

- ホーム
  - `.dabimas-home-section-title` — 余白 `16px 12px 6px`、色 `#5b4b8a`、13px、太さ 700、`letter-spacing: 0.04em`
  - `.dabimas-musume-tile-wrap` — 左右の余白 12px
  - `.dabimas-musume-tile` — `display: flex !important`、縦中央そろえ、隙間 12px、高さ 64px 以上、余白 `10px 12px`、角丸 `12px !important`、`cursor: pointer`。`!important` は Vuetify の `v-card` の指定に勝つため（既存の `.dabimas-category-card` と同じ）
  - `.dabimas-musume-tile__text` — `flex: 1 1 auto; min-width: 0`。`__title` は 15px・600・`#33324a`、`__sub` は 12px・`#757575`・上 2px
  - `.dabimas-home .dabimas-category-grid` — `padding: 4px 12px 12px`。Vuetify の `.container`（12px）に勝つよう 2 クラスで書く。`v-row dense` の −4px とカードの列の 4px が打ち消し合うので、これでタイルとカテゴリカードの左右が、どちらも画面端から 12px になる
  - **`.exp-mobile-layout .dabimas-home`** — 既存の `.exp-mobile-layout .dabimas-settings`（unified.css:214 付近）と同じ指定にする。`max-height: var(--exp-mobile-app-height)`、`overflow-y: auto`、`overscroll-behavior: contain`、`-webkit-overflow-scrolling: touch`、下の余白 `calc(16px + env(safe-area-inset-bottom, 0px))`
    - 理由: スマホ幅では `#app`（`.exp-mobile-layout`）と `.v-application--wrap` が画面の高さで `overflow: hidden` になっている（css/mobile.css:8-17）。ホーム（`.dabimas-home`）は `overflow-y: visible` なので、画面の高さを超えた分は切れ、スクロールでも届かない（Claude が 390×700 で確かめた）。見出し 2 つとタイルでカードが約 140px 下がるため、カテゴリが多い人は下のカードを開けなくなる。設定画面と同じ方法で、ホーム自身をスクロールの器にする
- 単体画面とシート
  - `.musume-screen` — 縦並びの flex、高さ `var(--exp-mobile-app-height, 100svh)`、`min-height: 100svh`、背景白
  - `.musume-frame-header` — `flex: 0 0 auto`、横並び・縦中央そろえ、隙間 8px、高さ 48px、左右 12px、下の線 `1px solid #ddd`、背景白
  - `.musume-frame-back` — `flex: 0 0 auto`、高さ 36px 以上、左右 12px、枠 `1px solid #bbb`、角丸 6px、背景白、14px、太字
  - `.musume-frame-title` — 伸びる、はみ出しは「…」で省略、15px、太字。中の `small` は左 6px・`#666`・普通の太さ
  - `.musume-iframe` — `display: block`、幅 100%、枠なし、背景 `#f8fafc`
  - `.musume-iframe--fill` — `flex: 1 1 auto; height: 0; min-height: 0`
  - `.musume-sheet` — `overflow: hidden`、角丸 `14px 14px 0 0 !important`
  - `.musume-sheet-grip` — 幅 40px・高さ 5px、`margin: 8px auto 0`、角丸 3px、`#ccc`
  - `.musume-iframe--sheet` — 高さ `calc(90svh - 61px)`（掴み手 13px とヘッダ 48px を引いた分）
- 馬選択
  - `.exp-mobile-picker-action--musume` — 背景 `#1e6bd6`、文字白
  - `.exp-mobile-fav-only-row` — flex、右寄せ
  - `.exp-mobile-fav-only-chip` — 高さ 34px 以上、左右 12px、枠 `1px solid #cfd8e3`、角丸 999px、背景白、`#374151`、13px。`.is-on` は枠 `#e0245e`・背景 `#fff0f5`・文字 `#e0245e`・太字
  - `.exp-fav-only-item .v-list-item__title` — 13px・`#374151`。`.is-on` は `#e0245e`・太字で、`.exp-fav-only-icon` も同じ色

ピンク（`#e0245e`・`#fff0f5`）は、ダビ娘の ❤ と「お気に入りのみ」と同じ色である。

---

## 制約

- `AGENTS.md` の Safety Rules に従うこと。`index.html` を扱うときは、`backup-index-exp` と `verify-index-exp` に `.\index.html` を渡す（渡さないと `index.exp.html` が対象になる）
- 既存のファイルの書き方に合わせる。IIFE（`(function (window, Vue) { … })(window, window.Vue);`）、`window.Dabimas` の名前空間、先頭の「このファイルの役割／このファイルに置かない処理」のコメント、同じファイルの中の書き方（`var` と `const`、関数の書き方）。文字コードは UTF-8（BOM なし）、改行は LF
- ダビ娘に送るメッセージは「背景と目的」の表と完全に同じ形にする。type 名、`v: 1`、キーの形を変えない
- IndexedDB に直接触るのは `vue/logic/storage/` の repository だけにする。`favorites.js` は repository を呼ぶ（既存の `horse-loading.js` が `editStallions` の repository を呼ぶのと同じ）
- `dabifaku_unified` の版の上げ方は、v2 に上げたときと同じにする（`onblocked` や `onversionchange` の処理は足さない）
- `vue/app/` の中で変えてよいのは `main.js` だけ

## スコープ外（やらないこと）

- ダビ娘側（`C:\derby\dabimas-data` リポジトリ）を変えない。このリポジトリの `dabimas-data/dist/`（ローカル検証用のコピー）も書き換えない
- ダビ娘の移行案内バナー（設計書の Phase C）、データ取得処理の統合（Phase 0）、ダビ娘に着地したときの detail の裏読みの遅延（設計書 §10.1）
- 起動時の着地の、ダビ娘以外の決め方（`lastOpenedCategoryId` によるカテゴリかホームか）を変えない
- `app-state.js` に `horsesBase` を足すなど、root app のリアクティブの変更
- `docs/dabimusume-integration-design.md` の書き換え（設計書との違いは完了報告に書く。Claude が検収のときに反映する）
- 既存の検証スクリプトの書き換え（新しく足すだけ）
- `tmp/` の削除、git への push
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く

## 受け入れ基準

設計書 §12 の 16 項目に、この指示書で足したものを加え、確かめ方で分けた。

- 【N】 `scripts/verify-musume-logic.cjs`（Node）で確かめる
- 【U】 `scripts/verify-musume-ui.html`（ヘッドレス Chrome）で確かめる
- 【検収】 Codex は確かめなくてよい。検収で Claude がブラウザで確かめ、iPhone の項目はユーザーが確かめる

### A. 既存の検証が通る【必須】

1. `verify-index-exp .\index.html` が `[verify] OK` を返す
2. `node scripts/verify-storage-boot-order.cjs`・`node scripts/verify-horse-candidate-lists.cjs`・`node scripts/verify-horse-badges.cjs` が、どれも OK を出す（2026-09-11 時点で 3 本とも通る）

### B. ロジック【N・必須】

`verify-musume-logic.cjs` は `verify-horse-candidate-lists.cjs` と同じく、`window` と `Vue` を用意して対象ファイルを読み込み、公開された関数や、コンポーネントの options の computed を、用意した `this` で呼んで確かめる。成功したら `musume logic regression: OK` を出す。

3. `allowedSexForCell` が 32 セルで次のとおりになる
   - `"1"`: 16
   - `"any"`: 3, 5, 7, 9, 11, 13, 15, 19, 21, 23, 25, 27, 29, 31
   - `"0"`: 0, 1, 2, 4, 6, 8, 10, 12, 14, 17, 18, 20, 22, 24, 26, 28, 30
4. ID の変換: `toMusumeKey("s3315497239") === "3315497239-0"`、`toMusumeKey("b1234") === "1234-1"`、`fromMusume("3315497239", "0") === "s3315497239"`、`fromMusume("1234", "1") === "b1234"`、`fromMusume("12a", "0") === null`、`fromMusume("1234", "2") === null`
5. `readMessage`: 別オリジンなら `null`、`sources` にない `source` なら `null`、`v` が `1` でなければ `null`、知らない `type` なら `null`、`data` が文字列なら `null`。条件を満たすものは `event.data` を返す
6. `favorites`（repository と appMeta をメモリ上の偽物に差し替えて）
   - `load()` で、保存済みの id と `favoritesOnly` が `state` に入る
   - `toggle` を 2 回呼ぶと `add` → `remove` の順に呼ばれ、`version` が 2 増える
   - 書き込みが失敗すると、元に戻って reject する
   - repository が失敗しても `load()` は resolve し、`available === false` になる
   - `passesFavoritesOnly` は、お気に入りの `s…` で true、お気に入りでない `s…` で false、`ch_…` で true、`es_…` で true、id のない馬で true
7. `mobile-horse-picker` の `filteredMobileLists`: 候補 100 頭のうち 70 頭がお気に入りのとき、オフ・検索語なしで 60 頭、**オンで 70 頭**になる（61 頭以上が全部出る。設計書 §12 の 8 で、プロトタイプでは確かめていなかった点）。オン・検索語ありでも 80 頭で切れない。`disabled` の馬はオンでも出ない
8. `desktop-horse-autocomplete` の `candidateItems`: オフのとき `this.lists` と同じ参照を返す。オンのとき、お気に入りの馬と、セルで選択中のお気に入りでない馬だけを返す
9. `unifiedDb.DB_VERSION === 3`、`unifiedDb.FAVORITE_STORE_NAME === "favorites"`
10. `index.html` のすべての `<script src="./….js">` が `service-worker.js` の `urlsToCache` にある（新しい 4 本を含む）。`index.html` に `<musume-host>` がちょうど 1 つある

### C. 画面と連携【U・必須】

`verify-musume-ui.html` は `scripts/verify-p2e-ui.html` と同じ作りにする。ページの中の iframe でアプリを動かし、確かめた結果を JSON で `<pre id="result">` に書き、`dump-dom` で読む。項目ごとに、受け入れ基準の番号と合否を出す。

- 最初に、SW の登録解除とキャッシュの削除（p2e と同じ）、`indexedDB.deleteDatabase("dabifaku_unified")`、`localStorage.clear()` を行い、まっさらな状態から始める。ヘッドレス Chrome のプロファイル（`.chrome-runtime/`）は実行をまたいで残るため。消えるのは検証用のプロファイルのデータで、ユーザーの実データではない
- アプリは iframe の `src` に `../index.html` を指定して読み込む（ダビ娘の iframe と同じオリジンにするため）。幅は 390px。PC の項目だけ、アプリの iframe の幅を 1280px に変えて確かめる
- ダビ娘の起動を待つときは、iframe の `load` ではなく、`.search-overlay--startup` が消えて `.keyword-block .text-input` が出たことを見る（`load` は JSON の読み込み前に来る）
- ダビ娘の画面の部品（Phase A で作ったもの）
  - キーワード欄 `.keyword-block .text-input`。React なので、値は `HTMLInputElement.prototype` の `value` の setter で入れてから `input` イベントを出す
  - 種牡馬・牝馬のタブ `.tab-button`、カード `.result-card`、❤ `.result-card__favorite`（オンで `.is-on`）、選択中のカード `.result-card.is-picked`
  - 「お気に入りのみ」`.favorites-only-toggle`（オンで `.is-on`）、下部バー `.picker-bar` と `.picker-bar__confirm`
- 偽のメッセージを iframe の中から送るときは、`iframeWindow.Function("m", "parent.postMessage(m, location.origin)")(message)` のように、その iframe の関数として呼ぶ。外から `iframeWindow.parent.postMessage(...)` を呼ぶと、`event.source` がテストのページになってしまう
- 確かめ終わっても、作ったお気に入りやカテゴリは消さなくてよい（次の実行の最初に DB ごと消える）

11. （§12 の 1・2）ホームに「馬を探す」「カテゴリ」の見出しがある。カテゴリが 0 件でもタイルが出る。カテゴリを 1 つ作ると、タイルと先頭のカテゴリカードの左端が、どちらも画面の左端から 12px（±1px）になる。編集モードにしても、タイルの中の `button` が増えない
12. （§12 の 3）タイルを押すと `currentScreen === "musume"` になり、iframe の `src` が `/dabimas-data/dist/?embed=1` で終わる。「‹ ホーム」で `currentScreen === "home"` に戻る
13. （§12 の 4）単体画面を開いたままアプリの iframe を読み直すと、`currentScreen === "musume"` で起動する。ホームへ戻ってから読み直すと、`"musume"` 以外で起動する
14. （§12 の 5）単体画面のダビ娘で「カズタカイザー」を検索すると、`textContent` に「カズタカイザー」を含むカードが 2 枚あり、❤ は 1 枚だけに出る（ダビふぁくにいる `s1074824357` のほう。`s0314537268` はダビふぁくにいない）
15. （§12 の 6）その ❤ を押すと、IndexedDB の `favorites` に id `"s1074824357"` のレコードができ、`favorites.state.count` が 1 増える。シートのダビ娘が開いていれば、そちらのカードの ❤ も `.is-on` になる。アプリを読み直しても `favorites` に残っている
16. （§12 の 7）ダビ娘の「お気に入りのみ」を押すと、検索語なしのとき、お気に入りの頭数と同じ枚数のカードが並ぶ
17. （§12 の 8）スマホ幅で、32 個すべてのセルの馬選択ダイアログに「条件で探す」と「お気に入りのみ」がある。セルごとに `mobile-horse-picker` のインスタンスを探し、`openMobileEditor()` で開いて DOM を確かめてよい（`app.dispCategory = 0` にしておく）
18. （§12 の 9）index 0・16・3 の「条件で探す」で開いたシートの iframe の `src` が、それぞれ `sex=0`・`sex=1`・`sex=any` で終わる。index 0 のシートで「アイアンリージ」を検索し、❤ の出ているカード（ダビふぁくにいる馬）を 1 枚押して「この馬を入れる」を押す。アプリの window で `message` を聞き、送られた `dabimas:select` の `horseId` を控えておく。`selected[0].name` が `findSummaryHorse({ id: "s" + horseId }).name` と同じになり、`selected[1]`〜`selected[15]` が 15 個とも埋まる。シートと馬選択ダイアログが両方閉じる
19. （§12 の 10）次の 4 つで、`selected` が変わらない
   - index 16 のシートの iframe から、種牡馬（`gender: "0"`）の `dabimas:select` を送ると、トースト「このセルには繁殖牝馬しか入りません」が出て、シートは開いたまま
   - index 0 のシートの iframe から、`horseId: "0314537268"`・`gender: "0"`・`name: "カズタカイザー"` の `dabimas:select` を送ると、トースト「『カズタカイザー』はダビふぁく未対応の馬です」が出る
   - テストのページ（iframe でないところ）から、正しい形の `dabimas:select` をアプリの window に送っても、何も起きない
   - シートの iframe から `v: 2` の `dabimas:select` を送っても、何も起きない
20. （§12 の 11）シートを「‹ 戻る」で閉じると、馬選択ダイアログは開いたままで、検索欄に打った文字が残っている。同じセルでもう一度開くと、シートの iframe の `contentDocument` が前と同じ（読み直されていない）で、`.result-card.is-picked` も残っている。同じ `sex` の別のセルで開くと、`.result-card.is-picked` が消える
21. （§12 の 12）PC 幅（1280px）で、入力欄の候補一覧の先頭に「お気に入りのみ」の行がある。押しても一覧（`v-autocomplete` のメニュー）が閉じない。オンにすると、候補がお気に入りだけになる。お気に入りでない馬が入っているセルは、オンにしても入力欄の馬名が消えない
22. （§12 の 16）ダビ娘の「お気に入りのみ」を押すと、`favorites.state.only === true` になり、スマホの馬選択ダイアログのチップが `.is-on` になり、PC の入力欄も `favoritesOnly` が true になる（PC は DOM でなく `desktop-horse-autocomplete` の computed で確かめてよい）。IndexedDB の `appMeta` の `favoritesOnly` が `true` になり、アプリを読み直しても `true` のまま。馬選択ダイアログのチップで切ると、開いているダビ娘の `.favorites-only-toggle` も `.is-on` でなくなる
23. （追加）スマホ幅（390×700）でカテゴリを 12 個作ると、ホームを一番下までスクロールでき、最後のカテゴリカードの下端が画面の中に入る
24. （追加）SW がアプリを制御するようになった（`navigator.serviceWorker.controller` が付いた）あとで、ダビ娘の iframe を新しく読み込んでも（シートの iframe の読み直しでよい）、SW のキャッシュにある `index.html` の中身がダビふぁくのもの（`<musume-host>` を含む）のままである

### D. 検収で確かめる【検収】

25. （§12 の 13）❤ のアニメーション。iPhone の「視差効果を減らす」をオンにすると動かず、表示が崩れない（ユーザーが iPhone で）
26. （§12 の 14）iPhone のホーム画面アプリで、一度開いたダビ娘が機内モードでも開ける（Phase A・B の公開後に、ユーザーが iPhone で）
27. （§12 の 15）ダビ娘をクエリなしで開くと、今のダビ娘と同じ見た目である（Phase A の範囲。Claude が確認済み）
28. ホーム・単体画面・シート・「お気に入りのみ」の見た目が、パート 11 の数値どおりである（Claude がブラウザで）

## 検証コマンド

リポジトリのルートで、PowerShell から次の順に実行する。

```powershell
# 1. index.html を編集する前と後
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 backup-index-exp .\index.html
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 verify-index-exp .\index.html

# 2. Node の検証
node scripts/verify-storage-boot-order.cjs
node scripts/verify-horse-candidate-lists.cjs
node scripts/verify-horse-badges.cjs
node scripts/verify-musume-logic.cjs

# 3. 画面の検証。別のターミナルで、リポジトリのルートを 8767 番で配信しておく
python scripts/lan_server.py 8767 --bind 127.0.0.1
powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 dump-dom "http://127.0.0.1:8767/scripts/verify-musume-ui.html" 390 844 180000
```

- 画面の検証の前に、`dabimas-data/dist/index.html` があることを確かめる。無ければ C を実行せずに、完了報告にそう書く（ビルドは Claude が置き直す。`dabimas-data` リポジトリで `npm run build` を実行すると、あちらの管理下の `dist/` が書き換わるので、しないこと）
- 配信には `python -m http.server` ではなく `scripts/lan_server.py` を使う。`Cache-Control: no-store` を付けるので、ファイルを直したあとに古い JS が使われない
- ポート 8766・8767 に、別のリポジトリのコピーを配る古いサーバーが残っていることがある。起動する前に確かめる
- `dump-dom` の最後の引数は仮想時間の上限（ミリ秒）。ダビ娘は 14.5MB の JSON を読むので、足りなければ増やす

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。

### 変更ファイル一覧

- `vue/logic/storage/unified-db.js`: DB v3 と favorites ストアを追加。
- `vue/logic/storage/favorite-repository.js`: お気に入りの全件取得・追加・削除を追加。
- `vue/logic/storage/app-meta-repository.js`: キー一覧のコメントに favoritesOnly / lastScreen を追加。
- `vue/logic/musume-link.js`: URL・32 セルの性別・ID 変換・受信メッセージ検査を追加。
- `vue/logic/favorites.js`: observable 状態、読み込み、楽観的更新と失敗時の復元、絞り込み設定の保存を追加。
- `vue/app/main.js`: workspaceSync.boot と favorites.load の両方を待って起動。
- `vue/logic/workspace-sync.js`: カテゴリ復元後の musume 着地と rememberScreen を追加。
- `vue/components/musume/musume-host.js`: 単体画面・シート・postMessage・同期・エラートーストを追加。
- `vue/components/home/home-page.js`: 見出しとダビ娘タイル、カテゴリ格子のクラスを追加。
- `vue/components/pedigree/mobile-horse-picker.js`: 条件検索、お気に入りチップ、お気に入り時の候補上限解除を追加。
- `vue/components/pedigree/desktop-horse-autocomplete.js`: お気に入り切替行と、選択済み馬を維持する候補絞り込みを追加。
- `index.html`: musume-host を 1 個、script を指定位置に 4 本追加。
- `service-worker.js`: 4 本のキャッシュ登録、キャッシュ版更新、ダビ娘リクエストの除外。
- `css/unified.css`: 指定のホーム・タイル・シート・ボタン・チップとホームのスクロール指定を追加。
- `scripts/verify-musume-logic.cjs`: 基準 3〜10 と、連打・削除失敗・保存設定失敗の回帰検証を追加。
- `scripts/verify-musume-ui.html`: 実アプリと Phase A ビルドによる基準 11〜24 の検証を追加。
- `docs/codex-work-orders/2026-09-11-musume-integration-phase-b.md`: この完了報告を記入。

### 設計判断

- 同じ馬への連打は保存順に処理する。先行保存が失敗したときの巻き戻しで後続操作を消さないため。最初の操作は即座にメモリへ反映する。
- 閉じたシートから遅れて来た select は無視する。閉じた後の血統表への意図しない反映を防ぐため。
- 基準 14 の検証は馬名が完全一致する「カズタカイザー」2 頭を対象とした。配置済みのデータには「カズタカイザー？」も 2 頭あるため、部分一致では 4 枚・❤ 2 個になる。完全一致の 2 頭には指示どおり ❤ が 1 個だけ出て、`s1074824357` が保存される。ダビ娘側のファイルは変更していない。
- 基準 23 は iframe を 390×700 に変更した後、アプリを再起動して測定した。既存の viewport 計算が縮小前の body 高を保持するため（下記参照）。
- 設計書との差異は本指示書の補足 1〜7 に従った。設計書自体は変更していない。

### 実行した検証と結果

- 基準 1: 編集前の `backup-index-exp .\index.html` を実行。編集後の `verify-index-exp .\index.html` は `[verify] OK`。
- 基準 2: `node scripts/verify-storage-boot-order.cjs` → `storage boot order regression: OK`。
- 基準 2: `node scripts/verify-horse-candidate-lists.cjs` → `horse candidate list regression: OK`。
- 基準 2: `node scripts/verify-horse-badges.cjs` → `horse badges regression: OK`。
- 基準 3〜10: `node scripts/verify-musume-logic.cjs` → `musume logic regression: OK`。
- 基準 11〜24: `python scripts/lan_server.py 8768 --bind 127.0.0.1` で配信し、`powershell -ExecutionPolicy Bypass -File .\scripts\codex-powershell.ps1 dump-dom "http://127.0.0.1:8768/scripts/verify-musume-ui.html" 390 844 300000` を実行。結果は全 14 項目 `OK`、全体 `status: OK`、`errors: []`。基準 14 は上記の対象特定を適用。最終出力はローカルの `tmp/musume-ui-dom.txt` に保存。
- 8767 番には既存の `python -m http.server` がいたため変更せず、検証には空いていた 8768 番を使用した。
- `git diff --check` は問題なし。規約と仕様の独立したレビューはいずれも指摘 0 件。

### 残課題・気づき

- 基準 25〜28 は指定どおり検収側で確認する。iPhone の動き・オフラインは未検証。
- 基準 14 の「部分一致でカード 2 枚」というデータ前提は配置済みビルドと異なる。馬名末尾「？」の別馬が含まれるため、検収時にも上記の区別が必要。
- 既存の `getStableViewportHeight()` は `body.clientHeight` も最大値候補にするため、起動後に iframe を 844px から 700px に縮めると `--exp-mobile-app-height` が 844px のまま残る。390×700 で起動し直すとホームを末尾までスクロールできる。指定スコープ外の `vue/app/methods/ui-viewport.js` は変更していない。
- Phase A 公開前の本番反映は禁止のまま。push・公開は行っていない。
