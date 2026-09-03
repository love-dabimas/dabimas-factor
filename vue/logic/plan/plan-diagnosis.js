/**
 * このファイルの役割:
 * - 血統表の母系チェーンから「段階配合計画」の工程を取り出し、工程ごとに
 *   既存のクロス判定（judgeInbreed）と配合理論判定（detectMatchedTheories /
 *   selectDisplayedTheory）を回して、途中工程の「危険な配合」を見つける。
 * - 仕様書: 「配合補助・工程危険診断 処理仕様書」v0.2
 *
 * このファイルに置かない処理:
 * - Vue state への代入、ボタン状態、結果パネルの描画
 *   （vue/app/methods/plan-diagnosis-ui.js の仕事）。
 * - クロス判定・理論判定の本体（vue/logic/inbreed/ と vue/logic/theory/ の仕事）。
 * - 馬マスターの取得。descendants 15 件つきの馬の解決は呼び出し側が
 *   resolveHorse / resolveMare で渡す。
 *
 * 母系チェーンとセル番号:
 * - セル番号の意味は vue/logic/inbreed/inbreed-detector.js の SIRE_PATHS と同じで、
 *   セル k は「祖先位置 bits(k) の父」を指す（1=F, 3=MF, 7=MMF, 15=MMMF）。
 * - よって母系で深さ d（0=本馬, 1=母, 2=母母, 3=母母母）の牝馬の父は
 *   セル 2^(d+1)-1 に入る。繁殖牝馬側は +16 が selected の index。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.plan = window.Dabimas.logic.plan || {};

  var ROWS_PER_SIDE = 16;
  var MAX_BASE_DEPTH = 3;

  // 深さ d の牝馬の「父」が入るセル番号（片側 0〜15）。
  function maternalSireCell(depth) {
    return Math.pow(2, depth + 1) - 1;
  }

  // セル k を (世代オフセット g, 世代内位置 m) に分解する。k = 2^g + m。
  function splitCell(cell) {
    var g = 31 - Math.clz32(cell);
    return { g: g, m: cell - (1 << g) };
  }

  // 血統表の全馬枠が埋まっているか（既存の dispTheory / dispInbreed と同じ条件）。
  function isPedigreeTableComplete(selected) {
    if (!Array.isArray(selected) || selected.length !== 32) {
      return false;
    }
    return selected.every(function (entry) {
      return !!entry && !!entry.name;
    });
  }

  // 繁殖牝馬を選んだセルは、その牝馬の父が subName "(牝馬名)" 付きで入る
  // （vue/logic/pedigree/pedigree-builder.js の牝馬ルート）。
  function readMareNameFromCell(entry) {
    var subName = entry && typeof entry.subName === "string" ? entry.subName : "";
    if (
      subName.length > 2 &&
      subName.charAt(0) === "(" &&
      subName.charAt(subName.length - 1) === ")"
    ) {
      return subName.slice(1, -1);
    }
    return null;
  }

  // 母系チェーンのうち、ユーザー自身が選んだ一番深いセルを基礎繁殖牝馬の位置とみなす。
  // 例: 繁殖牝馬側セル 15（MMMF）を自分で選んでいれば 4 工程（=4代計画）。
  function detectBaseDepth(selected) {
    for (var depth = MAX_BASE_DEPTH; depth >= 1; depth -= 1) {
      var entry = selected[ROWS_PER_SIDE + maternalSireCell(depth)];
      if (entry && entry.selfSelected === true) {
        return depth;
      }
    }
    var root = selected[ROWS_PER_SIDE];
    if (root && root.selfSelected === true) {
      return 0;
    }
    return MAX_BASE_DEPTH;
  }

  // 計画の工程一覧を作る。工程の種牡馬は「一つ浅い牝馬の父」セルで、
  // 最終工程だけは種牡馬側のセル 0（画面左側の種牡馬）になる。
  function detectPlan(selected) {
    var baseDepth = detectBaseDepth(selected);
    var baseCellIndex =
      baseDepth > 0
        ? ROWS_PER_SIDE + maternalSireCell(baseDepth)
        : ROWS_PER_SIDE;
    var steps = [];

    for (var depth = baseDepth; depth >= 0; depth -= 1) {
      steps.push({
        stepNo: steps.length + 1,
        mareDepth: depth,
        isFinalStep: depth === 0,
        sireIndex:
          depth === 0 ? 0 : ROWS_PER_SIDE + maternalSireCell(depth - 1),
      });
    }

    return {
      baseDepth: baseDepth,
      baseCellIndex: baseCellIndex,
      baseMareName: readMareNameFromCell(selected[baseCellIndex]),
      planDepth: steps.length,
      steps: steps,
    };
  }

  // 1頭ぶんの血統（16セル）を、既存の血統表展開処理そのままで作る。
  function expandHorseBoard(record, brosData) {
    var pedigree = window.Dabimas.logic.pedigree;
    var side = record && record.sex === "1" ? 1 : 0;
    var list = pedigree.setDataForPedigree(side, 0, record, brosData);
    var que = pedigree.getCellIdQue(0, list);
    var board = new Array(ROWS_PER_SIDE).fill(null);

    for (var i = 0; i < que.length; i += 1) {
      var value = list[i];
      if (value && value !== "broodmares") {
        board[que[i]] = value;
      }
    }
    return board;
  }

  // 仮想繁殖牝馬（前工程の産駒）の血統。父側が前工程の種牡馬、母側が前工程の繁殖牝馬。
  function composeVirtualMareBoard(sireBoard, mareBoard) {
    var board = new Array(ROWS_PER_SIDE).fill(null);
    // 仮想繁殖牝馬そのものは血統マスターに無いので 0 は空のままにする。
    board[1] = sireBoard[0] || null;

    for (var cell = 2; cell < ROWS_PER_SIDE; cell += 1) {
      var parts = splitCell(cell);
      var half = 1 << (parts.g - 1);
      var fromSire = parts.m < half;
      var source = fromSire ? sireBoard : mareBoard;
      var offset = fromSire ? parts.m : parts.m - half;
      board[cell] = source[half + offset] || null;
    }
    return board;
  }

  // 基礎繁殖牝馬が無名（種牡馬しか置かれていない）ときは、画面の血統表から切り出す。
  function sliceMareBoard(selected, depth) {
    var board = new Array(ROWS_PER_SIDE).fill(null);

    for (var cell = 1; cell < ROWS_PER_SIDE; cell += 1) {
      var parts = splitCell(cell);
      var mainCell =
        (1 << (depth + parts.g)) +
        ((1 << depth) - 1) * (1 << parts.g) +
        parts.m;
      if (mainCell < ROWS_PER_SIDE) {
        board[cell] = selected[ROWS_PER_SIDE + mainCell] || null;
      }
    }
    return board;
  }

  // 本馬（繁殖牝馬側セル 0）が基礎繁殖牝馬のとき用。画面の繁殖牝馬側をそのまま使う。
  function copySelectedBroodmareSide(selected) {
    var board = new Array(ROWS_PER_SIDE).fill(null);
    for (var cell = 0; cell < ROWS_PER_SIDE; cell += 1) {
      board[cell] = selected[ROWS_PER_SIDE + cell] || null;
    }
    return board;
  }

  // 種牡馬がマスターに無い（自動で埋まった祖先セル）ときに、画面の血統表から
  // その馬の血統だけを切り出す。画面には5代ぶんしか無いので浅い血統になる。
  function sliceSireBoard(selected, index) {
    var sideOffset = index < ROWS_PER_SIDE ? 0 : ROWS_PER_SIDE;
    var cell = index - sideOffset;
    var board = new Array(ROWS_PER_SIDE).fill(null);

    if (cell === 0) {
      for (var i = 0; i < ROWS_PER_SIDE; i += 1) {
        board[i] = selected[sideOffset + i] || null;
      }
      return board;
    }

    board[0] = selected[index] || null;
    var self = splitCell(cell);
    for (var sub = 1; sub < ROWS_PER_SIDE; sub += 1) {
      var parts = splitCell(sub);
      var mainCell =
        (1 << (self.g + 1 + parts.g)) +
        2 * self.m * (1 << parts.g) +
        parts.m;
      if (mainCell < ROWS_PER_SIDE) {
        board[sub] = selected[sideOffset + mainCell] || null;
      }
    }
    return board;
  }

  // 工程1枚ぶんの selected（32セル）を作る。
  function buildStepSelected(sireBoard, mareBoard) {
    var stepSelected = new Array(32).fill(null);

    for (var cell = 0; cell < ROWS_PER_SIDE; cell += 1) {
      if (sireBoard[cell]) {
        stepSelected[cell] = Object.assign({}, sireBoard[cell], { index: cell });
      }
      if (mareBoard[cell]) {
        stepSelected[cell + ROWS_PER_SIDE] = Object.assign({}, mareBoard[cell], {
          index: cell + ROWS_PER_SIDE,
        });
      }
    }
    return stepSelected;
  }

  // 既存 dispTheory と同じ形（[[面白系統4], [見事系統4]]）で親系統を取り出す。
  function buildTheoryOperands(stepSelected) {
    var parentLineAt = function (index) {
      var entry = stepSelected[index];
      return entry && typeof entry.parentLine === "string" ? entry.parentLine : "";
    };
    var damLines = [
      parentLineAt(17),
      parentLineAt(19),
      parentLineAt(21),
      parentLineAt(23),
    ];

    return {
      sire: [
        [parentLineAt(1), parentLineAt(3), parentLineAt(5), parentLineAt(7)],
        [parentLineAt(9), parentLineAt(11), parentLineAt(13), parentLineAt(15)],
      ],
      dam: [damLines, damLines.slice()],
    };
  }

  function createStepResult(base, extra) {
    return Object.assign(
      {
        stepNo: base.stepNo,
        status: "unknown",
        mareLabel: base.mareLabel,
        sireIndex: base.sireIndex,
        sireNodeId: base.sireNodeId,
        sireName: base.sireName,
        matchedTheories: [],
        displayedTheory: null,
        isDangerous: false,
        reasonCode: null,
      },
      extra || {}
    );
  }

  function buildDiagnosisSummary(steps) {
    var finalStep = steps.length > 0 ? steps[steps.length - 1] : null;
    var intermediateSteps = steps.slice(0, -1);
    var dangerSteps = steps.filter(function (step) {
      return step.status === "danger";
    });
    var unknownSteps = steps.filter(function (step) {
      return step.status === "unknown" || step.status === "blocked";
    });

    return {
      totalDangerCount: dangerSteps.length,
      intermediateDangerCount: intermediateSteps.filter(function (step) {
        return step.status === "danger";
      }).length,
      finalStepDanger: !!finalStep && finalStep.status === "danger",
      dangerStepNumbers: dangerSteps.map(function (step) {
        return step.stepNo;
      }),
      dangerCellIndexes: dangerSteps.map(function (step) {
        return step.sireIndex;
      }),
      unknownCount: unknownSteps.length,
      unknownStepNumbers: unknownSteps.map(function (step) {
        return step.stepNo;
      }),
      finalDisplayedTheory: finalStep ? finalStep.displayedTheory : null,
    };
  }

  // 選択内容が診断時から変わっていないかを見るためのハッシュ（同一性の判定だけに使う）。
  function createSnapshotHash(selected) {
    return (selected || [])
      .map(function (entry) {
        if (!entry) {
          return "-";
        }
        return [entry.nodeId || entry.name || "?", entry.subName || ""].join("|");
      })
      .join(",");
  }

  // 前工程が組めなかった場合、それ以降は判定できないので blocked にする。
  function appendBlockedLaterSteps(steps, plan, selected, fromIndex) {
    for (var i = fromIndex; i < plan.steps.length; i += 1) {
      var step = plan.steps[i];
      var sireEntry = selected[step.sireIndex];
      steps.push(
        createStepResult(
          {
            stepNo: step.stepNo,
            mareLabel: "工程" + (step.stepNo - 1) + "産駒（仮想繁殖牝馬）",
            sireIndex: step.sireIndex,
            sireNodeId: sireEntry ? sireEntry.nodeId || null : null,
            sireName: sireEntry ? sireEntry.name : "",
          },
          { status: "blocked", reasonCode: "PREVIOUS_STEP_BLOCKED" }
        )
      );
    }
  }

  /**
   * 計画全体を診断する。
   *
   * input:
   *   selected            画面の 32 セル
   *   brosData            全兄妹データ（既存 this.brosData）
   *   nodeTable           window.Dabimas.pedigreeNodes
   *   inbreedExceptions   既存 this.inbreedExceptions
   *   resolveHorse(entry) セルの馬を descendants 15 件つきのマスター馬へ解決する関数
   *   resolveMare(name)   基礎繁殖牝馬を名前から解決する関数
   */
  function diagnoseBreedingPlan(input) {
    var selected = input.selected;
    var judgeInbreed = window.Dabimas.logic.inbreed.judgeInbreed;
    var theory = window.Dabimas.logic.theory;
    var priority = window.Dabimas.constants.breedingTheories.PRIORITY;

    if (!isPedigreeTableComplete(selected)) {
      return { status: "incomplete", planDepth: 0, steps: [], summary: null };
    }

    var plan = detectPlan(selected);
    var steps = [];
    var mareBoard = null;
    var mareLabel = plan.baseMareName || "基礎繁殖牝馬";

    if (plan.baseMareName && input.resolveMare) {
      var baseMareRecord = input.resolveMare(plan.baseMareName);
      if (baseMareRecord) {
        try {
          mareBoard = expandHorseBoard(baseMareRecord, input.brosData);
        } catch (error) {
          mareBoard = null;
        }
      }
    }
    if (!mareBoard) {
      // 名前の分からない基礎繁殖牝馬は画面の血統表から切り出す。
      mareBoard =
        plan.baseDepth > 0
          ? sliceMareBoard(selected, plan.baseDepth)
          : copySelectedBroodmareSide(selected);
    }

    for (var i = 0; i < plan.steps.length; i += 1) {
      var step = plan.steps[i];
      var sireEntry = selected[step.sireIndex];
      var stepBase = {
        stepNo: step.stepNo,
        mareLabel: mareLabel,
        sireIndex: step.sireIndex,
        sireNodeId: sireEntry ? sireEntry.nodeId || null : null,
        sireName: sireEntry ? sireEntry.name : "",
      };

      var sireRecord = input.resolveHorse ? input.resolveHorse(sireEntry) : null;
      var sireBoard = null;
      if (sireRecord) {
        try {
          sireBoard = expandHorseBoard(sireRecord, input.brosData);
        } catch (error) {
          sireBoard = null;
        }
      }

      if (!sireBoard) {
        // 血統マスターに無い種牡馬。判定は「判定不能」にしつつ、画面から切り出した
        // 浅い血統で次工程の仮想繁殖牝馬だけは組み立てて診断を続ける（仕様 §15.1）。
        var fallbackBoard = sliceSireBoard(selected, step.sireIndex);
        steps.push(createStepResult(stepBase, { reasonCode: "MISSING_SIRE_DATA" }));
        if (!fallbackBoard[0] || step.isFinalStep) {
          appendBlockedLaterSteps(steps, plan, selected, i + 1);
          break;
        }
        mareBoard = composeVirtualMareBoard(fallbackBoard, mareBoard);
        mareLabel = "工程" + step.stepNo + "産駒（仮想繁殖牝馬）";
        continue;
      }
      if (!mareBoard || !mareBoard[1]) {
        steps.push(createStepResult(stepBase, { reasonCode: "MISSING_MARE_DATA" }));
        appendBlockedLaterSteps(steps, plan, selected, i + 1);
        break;
      }

      try {
        var stepSelected = buildStepSelected(sireBoard, mareBoard);
        var crossResult = judgeInbreed(
          stepSelected,
          input.inbreedExceptions || [],
          input.nodeTable || null
        );
        var operands = buildTheoryOperands(stepSelected);
        var matched = theory.detectMatchedTheories(operands.sire, operands.dam, {
          sameNameSpecialChecks: crossResult.sameNameSpecialChecks,
          selected: stepSelected,
          dangerous: crossResult.dangerous === true,
        });
        // 表示優先順位が将来変わっても危険情報を失わないよう、成立理論一覧で判定する。
        var isDangerous = matched.indexOf("DANGEROUS") !== -1;

        steps.push(
          createStepResult(stepBase, {
            status: isDangerous ? "danger" : "safe",
            matchedTheories: matched,
            displayedTheory: theory.selectDisplayedTheory(matched, priority),
            isDangerous: isDangerous,
          })
        );
      } catch (error) {
        if (window.Dabimas.debug) {
          console.warn("plan diagnosis failed", step.stepNo, error);
        }
        steps.push(createStepResult(stepBase, { reasonCode: "EVALUATION_ERROR" }));
        appendBlockedLaterSteps(steps, plan, selected, i + 1);
        break;
      }

      if (!step.isFinalStep) {
        mareBoard = composeVirtualMareBoard(sireBoard, mareBoard);
        mareLabel = "工程" + step.stepNo + "産駒（仮想繁殖牝馬）";
      }
    }

    return {
      status: "completed",
      snapshotHash: createSnapshotHash(selected),
      planDepth: plan.planDepth,
      baseCellIndex: plan.baseCellIndex,
      baseMareName: plan.baseMareName,
      diagnosedAt: new Date().toISOString(),
      steps: steps,
      summary: buildDiagnosisSummary(steps),
    };
  }

  window.Dabimas.logic.plan.maternalSireCell = maternalSireCell;
  window.Dabimas.logic.plan.isPedigreeTableComplete = isPedigreeTableComplete;
  window.Dabimas.logic.plan.detectPlan = detectPlan;
  window.Dabimas.logic.plan.expandHorseBoard = expandHorseBoard;
  window.Dabimas.logic.plan.composeVirtualMareBoard = composeVirtualMareBoard;
  window.Dabimas.logic.plan.sliceMareBoard = sliceMareBoard;
  window.Dabimas.logic.plan.buildStepSelected = buildStepSelected;
  window.Dabimas.logic.plan.buildDiagnosisSummary = buildDiagnosisSummary;
  window.Dabimas.logic.plan.createSnapshotHash = createSnapshotHash;
  window.Dabimas.logic.plan.diagnoseBreedingPlan = diagnoseBreedingPlan;
})(window);
