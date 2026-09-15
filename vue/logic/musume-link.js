/**
 * このファイルの役割: ダビ娘の URL・ID・性別・受信メッセージの規則。
 * このファイルに置かない処理: DOM、Vue、保存処理。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  var BASE_URL = "/dabimas-data/dist/";
  var PEDIGREE_KEY = "dabimasMusumePedigreeOpen";

  // 血統表を最初から開くかどうか。既定は畳む。
  // 1枚あたり15行あって、一覧をスクロールするときの重さの本体になっている。
  function pedigreeOpen() {
    try {
      return window.localStorage.getItem(PEDIGREE_KEY) === "1";
    } catch (error) {
      return false;
    }
  }
  function setPedigreeOpen(value) {
    try {
      window.localStorage.setItem(PEDIGREE_KEY, value ? "1" : "0");
    } catch (error) {
      // 保存できなくても、この画面では切り替わるようにする。
    }
    return !!value;
  }
  function pedigreeParam(open) {
    return open ? "&pedigree=open" : "";
  }
  function allowedSexForCell(index) {
    if (index === 16) return "1";
    return [3, 5, 7, 9, 11, 13, 15].includes(index % 16) ? "any" : "0";
  }
  function isMasterHorseId(id) {
    return typeof id === "string" && /^[sb]\d+$/.test(id);
  }
  function toMusumeKey(id, gender) {
    if (isMasterHorseId(id)) return id.slice(1) + (id[0] === "s" ? "-0" : "-1");
    return typeof id === "string" && id.length > 0 && ["0", "1"].includes(gender)
      ? "ch_" + id + "-" + gender : null;
  }
  function fromMusume(horseId, gender) {
    if (typeof horseId !== "string" || !["0", "1"].includes(gender)) return null;
    if (horseId.startsWith("ch_") && horseId.length > 3) return horseId.slice(3);
    if (!/^\d+$/.test(horseId)) return null;
    return (gender === "0" ? "s" : "b") + horseId;
  }
  function readMessage(event, sources, expectedOrigin) {
    if (!event || event.origin !== expectedOrigin || !event.source || !sources.includes(event.source)) return null;
    var data = event.data;
    if (!data || typeof data !== "object" || Array.isArray(data) || data.v !== 1) return null;
    return ["dabimas:hello", "dabimas:favorite-toggle", "dabimas:favorites-only", "dabimas:select", "dabimas:candidates"].includes(data.type) ? data : null;
  }
  window.Dabimas.logic.musumeLink = {
    BASE_URL: BASE_URL,
    embedUrl: function (open) { return BASE_URL + "?embed=1" + pedigreeParam(open); },
    pickerUrl: function (index, open) {
      return BASE_URL + "?picker=1&sex=" + allowedSexForCell(index) + pedigreeParam(open);
    },
    pedigreeParam: pedigreeParam,
    pedigreeOpen: pedigreeOpen,
    setPedigreeOpen: setPedigreeOpen,
    allowedSexForCell: allowedSexForCell,
    isMasterHorseId: isMasterHorseId,
    toMusumeKey: toMusumeKey,
    fromMusume: fromMusume,
    readMessage: readMessage,
  };
})(window);
