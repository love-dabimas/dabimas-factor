/**
 * PROTOTYPE — 消してよし（詳細は同じフォルダの NOTES.md）
 *
 * これまでの答え:
 *   第1ラウンド 器の見せ方 → C（ボトムシート）
 *   第2ラウンド どの馬かの示し方 → Z（カードをタップで選択 → 下部バーで確定）
 *   第3ラウンド 閉じ方 → 馬選択ダイアログへ1段だけ戻る
 *
 * 第4ラウンドの疑問: お気に入り（❤）と、ダビ娘を単体で使う画面はどう見えるべきか。
 *   - ❤ はダビ娘のカード右上。ダビふぁく未対応の65頭には出さない
 *   - お気に入りの正本はダビふぁく側（ここ）。ダビ娘は postMessage で頼むだけ
 *     （本実装では dabifaku_unified に favorites ストア。PROTOTYPE では localStorage のスクラッチキー）
 *   - 「お気に入りのみ」: ダビ娘（見返す・整理する）/ 馬選択ダイアログ / PC 入力欄
 *   - 単体画面: ホームの 🔍 とタイルから全画面で開く。起動時は最後の画面を復元
 *
 * 本番ファイルには一切手を入れていない。登録済みコンポーネントのテンプレート等を、new Vue より前に差し替えているだけ。
 */
