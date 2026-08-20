/** 子系統カラーのマスター読み込みと、表示・集計用の純関数を提供する。 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};

  var COLOR_HEX = [
    null,
    "#F4B8B8",
    "#F6CD9E",
    "#F2E388",
    "#BCDD9A",
    "#8FDEC1",
    "#9BD6EF",
    "#AABCF0",
    "#D4B8EC",
    "#F1B3D8",
  ];
  var COLOR_BADGE = ["", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"];
  var masterLines = [];
  var masterIdByName = {};
  var readyPromise = null;

  function emptySettings() {
    return { schemaVersion: 1, colors: {}, labels: {} };
  }

  function validateSettings(raw) {
    var validated = emptySettings();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return validated;
    }

    if (raw.colors && typeof raw.colors === "object" && !Array.isArray(raw.colors)) {
      Object.keys(raw.colors).forEach(function (key) {
        var id = Number(key);
        var colorIndex = raw.colors[key];
        if (
          Number.isInteger(id) &&
          String(id) === key &&
          id >= 1 &&
          id <= 58 &&
          Number.isInteger(colorIndex) &&
          colorIndex >= 1 &&
          colorIndex <= 9
        ) {
          validated.colors[String(id)] = colorIndex;
        }
      });
    }

    if (raw.labels && typeof raw.labels === "object" && !Array.isArray(raw.labels)) {
      Object.keys(raw.labels).forEach(function (key) {
        var colorIndex = Number(key);
        var value = raw.labels[key];
        if (
          !Number.isInteger(colorIndex) ||
          String(colorIndex) !== key ||
          colorIndex < 1 ||
          colorIndex > 9
        ) {
          return;
        }
        if (typeof value !== "string") {
          return;
        }
        var label = value.trim();
        if (label.length >= 1 && label.length <= 10) {
          validated.labels[String(colorIndex)] = label;
        }
      });
    }

    return validated;
  }

  function groupByBase(lines) {
    var groupsById = {};
    (Array.isArray(lines) ? lines : [])
      .slice()
      .sort(function (a, b) {
        return Number(a && a.id) - Number(b && b.id);
      })
      .forEach(function (line) {
        if (!line || !Number.isInteger(Number(line.id))) {
          return;
        }
        var baseId = Number(line.sireLineBaseId);
        var key = String(baseId);
        if (!groupsById[key]) {
          groupsById[key] = {
            baseId: baseId,
            baseAbbr: line.baseAbbr || "",
            baseName: line.baseName || "",
            lines: [],
          };
        }
        groupsById[key].lines.push(line);
      });

    return Object.keys(groupsById)
      .map(function (key) {
        return groupsById[key];
      })
      .sort(function (a, b) {
        return a.baseId - b.baseId;
      });
  }

  function installMasterLines(lines) {
    masterLines = (Array.isArray(lines) ? lines : [])
      .filter(function (line) {
        return line && Number.isInteger(Number(line.id)) && typeof line.name === "string";
      })
      .map(function (line) {
        return {
          id: Number(line.id),
          name: line.name,
          sireLineBaseId: Number(line.sireLineBaseId),
          baseName: line.baseName || "",
          baseAbbr: line.baseAbbr || "",
        };
      })
      .sort(function (a, b) {
        return a.id - b.id;
      });
    masterIdByName = {};
    masterLines.forEach(function (line) {
      masterIdByName[line.name.trim()] = line.id;
    });
  }

  function ready() {
    if (!readyPromise) {
      readyPromise = fetch("./data/sire_lines_public.json")
        .then(function (response) {
          if (!response.ok) {
            throw new Error("sire line master fetch failed: " + response.status);
          }
          return response.json();
        })
        .then(function (json) {
          installMasterLines(json && json.sireLines);
          return masterLines;
        })
        .catch(function (error) {
          console.warn("sire line color master load failed", error);
          installMasterLines([]);
          return masterLines;
        });
    }
    return readyPromise;
  }

  function getMasterLines() {
    return masterLines;
  }

  function colorIndexForId(id, settings) {
    if (!settings || !settings.colors) {
      return 0;
    }
    var numericId = Number(id);
    var colorIndex = settings.colors[String(numericId)];
    return Number.isInteger(colorIndex) && colorIndex >= 1 && colorIndex <= 9
      ? colorIndex
      : 0;
  }

  function colorIndexForName(name, settings) {
    if (typeof name !== "string" || !settings) {
      return 0;
    }
    var normalizedName = name.trim();
    if (!normalizedName || !Object.prototype.hasOwnProperty.call(masterIdByName, normalizedName)) {
      return 0;
    }
    return colorIndexForId(masterIdByName[normalizedName], settings);
  }

  function badgeFor(colorIndex) {
    return COLOR_BADGE[colorIndex] || "";
  }

  function colorClassFor(colorIndex) {
    return Number.isInteger(colorIndex) && colorIndex >= 1 && colorIndex <= 9
      ? "sire-color-" + colorIndex
      : "";
  }

  function countCategoryColorBuckets(categoryArray, settings) {
    var distinctNames = Array.from({ length: 10 }, function () {
      return new Set();
    });
    var total = Array.from({ length: 10 }, function () {
      return 0;
    });

    (Array.isArray(categoryArray) ? categoryArray : []).forEach(function (name) {
      if (typeof name !== "string") {
        return;
      }
      var normalizedName = name.trim();
      if (!normalizedName) {
        return;
      }
      var colorIndex = colorIndexForName(normalizedName, settings);
      distinctNames[colorIndex].add(normalizedName);
      total[colorIndex] += 1;
    });

    return {
      distinct: distinctNames.map(function (names) {
        return names.size;
      }),
      total: total,
    };
  }

  window.Dabimas.logic.sireLineColors = {
    COLOR_HEX: COLOR_HEX,
    COLOR_BADGE: COLOR_BADGE,
    ready: ready,
    getMasterLines: getMasterLines,
    groupByBase: groupByBase,
    colorIndexForName: colorIndexForName,
    colorIndexForId: colorIndexForId,
    badgeFor: badgeFor,
    colorClassFor: colorClassFor,
    countCategoryColorBuckets: countCategoryColorBuckets,
    validateSettings: validateSettings,
  };
})(window);
