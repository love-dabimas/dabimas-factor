/**
 * ブラウザ向けの純粋なJavaScriptラッパー。
 * TypeScript、npmパッケージ、Emscriptenランタイムは不要。
 */

/**
 * 入力を検証し、WASMを1回呼び出して詳細結果へdecodeする。
 *
 * @param {{ c: Function }} wasmExports
 * @param {{
 *   rarity: number,
 *   sireLineId: number,
 *   partnerLineIds: number[],
 *   miracle: boolean
 * }} input
 * @returns {{
 *   totalPoint: number,
 *   basePoint: number,
 *   commentId: number,
 *   miracleBonusApplied: boolean
 * }}
 */
function executeCalculation(wasmExports, input) {
  if (!wasmExports) {
    throw new Error("WASMが未初期化です");
  }
  if (!input || typeof input !== "object") {
    throw new TypeError("相性計算の入力オブジェクトが必要です");
  }
  if (Object.prototype.hasOwnProperty.call(input, "debug")) {
    throw new TypeError(
      "debugパラメータは使用できません。詳細結果にはcalculateDebug()を使用してください",
    );
  }

  const { rarity, sireLineId, partnerLineIds, miracle } = input;
  const isValidId = (value, min, max) =>
    Number.isInteger(value) && value >= min && value <= max;

  if (
    !isValidId(rarity, 1, 5) ||
    !isValidId(sireLineId, 1, 58) ||
    !Array.isArray(partnerLineIds) ||
    partnerLineIds.length !== 4 ||
    partnerLineIds.some((id) => !isValidId(id, 1, 58)) ||
    typeof miracle !== "boolean"
  ) {
    throw new RangeError("相性計算の入力値が範囲外です");
  }

  const packed = wasmExports.c(
    rarity,
    sireLineId,
    partnerLineIds[0],
    partnerLineIds[1],
    partnerLineIds[2],
    partnerLineIds[3],
    miracle ? 1 : 0,
  ) >>> 0;

  const invalidInput = ((packed >>> 21) & 1) === 1;
  if (invalidInput) {
    throw new RangeError("WASMが入力値を不正と判定しました");
  }

  return {
    totalPoint: packed & 0xff,
    basePoint: (packed >>> 8) & 0xff,
    commentId: (packed >>> 16) & 0x0f,
    miracleBonusApplied: ((packed >>> 20) & 1) === 1,
  };
}

export class LocalNicksCalculator {
  /**
   * @param {string} wasmUrl 公開したWASMファイルのURL
   */
  constructor(wasmUrl) {
    if (typeof wasmUrl !== "string" || wasmUrl.length === 0) {
      throw new TypeError("wasmUrlには空でない文字列を指定してください");
    }

    this.wasmUrl = wasmUrl;
    this.wasmExports = null;
    this.initializePromise = null;
  }

  /**
   * WASMを取得して初期化する。同時に複数回呼ばれても読み込みは1回だけ行う。
   * 初期化に失敗した場合は、次回の呼び出しで再試行できる。
   *
   * @returns {Promise<void>}
   */
  initialize() {
    if (this.initializePromise) return this.initializePromise;

    this.initializePromise = (async () => {
      const response = await fetch(this.wasmUrl, { cache: "force-cache" });
      if (!response.ok) {
        throw new Error(`WASMの取得に失敗しました: ${response.status}`);
      }

      let instance;

      try {
        // streaming側でbodyが消費されてもfallbackできるようcloneを使う。
        const result = await WebAssembly.instantiateStreaming(
          response.clone(),
          {},
        );
        instance = result.instance;
      } catch {
        // application/wasmが設定されていないサーバー向けfallback。
        const bytes = await response.arrayBuffer();
        const result = await WebAssembly.instantiate(bytes, {});
        instance = result.instance;
      }

      if (typeof instance.exports.c !== "function") {
        throw new Error("WASM export 'c' がありません");
      }

      this.wasmExports = instance.exports;
    })();

    this.initializePromise = this.initializePromise.catch((error) => {
      this.initializePromise = null;
      throw error;
    });

    return this.initializePromise;
  }

  /**
   * 通常利用向け。commentIdだけを数値で返す。
   *
   * @param {{
   *   rarity: number,
   *   sireLineId: number,
   *   partnerLineIds: number[],
   *   miracle: boolean
   * }} input
   * @returns {number}
   */
  calculate(input) {
    return executeCalculation(this.wasmExports, input).commentId;
  }

  /**
   * 調査・検証向け。計算途中の値を含む詳細オブジェクトを返す。
   *
   * @param {{
   *   rarity: number,
   *   sireLineId: number,
   *   partnerLineIds: number[],
   *   miracle: boolean
   * }} input
   * @returns {{
   *   totalPoint: number,
   *   basePoint: number,
   *   commentId: number,
   *   miracleBonusApplied: boolean
   * }}
   */
  calculateDebug(input) {
    return executeCalculation(this.wasmExports, input);
  }
}
