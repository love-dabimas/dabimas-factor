/**
 * このファイルの役割:
 * - 馬の検索・絞り込みで使う純粋な文字列処理をまとめる。
 * - 「PCのv-autocomplete」と「スマホの検索ダイアログ」の両方から同じ関数を呼べるようにする。
 *
 * このファイルに置かない処理:
 * - Vue コンポーネントの state（選択中の馬、ダイアログの開閉等）。
 * - IME（日本語入力）のイベント処理。あちらは mobile-horse-picker 側の役割で、
 *   ここでは「確定済みの検索文字列」を受け取って絞り込むだけ。
 *
 * 分けている理由:
 * - 分割前は common-autocomplete（現 horse-cell）が「PC入力」「スマホ入力」
 *   「メモ入力」「検索ロジック」を1つのコンポーネントで抱えており、検索文字列の
 *   正規化・絞り込みだけでも先に外へ出すことで、この部分は単体で挙動を
 *   確認できるようになる。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.horses = window.Dabimas.logic.horses || {};

  // getHorseSearchIndexText の結果をキャッシュする。馬オブジェクトは
  // Object.freeze 済みで instance が使い回されるため、WeakMap で参照ベースにキャッシュできる。
  var horseSearchIndexCache = new WeakMap();

  // 全角/半角・カタカナ/ひらがな・空白の揺れを吸収して検索しやすい形にする。
  // 例: "ｷﾀｻﾝﾌﾞﾗｯｸ" と "きたさんぶらっく" が同じ結果になるようにする。
  function normalizeSearchText(text) {
    if (typeof text !== "string") {
      return "";
    }

    return text
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/[　\s]+/g, "")
      .replace(/[ァ-ヶ]/g, function (char) {
        return String.fromCharCode(char.charCodeAt(0) - 0x60);
      });
  }

  // id・名前・馬名の補足・ふりがなをまとめた「内容ベース」のキー。
  // v-for の :key には使わない（内容が同じ馬が複数いると衝突するため）。
  // 主に「同じ馬かどうか」の突き合わせ判定に使う。
  function getHorseKey(horse) {
    if (!horse) {
      return "";
    }
    return [
      horse.id || "",
      horse.name || "",
      horse.subName || "",
      horse.ruby || "",
    ].join("|");
  }

  // 画面に表示する馬名（種別タグ＋名前＋補足）を組み立てる。
  // options.hideEditTag を立てるとエディット種牡馬の [E] を省く。
  // 候補リストのように行頭へ E バッジを別途出す場所で、同じ情報が
  // 二重に並ぶのを避けるために使う（血統表など、バッジが無い場所は付けたまま）。
  function getHorseBaseText(horse, options) {
    if (!horse) {
      return "";
    }
    var hideEditTag = !!(options && options.hideEditTag);
    var editTag = horse.source === "edit" && !hideEditTag ? "[E]" : "";
    var natureTag = horse.nature ? "[" + horse.nature.charAt(0) + "]" : "";
    return [editTag, natureTag, horse.name || "", horse.subName || ""]
      .filter(Boolean)
      .join("");
  }

  // 検索対象にする文字列（表示名＋名前＋補足＋ふりがな＋種別）をまとめて正規化する。
  // 呼び出しのたびに作り直すと重いため、馬オブジェクトごとにキャッシュする。
  function getHorseSearchIndexText(horse) {
    if (!horse || typeof horse !== "object") {
      return "";
    }
    var cached = horseSearchIndexCache.get(horse);
    if (typeof cached === "string") {
      return cached;
    }
    var searchText = normalizeSearchText(
      [
        getHorseBaseText(horse),
        horse.name || "",
        horse.subName || "",
        horse.ruby || "",
        horse.nature || "",
      ]
        .filter(Boolean)
        .join("|")
    );
    horseSearchIndexCache.set(horse, searchText);
    return searchText;
  }

  // 候補一覧に表示する因子バッジ（文字＋CSSクラス）を作る。
  function getHorseFactorBadges(horse) {
    var factors = Array.isArray(horse && horse.factors) ? horse.factors : [];
    return factors
      .map(function (value, index) {
        var text = typeof value === "string" ? value.trim() : "";
        if (!text) {
          return null;
        }
        var code = window.Dabimas.logic.factor.factorMap.get(text) || "00";
        return {
          key: code + "-" + text + "-" + index,
          text: text,
          className: code !== "00" ? "f" + code : "",
        };
      })
      .filter(Boolean);
  }

  // v-autocomplete / スマホ検索ダイアログ、どちらの絞り込みからも呼ばれる判定関数。
  // 「使用不可（disabled）」の馬は検索文字列に関わらず候補から除外する。
  function filterHorse(horse, queryText) {
    if (horse && horse.disabled) {
      return false;
    }

    var normalizedQuery = normalizeSearchText(queryText);

    if (!normalizedQuery) {
      return true;
    }

    return getHorseSearchIndexText(horse).indexOf(normalizedQuery) !== -1;
  }

  window.Dabimas.logic.horses.normalizeSearchText = normalizeSearchText;
  window.Dabimas.logic.horses.getHorseKey = getHorseKey;
  window.Dabimas.logic.horses.getHorseBaseText = getHorseBaseText;
  window.Dabimas.logic.horses.getHorseSearchIndexText = getHorseSearchIndexText;
  window.Dabimas.logic.horses.getHorseFactorBadges = getHorseFactorBadges;
  window.Dabimas.logic.horses.filterHorse = filterHorse;
})(window);
