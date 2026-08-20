/**
 * 統合版ダビふぁく取説の応用スクショ(10〜13)を撮る。
 *
 * 前提:
 *   - capture.js を実行済みで、そのプロファイル(os.tmpdir()/dabifaku-capture-profile)に
 *     「王座予選」カテゴリ＋キタサンブラック×エアグルーヴの作業枠1が残っていること
 *   - リポジトリ直下で python -m http.server 8766 が起動していること
 *
 * 撮影内容:
 *   10 PC版2カラム表示 → 11 子系統・メモモード(メモ入力済み)
 *   → 12 配合の保存・復元ダイアログ(保存直後) → 13 ハートで手動クロス指定
 *
 * 注意: 12で「キタエア配合」という配合が保存され、13で作業枠1に手動クロスが
 * 付いた状態が残る(自動保存)。スクショ用の使い捨てプロファイルなので問題ないが、
 * 01〜09を撮り直すときはプロファイルを削除してcapture.jsからやり直すこと。
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
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { width: 1280, height: 860, deviceScaleFactor: 1.5 };

async function shot(page, name) {
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, name), type: "png" });
  console.log("shot:", name);
}

// 王座予選カテゴリの作業枠1(キタサン×エア)を開いた状態にする
async function openWorkspace1(page) {
  await page.goto(URL, { waitUntil: "networkidle2" });
  await sleep(1500);
  const onHome = await page.evaluate(() =>
    !!document.querySelector(".dabimas-home") &&
    getComputedStyle(document.querySelector(".dabimas-home")).display !== "none"
  );
  if (onHome) {
    await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".dabimas-category-card")];
      cards.find((c) => c.textContent.includes("王座予選")).click();
    });
    await sleep(1500);
  } else {
    const name = await page.evaluate(() => {
      const el = document.querySelector(".dabimas-tab-bar-name");
      return el ? el.textContent.trim() : "";
    });
    if (name !== "王座予選") {
      await page.evaluate(() => {
        document.querySelector('button[aria-label="ホームへ戻る"]').click();
      });
      await sleep(1000);
      await page.evaluate(() => {
        const cards = [...document.querySelectorAll(".dabimas-category-card")];
        cards.find((c) => c.textContent.includes("王座予選")).click();
      });
      await sleep(1500);
    }
  }
  // タブ1をアクティブに
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll(".dabimas-tab-btn")];
    const tab1 = btns.find((b) => b.textContent.trim() === "1");
    if (tab1) tab1.click();
  });
  await sleep(2000);
  const hasKitasan = await page.evaluate(() =>
    document.body.textContent.includes("キタサンブラック")
  );
  if (!hasKitasan) throw new Error("workspace 1 not restored — run capture.js first");
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: PROFILE,
    args: ["--no-first-run", "--disable-features=Translate", "--no-sandbox", "--disable-gpu"],
    defaultViewport: MOBILE,
  });
  const page = await browser.newPage();
  await page.setViewport(MOBILE);
  await openWorkspace1(page);

  // 10: PC表示（血統表2枚横並び）
  await page.setViewport(DESKTOP);
  await page.reload({ waitUntil: "networkidle2" });
  await sleep(2500);
  await shot(page, "10-desktop.png");

  // モバイルに戻す
  await page.setViewport(MOBILE);
  await page.reload({ waitUntil: "networkidle2" });
  await sleep(2500);

  // 11: 子系統・メモモード（「子系統」ボタンをタップ→メモを入力）
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll(".exp-mobile-text-btn")];
    const b = btns.find((x) => x.textContent.includes("子系統"));
    b.click();
  });
  await sleep(800);
  const memoInput = await page.$('input[placeholder="メモ入力"]');
  await memoInput.click();
  await memoInput.type("本命はこの子!", { delay: 40 });
  await page.keyboard.press("Tab");
  await sleep(600);
  await shot(page, "11-memo-mode.png");

  // 12: 配合保存ダイアログ（馬アイコン→タイトル入力→保存）
  await page.evaluate(() => {
    document.querySelector("td.mobile-cross-rowspan").click();
  });
  await sleep(1000);
  await page.waitForSelector(".v-dialog--active input", { visible: true });
  await page.type(".v-dialog--active input", "キタエア配合", { delay: 40 });
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll(".v-dialog--active button")];
    const save = btns.find((b) => b.textContent.includes("配合を保存"));
    save.click();
  });
  await sleep(1500);
  await shot(page, "12-combination-dialog.png");

  // ダイアログを閉じる
  await page.keyboard.press("Escape");
  await sleep(800);

  // 血統表示モードへ戻す（ボタンは「因　子」表記になっている）
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll(".exp-mobile-text-btn")];
    const b = btns.find((x) => x.textContent.replace(/\s/g, "").includes("因子"));
    b.click();
  });
  await sleep(800);

  // 13: ハートボタンで手動クロス指定
  await page.evaluate(() => {
    const hearts = [...document.querySelectorAll(".exp-mobile-icon-btn .mdi-heart-outline")];
    hearts[0].closest("button").click();
  });
  await sleep(1200);
  await shot(page, "13-heart-manual-cross.png");

  await browser.close();
  console.log("done");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
