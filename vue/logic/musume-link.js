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
  // マスターの馬の ID。全書から作った馬は s/b + 全書の HorseId、R2 のゲームマスターから
  // 日次で足した馬は sg/bg + ゲーム内 ID（scripts/game_master_source.py）。
  // ダビ娘は後者を r/rb + ゲーム内 ID で持つ（dabimas-data の tools/horse_data/id_ledger.py）。
  var MASTER_ID_PREFIXES = [
    { factor: "sg", musume: "r", gender: "0" },
    { factor: "bg", musume: "rb", gender: "1" },
    { factor: "s", musume: "", gender: "0" },
    { factor: "b", musume: "", gender: "1" },
  ];
  function splitId(id, side) {
    if (typeof id !== "string") return null;
    var match = /^([a-z]*)(\d+)$/.exec(id);
    if (!match) return null;
    return MASTER_ID_PREFIXES.filter(function (rule) { return rule[side] === match[1]; })
      .map(function (rule) { return { rule: rule, number: match[2] }; });
  }
  function isMasterHorseId(id) {
    var found = splitId(id, "factor");
    return !!found && found.length > 0;
  }
  function toMusumeKey(id, gender) {
    var found = splitId(id, "factor");
    if (found && found.length) return found[0].rule.musume + found[0].number + "-" + found[0].rule.gender;
    return typeof id === "string" && id.length > 0 && ["0", "1"].includes(gender)
      ? "ch_" + id + "-" + gender : null;
  }
  function fromMusume(horseId, gender) {
    if (typeof horseId !== "string" || !["0", "1"].includes(gender)) return null;
    if (horseId.startsWith("ch_") && horseId.length > 3) return horseId.slice(3);
    var found = (splitId(horseId, "musume") || []).filter(function (item) { return item.rule.gender === gender; });
    return found.length ? found[0].rule.factor + found[0].number : null;
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
  // ダビ娘から届いた候補（[キー, 父系, 父父系, 3・4代の父系, 見事4枠]）のうち、
  // 形の合う行だけを残す。キーの HorseId は数字だけとは限らない。R2 から足した馬は
  // r329・rb283 のように英字が前に付く。1行でも合わない行があるときに全部を
  // 捨てると、理論チップが1つも出なくなる（実際にそうなった）ので、行ごとに落とす。
  // 6列目以降は見ない。ダビ娘が列を足しても、先に出た側が困らないようにしておく。
  function readCandidateRows(rows) {
    if (!Array.isArray(rows)) return null;
    return rows.filter(function (row) {
      return Array.isArray(row) && row.length >= 5 &&
        row.slice(0, 5).every(function (value) { return typeof value === "string"; }) &&
        /^[A-Za-z]*\d+-[01]$/.test(row[0]) &&
        /^[A-Za-z]{2}$/.test(row[1]) && /^[A-Za-z]{2}$/.test(row[2]) &&
        /^[A-Za-z]{4}$/.test(row[3]) && /^[A-Za-z]{6}([A-Za-z]{2})?$/.test(row[4]);
    });
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
    readCandidateRows: readCandidateRows,
  };
})(window);
