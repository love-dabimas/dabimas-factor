/**
 * このファイルの役割: お気に入りの状態と repository 経由の保存。
 * このファイルに置かない処理: DOM、iframe への配信、IndexedDB の直接操作。
 */
(function (window, Vue) {
  var repo = window.Dabimas.repositories.favorites;
  var meta = window.Dabimas.repositories.appMeta;
  var link = window.Dabimas.logic.musumeLink;
  var favoriteIds = new Set();
  var state = Vue.observable({ ready: false, available: true, only: false, count: 0, version: 0 });
  // 同じ馬への連打を保存順に処理し、失敗時の巻き戻しが後続操作を消さないようにする。
  var pending = new Map();
  function changed() {
    state.count = favoriteIds.size;
    state.version++;
  }
  function load() {
    return Promise.all([repo.getAll(), meta.get("favoritesOnly")]).then(function (values) {
      favoriteIds = new Set(values[0].map(function (row) { return row.id; }).filter(link.isMasterHorseId));
      state.only = values[1] === true;
      state.available = true;
      changed();
    }).catch(function (error) {
      state.available = false;
      console.warn("favorites load failed", error);
    }).then(function () { state.ready = true; });
  }
  function toggle(id) {
    if (!state.available) return Promise.reject(new Error("favorites unavailable"));
    if (!link.isMasterHorseId(id)) return Promise.reject(new Error("invalid favorite id"));
    if (pending.has(id)) return pending.get(id).catch(function () {}).then(function () { return toggle(id); });
    var had = favoriteIds.has(id);
    if (had) favoriteIds.delete(id);
    else favoriteIds.add(id);
    changed();
    var saving = Promise.resolve().then(function () {
      return had ? repo.remove(id) : repo.add(id);
    }).catch(function (error) {
      if (had) favoriteIds.add(id);
      else favoriteIds.delete(id);
      changed();
      throw error;
    }).finally(function () { pending.delete(id); });
    pending.set(id, saving);
    return saving;
  }
  function setOnly(value) {
    state.only = value === true;
    return meta.set("favoritesOnly", state.only).catch(function (error) {
      console.warn("favoritesOnly save failed", error);
    });
  }
  window.Dabimas.favorites = {
    state: state,
    load: load,
    has: function (id) { return favoriteIds.has(id); },
    ids: function () { return Array.from(favoriteIds); },
    toggle: toggle,
    setOnly: setOnly,
    passesFavoritesOnly: function (horse) {
      return !link.isMasterHorseId(horse && horse.id) || favoriteIds.has(horse.id);
    },
  };
})(window, window.Vue);
