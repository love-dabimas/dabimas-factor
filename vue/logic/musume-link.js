/**
 * このファイルの役割: ダビ娘の URL・ID・性別・受信メッセージの規則。
 * このファイルに置かない処理: DOM、Vue、保存処理。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  var BASE_URL = "/dabimas-data/dist/";
  function allowedSexForCell(index) {
    if (index === 16) return "1";
    return [3, 5, 7, 9, 11, 13, 15].includes(index % 16) ? "any" : "0";
  }
  function isMasterHorseId(id) {
    return typeof id === "string" && /^[sb]\d+$/.test(id);
  }
  function toMusumeKey(id) {
    return isMasterHorseId(id) ? id.slice(1) + (id[0] === "s" ? "-0" : "-1") : null;
  }
  function fromMusume(horseId, gender) {
    if (typeof horseId !== "string" || !/^\d+$/.test(horseId) || !["0", "1"].includes(gender)) return null;
    return (gender === "0" ? "s" : "b") + horseId;
  }
  function readMessage(event, sources, expectedOrigin) {
    if (!event || event.origin !== expectedOrigin || !event.source || !sources.includes(event.source)) return null;
    var data = event.data;
    if (!data || typeof data !== "object" || Array.isArray(data) || data.v !== 1) return null;
    return ["dabimas:hello", "dabimas:favorite-toggle", "dabimas:favorites-only", "dabimas:select"].includes(data.type) ? data : null;
  }
  window.Dabimas.logic.musumeLink = {
    BASE_URL: BASE_URL,
    embedUrl: function () { return BASE_URL + "?embed=1"; },
    pickerUrl: function (index) { return BASE_URL + "?picker=1&sex=" + allowedSexForCell(index); },
    allowedSexForCell: allowedSexForCell,
    isMasterHorseId: isMasterHorseId,
    toMusumeKey: toMusumeKey,
    fromMusume: fromMusume,
    readMessage: readMessage,
  };
})(window);
