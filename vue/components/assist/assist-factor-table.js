(function (window, Vue) {
  Vue.component("assist-factor-table", {
    props: { diagnosis: { type: Object, required: true } },
    data: function () {
      return { columns: [0, 1, 2, 3, 10, 11, 12, 13, 8, 9, 4, 5, 6, 7],
        labels: "短速底長適丈早晩堅難走中強雷".split("") };
    },
    template: `<table style="width:100%;border-collapse:collapse;table-layout:fixed" aria-label="因子の本数">
      <thead><tr><th style="width:44px"></th><th v-for="i in columns" :key="i"
        :class="'f' + ('0' + (i + 1)).slice(-2)">{{ labels[i] }}</th></tr></thead>
      <tbody><tr><th class="f00_nitro">ニトロ</th><td v-for="i in columns" :key="i"
        class="factorNumCell">{{ diagnosis.nitro[i] }}</td></tr>
      <tr><th class="f00_inbreed">クロス</th><td v-for="i in columns" :key="i"
        class="factorNumCell">{{ diagnosis.crossFactor[i] }}</td></tr></tbody>
    </table>`,
  });
})(window, window.Vue);
