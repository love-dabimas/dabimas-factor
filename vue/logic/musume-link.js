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
  // ゲーム内 ID（ゲーム本体が持つ番号）で作るキー。全書の更新や R2 の採取の
  // タイミングに左右されないので、ダビ娘との突き合わせでいちばん安定する。
  // ダビふぁくの馬に gameId が入るのは日次データ更新の実装後なので、
  // それまでこの経路は黙って使われないままになる（害は無い）。
  function gameKey(gameId, gender) {
    if (gameId === undefined || gameId === null || gameId === "") return null;
    return ["0", "1"].includes(gender) ? "g" + String(gameId) + "-" + gender : null;
  }
  // ダビ娘から届いた馬を、ダビふぁくの ID に直す。
  // ゲーム内 ID で引ければそれを優先し、だめなら従来どおり s/b + HorseId にする。
  // ダビ娘は、こちらが知っている ID（採番が変わる前の ID を含む）を送ってくる。
  function resolveId(data, idByGameId) {
    var byGame = idByGameId && data && gameKey(data.gameId, data.gender)
      ? idByGameId.get(gameKey(data.gameId, data.gender)) : null;
    return byGame || fromMusume(data && data.horseId, data && data.gender);
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
    gameKey: gameKey,
    resolveId: resolveId,
    readMessage: readMessage,
  };
})(window);
