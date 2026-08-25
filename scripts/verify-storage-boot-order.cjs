const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
let serviceWorkerRegisterCalls = 0;

const windowObject = {
  Dabimas: {
    app: {},
    logic: {
      pedigree: {
        createPedigreeRowConfigs() {
          return [];
        },
      },
      nicks: {
        isReady() {
          return false;
        },
      },
    },
  },
  addEventListener() {},
  removeEventListener() {},
  requestAnimationFrame(callback) {
    callback();
  },
  visualViewport: null,
  Vue: { config: {} },
};

const navigatorObject = {
  onLine: true,
  userAgent: "storage-boot-order-test",
  serviceWorker: {
    controller: null,
    addEventListener() {},
    register() {
      serviceWorkerRegisterCalls += 1;
      return Promise.resolve({
        scope: "http://localhost/",
        update() {
          return Promise.resolve();
        },
      });
    },
  },
};

const context = vm.createContext({
  console,
  document: {
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    },
  },
  location: { protocol: "http:" },
  navigator: navigatorObject,
  Promise,
  setTimeout() {},
  window: windowObject,
  Vue: windowObject.Vue,
});
windowObject.navigator = navigatorObject;

vm.runInContext(
  fs.readFileSync(path.join(root, "vue/app/boot.js"), "utf8"),
  context,
  { filename: "boot.js" }
);

assert.equal(
  serviceWorkerRegisterCalls,
  0,
  "boot.js の評価時にService Worker登録を開始しない"
);
assert.equal(
  typeof windowObject.Dabimas.boot.registerServiceWorker,
  "function",
  "復元完了後に呼べる登録関数を公開する"
);

vm.runInContext(
  fs.readFileSync(path.join(root, "vue/app/app-lifecycle.js"), "utf8"),
  context,
  { filename: "app-lifecycle.js" }
);

let resolveDataReady;
const dataReadyPromise = new Promise((resolve) => {
  resolveDataReady = resolve;
});
const mountedContext = {
  $nextTick() {},
  $vuetify: { breakpoint: { smAndDown: false } },
  c1() {
    return dataReadyPromise;
  },
  c2() {
    return Promise.resolve();
  },
  c3() {
    return Promise.resolve();
  },
  getStableViewportHeight() {
    return 600;
  },
  loadInbreedExceptions() {
    return Promise.resolve();
  },
  scheduleInitialMobileViewportLayout() {},
};

windowObject.Dabimas.app.lifecycle.mounted.call(mountedContext);
assert.equal(
  serviceWorkerRegisterCalls,
  0,
  "データ復元中はService Worker登録を開始しない"
);

resolveDataReady();
setImmediate(() => {
  assert.equal(
    serviceWorkerRegisterCalls,
    1,
    "データ復元完了後にService Workerを1回登録する"
  );
  console.log("storage boot order regression: OK");
});
