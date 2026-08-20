/** 子系統カラー設定の読み込み・保存を root app の methods へ追加する。 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.app = window.Dabimas.app || {};
  window.Dabimas.app.methods = window.Dabimas.app.methods || {};

  var SETTINGS_KEY = "sireLineColorSettings";

  function logic() {
    return window.Dabimas.logic.sireLineColors;
  }

  function repository() {
    return window.Dabimas.repositories.appMeta;
  }

  function cloneSettings(settings) {
    var validated = logic().validateSettings(settings);
    return {
      schemaVersion: 1,
      colors: Object.assign({}, validated.colors),
      labels: Object.assign({}, validated.labels),
    };
  }

  Object.assign(window.Dabimas.app.methods, {
    loadSireLineColorSettings: function () {
      return Promise.all([logic().ready(), repository().get(SETTINGS_KEY)])
        .then(
          function (results) {
            var settings = logic().validateSettings(results[1]);
            this.sireLineColorSettings = settings;
            return settings;
          }.bind(this)
        )
        .catch(
          function (error) {
            console.warn("sire line color settings load failed", error);
            var settings = logic().validateSettings(null);
            this.sireLineColorSettings = settings;
            return settings;
          }.bind(this)
        );
    },

    saveSireLineColorAssignment: function (sireLineId, colorIndex) {
      var next = cloneSettings(this.sireLineColorSettings);
      var id = Number(sireLineId);
      var color = Number(colorIndex);
      if (Number.isInteger(id) && id >= 1 && id <= 58) {
        if (color === 0) {
          delete next.colors[String(id)];
        } else if (Number.isInteger(color) && color >= 1 && color <= 9) {
          next.colors[String(id)] = color;
        }
      }
      next = logic().validateSettings(next);
      return repository()
        .set(SETTINGS_KEY, next)
        .then(
          function () {
            this.sireLineColorSettings = next;
            return next;
          }.bind(this)
        );
    },

    saveSireLineColorLabels: function (labels) {
      var current = cloneSettings(this.sireLineColorSettings);
      var next = logic().validateSettings({
        schemaVersion: 1,
        colors: current.colors,
        labels: labels,
      });
      return repository()
        .set(SETTINGS_KEY, next)
        .then(
          function () {
            this.sireLineColorSettings = next;
            return next;
          }.bind(this)
        );
    },

    clearAllSireLineColors: function () {
      var current = cloneSettings(this.sireLineColorSettings);
      var next = {
        schemaVersion: 1,
        colors: {},
        labels: Object.assign({}, current.labels),
      };
      return repository()
        .set(SETTINGS_KEY, next)
        .then(
          function () {
            this.sireLineColorSettings = next;
            return next;
          }.bind(this)
        );
    },

    buildSireLineColorCounts: function () {
      // category は index 直接代入で更新されるため computed にせず、描画のたびに数える。
      return logic().countCategoryColorBuckets(
        this.category,
        this.sireLineColorSettings
      );
    },
  });
})(window);
