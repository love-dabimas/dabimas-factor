import { LocalNicksCalculator } from "./nicksCalculator.js";

window.Dabimas = window.Dabimas || {};
window.Dabimas.logic = window.Dabimas.logic || {};

const calculator = new LocalNicksCalculator(
  "./assets/nicks.43c73869f1a2.wasm",
);
const validLineIds = new Set(
  Array.from({ length: 58 }, (_, index) => index + 1),
);
const lineIdByName = new Map();
let ready = false;

window.Dabimas.logic.nicks = {
  isReady() {
    return ready;
  },

  calculate(input) {
    return calculator.calculate(input);
  },

  resolveLineId(sonId, sonName) {
    if (Number.isInteger(sonId) && validLineIds.has(sonId)) {
      return sonId;
    }

    if (typeof sonName !== "string") {
      return null;
    }

    const normalizedName = sonName.trim();
    return normalizedName ? (lineIdByName.get(normalizedName) ?? null) : null;
  },
};

(async function initializeNicks() {
  try {
    const [, response] = await Promise.all([
      calculator.initialize(),
      fetch("./data/sire_lines_public.json"),
    ]);
    if (!response.ok) {
      throw new Error(`子系統マスターの取得に失敗しました: ${response.status}`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.sireLines)) {
      throw new TypeError("子系統マスターの形式が不正です");
    }

    data.sireLines.forEach((line) => {
      if (
        line &&
        validLineIds.has(line.id) &&
        typeof line.name === "string" &&
        line.name.trim()
      ) {
        lineIdByName.set(line.name.trim(), line.id);
      }
    });

    ready = true;
    window.dispatchEvent(new CustomEvent("dabimas:nicks-ready"));
  } catch (error) {
    console.warn("相性計算の初期化に失敗しました。", error);
  }
})();
