/**
 * 統合版ダビふぁく取説の基本スクショ(01〜09)を撮る。
 *
 * 前提:
 *   - リポジトリ直下で python -m http.server 8766 が起動していること
 *     (.claude/launch.json の "static")
 *   - 実行ディレクトリで npm install puppeteer-core 済みであること
 *     (システムの Chrome を使うためブラウザのダウンロードは不要)
 *   - クリーンな状態(初回起動)から一連のフローを再現するため、
 *     PROFILE ディレクトリを事前に削除してから実行すること
 *
 * 撮影内容:
 *   01 ホーム(空) → 02 カテゴリ追加ダイアログ → 03 カテゴリ画面(空の血統表)
 *   → 04 種牡馬検索 → 05 配合済み血統表 → 06 作業枠追加 → 07 タブ1復元
 *   → 08 ホーム(カード3枚) → 09 ホーム編集モード
 *
 * UIが変わってセレクタが壊れたら、preview_snapshot 等で実DOMを確認して直すこと。
 */
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const os = require("os");
const path = require("path");

const OUT = "C:\\derby\\dabimasFactor\\note-article\\images";
const URL = "http://localhost:8766/";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROFILE = path.join(os.tmpdir(), "dabifaku-capture-profile");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, name), type: "png" });
  console.log("shot:", name);
}

// テキストを含む要素をクリックする（Vuetifyボタン等）
async function clickByText(page, selector, text) {
  const ok = await page.evaluate(
    (sel, txt) => {
      const els = [...document.querySelectorAll(sel)];
      const el = els.find((e) => e.textContent.includes(txt));
      if (!el) return false;
      el.click();
      return true;
    },
    selector,
    text
  );
  if (!ok) throw new Error(`clickByText failed: ${selector} "${text}"`);
}

async function createCategory(page, name, iconClass) {
  // ホームの＋（ヘッダー）を押す
  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="カテゴリを追加"]');
    if (btn) { btn.click(); return; }
    // 空状態のボタン
    const els = [...document.querySelectorAll("button")];
    els.find((e) => e.textContent.includes("カテゴリを追加")).click();
  });
  await page.waitForSelector(".v-dialog--active input[type='text']", { visible: true });
  await page.type(".v-dialog--active input[type='text']", name, { delay: 30 });
  await page.evaluate((cls) => {
    const dlg = document.querySelector(".v-dialog--active");
    const icons = [...dlg.querySelectorAll("button .v-icon")];
    const target = icons.find((i) => i.className.includes(cls));
    if (target) target.closest("button").click();
  }, iconClass);
  await sleep(300);
}

async function submitCategoryDialog(page) {
  await clickByText(page, ".v-dialog--active button", "作成");
  await page.waitForSelector(".dabimas-tab-bar", { visible: true });
  await sleep(800);
}

async function goHome(page) {
  await page.evaluate(() => {
    document.querySelector('button[aria-label="ホームへ戻る"]').click();
  });
  await page.waitForSelector(".dabimas-home", { visible: true });
  await sleep(500);
}

// モバイル馬選択：n番目のトリガーを開いて検索する
// （トリガーは血統表のDOM順。0=父側ルート、16=母側ルート）
async function pickHorse(page, triggerIndex, query) {
  await page.evaluate((idx) => {
    const triggers = [...document.querySelectorAll(".exp-mobile-horse-trigger")];
    triggers[idx].click();
  }, triggerIndex);
  await page.waitForSelector(".v-dialog--active .exp-mobile-search-input", { visible: true });
  await page.type(".v-dialog--active .exp-mobile-search-input", query, { delay: 50 });
  await sleep(700); // debounce 120ms + 描画待ち
  const count = await page.evaluate(
    () => document.querySelectorAll(".v-dialog--active .exp-mobile-option-btn").length
  );
  if (count === 0) throw new Error(`no options for query: ${query}`);
  return count;
}

async function selectFirstOption(page) {
  await page.evaluate(() => {
    document.querySelector(".v-dialog--active .exp-mobile-option-btn").click();
  });
  await sleep(2000); // detail取得＋血統展開待ち
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: PROFILE,
    args: ["--no-first-run", "--disable-features=Translate", "--no-sandbox", "--disable-gpu"],
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  });
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: "networkidle2" });
  await page.waitForSelector(".dabimas-home", { visible: true });
  await sleep(1000);

  // 01: ホーム（空状態）
  await shot(page, "01-home-empty.png");

  // 02: カテゴリ追加ダイアログ
  await createCategory(page, "王座予選", "mdi-trophy");
  await shot(page, "02-category-dialog.png");
  await submitCategoryDialog(page);

  // 03: カテゴリ画面（作業枠タブ＋空の血統表）
  await shot(page, "03-category-screen.png");

  // 04: 種牡馬選択ダイアログ（検索中）
  await pickHorse(page, 0, "キタサン");
  await shot(page, "04-horse-picker.png");
  await selectFirstOption(page);

  // 繁殖牝馬（母側ルート＝トリガー16番目）も選択
  await pickHorse(page, 16, "エア");
  await selectFirstOption(page);

  // 05: 血統表に選択が反映された状態
  await shot(page, "05-pedigree-filled.png");

  // 06: 作業枠を追加（タブ2が空で開く）
  await page.evaluate(() => {
    document.querySelector('button[aria-label="作業枠を追加"]').click();
  });
  await sleep(1500);
  await shot(page, "06-workspace-added.png");

  // 07: タブ1へ戻る→さっきの配合が復元される
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll(".dabimas-tab-btn")];
    const tab1 = btns.find((b) => b.textContent.trim() === "1");
    tab1.click();
  });
  await sleep(2000);
  await shot(page, "07-workspace-restored.png");

  // ホームへ戻ってカテゴリを増やす
  await goHome(page);
  await createCategory(page, "スタスタ", "mdi-run-fast");
  await submitCategoryDialog(page);
  await goHome(page);
  await createCategory(page, "肌馬さがし", "mdi-heart");
  await submitCategoryDialog(page);
  await goHome(page);

  // 08: ホーム（カテゴリカードが並んだ状態）
  await shot(page, "08-home-cards.png");

  // 09: ホーム編集モード
  await clickByText(page, ".dabimas-home-appbar button", "編集");
  await sleep(400);
  await shot(page, "09-home-edit.png");

  await browser.close();
  console.log("done");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