(function (window, Vue) {
  "use strict";

  var MUSUME_URL = "/tmp/prototype-search-modal/musume/";
  var MUSUME_SCREEN = "proto-musume";
  var PROTO_CATEGORY = "PROTOTYPE（消してよし）";
  var MATERNAL_ANCESTOR_IDS = [3, 5, 7, 9, 11, 13, 15];
  var FAV_KEY = "PROTOTYPE_dabimas_favorites（消してよし）";
  var FAV_ONLY_KEY = "PROTOTYPE_dabimas_favorites_only（消してよし）";
  var LAST_SCREEN_KEY = "PROTOTYPE_dabimas_last_screen（消してよし）";

  function loadJson(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }
  function saveJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // 保存できなくても検証は続けられる
    }
  }

  // 起動時に復元する画面は、画面遷移で上書きされる前に読んでおく
  var launchLastScreen = loadJson(LAST_SCREEN_KEY, "");
  // horse-cell.js の lists() と同じ規則で、セルに入れてよい性別を決める。
  function allowedSexForCell(index) {
    var sex = Math.floor(index / 16);
    var id = index % 16;
    if (sex === 1 && id === 0) return "1";
    if (MATERNAL_ANCESTOR_IDS.indexOf(id) !== -1) return "any";
    return "0";
  }

  function cellLabel(index) {
    var side = index < 16 ? "種牡馬側" : "繁殖牝馬側";
    var id = index % 16;
    return side + (id === 0 ? "・本馬" : "・祖先" + id);
  }

  // ダビ娘のキー（HorseId-Gender）⇔ ダビふぁくの ID（s/b + HorseId）。変換はこちらの責務。
  function fakuIdFromMusume(horseId, gender) {
    return (gender === "0" ? "s" : "b") + horseId;
  }
  function musumeKeyFromFakuId(id) {
    return id.slice(1) + "-" + (id.charAt(0) === "s" ? "0" : "1");
  }

  // ===== お気に入り（正本はダビふぁく側）=====
  var favIds = new Set(loadJson(FAV_KEY, []));
  var fav = Vue.observable({ version: 0, only: !!loadJson(FAV_ONLY_KEY, false) });

  function favoriteMusumeKeys() {
    return Array.from(favIds).map(musumeKeyFromFakuId);
  }
  function masterHorseIds() {
    var root = window.__debugAppInstance;
    return ((root && root.horsesBase) || [])
      .map(function (horse) { return horse.id; })
      .filter(function (id) { return /^[sb]\d+$/.test(id); });
  }
  function postToAllMusume(message) {
    Array.prototype.forEach.call(document.querySelectorAll("iframe.proto-iframe"), function (frame) {
      if (frame.contentWindow) {
        frame.contentWindow.postMessage(message, window.location.origin);
      }
    });
  }
  function toggleFavoriteId(id) {
    if (favIds.has(id)) {
      favIds.delete(id);
    } else {
      favIds.add(id);
    }
    saveJson(FAV_KEY, Array.from(favIds));
    fav.version += 1;
    postToAllMusume({ type: "dabimas-proto:favorites", favoriteKeys: favoriteMusumeKeys() });
  }
  function setFavoritesOnly(value) {
    fav.only = !!value;
    saveJson(FAV_ONLY_KEY, fav.only);
  }
  // 自家製馬と編集種牡馬は「お気に入りのみ」でも常に出す
  function passesFavoritesOnly(horse) {
    if (!horse) return false;
    if (horse.source === "edit") return true;
    if (String(horse.id || "").indexOf("ch_") === 0) return true;
    return favIds.has(horse.id);
  }
  function whenHorsesReady(callback) {
    var timer = setInterval(function () {
      var root = window.__debugAppInstance;
      if (root && Array.isArray(root.horsesBase) && root.horsesBase.length) {
        clearInterval(timer);
        callback(root);
      }
    }, 100);
  }

  // 馬選択ダイアログ・PC 入力欄に足す「お気に入りのみ」の共通部品
  var favComputed = {
    protoFavOnly: function () {
      return fav.only;
    },
    protoFavCount: function () {
      return fav.version >= 0 ? favIds.size : 0;
    },
  };
  var favMethods = {
    protoToggleFavOnly: function () {
      setFavoritesOnly(!fav.only);
    },
  };
  function extendOptions(Ctor, computed, methods) {
    Ctor.options.computed = Ctor.options.computed || {};
    Ctor.options.methods = Ctor.options.methods || {};
    Object.keys(computed).forEach(function (key) { Ctor.options.computed[key] = computed[key]; });
    Object.keys(methods).forEach(function (key) { Ctor.options.methods[key] = methods[key]; });
  }
  function patchTemplate(name, pairs) {
    var Ctor = Vue.options.components[name];
    if (!Ctor) {
      throw new Error("PROTOTYPE: " + name + " が登録されていない");
    }
    pairs.forEach(function (pair) {
      if (Ctor.options.template.split(pair[0]).length !== 2) {
        throw new Error("PROTOTYPE: " + name + " のテンプレートが想定と違う: " + pair[0]);
      }
      Ctor.options.template = Ctor.options.template.replace(pair[0], pair[1]);
    });
    return Ctor;
  }

  // 1) 本番の Service Worker を登録させない（LAN の http では動かず、localhost ではキャッシュが検証の邪魔になる）
  window.Dabimas.boot.registerServiceWorker = function () {};

  // 2) 馬選択ダイアログ（スマホ）: 「条件で探す」と「お気に入りのみ」
  //    main.js（new Vue）より前に実行されないと、元のテンプレートでマウントされる。
  var PICKER_ACTIONS = '<div class="exp-mobile-picker-actions">';
  var PICKER_BODY = '<div class="exp-mobile-picker-body">';
  var Picker = patchTemplate("mobile-horse-picker", [
    [
      PICKER_ACTIONS,
      PICKER_ACTIONS +
        `<button type="button" class="exp-mobile-picker-action proto-search-action"
          @click="$root.$emit('proto:open-search', { index: index, select: selectMobileHorse })">条件で探す</button>`,
    ],
    [
      PICKER_BODY,
      PICKER_BODY +
        `<div class="proto-fav-only-row">
          <button type="button" class="proto-fav-only-chip" :class="{ 'is-on': protoFavOnly }"
            :aria-pressed="protoFavOnly ? 'true' : 'false'" @click="protoToggleFavOnly">
            {{ protoFavOnly ? '♥' : '♡' }} お気に入りのみ（{{ protoFavCount }}）
          </button>
        </div>`,
    ],
  ]);
  extendOptions(Picker, favComputed, favMethods);
  // 候補の絞り込み（元の filteredMobileLists と同じ手順に「お気に入りのみ」を足す）。
  // 元は入力なしで 60 頭・入力ありで 80 頭までしか出さない。「お気に入りのみ」のときは上限を外して全部出す。
  Picker.options.computed.filteredMobileLists = function () {
    var source = Array.isArray(this.lists) ? this.lists : [];
    var normalizedQuery = this.normalizeSearchText(this.mobileQuery);
    var favoritesOnly = fav.only && fav.version >= 0;
    var limit = favoritesOnly ? Infinity : normalizedQuery ? 80 : 60;
    var filtered = [];
    for (var i = 0; i < source.length; i++) {
      var horse = source[i];
      if (!horse || horse.disabled) continue;
      if (favoritesOnly && !passesFavoritesOnly(horse)) continue;
      if (normalizedQuery && !this.getHorseSearchIndexText(horse).includes(normalizedQuery)) continue;
      filtered.push(horse);
      if (filtered.length >= limit) break;
    }
    return filtered;
  };

  // 3) PC の入力欄（v-autocomplete）: 候補一覧の先頭に「お気に入りのみ」
  var ITEM_SLOT = '<template v-slot:item="data">';
  var Desktop = patchTemplate("desktop-horse-autocomplete", [
    [':items="lists"', ':items="protoItems"'],
    [
      ITEM_SLOT,
      `<template v-slot:prepend-item>
          <v-list-item dense class="proto-fav-only-item" :class="{ 'is-on': protoFavOnly }"
            @mousedown.prevent @click="protoToggleFavOnly">
            <v-list-item-content>
              <v-list-item-title>{{ protoFavOnly ? '♥' : '♡' }} お気に入りのみ（{{ protoFavCount }}）</v-list-item-title>
            </v-list-item-content>
          </v-list-item>
          <v-divider></v-divider>
        </template>
        ` + ITEM_SLOT,
    ],
  ]);
  extendOptions(
    Desktop,
    Object.assign({}, favComputed, {
      protoItems: function () {
        var lists = this.lists;
        if (!fav.only || fav.version < 0 || !Array.isArray(lists)) return lists;
        return lists.filter(passesFavoritesOnly);
      },
    }),
    favMethods
  );

  // 4) ホーム画面: ダビ娘の入口。
  //    第7ラウンドで「見出しで区切る」に決定（横長タイル・カードの1枚の案は削除）。
  //    「馬を探す」「カテゴリ」の小見出しで 2 区画に分け、ダビ娘のタイルとカテゴリの格子の左右を 12px にそろえる。
  //    アプリバーの 🔍 は外した（アプリバーは固定されず一覧と一緒に流れるので、すぐ下のタイルと役割が重なる）。
  patchTemplate("home-page", [
    ['<div class="dabimas-home">', '<div class="dabimas-home proto-home">'],
    [
      "</v-app-bar>",
      `</v-app-bar>
        <div class="proto-home-section-title">馬を探す</div>
        <div class="proto-musume-tile-wrap">
          <v-card outlined ripple class="proto-musume-tile" @click="$root.$emit('proto:open-musume')">
            <v-icon size="28" color="primary">mdi-magnify</v-icon>
            <div class="proto-musume-tile__text">
              <div class="proto-musume-tile__title">ダビ娘</div>
              <div class="proto-musume-tile__sub">馬を探す・お気に入りを付ける</div>
            </div>
            <v-icon color="grey">mdi-chevron-right</v-icon>
          </v-card>
        </div>
        <div class="proto-home-section-title">カテゴリ</div>`,
    ],
  ]);

  // 5) 血統データが揃ったら検証用カテゴリへ切り替え、最後の画面がダビ娘ならダビ娘を開く
  var landTimer = setInterval(function () {
    var root = window.__debugAppInstance;
    var sync = window.Dabimas.workspaceSync;
    if (!root || !sync || !Array.isArray(root.horsesBase) || root.horsesBase.length === 0) {
      return;
    }
    clearInterval(landTimer);
    if (sync.state.dbUnavailable) {
      return;
    }
    var landing;
    if (sync.state.activeCategoryName === PROTO_CATEGORY && root.currentScreen === "category") {
      landing = Promise.resolve();
    } else {
      var existing = (sync.state.categories || []).find(function (c) { return c.name === PROTO_CATEGORY; });
      landing = existing
        ? sync.switchToCategory(existing.id)
        : sync.addCategory({ name: PROTO_CATEGORY, iconKey: "mdi-horse-variant" });
    }
    landing
      .then(function () {
        if (launchLastScreen === MUSUME_SCREEN) {
          root.$emit("proto:open-musume");
        }
      })
      .catch(function (error) {
        console.error("PROTOTYPE: 検証用カテゴリへ切り替えられなかった", error);
      });
  }, 100);

  // 馬選択用の iframe（ボトムシートの中身は一度開くと保持される）へメッセージを送る
  function postToPickerMusume(message) {
    var frame = document.querySelector(".proto-dialog--c iframe");
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage(message, window.location.origin);
    }
  }

  // 6) ボトムシート（馬選択から）・単体画面・状態表示
  Vue.component("prototype-search-host", {
    data: function () {
      return {
        open: false,
        target: null,
        lastTargetIndex: null,
        iframeSrc: "",
        iframeBornAt: 0,
        iframeLoadMs: null,
        musumeOpened: false,
        musumeUrl: MUSUME_URL + "?embed=1",
        lastResult: "",
        snackbar: { show: false, text: "" },
        vv: { h: 0, top: 0, inner: 0 },
        compact: false,
      };
    },
    computed: {
      targetLabel: function () {
        return this.target ? cellLabel(this.target.index) : "";
      },
      isMusumeScreen: function () {
        return this.$root.currentScreen === MUSUME_SCREEN;
      },
      favCount: function () {
        return fav.version >= 0 ? favIds.size : 0;
      },
    },
    created: function () {
      this.$root.$on("proto:open-search", this.openSearch);
      this.$root.$on("proto:open-musume", this.openMusume);
      this.$watch(
        function () { return this.$root.currentScreen; },
        function (screen) { saveJson(LAST_SCREEN_KEY, screen); }
      );
      window.addEventListener("message", this.onMessage);
      window.addEventListener("resize", this.updateVv);
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", this.updateVv);
        window.visualViewport.addEventListener("scroll", this.updateVv);
      }
      this.updateVv();
    },
    methods: {
      openSearch: function (target) {
        this.target = target;
        var src = MUSUME_URL + "?picker=1&sex=" + allowedSexForCell(target.index);
        if (src !== this.iframeSrc) {
          this.iframeSrc = src;
          this.iframeLoadMs = null;
        } else if (this.lastTargetIndex !== target.index) {
          // 同じ iframe を別のセル用に使い回すときは、前のセル向けの「選択中」を消す
          postToPickerMusume({ type: "dabimas-proto:reset-pick" });
        }
        this.lastTargetIndex = target.index;
        if (this.iframeLoadMs === null) {
          this.iframeBornAt = performance.now();
        }
        // 馬選択ダイアログは閉じずに下に残す。「‹ 戻る」でシートを下げると元の状態のまま出てくる。
        this.open = true;
      },
      backToPicker: function () {
        this.open = false;
      },
      openMusume: function () {
        this.musumeOpened = true;
        this.$root.currentScreen = MUSUME_SCREEN;
      },
      leaveMusume: function () {
        window.Dabimas.workspaceSync.goHome();
      },
      onIframeLoad: function (event) {
        // onload は React の描画前に来るので、検索 UI が出るまで中身を覗いて待つ（同一オリジンなので読める）
        var frame = event.target;
        var self = this;
        var started = this.iframeBornAt;
        var tick = function () {
          var doc = frame.contentDocument;
          var text = doc && doc.body ? doc.body.innerText : "";
          if (doc && doc.querySelector("input") && text.indexOf("起動中") === -1) {
            self.iframeLoadMs = Math.round(performance.now() - started);
            return;
          }
          if (performance.now() - started < 30000) {
            setTimeout(tick, 100);
          }
        };
        tick();
      },
      onMessage: function (event) {
        if (event.origin !== window.location.origin) {
          return;
        }
        var data = event.data || {};
        if (data.type === "dabimas-proto:hello") {
          // ダビ娘が起動したら、❤ を出してよい馬（ダビふぁく対応の馬）と今のお気に入りを渡す
          var source = event.source;
          whenHorsesReady(function () {
            try {
              source.postMessage(
                {
                  type: "dabimas-proto:favorites",
                  supportedKeys: masterHorseIds().map(musumeKeyFromFakuId),
                  favoriteKeys: favoriteMusumeKeys(),
                },
                window.location.origin
              );
            } catch (error) {
              // iframe が先に消えていたら何もしない
            }
          });
          return;
        }
        if (data.type === "dabimas-proto:favorite-toggle") {
          var favId = fakuIdFromMusume(String(data.horseId), String(data.gender));
          if (masterHorseIds().indexOf(favId) === -1) {
            return; // ダビふぁく未対応の馬は受け付けない（ダビ娘側でも ❤ を出していない）
          }
          toggleFavoriteId(favId);
          return;
        }
        if (data.type !== "dabimas-proto:select" || !this.target) {
          return;
        }
        // ダビ娘は HorseId と Gender だけ返す。ダビふぁくの ID への組み立てはこちらの責務。
        var fakuId = fakuIdFromMusume(String(data.horseId), String(data.gender));
        var summary = this.$root.findSummaryHorse({ id: fakuId });
        if (!summary) {
          this.toast("「" + data.name + "」はダビふぁく未対応の馬です（" + fakuId + "）");
          return;
        }
        var need = allowedSexForCell(this.target.index);
        if (need !== "any" && need !== data.gender) {
          this.toast("このセルには" + (need === "0" ? "種牡馬" : "繁殖牝馬") + "しか入りません");
          return;
        }
        var target = this.target;
        this.open = false;
        postToPickerMusume({ type: "dabimas-proto:reset-pick" });
        // 本番と同じ経路: 馬選択ダイアログを閉じて horse-change を emit → onChange
        target.select(summary);
        this.lastResult =
          summary.name + (summary.subName ? "-" + summary.subName + "-" : "") + " → " + cellLabel(target.index);
      },
      toast: function (text) {
        this.snackbar = { show: true, text: text };
      },
      updateVv: function () {
        var vv = window.visualViewport;
        this.vv = {
          h: Math.round(vv ? vv.height : window.innerHeight),
          top: Math.round(vv ? vv.offsetTop : 0),
          inner: window.innerHeight,
        };
      },
    },
    template: `
      <div class="proto-host">
        <!-- 馬選択の「条件で探す」から: ボトムシート。馬選択ダイアログの上に重ねる -->
        <v-bottom-sheet v-model="open" content-class="proto-dialog proto-dialog--c">
          <v-sheet class="proto-sheet">
            <div class="proto-sheet-grip"></div>
            <div class="proto-frame-header">
              <button type="button" class="proto-frame-button proto-frame-button--back" @click="backToPicker">‹ 戻る</button>
              <span class="proto-frame-title">ダビ娘で探す<small>{{ targetLabel }}</small></span>
            </div>
            <iframe v-if="iframeSrc" :src="iframeSrc" class="proto-iframe proto-iframe--c" title="ダビ娘" @load="onIframeLoad"></iframe>
          </v-sheet>
        </v-bottom-sheet>

        <!-- ホームから: 単体画面（全画面。シートではない） -->
        <div v-if="musumeOpened" v-show="isMusumeScreen" class="proto-screen">
          <div class="proto-frame-header">
            <button type="button" class="proto-frame-button proto-frame-button--back" @click="leaveMusume">‹ ホーム</button>
            <span class="proto-frame-title">ダビ娘</span>
          </div>
          <iframe :src="musumeUrl" class="proto-iframe proto-iframe--fill" title="ダビ娘"></iframe>
        </div>

        <v-snackbar v-model="snackbar.show" :timeout="3500" top color="error">{{ snackbar.text }}</v-snackbar>

        <!-- 状態表示（評価対象の UI ではない）。タップすると小さくなる -->
        <div class="proto-switcher" :class="{ 'is-compact': compact }" @click="compact = !compact">
          <div class="proto-switcher-label">
            <strong>PROTOTYPE — ♥ {{ favCount }}頭</strong>
            <span v-if="!compact">vv {{ vv.h }}/{{ vv.inner }}<template v-if="lastResult"> · {{ lastResult }}</template></span>
          </div>
        </div>
      </div>
    `,
  });
})(window, window.Vue);
