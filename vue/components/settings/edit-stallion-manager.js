/**
 * エディット種牡馬の一覧、登録・編集ダイアログ、削除確認を担当する。
 * バリデーションは Node からも検証できる純関数として公開する。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.components = window.Dabimas.components || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.editStallions = window.Dabimas.logic.editStallions || {};

  var horseSearch = window.Dabimas.logic.horses;
  var factorDefinitions = window.Dabimas.constants.factorDefinitions;
  var factorNames = factorDefinitions.FACTOR_CODE_ENTRIES
    .map(function (entry) {
      return entry[0];
    })
    .filter(Boolean);

  function normalizeFactorName(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function validateEditStallionInput(options) {
    options = options || {};
    var records = Array.isArray(options.records) ? options.records : [];
    var baseStallions = Array.isArray(options.baseStallions)
      ? options.baseStallions
      : [];
    var factorName = normalizeFactorName(options.factorName);
    var baseHorse = baseStallions.find(function (horse) {
      return (
        horse.id === options.baseHorseId &&
        horse.source !== "custom" &&
        horse.source !== "edit"
      );
    });
    var errors = [];

    if (!options.recordId && records.length >= 100) {
      errors.push("エディット種牡馬は100件まで登録できます");
    }
    if (!baseHorse) {
      errors.push("ベース種牡馬を選択してください");
    }
    if (!factorName) {
      errors.push("因名は必須です");
    } else {
      if (Array.from(factorName).length > 3) {
        errors.push("因名は3文字以内で入力してください");
      }
      if (/^[★☆]/.test(factorName)) {
        errors.push("因名を★または☆で始めることはできません");
      }
      if (factorName.charAt(0) === "(" && factorName.charAt(factorName.length - 1) === ")") {
        errors.push("因名に(…)形式は使用できません");
      }
      if (
        records.some(function (record) {
          return (
            record.id !== options.recordId &&
            record.baseHorseId === options.baseHorseId &&
            normalizeFactorName(record.factorName) === factorName
          );
        })
      ) {
        errors.push("同じベース種牡馬と因名がすでに登録されています");
      }
      if (
        baseHorse &&
        baseStallions.some(function (horse) {
          return (
            horse.name === baseHorse.name &&
            normalizeFactorName(horse.subName) === factorName
          );
        })
      ) {
        errors.push("既存馬と同じ馬名・因名は登録できません");
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors,
      factorName: factorName,
      baseHorse: baseHorse || null,
    };
  }

  // 因名（燕靭 など）は因子セットと1対1に対応しているので、
  // 「因名 → 因子3つ」の対応表を作る。候補リストのバッジ表示と、
  // 因名を選んだときの因子オートセットの両方がこの表を使う。
  // 既存馬の因名を正とし、無いものだけエディット種牡馬の登録内容で補う。
  function collectFactorSetsByName(baseStallions, records) {
    var map = {};
    function put(name, factors) {
      var key = normalizeFactorName(name);
      if (!key || map[key]) {
        return;
      }
      var list = Array.isArray(factors) ? factors : [];
      if (!list.some(Boolean)) {
        return;
      }
      map[key] = [0, 1, 2].map(function (index) {
        return String(list[index] || "");
      });
    }
    (Array.isArray(baseStallions) ? baseStallions : []).forEach(function (horse) {
      put(horse.subName, horse.factors);
    });
    (Array.isArray(records) ? records : []).forEach(function (record) {
      put(record.factorName, record.factors);
    });
    return map;
  }

  function collectFactorNameCandidates(baseStallions, records) {
    var names = [];
    (Array.isArray(baseStallions) ? baseStallions : []).forEach(function (horse) {
      var name = normalizeFactorName(horse.subName);
      if (
        name &&
        !/^[0-9]{4}$/.test(name) &&
        name !== "20XX" &&
        !(name.charAt(0) === "(" && name.charAt(name.length - 1) === ")")
      ) {
        names.push(name);
      }
    });
    (Array.isArray(records) ? records : []).forEach(function (record) {
      var name = normalizeFactorName(record.factorName);
      if (name) {
        names.push(name);
      }
    });
    return Array.from(new Set(names)).sort(function (a, b) {
      return a.localeCompare(b, "ja");
    });
  }

  window.Dabimas.logic.editStallions.validateEditStallionInput =
    validateEditStallionInput;
  window.Dabimas.logic.editStallions.collectFactorNameCandidates =
    collectFactorNameCandidates;
  window.Dabimas.logic.editStallions.collectFactorSetsByName =
    collectFactorSetsByName;

  var EditStallionManager = {
    name: "edit-stallion-manager",
    data: function () {
      return {
        dialogVisible: false,
        form: {
          id: null,
          baseHorseId: null,
          factorName: "",
          factors: ["", "", ""],
        },
        dialogErrors: [],
        saving: false,
        deleteDialogVisible: false,
        deleteTarget: null,
        deleting: false,
        snackbar: { show: false, message: "", color: "success" },
      };
    },
    computed: {
      records: function () {
        return Array.isArray(this.$root.editStallions)
          ? this.$root.editStallions
          : [];
      },
      baseStallions: function () {
        return (this.$root.stallionsBase || []).filter(function (horse) {
          return horse.source !== "custom" && horse.source !== "edit";
        });
      },
      rows: function () {
        var baseById = new Map(
          this.baseStallions.map(function (horse) {
            return [horse.id, horse];
          })
        );
        return this.records
          .slice()
          .sort(function (a, b) {
            var createdOrder = String(a.createdAt || "").localeCompare(
              String(b.createdAt || "")
            );
            return createdOrder || String(a.id || "").localeCompare(String(b.id || ""));
          })
          .map(function (record) {
            return { record: record, baseHorse: baseById.get(record.baseHorseId) || null };
          });
      },
      factorNameCandidates: function () {
        return collectFactorNameCandidates(this.baseStallions, this.records);
      },
      factorSetsByName: function () {
        return collectFactorSetsByName(this.baseStallions, this.records);
      },
      factorOptions: function () {
        return [{ text: "なし", value: "" }].concat(
          factorNames.map(function (name) {
            return { text: name, value: name };
          })
        );
      },
      editing: function () {
        return !!this.form.id;
      },
    },
    methods: {
      showMessage: function (message, color) {
        this.snackbar = { show: true, message: message, color: color || "success" };
      },
      getHorseText: function (horse) {
        return horseSearch.getHorseNameText(horse);
      },
      getHorseBadges: function (horse) {
        return horseSearch.getHorseBadges(horse);
      },
      getEditStallionBadges: function (row) {
        if (!row || !row.baseHorse) {
          return horseSearch.getHorseBadges({ source: "edit" });
        }
        return horseSearch.getHorseBadges(
          Object.assign({}, row.baseHorse, {
            source: "edit",
            subName: row.record.factorName || "",
          })
        );
      },
      filterBaseHorse: function (item, queryText) {
        return horseSearch.filterHorse(item, queryText);
      },
      getFactorBadges: function (record) {
        return horseSearch.getHorseFactorBadges({ factors: record.factors });
      },
      // 因名候補リストの右側に出す「その因名の因子セット」バッジ。
      factorBadgesForName: function (factorName) {
        var factors = this.factorSetsByName[normalizeFactorName(factorName)];
        return factors ? horseSearch.getHorseFactorBadges({ factors: factors }) : [];
      },
      // 因名を選んだら、その因名が表す因子セットを因子1〜3へ流し込む。
      // 候補にない因名を手入力したときは、入力済みの因子をそのまま残す。
      applyFactorSetForName: function (factorName) {
        var factors = this.factorSetsByName[normalizeFactorName(factorName)];
        if (factors) {
          this.form.factors = factors.slice();
        }
      },
      factorChipClass: function (factorName) {
        var entry = factorDefinitions.FACTOR_CODE_ENTRIES.find(function (item) {
          return item[0] === factorName;
        });
        return entry && entry[1] !== "00" ? "f" + entry[1] : "";
      },
      displayName: function (row) {
        if (!row || !row.baseHorse) {
          return "ベース馬不明";
        }
        return (row.baseHorse.name || "") + (row.record.factorName || "");
      },
      resetForm: function () {
        this.form = {
          id: null,
          baseHorseId: null,
          factorName: "",
          factors: ["", "", ""],
        };
        this.dialogErrors = [];
      },
      openCreateDialog: function () {
        if (this.records.length >= 100) {
          this.showMessage("エディット種牡馬は100件まで登録できます", "error");
          return;
        }
        this.resetForm();
        this.dialogVisible = true;
      },
      openEditDialog: function (row) {
        if (!row.baseHorse) {
          return;
        }
        this.form = {
          id: row.record.id,
          baseHorseId: row.record.baseHorseId,
          factorName: row.record.factorName || "",
          factors: [0, 1, 2].map(function (index) {
            return String((row.record.factors || [])[index] || "");
          }),
        };
        this.dialogErrors = [];
        this.dialogVisible = true;
      },
      save: function () {
        var validation = validateEditStallionInput({
          recordId: this.form.id,
          baseHorseId: this.form.baseHorseId,
          factorName: this.form.factorName,
          records: this.records,
          baseStallions: this.baseStallions,
        });
        this.dialogErrors = validation.errors;
        if (!validation.valid) {
          return;
        }
        var existing = this.records.find(
          function (record) {
            return record.id === this.form.id;
          }.bind(this)
        );
        var record = {
          id: this.form.id || undefined,
          baseHorseId: this.form.baseHorseId,
          factorName: validation.factorName,
          factors: this.form.factors.slice(0, 3),
          createdAt: existing && existing.createdAt,
        };
        var displayName = validation.baseHorse.name + validation.factorName;
        this.saving = true;
        this.$root
          .saveEditStallion(record)
          .then(
            function () {
              this.saving = false;
              this.dialogVisible = false;
              this.showMessage("「" + displayName + "」を保存しました");
            }.bind(this)
          )
          .catch(
            function (error) {
              console.error(error);
              this.saving = false;
              this.dialogErrors = ["保存に失敗しました。もう一度お試しください"];
            }.bind(this)
          );
      },
      confirmDelete: function (row) {
        this.deleteTarget = row;
        this.deleteDialogVisible = true;
      },
      executeDelete: function () {
        if (!this.deleteTarget) {
          return;
        }
        var id = this.deleteTarget.record.id;
        this.deleting = true;
        this.$root
          .removeEditStallion(id)
          .then(
            function () {
              this.deleting = false;
              this.deleteDialogVisible = false;
              this.deleteTarget = null;
              this.showMessage("エディット種牡馬を削除しました");
            }.bind(this)
          )
          .catch(
            function (error) {
              console.error(error);
              this.deleting = false;
              this.showMessage("削除に失敗しました。もう一度お試しください", "error");
            }.bind(this)
          );
      },
    },
    template: `
      <div class="dabimas-settings">
        <v-app-bar dense flat color="white" class="dabimas-settings-appbar">
          <v-btn icon aria-label="設定メニューへ戻る" @click="$emit('back')">
            <v-icon>mdi-arrow-left</v-icon>
          </v-btn>
          <v-toolbar-title class="dabimas-settings-title">エディット種牡馬</v-toolbar-title>
          <v-spacer></v-spacer>
          <v-btn color="primary" text @click="openCreateDialog">＋登録</v-btn>
        </v-app-bar>

        <div v-if="rows.length === 0" class="dabimas-settings-empty">
          <v-icon size="48" color="grey">mdi-horse</v-icon>
          <p>エディット種牡馬はまだ登録されていません</p>
          <v-btn color="primary" rounded @click="openCreateDialog">＋ 登録する</v-btn>
        </div>

        <v-list v-else two-line class="edit-stallion-list">
          <v-list-item v-for="row in rows" :key="row.record.id" class="edit-stallion-row">
            <v-list-item-content :class="{ 'edit-stallion-missing': !row.baseHorse }">
              <v-list-item-title class="edit-stallion-name">
                <span class="exp-horse-badges">
                  <span
                    v-for="badge in getEditStallionBadges(row)"
                    :key="badge.key"
                    :class="['exp-horse-badge', badge.className]"
                    :title="badge.title"
                  >{{ badge.text }}</span>
                </span>
                <span>{{ displayName(row) }}</span>
              </v-list-item-title>
              <v-list-item-subtitle v-if="row.baseHorse" class="edit-stallion-factors">
                <span
                  v-for="badge in getFactorBadges(row.record)"
                  :key="badge.key"
                  class="edit-stallion-factor-badge factor-color-badge"
                  :class="badge.className"
                >{{ badge.text }}</span>
                <span v-if="getFactorBadges(row.record).length === 0">因子なし</span>
              </v-list-item-subtitle>
              <v-list-item-subtitle v-else>ベース馬が見つかりません</v-list-item-subtitle>
            </v-list-item-content>
            <v-list-item-action class="edit-stallion-actions">
              <v-btn v-if="row.baseHorse" small text color="primary" @click="openEditDialog(row)">編集</v-btn>
              <v-btn small text color="error" @click="confirmDelete(row)">削除</v-btn>
            </v-list-item-action>
          </v-list-item>
        </v-list>

        <v-dialog v-model="dialogVisible" max-width="520" scrollable persistent content-class="edit-stallion-dialog">
          <v-card>
            <v-card-title class="edit-stallion-dialog-title">{{ editing ? 'エディット種牡馬を編集' : 'エディット種牡馬を登録' }}</v-card-title>
            <v-card-text>
              <v-autocomplete
                v-model="form.baseHorseId"
                :items="baseStallions"
                item-value="id"
                :item-text="getHorseText"
                :filter="filterBaseHorse"
                :disabled="editing"
                label="ベース種牡馬"
                :menu-props="{ contentClass: 'edit-stallion-menu', offsetY: true }"
                clearable
              >
                <template v-slot:item="{ item }">
                  <v-list-item-content>
                    <v-list-item-title>
                      <span
                        v-if="getHorseBadges(item).length"
                        class="exp-horse-badges"
                      >
                        <span
                          v-for="badge in getHorseBadges(item)"
                          :key="badge.key"
                          :class="['exp-horse-badge', badge.className]"
                          :title="badge.title"
                        >{{ badge.text }}</span>
                      </span>
                      <span>{{ getHorseText(item) }}</span>
                    </v-list-item-title>
                  </v-list-item-content>
                </template>
              </v-autocomplete>
              <v-combobox
                v-model="form.factorName"
                :items="factorNameCandidates"
                label="因名（3文字以内）"
                maxlength="3"
                :menu-props="{ contentClass: 'edit-stallion-menu', offsetY: true }"
                clearable
                @change="applyFactorSetForName"
              >
                <template v-slot:item="{ item, on, attrs }">
                  <v-list-item v-bind="attrs" v-on="on">
                    <v-list-item-content>
                      <v-list-item-title class="edit-stallion-name-option">
                        <span class="edit-stallion-name-option-text">{{ item }}</span>
                        <span
                          v-for="badge in factorBadgesForName(item)"
                          :key="badge.key"
                          class="edit-stallion-factor-badge factor-color-badge"
                          :class="badge.className"
                        >{{ badge.text }}</span>
                      </v-list-item-title>
                    </v-list-item-content>
                  </v-list-item>
                </template>
              </v-combobox>
              <div class="edit-stallion-factor-selects">
                <v-select
                  v-for="index in 3"
                  :key="index"
                  v-model="form.factors[index - 1]"
                  :items="factorOptions"
                  :label="'因子' + index"
                  :menu-props="{ contentClass: 'edit-stallion-menu', offsetY: true }"
                >
                  <template v-slot:selection="{ item }">
                    <span v-if="!item.value">なし</span>
                    <v-chip
                      v-else
                      small
                      class="edit-stallion-factor-chip factor-color-badge"
                      :class="factorChipClass(item.value)"
                    >{{ item.text }}</v-chip>
                  </template>
                </v-select>
              </div>
              <v-alert v-if="dialogErrors.length" dense text type="error">
                <div v-for="error in dialogErrors" :key="error">{{ error }}</div>
              </v-alert>
              <p class="caption grey--text text--darken-1 mb-0 edit-stallion-dialog-note">
                変更は候補リストへ即時反映されます。配置済みの馬や保存済み配合は、選択時の内容のままです。
              </p>
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn text :disabled="saving" @click="dialogVisible = false">キャンセル</v-btn>
              <v-btn color="primary" :loading="saving" @click="save">保存</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <v-dialog v-model="deleteDialogVisible" max-width="420">
          <v-card v-if="deleteTarget">
            <v-card-title class="text-subtitle-1">
              「{{ displayName(deleteTarget) }}」を削除しますか？
            </v-card-title>
            <v-card-text>
              血統表や保存済みの配合に配置済みのものはそのまま残ります。
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn text :disabled="deleting" @click="deleteDialogVisible = false">キャンセル</v-btn>
              <v-btn color="error" :loading="deleting" @click="executeDelete">削除</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="4000">
          {{ snackbar.message }}
        </v-snackbar>
      </div>
    `,
  };

  window.Dabimas.components.EditStallionManager = EditStallionManager;
  Vue.component("edit-stallion-manager", EditStallionManager);
})(window, window.Vue);
