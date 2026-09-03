/**
 * 工程診断のブラウザ通しスモーク。
 *
 *   1) 静的サーバを立てる（例: python -m http.server 8771）
 *   2) Chrome を --headless --remote-debugging-port=9222 で起動する
 *   3) node scripts/smoke-plan-diagnosis.cjs [origin] [debugPort]
 *
 * 画面の onChangeMain（＝馬を選んだときと同じ入口）で血統表を組み立て、
 * runPlanDiagnosis を呼んで、ボタン状態・⚠ の数・工程結果を取り出す。
 */
const ORIGIN = process.argv[2] || "http://localhost:8771";
const DEBUG_PORT = process.argv[3] || "9222";

const PAGE_SCRIPT = `(async () => {
  const waitFor = async (test, timeoutMs) => {
    const limit = Date.now() + (timeoutMs || 30000);
    while (Date.now() < limit) {
      const value = test();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("timeout: " + test.toString());
  };

  const app = await waitFor(() => window.__debugAppInstance);
  await waitFor(() => Array.isArray(app.horsesBase) && app.horsesBase.length > 0);
  app.currentScreen = "category";

  const find = (name, subName) =>
    app.horsesBase.find(
      (horse) => horse.name === name && (subName === undefined || horse.subName === subName)
    );
  const baseBroodmare = app.horsesBase.find((horse) => horse.sex === "1");

  await app.onChangeMain(0, 0, find("ディープインパクト"));
  await app.onChangeMain(1, 0, baseBroodmare);
  await app.onChangeMain(1, 1, find("アイアンリージ", "巌瓏"));
  await app.onChangeMain(1, 3, find("アイスカペイド", "1973"));
  await app.onChangeMain(1, 7, find("ガーサント", "神狂"));
  await app.onChangeMain(1, 15, find("アドマイヤグルーヴ"));

  const beforeState = app.planDiagnosisState;
  await app.runPlanDiagnosis();
  await new Promise((resolve) => setTimeout(resolve, 200));

  const result = app.planDiagnosisResult;
  return JSON.stringify({
    baseBroodmare: baseBroodmare && baseBroodmare.name,
    beforeState,
    state: app.planDiagnosisState,
    badge: app.planDiagnosisBadgeText,
    dangerCells: app.planDangerCellIndexes,
    dangerMarksInDom: document.querySelectorAll(".plan-danger-mark").length,
    panelVisible: app.planDiagnosisPanelVisible,
    steps: result
      ? result.steps.map((step) => [step.stepNo, step.status, step.sireIndex, step.sireName])
      : null,
  });
})()`;

async function main() {
  const target = await fetch(
    "http://localhost:" + DEBUG_PORT + "/json/new?" + encodeURIComponent(ORIGIN + "/index.html"),
    { method: "PUT" }
  ).then((response) => response.json());

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;

  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params: params || {} }));
    });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        reject(new Error(JSON.stringify(message.error)));
      } else {
        resolve(message.result);
      }
    }
  });

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve);
    socket.addEventListener("error", reject);
  });

  const evaluated = await send("Runtime.evaluate", {
    expression: PAGE_SCRIPT,
    awaitPromise: true,
    returnByValue: true,
  });

  if (evaluated.exceptionDetails) {
    console.error(JSON.stringify(evaluated.exceptionDetails, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(JSON.parse(evaluated.result.value), null, 2));
  }

  // 第4引数を渡すと、その時点の画面を PNG で保存する。
  // 第5引数に closed を渡すと、結果パネルを閉じた状態（⚠ の確認用）で撮る。
  const screenshotPath = process.argv[4];
  if (screenshotPath && process.argv[5] === "closed") {
    await send("Runtime.evaluate", {
      expression:
        "window.__debugAppInstance.closePlanDiagnosisPanel();" +
        "new Promise((resolve) => setTimeout(resolve, 500))",
      awaitPromise: true,
    });
  }
  if (screenshotPath) {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    require("node:fs").writeFileSync(screenshotPath, Buffer.from(shot.data, "base64"));
    console.log("screenshot:", screenshotPath);
  }

  await send("Page.close").catch(() => {});
  socket.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
