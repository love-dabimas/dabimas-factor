/**
 * このファイルの役割:
 * - JSON分割ロード（summary + detail chunk）に関わるメソッド一式。
 *   summary（軽量な一覧用データ）の正規化・候補リスト構築、選択時の
 *   detail chunk 取得・水和（hydrate）、自家製馬（IndexedDB）の読み込み、
 *   選択状態の localStorage への永続化（persistSelectedToStorage）まで。
 *
 * このファイルに置かない処理:
 * - 血統計算、インブリード判定。
 * - 配合保存ダイアログ・手動クロス永続化（vue/app/methods/combination.js の仕事）。
 *
 * 分けている理由:
 * - index.html の new Vue({...}) に全部書くと変更箇所が広がるため、
 *   馬データのロード・永続化まわりだけをまとめて見えるようにする
 *   （docs/index-split-completion-plan.md Phase 4-3）。
 */
(function (window, Vue) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.app = window.Dabimas.app || {};
  window.Dabimas.app.methods = window.Dabimas.app.methods || {};

  // 選択状態の復元用 extras は、同じマスター馬が候補へ二重に入らないようにする。
  // 現行データは id を優先し、id がない旧 snapshot は表示内容で照合する。
  function mergeHorseCandidateExtras(baseCandidates, extraCandidates) {
    const merged = Array.isArray(baseCandidates) ? [...baseCandidates] : [];
    const seenIds = new Set();
    const seenLegacyKeys = new Set();

    const getId = (horse) => {
      if (!horse || typeof horse !== "object") {
        return "";
      }
      return horse.id === undefined || horse.id === null
        ? ""
        : String(horse.id);
    };
    const getLegacyKey = (horse) => {
      if (!horse || typeof horse !== "object" || !horse.name) {
        return "";
      }
      const factors = Array.isArray(horse.factors)
        ? horse.factors.map((factor) => String(factor || ""))
        : [];
      return [
        String(horse.name || ""),
        String(horse.subName || ""),
        JSON.stringify(factors),
      ].join("|");
    };
    const remember = (horse) => {
      const id = getId(horse);
      const legacyKey = getLegacyKey(horse);
      if (id) {
        seenIds.add(id);
      }
      if (legacyKey) {
        seenLegacyKeys.add(legacyKey);
      }
    };

    merged.forEach(remember);
    (Array.isArray(extraCandidates) ? extraCandidates : []).forEach((horse) => {
      const id = getId(horse);
      const legacyKey = getLegacyKey(horse);
      const isDuplicate = id
        ? seenIds.has(id)
        : legacyKey && seenLegacyKeys.has(legacyKey);
      if (isDuplicate) {
        return;
      }
      merged.push(horse);
      remember(horse);
    });

    return merged;
  }

  Object.assign(window.Dabimas.app.methods, {
        // ===== JSON 分割ロード（summary + detail chunk）=====
        // summary 1 件を候補リスト用の馬オブジェクトへ整える（descendants は持たない）。
        normalizeHorseSummary(horse) {
          return {
            id: horse.id,
            nodeId: typeof horse.nodeId === "string" ? horse.nodeId : null,
            pedigreeId:
              typeof horse.pedigreeId === "string" ? horse.pedigreeId : null,
            detailChunk:
              typeof horse.detailChunk === "number" ? horse.detailChunk : 0,
            name: horse.name || "",
            ruby: horse.ruby || "",
            subName: horse.subName || "",
            nature: horse.nature || "",
            sex: horse.sex,
            rare: typeof horse.rare === "number" ? horse.rare : null,
            abilityType:
              typeof horse.abilityType === "string" ? horse.abilityType : null,
            categoryIcon:
              typeof horse.categoryIcon === "string" ? horse.categoryIcon : null,
            parentLine: horse.parentLine || "",
            parentLineId:
              typeof horse.parentLineId === "number" ? horse.parentLineId : null,
            son: horse.son || "",
            sonId: typeof horse.sonId === "number" ? horse.sonId : null,
            factors: Array.isArray(horse.factors) ? horse.factors : ["", "", ""],
            source: "base",
          };
        },
        // 馬リスト（horsesBase / horses / stallions / broodmares 等）を作る共通処理。
        buildHorseLists(horsesList) {
          horsesList.forEach((horse) => Object.freeze(horse));
          this.horsesBase = Object.freeze(horsesList);
          const selectableHorses = this.horsesBase.filter(
            (horse) => horse.sex === "0" || horse.sex === "1"
          );
          this.stallionsBase = Object.freeze(
            selectableHorses.filter((horse) => horse.sex === "0")
          );
          this.broodmaresBase = Object.freeze(
            selectableHorses.filter((horse) => horse.sex === "1")
          );
          this.refreshCandidateLists();
        },
        createSavedHorseSummary(record) {
          return {
            id: record.id,
            customHorseId: record.id,
            source: "custom",
            name: record.name,
            ruby: "",
            subName: "",
            nature: "",
            sex: record.sex,
            parentLine: record.parentLine || "",
            son: record.son || "",
            // 保存時に本人へ付与した因子を候補・配合表へ反映する
            // （エディット種牡馬の createEditStallionSummary と同じ扱い）。
            // hydrateHorseWithDetail は {...horse, descendants} で top-level を
            // 引き継ぐため、ここで factors を持たせればセル0にも表示される。
            factors: [0, 1, 2].map(
              (index) => String((record.factors || [])[index] || "")
            ),
            factorLocked: true,
            nodeId: null,
            pedigreeId: null,
          };
        },
        createEditStallionSummary(record, baseHorse) {
          return Object.freeze({
            id: record.id,
            source: "edit",
            baseHorseId: record.baseHorseId,
            detailChunk: baseHorse.detailChunk,
            name: baseHorse.name,
            ruby: baseHorse.ruby,
            subName: record.factorName,
            nature: baseHorse.nature,
            sex: "0",
            rare: baseHorse.rare,
            abilityType: baseHorse.abilityType,
            categoryIcon: baseHorse.categoryIcon,
            parentLine: baseHorse.parentLine,
            parentLineId: baseHorse.parentLineId,
            son: baseHorse.son,
            sonId: baseHorse.sonId,
            factors: [0, 1, 2].map(
              (index) => String((record.factors || [])[index] || "")
            ),
            nodeId: null,
            pedigreeId: null,
          });
        },
        insertEditStallions(baseList, records = this.editStallions) {
          const bases = Array.isArray(baseList) ? baseList : [];
          const baseById = new Map(bases.map((horse) => [horse.id, horse]));
          const editsByBaseId = new Map();

          (Array.isArray(records) ? records : [])
            .slice()
            .sort((a, b) => {
              const createdOrder = String(a.createdAt || "").localeCompare(
                String(b.createdAt || "")
              );
              return createdOrder || String(a.id || "").localeCompare(String(b.id || ""));
            })
            .forEach((record) => {
              const baseHorse = baseById.get(record.baseHorseId);
              if (!baseHorse) {
                console.warn(
                  "edit stallion base horse not found",
                  record.id,
                  record.baseHorseId
                );
                return;
              }
              const summaries = editsByBaseId.get(record.baseHorseId) || [];
              summaries.push(this.createEditStallionSummary(record, baseHorse));
              editsByBaseId.set(record.baseHorseId, summaries);
            });

          return bases.reduce((result, baseHorse) => {
            result.push(baseHorse);
            const edits = editsByBaseId.get(baseHorse.id);
            if (edits) {
              result.push(...edits);
            }
            return result;
          }, []);
        },
        refreshCandidateLists(horseExtras = [], broodmareExtras = []) {
          const savedAll = Array.isArray(this.savedHorseSummaries)
            ? this.savedHorseSummaries
            : [];
          const savedStallions = savedAll.filter((horse) => horse.sex === "0");
          const savedBroodmares = savedAll.filter((horse) => horse.sex === "1");
          const horsesWithEdits = this.insertEditStallions(this.horsesBase);
          const stallionsWithEdits = this.insertEditStallions(this.stallionsBase);
          this.horses = mergeHorseCandidateExtras(
            [...savedAll, ...horsesWithEdits],
            horseExtras
          );
          this.stallions = mergeHorseCandidateExtras(
            [...savedStallions, ...stallionsWithEdits],
            horseExtras
          );
          this.broodmares = mergeHorseCandidateExtras(
            [...savedBroodmares, ...this.broodmaresBase],
            broodmareExtras
          );
          this.horseDataLists = [this.horses, this.stallions, this.broodmares];
        },
        refreshCandidateListsFromSelection() {
          const selectedHorses = this.selected.filter((horse) => horse);
          const selectedBroodmare = this.selected[16] ? [this.selected[16]] : [];
          this.refreshCandidateLists(selectedHorses, selectedBroodmare);
        },
        loadSavedHorseSummaries() {
          return this.ensureCustomHorseDb()
            .then((db) =>
              window.Dabimas.logic.storage.combinationStorage.loadCustomHorses(db)
            )
            .then((records) => {
              const savedRecords = (records || [])
                .filter(
                  (record) =>
                    record &&
                    (record.kind === "stallion" || record.kind === "broodmare")
                )
                .sort((a, b) =>
                  String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
                );
              savedRecords.forEach((record) => {
                this.$set(this.customHorseDetails, record.id, record);
              });
              this.savedHorseSummaries = savedRecords.map((record) =>
                this.createSavedHorseSummary(record)
              );
              return this.savedHorseSummaries;
            })
            .catch((error) => {
              console.warn("saved horse summary load failed", error);
              this.savedHorseSummaries = [];
              return [];
            });
        },
        loadEditStallions() {
          const repository = window.Dabimas.repositories.editStallions;
          return repository
            .loadAll()
            .then((records) => {
              this.editStallions = records || [];
              return this.editStallions;
            })
            .catch((error) => {
              console.warn("edit stallion load failed", error);
              this.editStallions = [];
              return [];
            });
        },
        saveEditStallion(record) {
          const repository = window.Dabimas.repositories.editStallions;
          return repository.save(record).then((saved) => {
            this.editStallions = [
              ...this.editStallions.filter((item) => item.id !== saved.id),
              saved,
            ].sort((a, b) => {
              const createdOrder = String(a.createdAt || "").localeCompare(
                String(b.createdAt || "")
              );
              return createdOrder || String(a.id || "").localeCompare(String(b.id || ""));
            });
            this.refreshCandidateListsFromSelection();
            return saved;
          });
        },
        removeEditStallion(id) {
          const repository = window.Dabimas.repositories.editStallions;
          return repository.remove(id).then(() => {
            this.editStallions = this.editStallions.filter(
              (record) => record.id !== id
            );
            this.refreshCandidateListsFromSelection();
          });
        },
        handleSavedHorseCreated(record) {
          if (!record || !record.id || !record.kind) {
            return;
          }
          this.$set(this.customHorseDetails, record.id, record);
          const summary = this.createSavedHorseSummary(record);
          this.savedHorseSummaries = [
            summary,
            ...this.savedHorseSummaries.filter((horse) => horse.id !== record.id),
          ];
          this.refreshCandidateListsFromSelection();
        },
        handleSavedHorseRemoved(customHorseId) {
          this.savedHorseSummaries = this.savedHorseSummaries.filter(
            (horse) => horse.id !== customHorseId
          );
          this.$delete(this.customHorseDetails, customHorseId);
          this.refreshCandidateListsFromSelection();
        },
        // detail chunk を取得して Map<id, detail> を返す。Promise / 結果を cache する。
        fetchHorseDetailChunk(chunkIndex) {
          const idx = Number(chunkIndex);
          if (!Number.isInteger(idx) || idx < 0) {
            return Promise.reject(
              new Error("Invalid detail chunk index: " + chunkIndex)
            );
          }
          if (this.horseDetailChunks[idx]) {
            return Promise.resolve(this.horseDetailChunks[idx]);
          }
          if (this.horseDetailChunkPromises[idx]) {
            return this.horseDetailChunkPromises[idx];
          }
          const padded = ("000" + idx).slice(-3);
          const url = `./json/dabimasFactor-details/dabimasFactor.details.${padded}.json`;
          const promise = fetch(url)
            .then((response) => {
              if (!response.ok) {
                throw new Error("detail chunk fetch failed: " + response.status);
              }
              return response.json();
            })
            .then((json) => {
              const map = new Map();
              (json.horseDetails || []).forEach((detail) => {
                map.set(detail.id, detail);
              });
              this.$set(this.horseDetailChunks, idx, map);
              return map;
            })
            .catch((error) => {
              // 失敗した promise は握り続けない（再試行可能にする）
              this.$delete(this.horseDetailChunkPromises, idx);
              throw error;
            });
          this.$set(this.horseDetailChunkPromises, idx, promise);
          return promise;
        },
        // freeze 済み summary を mutate せず、descendants を載せた新オブジェクトを返す（指摘 G）。
        hydrateHorseWithDetail(horse, descendants, mares = null) {
          return {
            ...horse,
            descendants,
            mares: Array.isArray(mares) ? mares : null,
          };
        },
        // 保存済み配合の descendants[0] にバッジ用フィールド（天性・非凡・因名祭）を補う。
        // vue/logic/horses/saved-horse-builder.js がこれらを保存するようになる前の
        // レコードは name / subName / parentLine / factors しか持っておらず、
        // 保存前は1行目に出ていたバッジが2行目へ降りた途端に消えてしまう。
        //
        // 対象を先頭の1件に限るのは、保存時に写せるのもここだけだから。
        // descendants[0] は「保存する前に1行目にいた馬」＝ユーザーが自分で選んだ馬で、
        // それより深い祖先は元々どの経路でもバッジを持たない（DB馬を直接選んだときの
        // 祖先セルと同じ）。全件を補完すると、同じ血統表でも「直接選んだとき」と
        // 「保存した配合から復元したとき」でバッジの数が変わってしまう。
        //
        // 名前＋馬名補足が summary 内で一意に決まるときだけ補完する
        // （同名馬が複数いるときに別の馬の天性を貼ってしまわないように）。
        restoreDescendantBadgeFields(descendants) {
          if (!Array.isArray(descendants) || !Array.isArray(this.horsesBase)) {
            return descendants;
          }
          const head = descendants[0];
          if (!head || head.nature !== undefined) {
            // 新しい形式（保存時に写してある）はそのまま使う。
            return descendants;
          }
          const name = head.name || "";
          const subName = head.subName || "";
          const matches = this.horsesBase.filter(
            (candidate) =>
              candidate.name === name && (candidate.subName || "") === subName
          );
          if (matches.length !== 1) {
            return descendants;
          }
          const base = matches[0];
          const restored = descendants.slice();
          restored[0] = {
            ...head,
            sex: base.sex,
            nature: base.nature || "",
            rare: base.rare,
            abilityType: base.abilityType,
            categoryIcon: base.categoryIcon,
          };
          return restored;
        },
        // 名前等から summary 側の馬を探す（旧データ・id 欠落時のフォールバック / 指摘 G）。
        findSummaryHorse(horse) {
          if (!horse || !Array.isArray(this.horsesBase)) {
            return null;
          }
          if (horse.id) {
            const byId = this.horsesBase.find((h) => h.id === horse.id);
            if (byId) {
              return byId;
            }
          }
          const name = horse.name || "";
          const subName = horse.subName || "";
          const sex = horse.sex;
          const matches = this.horsesBase.filter(
            (h) =>
              h.name === name && (h.subName || "") === subName && h.sex === sex
          );
          if (matches.length <= 1) {
            return matches[0] || null;
          }
          const factorsKey = JSON.stringify(horse.factors || []);
          const refined = matches.filter(
            (h) => JSON.stringify(h.factors || []) === factorsKey
          );
          return refined.length === 1 ? refined[0] : matches[0];
        },
        // 選択時に detail（descendants 15 件）を確定させる。state を壊さない純粋関数。
        ensureHorseDetail(horse) {
          if (!horse) {
            return Promise.resolve(horse);
          }
          // 1) 旧 snapshot 互換: 既に descendants を持つならそのまま使う（指摘 E）
          if (Array.isArray(horse.descendants) && horse.descendants.length === 15) {
            return Promise.resolve(horse);
          }
          // 1.5) エディット種牡馬: ベース馬の static detail を参照する。
          if (horse.source === "edit" && horse.baseHorseId) {
            const findBaseHorse = () => {
              const matched = this.findSummaryHorse({
                id: horse.baseHorseId,
                name: horse.name,
                subName: horse.subName,
                sex: "0",
              });
              if (matched) {
                return matched;
              }
              return (this.horsesBase || []).find(
                (candidate) => candidate.name === horse.name && candidate.sex === "0"
              );
            };
            let chunkIndex = horse.detailChunk;
            let lookupId = horse.baseHorseId;
            if (chunkIndex === undefined || chunkIndex === null || !lookupId) {
              const matched = findBaseHorse();
              if (!matched) {
                return Promise.reject(new Error("Edit stallion detail metadata missing"));
              }
              chunkIndex = matched.detailChunk;
              lookupId = matched.id;
            }
            const retryFromSummary = (originalError) => {
              const matched = findBaseHorse();
              if (
                matched &&
                (matched.id !== lookupId || matched.detailChunk !== chunkIndex)
              ) {
                return this.fetchHorseDetailChunk(matched.detailChunk).then(
                  (retryMap) => {
                    const retryDetail = retryMap.get(matched.id);
                    if (retryDetail && Array.isArray(retryDetail.descendants)) {
                      return this.hydrateHorseWithDetail(
                        horse,
                        retryDetail.descendants,
                        retryDetail.mares
                      );
                    }
                    return Promise.reject(
                      new Error("Edit stallion detail not found: " + horse.baseHorseId)
                    );
                  }
                );
              }
              return Promise.reject(
                originalError ||
                  new Error("Edit stallion detail not found: " + horse.baseHorseId)
              );
            };
            return this.fetchHorseDetailChunk(chunkIndex).then(
              (detailMap) => {
                const detail = detailMap.get(lookupId);
                if (detail && Array.isArray(detail.descendants)) {
                  return this.hydrateHorseWithDetail(
                    horse,
                    detail.descendants,
                    detail.mares
                  );
                }
                return retryFromSummary();
              },
              (error) => retryFromSummary(error)
            );
          }
          // 2) 自家製馬: IndexedDB の customHorses から detail を解決（指摘 H）
          if (horse.source === "custom" || horse.customHorseId) {
            const customId = horse.customHorseId || horse.id;
            return this.getCustomHorseDetail(customId).then((detail) => {
              if (
                detail &&
                Array.isArray(detail.descendants) &&
                detail.descendants.length === 15
              ) {
                return this.hydrateHorseWithDetail(
                  horse,
                  this.restoreDescendantBadgeFields(detail.descendants),
                  null
                );
              }
              return Promise.reject(
                new Error("Custom horse detail not found: " + customId)
              );
            });
          }
          // 3) 通常馬: summary 由来の detailChunk + id で chunk から（指摘 B）。
          let chunkIndex = horse.detailChunk;
          let lookupId = horse.id;
          if (chunkIndex === undefined || chunkIndex === null || !lookupId) {
            const matched = this.findSummaryHorse(horse);
            if (
              !matched ||
              matched.detailChunk === undefined ||
              matched.detailChunk === null
            ) {
              return Promise.reject(new Error("Horse detail metadata missing"));
            }
            chunkIndex = matched.detailChunk;
            lookupId = matched.id;
          }
          return this.fetchHorseDetailChunk(chunkIndex).then((detailMap) => {
            const detail = detailMap.get(lookupId);
            if (detail && Array.isArray(detail.descendants)) {
              return this.hydrateHorseWithDetail(
                horse,
                detail.descendants,
                detail.mares
              );
            }
            // id が chunk に無い → 名前等で 1 回だけ再解決を試す（指摘 G）
            const matched = this.findSummaryHorse(horse);
            if (
              matched &&
              matched.id !== lookupId &&
              matched.detailChunk !== undefined &&
              matched.detailChunk !== null
            ) {
              return this.fetchHorseDetailChunk(matched.detailChunk).then(
                (retryMap) => {
                  const retryDetail = retryMap.get(matched.id);
                  if (retryDetail && Array.isArray(retryDetail.descendants)) {
                    return this.hydrateHorseWithDetail(
                      horse,
                      retryDetail.descendants,
                      retryDetail.mares
                    );
                  }
                  return Promise.reject(
                    new Error(
                      "Horse detail not found: " + (horse.id || horse.name)
                    )
                  );
                }
              );
            }
            return Promise.reject(
              new Error("Horse detail not found: " + (horse.id || horse.name))
            );
          });
        },
        // idle 中に detail chunk を順次先読みする（全 chunk を一気に読まない / 案 B）。
        prefetchHorseDetails() {
          if (this.horseDetailPreloadStarted || !this.horseSummaryLoaded) {
            return;
          }
          const total = this.horseDetailTotalChunks;
          if (!total) {
            return;
          }
          this.horseDetailPreloadStarted = true;
          let next = 0;
          const pump = () => {
            while (next < total && this.horseDetailChunks[next]) {
              next++;
            }
            if (next >= total) {
              return;
            }
            const chunkIndex = next;
            next++;
            this.fetchHorseDetailChunk(chunkIndex)
              .catch(() => {})
              .then(() => {
                schedule();
              });
          };
          const schedule = () => {
            if (next >= total) {
              return;
            }
            if (typeof window.requestIdleCallback === "function") {
              window.requestIdleCallback(() => pump(), { timeout: 2000 });
            } else {
              setTimeout(pump, 300);
            }
          };
          if (typeof window.requestIdleCallback === "function") {
            window.requestIdleCallback(() => pump(), { timeout: 2000 });
          } else {
            setTimeout(pump, 1000);
          }
        },
        // ===== 自家製馬 detail（IndexedDB customHorses）=====
        // DB open処理は vue/logic/storage/combination-storage.js に集約済み。
        // 接続はこのプロパティで使い回す。
        ensureCustomHorseDb() {
          if (this.customHorseDb) {
            return Promise.resolve(this.customHorseDb);
          }
          return window.Dabimas.logic.storage.combinationStorage
            .openDB()
            .then((db) => {
              this.customHorseDb = db;
              return db;
            });
        },
        // customHorses store から 1 件取得（再選択時の detail 解決）。
        getCustomHorseDetail(customHorseId) {
          if (!customHorseId) {
            return Promise.resolve(null);
          }
          if (this.customHorseDetails[customHorseId]) {
            return Promise.resolve(this.customHorseDetails[customHorseId]);
          }
          return this.ensureCustomHorseDb().then(
            (db) =>
              new Promise((resolve, reject) => {
                const tx = db.transaction(["customHorses"], "readonly");
                const store = tx.objectStore("customHorses");
                const request = store.get(customHorseId);
                request.onsuccess = () => {
                  if (request.result) {
                    this.$set(
                      this.customHorseDetails,
                      customHorseId,
                      request.result
                    );
                  }
                  resolve(request.result || null);
                };
                request.onerror = () => reject(request.error);
              })
          );
        },
        // customHorses store を全件読み込んで customHorseDetails に載せる（候補再利用用）。
        loadCustomHorseDetails() {
          return this.ensureCustomHorseDb()
            .then(
              (db) =>
                new Promise((resolve, reject) => {
                  const tx = db.transaction(["customHorses"], "readonly");
                  const store = tx.objectStore("customHorses");
                  const request = store.getAll();
                  request.onsuccess = () => {
                    (request.result || []).forEach((record) => {
                      this.$set(this.customHorseDetails, record.id, record);
                    });
                    resolve(request.result || []);
                  };
                  request.onerror = () => reject(request.error);
                })
            )
            .catch(() => []);
        },
        // ===== localStorage 軽量化 =====
        // descendants / searchText / displayName を落とした保存用 snapshot を作る。
        stripHorseForStorage(horse) {
          if (!horse) {
            return horse;
          }
          const { descendants, searchText, displayName, mares, ...rest } = horse;
          return rest;
        },
        serializeSelectedForStorage(selected) {
          if (!Array.isArray(selected)) {
            return selected;
          }
          return selected.map((horse) =>
            horse ? this.stripHorseForStorage(horse) : null
          );
        },
        // dabimasFactor / Category をまとめて軽量保存する。
        persistSelectedToStorage() {
          if (typeof window === "undefined" || !window.localStorage) {
            return;
          }
          window.localStorage.setItem(
            "dabimasFactor",
            JSON.stringify(this.serializeSelectedForStorage(this.selected))
          );
          window.localStorage.setItem(
            "dabimasFactorCategory",
            JSON.stringify(this.category)
          );
          window.Dabimas.workspaceSync?.notifyLocalChange();
        },
        // detail 取得失敗時の再試行可能メッセージ（既存セルは保持済み・指摘 F）。
        notifyHorseDetailError(message) {
          this.horseDetailError = {
            show: true,
            message:
              message ||
              "血統データの取得に失敗しました。通信状況を確認して、もう一度選択してください。",
          };
        },
        // readyPromise: インブリード例外ルール読み込み（loadInbreedExceptions）の Promise。
        // summary fetch と並行に読み込みを開始しつつ、復元処理（c4 内の dispInbreed が
        // 例外ルールを使う）だけはこの Promise の解決を待ってから行う。
        dbinitializer(readyPromise) {
          const nodeTablePromise = fetch("./json/pedigreeNodes.json")
            .then((response) => {
              if (!response.ok) {
                throw new Error(
                  "pedigree nodes fetch failed: " + response.status
                );
              }
              return response.json();
            })
            .then((json) => {
              window.Dabimas.pedigreeNodes =
                window.Dabimas.logic.pedigree.buildNodeTable(json);
            })
            .catch((error) => {
              console.warn("pedigree nodes load failed", error);
              window.Dabimas.pedigreeNodes = null;
            });
          const waitReady = () =>
            Promise.all([Promise.resolve(readyPromise), nodeTablePromise]);
          const savedHorsePromise = this.loadSavedHorseSummaries();
          const editStallionPromise = this.loadEditStallions();
          // グローバル設定は復元チェーンを待たせず、マスターと並行で読み込む。
          this.loadSireLineColorSettings();
          const composeSavedHorsesAfterRestore = () =>
            Promise.all([savedHorsePromise, editStallionPromise]).then(() => {
              this.refreshCandidateListsFromSelection();
            });

          // 旧 full JSON を読み込む退避経路（summary 取得失敗時のフォールバック）。
          const loadFullJsonFallback = () =>
            fetch("./json/dabimasFactor.json")
              .then((response) => {
                if (!response.ok) {
                  throw new Error("full json fetch failed: " + response.status);
                }
                return response.json();
              })
              .then((json) => {
                this.horseSummaryLoaded = false;
                this.buildHorseLists(json.horseLists);
                return waitReady()
                  .then(() => this.c4())
                  .then(composeSavedHorsesAfterRestore);
              });

          // 通常経路: 軽量 summary を読み込む。descendants はここでは持たない。
          // dbinitializer 呼び出し元（bootstrap.js の c1）へ、復元処理まで終わった
          // ことを伝えるため Promise を返す（起動ローダーを隠すタイミングに使う）。
          const restorePromise = fetch("./json/dabimasFactor.summary.json")
            .then((response) => {
              if (!response.ok) {
                throw new Error("summary fetch failed: " + response.status);
              }
              return response.json();
            })
            .then((json) => {
              this.horseSummaryChunkSize = json.chunkSize || 128;
              const horsesList = (json.horseLists || []).map((horse) =>
                this.normalizeHorseSummary(horse)
              );
              this.horseDetailTotalChunks = horsesList.reduce(
                (max, horse) =>
                  Math.max(max, (Number(horse.detailChunk) || 0) + 1),
                0
              );
              this.horseSummaryLoaded = true;
              this.buildHorseLists(horsesList);
              // 保存されていた場合はリストア処理を行う
              const restoreDone = waitReady()
                .then(() => this.c4())
                .then(composeSavedHorsesAfterRestore);
              // 初期表示を邪魔しない idle のタイミングで detail を先読みする
              this.prefetchHorseDetails();
              return restoreDone;
            })
            .catch((error) => {
              // summary が無い・壊れている場合は従来の full JSON へ退避する（指摘 G）
              console.warn(
                "summary load failed, falling back to full json",
                error
              );
              return loadFullJsonFallback();
            })
            .catch((error) => {
              console.error("dbinitializer failed", error);
            });

            // 全兄弟データを読み込む（血統表の初期表示を待たせない・並行実行のまま）
            fetch("./json/brosData.json")
            .then((response) => {
              return response.json();
            })
            .then((json) => {
              // jsonから取得 - フリーズして変更不可にする
              const brosDataList = json.brosData;
              brosDataList.forEach(bros => Object.freeze(bros));
              this.brosData = Object.freeze(brosDataList);
            });

          return restorePromise;
        },
  });
})(window, window.Vue);
