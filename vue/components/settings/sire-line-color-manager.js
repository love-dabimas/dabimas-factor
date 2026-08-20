/** 設定画面の子系統カラー割り当て・ラベル編集ビュー。 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.components = window.Dabimas.components || {};

  var SireLineColorManager = {
    name: "sire-line-color-manager",
    data: function () {
      return {
        loading: true,
        groups: [],
        pickerVisible: false,
        selectedLine: null,
        labelDialogVisible: false,
        labelDraft: {},
        clearDialogVisible: false,
        saving: false,
        snackbar: { show: false, message: "", color: "success" },
      };
    },
    computed: {
      settings: function () {
        return window.Dabimas.logic.sireLineColors.validateSettings(
          this.$root.sireLineColorSettings
        );
      },
      assignedCount: function () {
        return Object.keys(this.settings.colors).length;
      },
      paletteOptions: function () {
        return Array.from({ length: 10 }, function (_, index) {
          return { index: index };
        });
      },
      labelOptions: function () {
        return this.paletteOptions.slice(1);
      },
      selectedColorIndex: function () {
        return this.selectedLine ? this.colorIndexForLine(this.selectedLine) : 0;
      },
    },
    created: function () {
      window.Dabimas.logic.sireLineColors
        .ready()
        .then(
          function () {
            this.groups = window.Dabimas.logic.sireLineColors.groupByBase(
              window.Dabimas.logic.sireLineColors.getMasterLines()
            );
          }.bind(this)
        )
        .catch(function (error) {
          console.warn("sire line color manager load failed", error);
        })
        .then(
          function () {
            this.loading = false;
          }.bind(this)
        );
    },
    methods: {
      showMessage: function (message, color) {
        this.snackbar = {
          show: true,
          message: message,
          color: color || "success",
        };
      },
      colorIndexForLine: function (line) {
        return window.Dabimas.logic.sireLineColors.colorIndexForId(
          line && line.id,
          this.settings
        );
      },
      colorClassForIndex: function (colorIndex) {
        return window.Dabimas.logic.sireLineColors.colorClassFor(colorIndex);
      },
      colorClassForLine: function (line) {
        return this.colorClassForIndex(this.colorIndexForLine(line));
      },
      badgeFor: function (colorIndex) {
        return window.Dabimas.logic.sireLineColors.badgeFor(colorIndex);
      },
      openPicker: function (line) {
        this.selectedLine = line;
        this.pickerVisible = true;
      },
      paletteLabel: function (colorIndex) {
        if (colorIndex === 0) {
          return "未設定";
        }
        var label = this.settings.labels[String(colorIndex)];
        return this.badgeFor(colorIndex) + (label ? " " + label : "");
      },
      selectColor: function (colorIndex) {
        if (!this.selectedLine || this.saving) {
          return;
        }
        this.saving = true;
        this.$root
          .saveSireLineColorAssignment(this.selectedLine.id, colorIndex)
          .then(
            function () {
              this.pickerVisible = false;
              this.selectedLine = null;
            }.bind(this)
          )
          .catch(
            function (error) {
              console.error(error);
              this.showMessage("色設定の保存に失敗しました", "error");
            }.bind(this)
          )
          .then(
            function () {
              this.saving = false;
            }.bind(this)
          );
      },
      openLabelDialog: function () {
        var draft = {};
        for (var index = 1; index <= 9; index += 1) {
          draft[String(index)] = this.settings.labels[String(index)] || "";
        }
        this.labelDraft = draft;
        this.labelDialogVisible = true;
      },
      saveLabels: function () {
        if (this.saving) {
          return;
        }
        this.saving = true;
        this.$root
          .saveSireLineColorLabels(this.labelDraft)
          .then(
            function () {
              this.labelDialogVisible = false;
            }.bind(this)
          )
          .catch(
            function (error) {
              console.error(error);
              this.showMessage("色ラベルの保存に失敗しました", "error");
            }.bind(this)
          )
          .then(
            function () {
              this.saving = false;
            }.bind(this)
          );
      },
      executeClear: function () {
        if (this.saving) {
          return;
        }
        this.saving = true;
        this.$root
          .clearAllSireLineColors()
          .then(
            function () {
              this.clearDialogVisible = false;
            }.bind(this)
          )
          .catch(
            function (error) {
              console.error(error);
              this.showMessage("色設定の解除に失敗しました", "error");
            }.bind(this)
          )
          .then(
            function () {
              this.saving = false;
            }.bind(this)
          );
      },
    },
    template: `
      <div class="dabimas-settings sire-line-color-manager">
        <v-app-bar dense flat color="white" class="dabimas-settings-appbar">
          <v-btn icon aria-label="設定メニューへ戻る" @click="$emit('back')">
            <v-icon>mdi-arrow-left</v-icon>
          </v-btn>
          <v-toolbar-title class="dabimas-settings-title">子系統カラー</v-toolbar-title>
        </v-app-bar>

        <div class="sire-line-color-toolbar">
          <span class="sire-line-color-count">設定済み {{ assignedCount }} / 58</span>
          <v-btn small text color="primary" @click="openLabelDialog">色ラベル</v-btn>
          <v-btn small text color="error" @click="clearDialogVisible = true">すべて解除</v-btn>
        </div>

        <div v-if="loading" class="dabimas-settings-empty">
          <v-progress-circular indeterminate color="primary"></v-progress-circular>
        </div>
        <div v-else class="sire-line-color-list">
          <div v-for="group in groups" :key="group.baseId" class="sire-line-color-group">
            <div class="sire-line-color-group-header">
              {{ group.baseAbbr }}｜{{ group.baseName }}
            </div>
            <v-list dense class="py-0">
              <v-list-item
                v-for="line in group.lines"
                :key="line.id"
                :class="['sire-line-color-row', colorClassForLine(line)]"
                @click="openPicker(line)"
              >
                <v-list-item-icon class="my-2 mr-3">
                  <span
                    class="sire-line-color-swatch"
                    :class="colorClassForLine(line)"
                  >{{ badgeFor(colorIndexForLine(line)) }}</span>
                </v-list-item-icon>
                <v-list-item-content>
                  <v-list-item-title>{{ line.name }}</v-list-item-title>
                </v-list-item-content>
              </v-list-item>
            </v-list>
          </div>
        </div>

        <v-dialog v-model="pickerVisible" max-width="480">
          <v-card v-if="selectedLine">
            <v-card-title>{{ selectedLine.name }}</v-card-title>
            <v-card-text>
              <div class="sire-line-color-palette">
                <button
                  v-for="option in paletteOptions"
                  :key="option.index"
                  type="button"
                  class="sire-line-color-option"
                  :class="[
                    colorClassForIndex(option.index),
                    { 'sire-line-color-option--selected': option.index === selectedColorIndex }
                  ]"
                  :disabled="saving"
                  @click="selectColor(option.index)"
                >{{ paletteLabel(option.index) }}</button>
              </div>
            </v-card-text>
          </v-card>
        </v-dialog>

        <v-dialog v-model="labelDialogVisible" max-width="520" scrollable>
          <v-card>
            <v-card-title>色ラベル</v-card-title>
            <v-card-text>
              <div
                v-for="option in labelOptions"
                :key="option.index"
                class="sire-line-color-label-row"
              >
                <span
                  class="sire-line-color-swatch"
                  :class="colorClassForIndex(option.index)"
                >{{ badgeFor(option.index) }}</span>
                <v-text-field
                  v-model="labelDraft[String(option.index)]"
                  :label="badgeFor(option.index) + ' のラベル'"
                  maxlength="10"
                  outlined
                  dense
                  hide-details
                ></v-text-field>
              </div>
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn text :disabled="saving" @click="labelDialogVisible = false">キャンセル</v-btn>
              <v-btn color="primary" :loading="saving" @click="saveLabels">保存</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <v-dialog v-model="clearDialogVisible" max-width="420">
          <v-card>
            <v-card-title class="text-subtitle-1">すべて解除</v-card-title>
            <v-card-text>
              すべての子系統の色設定を解除します。よろしいですか？
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn text :disabled="saving" @click="clearDialogVisible = false">キャンセル</v-btn>
              <v-btn color="error" :loading="saving" @click="executeClear">解除</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="4000">
          {{ snackbar.message }}
        </v-snackbar>
      </div>
    `,
  };

  window.Dabimas.components.SireLineColorManager = SireLineColorManager;
  Vue.component("sire-line-color-manager", SireLineColorManager);
})(window, window.Vue);
