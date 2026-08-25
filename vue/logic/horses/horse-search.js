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
  var ABILITY_BADGES = {
    none: {
      text: "凡",
      className: "exp-horse-badge--noability",
      title: "非凡なし",
    },
    normal: {
      text: "非",
      className: "exp-horse-badge--normal",
      title: "非凡あり",
    },
    double: {
      text: "弐",
      className: "exp-horse-badge--double",
      title: "弐重非凡",
    },
    focused: {
      text: "特",
      className: "exp-horse-badge--focused",
      title: "特化非凡",
    },
  };
  var ABILITY_ALIASES = {
    none: "非凡なし|ひぼんなし",
    normal: "非凡あり|ひぼんあり",
    double: "非凡あり|ひぼんあり|弐重非凡|にじゅうひぼん",
    focused: "非凡あり|ひぼんあり|特化非凡|とっかひぼん",
  };
  var INMEISAI_CATEGORY_ICON = "14";
  var INMEISAI_ALIASES = "因名祭|いんめいさい";
  // 配合保存ダイアログで作った馬（自家製）。保存レコードの name は
  // "☆タイトル" で、インブリード判定（vue/logic/inbreed/inbreed-detector.js）が
  // この ☆ を見て対象外にしているため、名前そのものは変えない。
  // 表示のときだけ ☆ を落として「自」バッジに置き換える。
  var SAVED_NAME_PREFIX = /^☆/;
  var SAVED_ALIASES = "自家製|じかせい";

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

  // 非凡バッジ対象になる★5種牡馬の既知種別だけを返す。
  function getAbilityType(horse) {
    if (!horse || horse.sex !== "0" || horse.rare !== 5) {
      return "";
    }
    return ABILITY_BADGES[horse.abilityType] ? horse.abilityType : "";
  }

  function isInmeisai(horse) {
    return !!horse && horse.categoryIcon === INMEISAI_CATEGORY_ICON;
  }

  // 配合保存ダイアログで保存した馬かどうか。候補一覧に載る summary は
  // source:"custom" を持つが、localStorage から復元した selected など
  // source が落ちている経路もあるため、customHorseId と名前の ☆ も見る。
  function isSavedHorse(horse) {
    if (!horse) {
      return false;
    }
    return (
      horse.source === "custom" ||
      !!horse.customHorseId ||
      SAVED_NAME_PREFIX.test(String(horse.name || ""))
    );
  }

  // 画面共通の1文字バッジを、表示順どおりの新しい配列で返す。
  function getHorseBadges(horse, options) {
    if (!horse) {
      return [];
    }
    var badges = [];
    var hideEditBadge = !!(options && options.hideEditBadge);
    if (isSavedHorse(horse)) {
      badges.push({
        key: "saved",
        text: "自",
        className: "exp-horse-badge--saved",
        title: "自家製（保存した配合）",
      });
    }
    if (horse.source === "edit" && !hideEditBadge) {
      badges.push({
        key: "edit",
        text: "E",
        className: "exp-horse-badge--edit",
        title: "エディット種牡馬",
      });
    }
    if (typeof horse.nature === "string" && horse.nature) {
      badges.push({
        key: "nature",
        text: horse.nature.charAt(0),
        className: "exp-horse-badge--nature",
        title: "天性: " + horse.nature,
      });
    }
    var abilityType = getAbilityType(horse);
    if (abilityType) {
      badges.push(Object.assign({ key: "ability" }, ABILITY_BADGES[abilityType]));
    }
    if (isInmeisai(horse)) {
      badges.push({
        key: "inmeisai",
        text: "祭",
        className: "exp-horse-badge--inmeisai",
        title: "因名祭",
      });
    }
    return badges;
  }

  // バッジを別DOMで描画する場所向けの、タグを含まない馬名。
  function getHorseNameText(horse) {
    if (!horse) {
      return "";
    }
    // 自家製馬の先頭の ☆ は「自」バッジで表すので、表示名からは外す。
    // この関数を呼ぶ場所（血統表のセル・候補一覧・スマホの検索ダイアログ）は
    // いずれも同じ場所へ getHorseBadges の結果を並べている。
    var name = String(horse.name || "").replace(SAVED_NAME_PREFIX, "");
    return [name, horse.subName || ""].filter(Boolean).join("");
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
    var badgeText = getHorseBadges(horse, { hideEditBadge: hideEditTag })
      .map(function (badge) {
        return "[" + badge.text + "]";
      })
      .join("");
    return badgeText + getHorseNameText(horse);
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
    var abilityType = getAbilityType(horse);
    var searchText = normalizeSearchText(
      [
        getHorseBaseText(horse),
        horse.name || "",
        horse.subName || "",
        horse.ruby || "",
        horse.nature || "",
        getHorseBadges(horse)
          .map(function (badge) {
            return badge.text;
          })
          .join(""),
        abilityType ? ABILITY_ALIASES[abilityType] : "",
        isInmeisai(horse) ? INMEISAI_ALIASES : "",
        isSavedHorse(horse) ? SAVED_ALIASES : "",
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
  window.Dabimas.logic.horses.getAbilityType = getAbilityType;
  window.Dabimas.logic.horses.isInmeisai = isInmeisai;
  window.Dabimas.logic.horses.isSavedHorse = isSavedHorse;
  window.Dabimas.logic.horses.getHorseBadges = getHorseBadges;
  window.Dabimas.logic.horses.getHorseNameText = getHorseNameText;
  window.Dabimas.logic.horses.getHorseBaseText = getHorseBaseText;
  window.Dabimas.logic.horses.getHorseSearchIndexText = getHorseSearchIndexText;
  window.Dabimas.logic.horses.getHorseFactorBadges = getHorseFactorBadges;
  window.Dabimas.logic.horses.filterHorse = filterHorse;
})(window);
