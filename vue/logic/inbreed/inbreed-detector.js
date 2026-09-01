/**
 * このファイルの役割:
 * - judgeInbreed（クロス＝インブリード判定）を純関数として提供する。
 * - 入力: 選択済み32頭（selected）、例外ルール（inbreedExceptions）、
 *   任意の血統ノードテーブル（nodeTable）。
 * - 出力: クロス件数と、画面表示に必要な判定結果一式
 *   （sameNameGroups / siblingGroups / sameNameSpecialChecks /
 *   sameNameSpecialChecksByIndex / inbreedColorIndexes）に加え、nodeId ベースの
 *   crosses と整数血量による dangerous をまとめたオブジェクト。
 *
 * このファイルに置かない処理:
 * - Vue state（this.sameNameGroups 等）への代入、dispColor への $set。
 *   それは呼び出し側（root app の judgeInbreed ラッパ）が担当する。
 *
 * 分けている理由:
 * - judgeInbreed は「選択済み32頭 + 例外ルール + 任意のノードテーブル」から
 *   「判定結果」を返す変換処理で、Vue のインスタンスに依存しない。
 *   root app から切り離すことで単体で入出力を確認できる
 *   （docs/index-split-completion-plan.md Phase 1）。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.inbreed = window.Dabimas.logic.inbreed || {};

  window.Dabimas.logic.inbreed.judgeInbreed = function (
    selected,
    inbreedExceptions,
    nodeTable
  ) {
          // nodeTable が無いときは nodeId 判定へ進まない。
          // nodeId は summary/details 由来なので pedigreeNodes.json の取得に
          // 失敗しても各セルには残っており、ここで nodeId を見てしまうと
          // 「variant 違いなので同一馬ではない」とだけ判定され、全兄妹判定
          // （nodeTable が要る）も効かないため、現行より検出が減る。
          // 縮退時は現行どおり名前一致で拾う（設計 §6.7）。
          const isExactSameNode = (a, b) => {
            if (
              nodeTable &&
              typeof a?.nodeId === "string" &&
              typeof b?.nodeId === "string"
            ) {
              return a.nodeId === b.nodeId;
            }
            return a?.name === b?.name;
          };
          const parentsOf = (horse) => {
            if (!nodeTable || typeof horse?.nodeId !== "string") {
              return null;
            }
            return nodeTable.parentsOf(horse.nodeId);
          };
          const isFullSiblingByMasterNodeIds = (nodeIdA, nodeIdB) => {
            if (
              !nodeTable ||
              typeof nodeIdA !== "string" ||
              typeof nodeIdB !== "string" ||
              nodeIdA === nodeIdB
            ) {
              return false;
            }
            const parentsA = nodeTable.parentsOf(nodeIdA);
            const parentsB = nodeTable.parentsOf(nodeIdB);
            if (
              !parentsA?.father ||
              !parentsA?.mother ||
              !parentsB?.father ||
              !parentsB?.mother
            ) {
              return false;
            }
            return (
              parentsA.father === parentsB.father &&
              parentsA.mother === parentsB.mother
            );
          };
          const isFullSiblingByMaster = (a, b) =>
            isFullSiblingByMasterNodeIds(a?.nodeId, b?.nodeId);
          const isFullSiblingByOverride = (a, b) =>
            (Array.isArray(a?.fullBrothers) &&
              a.fullBrothers.includes(b?.name)) ||
            (Array.isArray(b?.fullBrothers) &&
              b.fullBrothers.includes(a?.name));
          const isCrossRelated = (a, b) =>
            isExactSameNode(a, b) ||
            isFullSiblingByOverride(a, b) ||
            isFullSiblingByMaster(a, b);
          const isInbreedExcludedHorse = (horse) => {
            const horseName = horse?.name;
            if (typeof horseName !== "string") {
              return false;
            }
            return /^[★☆]/.test(horseName.trimStart());
          };
          const isBroodmarePlaceholderHorse = (horse) => {
            const subName = horse?.subName;
            if (typeof subName !== "string") {
              return false;
            }
            return subName.startsWith("(") && subName.endsWith(")");
          };
          // 世代対応表（indexから世代を取得）
          const generationMap = [
            1, 2, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5,
            1, 2, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5,
          ];
          const MARE_GENERATIONS = [
            2, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5,
          ];
          const SIRE_PATHS = [
            "F", "FF", "FFF", "FFFF", "FFMF", "FMF", "FMFF", "FMMF",
            "MF", "MFF", "MFFF", "MFMF", "MMF", "MMFF", "MMMF",
          ];
          const MARE_PATHS = [
            "M", "FM", "MM", "FFM", "FMM", "MFM", "MMM", "FFFM",
            "FFMM", "FMFM", "FMMM", "MFFM", "MFMM", "MMFM", "MMMM",
          ];
          const DESCENDANT_SLOTS =
            window.Dabimas.logic.pedigree.DESCENDANT_SLOTS;
          const BLOOD_VOLUME = {
            1: 50000,
            2: 25000,
            3: 12500,
            4: 6250,
            5: 3125,
          };
          const buildMareOccurrences = (rootCell, side) => {
            if (!nodeTable) {
              return [];
            }
            const ids = Array.isArray(rootCell?.mareNodeIds)
              ? rootCell.mareNodeIds
              : [];
            const occurrences = [];
            ids.forEach((nodeId, slot) => {
              if (typeof nodeId !== "string") {
                return;
              }
              occurrences.push({
                nodeId,
                side,
                generation: MARE_GENERATIONS[slot],
                index: null,
                mareSlot: slot,
                path: MARE_PATHS[slot],
              });
            });
            return occurrences;
          };

          // 選択済み32枠を牡馬（0-15）・牝馬（16-31）に分割
          const stallionsArray = [];
          const broodmaresArray = [];
          
          for (let loopIndex = 0; loopIndex < selected.length; loopIndex++) {
            const value = selected[loopIndex];
            if (!value || !value.name) {
              continue;
            }
            if (isInbreedExcludedHorse(value)) {
              continue;
            }
            if (loopIndex < 16) {
              stallionsArray.push(value);
            } else {
              broodmaresArray.push(value);
            }
          }

          // 片側しか埋まっていない場合は何も判定せず終了
          if (stallionsArray.length === 0 || broodmaresArray.length === 0) {
            return {
              count: 0,
              sameNameGroups: [],
              siblingGroups: [],
              sameNameSpecialChecks: [],
              sameNameSpecialChecksByIndex: Array.from(new Array(32).fill(false)),
              inbreedColorIndexes: [],
              crosses: [],
              dangerous: false,
            };
          }

          // 子孫ノード取得関数（特定indexから子孫をすべて取得）
          const getAncestorIndexes = (startIndex) => {
            const ancestors = new Set();
            
            // 親子関係マッピング（dummy母も含む完全なツリー構造）
            // 実際のindex: 0-15 (父側), 16-31 (母側)
            // 仮想母index: 100番台 (父側の母), 200番台 (母側の母)
            const parentChildMap = {
              // 父側（0-15）
              0: [1, 100],        // 本馬 → 父[1], 母[100]
              100: [3, 107],      // [0]の母 → 父[3], 母[107]
              107: [7, 115],      // [0]の母の母 → 父[7], 母[115]
              115: [15],          // [0]の母の母の母 → 父[15]のみ
              
              1: [2, 101],        // [1] → 父[2], 母[101]
              101: [5, 111],      // [1]の母 → 父[5], 母[111]
              111: [11],          // [1]の母の母 → 父[11]のみ
              
              2: [4, 102],        // [2] → 父[4], 母[102]
              102: [9],           // [2]の母 → 父[9]のみ
              
              3: [6, 103],        // [3] → 父[6], 母[103]
              103: [13],          // [3]の母 → 父[13]のみ
              
              4: [8],             // [4] → 父[8]のみ
              5: [10],            // [5] → 父[10]のみ
              6: [12],            // [6] → 父[12]のみ
              7: [14],            // [7] → 父[14]のみ
              
              // 母側（16-31）
              16: [17, 200],      // 本馬 → 父[17], 母[200]
              200: [19, 207],     // [16]の母 → 父[19], 母[207]
              207: [23, 215],     // [16]の母の母 → 父[23], 母[215]
              215: [31],          // [16]の母の母の母 → 父[31]のみ
              
              17: [18, 201],      // [17] → 父[18], 母[201]
              201: [21, 211],     // [17]の母 → 父[21], 母[211]
              211: [27],          // [17]の母の母 → 父[27]のみ
              
              18: [20, 202],      // [18] → 父[20], 母[202]
              202: [25],          // [18]の母 → 父[25]のみ
              
              19: [22, 203],      // [19] → 父[22], 母[203]
              203: [29],          // [19]の母 → 父[29]のみ
              
              20: [24],           // [20] → 父[24]のみ
              21: [26],           // [21] → 父[26]のみ
              22: [28],           // [22] → 父[28]のみ
              23: [30],           // [23] → 父[30]のみ
            };
            
            // 再帰的に祖先を収集（parentChildMapは「自分→親」の関係）
            const collectAncestors = (idx) => {
              const parents = parentChildMap[idx];
              if (parents) {
                parents.forEach(parentIdx => {
                  if (!ancestors.has(parentIdx)) {
                    ancestors.add(parentIdx);
                    collectAncestors(parentIdx);
                  }
                });
              }
            };
            
            collectAncestors(startIndex);
            return ancestors;
          };

          // クロス候補を検出（名前一致 + fullBrothers一致 + 繫殖牝馬×種牡馬全兄妹）
          const crossCandidates = [];
          const siblingPairs = new Set(); // 全兄弟で判定済みのペアを記録
          
          // ========================================
          // 1. 繫殖牝馬×種牡馬の全兄妹クロス検出（最優先）
          // ========================================
          const broodmareGroups = {}; // subName → [indexes]のマップ
          
          // 父側で繫殖牝馬の血統表を検出
          for (let sIdx = 0; sIdx < stallionsArray.length; sIdx++) {
            const stallion = stallionsArray[sIdx];
            if (!stallion || !stallion.subName) continue;
            
            // subNameが`(`で始まる → 繫殖牝馬の血統表
            if (stallion.subName.startsWith('(') && stallion.subName.endsWith(')')) {
              const broodmareName = stallion.subName.slice(1, -1); // "(ダンスパートナー)" → "ダンスパートナー"
              
              if (!broodmareGroups[broodmareName]) {
                broodmareGroups[broodmareName] = [];
              }
              broodmareGroups[broodmareName].push(stallion.index);
            }
          }
          
          // 各繫殖牝馬について、母側で全兄妹を探す
          for (const [broodmareName, broodmareIndexes] of Object.entries(broodmareGroups)) {
            for (let bIdx = 0; bIdx < broodmaresArray.length; bIdx++) {
              const broodmare = broodmaresArray[bIdx];
              if (!broodmare || !broodmare.name) continue;
              
              let isSibling = false;
              
              // broodmareのfullBrothersにbroodmareNameがある
              if (Array.isArray(broodmare.fullBrothers) && broodmare.fullBrothers.includes(broodmareName)) {
                isSibling = true;
              }
              
              // broodmareのfullSistersにbroodmareNameがある
              if (Array.isArray(broodmare.fullSisters) && broodmare.fullSisters.includes(broodmareName)) {
                isSibling = true;
              }
              
              if (isSibling) {
                // 種牡馬側のみをsiblingGroupsに追加
                const broodmareGlobalIdx = broodmare.index;
                const broodmareGen = generationMap[broodmareGlobalIdx];
                
                crossCandidates.push({
                  name: `${broodmareName}×${broodmare.name}(全兄妹)`,
                  type: 'broodmare-stallion-sibling',
                  stallionIndex: null, // 繫殖牝馬側は追加しない
                  broodmareIndex: broodmareGlobalIdx,
                  stallionGen: 0,
                  broodmareGen: broodmareGen,
                  generationSum: broodmareGen, // 母側のみでソート
                  stallionNode: null,
                  broodmareNode: broodmare,
                  broodmareGroupIndexes: broodmareIndexes, // 繫殖牝馬側の全indexを保持
                });
              }
            }
          }
          
          // ========================================
          // 2. fullBrothers一致でクロス検出（先に処理）
          // ========================================
          for (let sIdx = 0; sIdx < stallionsArray.length; sIdx++) {
            const stallion = stallionsArray[sIdx];
            if (!stallion || !stallion.name) continue;
            
            for (let bIdx = 0; bIdx < broodmaresArray.length; bIdx++) {
              const broodmare = broodmaresArray[bIdx];
              if (!broodmare || !broodmare.name) continue;
              if (
                isBroodmarePlaceholderHorse(stallion) ||
                isBroodmarePlaceholderHorse(broodmare)
              ) {
                continue;
              }
              
              const isSibling =
                isFullSiblingByOverride(stallion, broodmare) ||
                isFullSiblingByMaster(stallion, broodmare);
              
              if (isSibling) {
                const stallionGlobalIdx = stallion.index;
                const broodmareGlobalIdx = broodmare.index;
                const stallionGen = generationMap[stallionGlobalIdx];
                const broodmareGen = generationMap[broodmareGlobalIdx];
                
                // 重複チェック（既に追加されていないか）
                const exists = crossCandidates.some(c => 
                  c.stallionIndex === stallionGlobalIdx && 
                  c.broodmareIndex === broodmareGlobalIdx
                );
                
                if (!exists) {
                  crossCandidates.push({
                    name: `${stallion.name}×${broodmare.name}(兄弟)`,
                    type: 'sibling',
                    stallionIndex: stallionGlobalIdx,
                    broodmareIndex: broodmareGlobalIdx,
                    stallionGen: stallionGen,
                    broodmareGen: broodmareGen,
                    generationSum: stallionGen + broodmareGen,
                    stallionNode: stallion,
                    broodmareNode: broodmare,
                  });
                  
                  // このペアを記録
                  siblingPairs.add(`${stallionGlobalIdx}-${broodmareGlobalIdx}`);
                }
              }
            }
          }
          
          // 名前一致でクロス検出
          for (let sIdx = 0; sIdx < stallionsArray.length; sIdx++) {
            const stallion = stallionsArray[sIdx];
            if (!stallion || !stallion.name) continue;
            
            for (let bIdx = 0; bIdx < broodmaresArray.length; bIdx++) {
              const broodmare = broodmaresArray[bIdx];
              if (!broodmare || !broodmare.name) continue;
              
              if (isExactSameNode(stallion, broodmare)) {
                const stallionGlobalIdx = stallion.index;
                const broodmareGlobalIdx = broodmare.index;
                
                // 全兄弟で既に判定済みのペアはスキップ
                if (siblingPairs.has(`${stallionGlobalIdx}-${broodmareGlobalIdx}`)) {
                  continue;
                }
                
                const stallionGen = generationMap[stallionGlobalIdx];
                const broodmareGen = generationMap[broodmareGlobalIdx];
                
                crossCandidates.push({
                  name: stallion.name,
                  type: 'sameName',
                  stallionIndex: stallionGlobalIdx,
                  broodmareIndex: broodmareGlobalIdx,
                  stallionGen: stallionGen,
                  broodmareGen: broodmareGen,
                  generationSum: stallionGen + broodmareGen,
                  stallionNode: stallion,
                  broodmareNode: broodmare,
                });
              }
            }
          }

          // 世代合計でソート（繫殖牝馬×種牡馬全兄妹クロスを最優先、その後世代合計順）
          crossCandidates.sort((a, b) => {
            // 繫殖牝馬×種牡馬の全兄妹クロスを最優先
            if (a.type === 'broodmare-stallion-sibling' && b.type !== 'broodmare-stallion-sibling') {
              return -1;
            }
            if (a.type !== 'broodmare-stallion-sibling' && b.type === 'broodmare-stallion-sibling') {
              return 1;
            }
            // それ以外は世代合計順
            return a.generationSum - b.generationSum;
          });

          // 祖先除外ロジックを適用
          const excludedExceptionTargets = new Set();
          const excludedAncestorPairs = new Set();
          const exceptionExcludedPairs = new Set(); // 例外パターンで除外されたペア（"idx1-idx2"形式）
          const broodmareGroupIndexes = new Set(); // 繫殖牝馬側のindexを記録（filterで使用）
          const recognizedCrosses = [];
          
          // ===== 例外パターンのクロス判定（通常のクロス判定の前に実行） =====
          // ヘルパー関数：indexから世代を計算
          const getGenerationFromIndex = (index) => {
            if (index === 0 || index === 16) return 1;
            if (index === 1 || index === 17) return 2;
            if ((index >= 2 && index <= 3) || (index >= 18 && index <= 19)) return 3;
            if ((index >= 4 && index <= 7) || (index >= 20 && index <= 23)) return 4;
            if ((index >= 8 && index <= 15) || (index >= 24 && index <= 31)) return 5;
            return 0;
          };
          
          // ヘルパー関数：indexから父側/母側を判定
          const getSideFromIndex = (index) => {
            return index < 16 ? 'stallion' : 'broodmare';
          };
          
          // ヘルパー関数：世代条件をチェック
          const checkGenerationCondition = (gen, targetGen, operator) => {
            switch (operator) {
              case '<': return gen < targetGen;
              case '<=': return gen <= targetGen;
              case '>': return gen > targetGen;
              case '>=': return gen >= targetGen;
              case '==': return gen === targetGen;
              default: return false;
            }
          };

          const getPairKey = (stallionIndex, broodmareIndex) =>
            `${stallionIndex}-${broodmareIndex}`;

          const exceptionParentChildMap = {
            0: [1, 100],
            100: [3, 107],
            107: [7, 115],
            115: [15],
            1: [2, 101],
            101: [5, 111],
            111: [11],
            2: [4, 102],
            102: [9],
            3: [6, 103],
            103: [13],
            4: [8],
            5: [10],
            6: [12],
            7: [14],
            16: [17, 200],
            200: [19, 207],
            207: [23, 215],
            215: [31],
            17: [18, 201],
            201: [21, 211],
            211: [27],
            18: [20, 202],
            202: [25],
            19: [22, 203],
            203: [29],
            20: [24],
            21: [26],
            22: [28],
            23: [30],
          };

          const normalizeExceptionBranchPath = (path) => {
            if (Array.isArray(path)) {
              return path;
            }
            if (typeof path === "string") {
              return path.split(".").filter((step) => step);
            }
            return [];
          };

          const resolveExceptionBranchRoot = (startIndex, path) => {
            let currentIndex = startIndex;
            for (const step of normalizeExceptionBranchPath(path)) {
              const parents = exceptionParentChildMap[currentIndex];
              if (!parents) {
                return null;
              }
              if (step === "father" || step === "sire") {
                currentIndex = parents[0];
              } else if (step === "mother" || step === "dam") {
                currentIndex = parents[1];
              } else {
                return null;
              }
              if (!Number.isInteger(currentIndex)) {
                return null;
              }
            }
            return currentIndex;
          };

          const getExceptionBranchAncestors = (startIndex, path) => {
            const branchRoot = resolveExceptionBranchRoot(startIndex, path);
            if (!Number.isInteger(branchRoot)) {
              return new Set();
            }
            return getAncestorIndexes(branchRoot);
          };

          const addExceptionExcludedPairs = (triggerIdx, targetIdx, exception) => {
            const branchRules = exception.action.excludeAncestorBranches;
            if (Array.isArray(branchRules) && branchRules.length > 0) {
              branchRules.forEach((rule) => {
                const triggerAncestors = getExceptionBranchAncestors(
                  triggerIdx,
                  rule.trigger
                );
                const targetAncestors = getExceptionBranchAncestors(
                  targetIdx,
                  rule.target
                );

                targetAncestors.forEach((ancestorIdx) => {
                  excludedExceptionTargets.add(ancestorIdx);
                });
                triggerAncestors.forEach((triggerAncestor) => {
                  targetAncestors.forEach((ancestorIdx) => {
                    exceptionExcludedPairs.add(getPairKey(triggerAncestor, ancestorIdx));
                    exceptionExcludedPairs.add(getPairKey(ancestorIdx, triggerAncestor));
                  });
                });
              });
              return;
            }

            const triggerAncestors = getAncestorIndexes(triggerIdx);
            triggerAncestors.add(triggerIdx);
            const ancestors = getAncestorIndexes(targetIdx);
            ancestors.forEach((ancestorIdx) => {
              excludedExceptionTargets.add(ancestorIdx);
              triggerAncestors.forEach((triggerAncestor) => {
                exceptionExcludedPairs.add(getPairKey(triggerAncestor, ancestorIdx));
                exceptionExcludedPairs.add(getPairKey(ancestorIdx, triggerAncestor));
              });
            });
          };

          const addExcludedAncestorPairs = (stallionIndexes, broodmareIndexes) => {
            const stallionAncestors = new Set();
            const broodmareAncestors = new Set();

            stallionIndexes
              .filter((idx) => Number.isInteger(idx))
              .forEach((idx) => {
                getAncestorIndexes(idx).forEach((ancestorIdx) => {
                  stallionAncestors.add(ancestorIdx);
                });
              });

            broodmareIndexes
              .filter((idx) => Number.isInteger(idx))
              .forEach((idx) => {
                getAncestorIndexes(idx).forEach((ancestorIdx) => {
                  broodmareAncestors.add(ancestorIdx);
                });
              });

            stallionAncestors.forEach((stallionAncestorIdx) => {
              broodmareAncestors.forEach((broodmareAncestorIdx) => {
                excludedAncestorPairs.add(
                  getPairKey(stallionAncestorIdx, broodmareAncestorIdx)
                );
              });
            });
          };
          
          // 例外パターンのチェック
          inbreedExceptions.forEach(exception => {
            // trigger条件のチェック：トリガー馬のindexを検索
            const triggerHorseIndexes = [];
            stallionsArray.forEach(horse => {
              if (horse && horse.name === exception.trigger.horse) {
                triggerHorseIndexes.push(horse.index);
              }
            });
            broodmaresArray.forEach(horse => {
              if (horse && horse.name === exception.trigger.horse) {
                triggerHorseIndexes.push(horse.index);
              }
            });
            
            // トリガー条件に一致するindexをフィルタ
            const matchingTriggers = triggerHorseIndexes.filter(idx => {
              const gen = getGenerationFromIndex(idx);
              const side = getSideFromIndex(idx);
              
              // 世代条件のチェック
              if (!checkGenerationCondition(gen, exception.trigger.generation, exception.trigger.operator)) {
                return false;
              }
              
              // side条件のチェック
              if (exception.trigger.side === 'stallion' && side !== 'stallion') return false;
              if (exception.trigger.side === 'broodmare' && side !== 'broodmare') return false;
              // 'either'の場合はどちらでもOK
              
              return true;
            });
            
            if (matchingTriggers.length === 0) return;
            
            // target馬のチェック
            matchingTriggers.forEach(triggerIdx => {
              const triggerSide = getSideFromIndex(triggerIdx);
              
              // target側を決定
              let targetSide;
              if (exception.target.side === 'opposite') {
                targetSide = triggerSide === 'stallion' ? 'broodmare' : 'stallion';
              } else if (exception.target.side === 'same') {
                targetSide = triggerSide;
              } else if (exception.target.side === 'either') {
                targetSide = null; // 両方チェック
              } else {
                return;
              }
              
              // target馬のindexを検索
              const targetIndexes = [];
              const searchArrays = targetSide === 'stallion' ? [stallionsArray] 
                                : targetSide === 'broodmare' ? [broodmaresArray]
                                : [stallionsArray, broodmaresArray];
              
              searchArrays.forEach(arr => {
                arr.forEach(horse => {
                  if (!horse || horse.name !== exception.target.horse) {
                    return;
                  }

                  if (Number.isInteger(exception.target.generation)) {
                    const targetGen = getGenerationFromIndex(horse.index);
                    if (!checkGenerationCondition(
                      targetGen,
                      exception.target.generation,
                      exception.target.operator
                    )) {
                      return;
                    }
                  }

                  targetIndexes.push({index: horse.index, node: horse});
                });
              });
              
              // 各target馬についてクロス認定
              targetIndexes.forEach(target => {
                const targetIdx = target.index;
                const targetNode = target.node;
                const targetActualSide = getSideFromIndex(targetIdx);
                
                // 除外リストに含まれているかチェック
                if (excludedExceptionTargets.has(targetIdx)) {
                  return; // 既に除外されている場合はスキップ
                }
                
                // 例外ターゲットをクロス表示する場合だけrecognizedCrossesに追加
                if (exception.action.recognizeAsCross !== false) {
                  const crossData = {
                    name: `${exception.target.horse}(例外:${exception.name})`,
                    type: 'exception',
                    stallionIndex: targetActualSide === 'stallion' ? targetIdx : null,
                    broodmareIndex: targetActualSide === 'broodmare' ? targetIdx : null,
                    stallionNode: targetActualSide === 'stallion' ? targetNode : null,
                    broodmareNode: targetActualSide === 'broodmare' ? targetNode : null,
                    exceptionId: exception.id,
                    displayInSameNameGroups: exception.action.displayInSameNameGroups
                  };
                  
                  recognizedCrosses.push(crossData);
                }
                
                // 祖先を除外
                if (exception.action.excludeAncestors) {
                  addExceptionExcludedPairs(triggerIdx, targetIdx, exception);
                }
              });
            });
          });
          
          for (const cross of crossCandidates) {
            // 繫殖牝馬×種牡馬の全兄妹クロスの場合
            if (cross.type === 'broodmare-stallion-sibling') {
              // 種牡馬側のみをsiblingGroupsに追加
              recognizedCrosses.push(cross);
              
              // 繫殖牝馬側の全ての馬を記録し、その祖先も除外
              cross.broodmareGroupIndexes.forEach(idx => {
                broodmareGroupIndexes.add(idx);
                
                // この繫殖牝馬の祖先も除外
              });
              
              // 種牡馬側の全ての祖先を除外リストに追加
              addExcludedAncestorPairs(
                cross.broodmareGroupIndexes,
                [cross.broodmareIndex]
              );
              
              continue;
            }
            
            // 通常のクロス判定（名前一致・fullBrothers一致）
            // 例外パターンで除外されたペアかチェック
            const pairKey1 = getPairKey(cross.stallionIndex, cross.broodmareIndex);
            const pairKey2 = getPairKey(cross.broodmareIndex, cross.stallionIndex);
            if (exceptionExcludedPairs.has(pairKey1) || exceptionExcludedPairs.has(pairKey2)) {
              continue; // 例外パターンで除外されたペアなのでスキップ
            }
            
            // どちらかのノードが除外リストに含まれているかチェック
            const isAncestorPairExcluded = excludedAncestorPairs.has(pairKey1);
            
            // 両方とも除外されている場合のみスキップ
            if (isAncestorPairExcluded) {
              continue;
            }
            
            // インブリード認定
            recognizedCrosses.push(cross);
            
            // 使用したノードの祖先を除外リストに追加
            addExcludedAncestorPairs(
              [cross.stallionIndex],
              [cross.broodmareIndex]
            );
          }

          // 認定された同一馬・全兄妹クロスを連結し、同じグループの全出現を集める。
          const crossGroups = [];
          const addPairToCrossGroups = (pair, areRelated) => {
            const matchingGroups = crossGroups.filter((group) =>
              group.some((member) =>
                pair.some((node) => areRelated(member, node))
              )
            );
            const merged = pair.slice();
            matchingGroups.forEach((group) => merged.push(...group));
            matchingGroups.forEach((group) => {
              crossGroups.splice(crossGroups.indexOf(group), 1);
            });
            crossGroups.push(merged);
          };

          const stallionMares = buildMareOccurrences(
            selected[0],
            "stallion"
          );
          const broodmareMares = buildMareOccurrences(
            selected[16],
            "broodmare"
          );
          const isMareOccurrence = (occurrence) =>
            occurrence && occurrence.index === null;
          const isMasterCrossRelated = (a, b) =>
            isExactSameNode(a, b) || isFullSiblingByMaster(a, b);
          const buildSideOccurrences = (sideOffset, side, mareOccurrences) => {
            const occurrences = [];
            const root = selected[sideOffset];
            if (
              root?.name &&
              !isInbreedExcludedHorse(root) &&
              !isBroodmarePlaceholderHorse(root)
            ) {
              occurrences.push({
                ...root,
                side,
                path: "",
                generation: 1,
              });
            }
            SIRE_PATHS.forEach((path, pathIndex) => {
              const horse = selected[
                sideOffset + DESCENDANT_SLOTS[pathIndex]
              ];
              if (
                !horse?.name ||
                isInbreedExcludedHorse(horse) ||
                isBroodmarePlaceholderHorse(horse)
              ) {
                return;
              }
              occurrences.push({
                ...horse,
                side,
                path,
                generation: generationMap[horse.index],
              });
            });
            occurrences.push(...mareOccurrences);

            const byPath = new Map(
              occurrences.map((occurrence) => [occurrence.path, occurrence])
            );
            occurrences.forEach((occurrence) => {
              occurrence.branchParentNodeId = occurrence.path
                ? byPath.get(occurrence.path.slice(0, -1))?.nodeId ?? null
                : null;
            });
            return occurrences;
          };
          const isSameBranch = (a, b) => {
            const parentA = a?.branchParentNodeId;
            const parentB = b?.branchParentNodeId;
            if (!parentA || !parentB) {
              return false;
            }
            return (
              parentA === parentB ||
              isFullSiblingByMasterNodeIds(parentA, parentB)
            );
          };

          let stallionOccurrences;
          let broodmareOccurrences;
          let groupRelation;
          if (nodeTable) {
            stallionOccurrences = buildSideOccurrences(
              0,
              "stallion",
              stallionMares
            );
            broodmareOccurrences = buildSideOccurrences(
              16,
              "broodmare",
              broodmareMares
            );
            groupRelation = isMasterCrossRelated;
            stallionOccurrences.forEach((stallion) => {
              broodmareOccurrences.forEach((broodmare) => {
                if (
                  isMasterCrossRelated(stallion, broodmare) &&
                  !isSameBranch(stallion, broodmare)
                ) {
                  addPairToCrossGroups(
                    [stallion, broodmare],
                    isMasterCrossRelated
                  );
                }
              });
            });
          } else {
            stallionOccurrences = [...stallionsArray, ...stallionMares];
            broodmareOccurrences = [...broodmaresArray, ...broodmareMares];
            groupRelation = isCrossRelated;
            recognizedCrosses
              .filter(
                (cross) =>
                  cross.type === "sameName" || cross.type === "sibling"
              )
              .forEach((cross) => {
                const pair = [
                  cross.stallionNode,
                  cross.broodmareNode,
                ].filter(Boolean);
                addPairToCrossGroups(pair, isCrossRelated);
              });
          }

          const allOccurrences = [
            ...stallionOccurrences,
            ...broodmareOccurrences,
          ];
          const occurrenceKey = (occurrence) =>
            isMareOccurrence(occurrence)
              ? occurrence.side + ":mare:" + occurrence.mareSlot
              : "cell:" + occurrence.index;
          crossGroups.forEach((group) => {
            let added;
            do {
              added = false;
              allOccurrences.forEach((horse) => {
                if (
                  !group.some(
                    (member) => occurrenceKey(member) === occurrenceKey(horse)
                  ) &&
                  group.some((member) => groupRelation(member, horse))
                ) {
                  group.push(horse);
                  added = true;
                }
              });
            } while (added);
          });

          const crosses = crossGroups.map((group) => {
            const unique = [];
            const seenOccurrences = new Set();
            group
              .slice()
              .sort((a, b) => {
                const sideA = a.side || (a.index < 16 ? "stallion" : "broodmare");
                const sideB = b.side || (b.index < 16 ? "stallion" : "broodmare");
                if (sideA !== sideB) {
                  return sideA === "stallion" ? -1 : 1;
                }
                const positionA = isMareOccurrence(a)
                  ? 100 + a.mareSlot
                  : a.index;
                const positionB = isMareOccurrence(b)
                  ? 100 + b.mareSlot
                  : b.index;
                return positionA - positionB;
              })
              .forEach((horse) => {
                const key = occurrenceKey(horse);
                if (!seenOccurrences.has(key)) {
                  seenOccurrences.add(key);
                  unique.push(horse);
                }
              });
            const occurrences = unique.map((horse) => {
              const occurrence = {
                nodeId:
                  typeof horse.nodeId === "string" ? horse.nodeId : null,
                side:
                  horse.side ||
                  (horse.index < 16 ? "stallion" : "broodmare"),
                generation: isMareOccurrence(horse)
                  ? horse.generation
                  : generationMap[horse.index],
                index: horse.index,
              };
              if (nodeTable) {
                occurrence.path = horse.path;
                occurrence.branchParentNodeId =
                  horse.branchParentNodeId ?? null;
              }
              return occurrence;
            });
            const generations = occurrences.map((item) => item.generation);
            const bloodVolume = generations.reduce(
              (sum, generation) => sum + (BLOOD_VOLUME[generation] || 0),
              0
            );
            const representative = unique.find(
              (horse) => typeof horse.nodeId === "string"
            );
            return {
              representativeNodeId:
                representative?.nodeId || unique[0]?.name || null,
              occurrences,
              bloodVolume,
              generations,
              hasMareOccurrence: occurrences.some(
                (occurrence) => occurrence.index === null
              ),
            };
          });
          const dangerous = crosses.some((cross) => cross.bloodVolume >= 50000);


          // sameNameGroupsとsiblingGroupsに分類
          const sameNameGroupsFinal = [];
          const siblingGroupsFinal = [];
          
          // 各馬名について、異なるselectedHorseでクロスしているかチェック
          const namesWithDifferentSelectedHorseCross = new Set();
          
          recognizedCrosses.forEach(cross => {
            if (cross.type === 'sameName') {
              const stallionSelectedHorse = cross.stallionNode ? cross.stallionNode.selectedHorse : null;
              const broodmareSelectedHorse = cross.broodmareNode ? cross.broodmareNode.selectedHorse : null;
              
              // 異なるselectedHorseのクロスの場合、その馬名を記録
              if (stallionSelectedHorse !== broodmareSelectedHorse && cross.stallionNode && cross.stallionNode.name) {
                namesWithDifferentSelectedHorseCross.add(cross.stallionNode.name);
              }
            }
          });
          
          recognizedCrosses.forEach(cross => {
            if (cross.type === 'broodmare-stallion-sibling') {
              // 繫殖牝馬×種牡馬の全兄妹クロス：種牡馬のみを追加
              siblingGroupsFinal.push([cross.broodmareNode]);
            } else {
              const group = [cross.stallionNode, cross.broodmareNode];
              
              if (cross.type === 'sameName') {
                const horseName = cross.stallionNode ? cross.stallionNode.name : null;
                const hasbroodmareIndex = broodmareGroupIndexes.has(cross.stallionIndex) || 
                                          broodmareGroupIndexes.has(cross.broodmareIndex);
                
                // 繫殖牝馬側のindexを含む場合
                if (hasbroodmareIndex) {
                  // 異なるselectedHorseでもクロスしている場合はsameNameGroupsに含める
                  if (namesWithDifferentSelectedHorseCross.has(horseName)) {
                    sameNameGroupsFinal.push(group);
                  }
                  // 同じselectedHorseでしかクロスしていない場合はsameNameGroupsから除外
                } else {
                  // 繫殖牝馬側のindexを含まない場合は通常通り追加
                  sameNameGroupsFinal.push(group);
                }
              } else if (cross.type === 'exception') {
                // 例外パターンのクロス
                const targetNode = cross.stallionNode || cross.broodmareNode;
                if (cross.displayInSameNameGroups) {
                  sameNameGroupsFinal.push([targetNode]);
                } else {
                  siblingGroupsFinal.push([targetNode]);
                }
              } else {
                siblingGroupsFinal.push(group);
              }
            }
          });

          // sameNameGroupsFinalとsiblingGroupsFinalを名前でグループ化し、JSONから同名の馬を追加
          // 1. sameNameGroupsFinalを名前でグループ化
          const sameNameGroupsByName = new Map(); // name → [nodes]
          sameNameGroupsFinal.forEach(group => {
            group.forEach(node => {
              if (node && node.name) {
                if (!sameNameGroupsByName.has(node.name)) {
                  sameNameGroupsByName.set(node.name, []);
                }
                // 重複チェック（同じindexが既に含まれていないか）
                const existingIndexes = sameNameGroupsByName.get(node.name).map(n => n.index);
                if (!existingIndexes.includes(node.index)) {
                  sameNameGroupsByName.get(node.name).push(node);
                }
              }
            });
          });
          
          // stallionsArrayとbroodmaresArrayから同名の馬を探して追加
          sameNameGroupsByName.forEach((nodes, name) => {
            const existingIndexes = nodes.map(n => n.index);
            [...stallionsArray, ...broodmaresArray].forEach(horse => {
              if (horse && horse.name === name && !existingIndexes.includes(horse.index)) {
                nodes.push(horse);
                existingIndexes.push(horse.index);
              }
            });
          });
          
          // Map → 配列に変換
          const sameNameGroupsFinalGrouped = Array.from(sameNameGroupsByName.values());
          
          // 2. siblingGroupsFinalを名前でグループ化
          const siblingGroupsByName = new Map(); // name → [nodes]
          siblingGroupsFinal.forEach(group => {
            group.forEach(node => {
              if (node && node.name) {
                if (!siblingGroupsByName.has(node.name)) {
                  siblingGroupsByName.set(node.name, []);
                }
                // 重複チェック（同じindexが既に含まれていないか）
                const existingIndexes = siblingGroupsByName.get(node.name).map(n => n.index);
                if (!existingIndexes.includes(node.index)) {
                  siblingGroupsByName.get(node.name).push(node);
                }
              }
            });
          });
          
          // stallionsArrayとbroodmaresArrayから同名の馬を探して追加
          siblingGroupsByName.forEach((nodes, name) => {
            const existingIndexes = nodes.map(n => n.index);
            [...stallionsArray, ...broodmaresArray].forEach(horse => {
              if (horse && horse.name === name && !existingIndexes.includes(horse.index)) {
                nodes.push(horse);
                existingIndexes.push(horse.index);
              }
            });
          });
          
          // Map → 配列に変換
          const siblingGroupsFinalGrouped = Array.from(siblingGroupsByName.values());

          // siblingGroupsFinalGroupedと重複する名前をsameNameGroupsFinalGroupedから削除
          const namesInSiblingGroups = new Set();
          siblingGroupsFinalGrouped.forEach(group => {
            if (group.length > 0 && group[0] && group[0].name) {
              namesInSiblingGroups.add(group[0].name);
            }
          });
          
          // sameNameGroupsFinalGroupedから重複する名前のグループを削除
          const sameNameGroupsFinalFiltered = sameNameGroupsFinalGrouped.filter(group => {
            if (group.length > 0 && group[0] && group[0].name) {
              return !namesInSiblingGroups.has(group[0].name);
            }
            return true;
          });

          // combinedFlatIndexesとcombinedFlatSeenを再構築
          const newCombinedFlatIndexes = [];
          const newCombinedFlatSeen = Array.from(new Array(32).fill(false));
          
          // sameNameGroupsFinalFilteredから全てのindexを収集
          sameNameGroupsFinalFiltered.forEach(group => {
            group.forEach(node => {
              if (node && node.index !== undefined) {
                const horseName = node.name;
                const hasbroodmareIndex = broodmareGroupIndexes.has(node.index);
                
                // 繫殖牝馬側のindexでも、別系統でクロスしている場合は含める
                if (hasbroodmareIndex) {
                  // 異なるselectedHorseでクロスしている場合のみ追加
                  if (namesWithDifferentSelectedHorseCross.has(horseName) && !newCombinedFlatSeen[node.index]) {
                    newCombinedFlatSeen[node.index] = true;
                    newCombinedFlatIndexes.push(node.index);
                  }
                } else {
                  // 繫殖牝馬側のindexでない場合は通常通り追加
                  if (!newCombinedFlatSeen[node.index]) {
                    newCombinedFlatSeen[node.index] = true;
                    newCombinedFlatIndexes.push(node.index);
                  }
                }
              }
            });
          });
          
          // siblingGroupsFinalGroupedから全てのindexを収集
          siblingGroupsFinalGrouped.forEach(group => {
            group.forEach(node => {
              if (node && node.index !== undefined) {
                if (!newCombinedFlatSeen[node.index]) {
                  newCombinedFlatSeen[node.index] = true;
                  newCombinedFlatIndexes.push(node.index);
                }
              }
            });
          });

          // sameNameGroupsFinalFilteredの特殊チェック
          const indexGroupAssignments = [
            1, 2, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5,
            1, 2, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5,
          ];

          const evaluateSameNameSpecialCheck = (group) => {
            if (!Array.isArray(group) || group.length === 0) {
              return false;
            }

            const coveredGroups = new Set(
              group
                .map((item) => {
                  if (typeof item?.index !== "number") {
                    return undefined;
                  }
                  return indexGroupAssignments[item.index];
                })
                .filter((value) => typeof value === "number")
            );
            const coverageOk = coveredGroups.has(3) && coveredGroups.has(4) && coveredGroups.has(5);
            if (!coverageOk) {
              return false;
            }

            const factorSet = new Set();
            group.forEach((item) => {
              if (Array.isArray(item?.factors)) {
                item.factors.forEach((factor) => {
                  const normalized = (factor ?? "").trim();
                  if (normalized) {
                    factorSet.add(normalized);
                  }
                });
              }
            });
            return factorSet.size >= 6;
          };

          // sameNameGroupsFinalFilteredの各グループをチェック
          const specialCheckIndexes = [];
          const specialCheckSeen = Array.from(new Array(32).fill(false));
          
          sameNameGroupsFinalFiltered.forEach(group => {
            if (evaluateSameNameSpecialCheck(group)) {
              // 条件を満たすグループのindexを収集
              group.forEach(node => {
                if (node && node.index !== undefined && !specialCheckSeen[node.index]) {
                  specialCheckSeen[node.index] = true;
                  specialCheckIndexes.push(node.index);
                }
              });
            }
          });

          // 結果をまとめる（旧実装は this.sameNameGroups 等へ直接代入していたが、
          // 純関数化のためローカル変数を経由して戻り値オブジェクトに含める）。
          const inbreedColorIndexes = [];
          newCombinedFlatIndexes.forEach(element => {
            inbreedColorIndexes.push(element);
          });
          // specialCheckIndexes.forEach(element => {
          //   inbreedColorIndexes.push(element); // 元は dispColor に "supreme" を$setする行。コメントアウトのまま維持。
          // });

          // インブリード発生数と各種判定結果をまとめて返す
          const colored = new Set(inbreedColorIndexes);
          const hiddenCrossCount = crosses.filter(
            (cross) =>
              !cross.occurrences.some(
                (occurrence) =>
                  occurrence.index !== null && colored.has(occurrence.index)
              )
          ).length;
          return {
            count: inbreedColorIndexes.length + hiddenCrossCount,
            sameNameGroups: sameNameGroupsFinalFiltered,
            siblingGroups: siblingGroupsFinalGrouped,
            sameNameSpecialChecks: specialCheckIndexes,
            sameNameSpecialChecksByIndex: specialCheckSeen,
            inbreedColorIndexes,
            crosses,
            dangerous,
          };
        };

})(window);
