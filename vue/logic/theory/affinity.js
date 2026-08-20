(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.theory = window.Dabimas.logic.theory || {};

  // context: { selected, parentLines, category, inbreedList }
  // 戻り値: number（commentId 0〜4）または null（未計算・計算不能）
  function calculateAffinity(context) {
    try {
      const nicks = window.Dabimas.logic.nicks;
      if (
        !nicks ||
        typeof nicks.isReady !== "function" ||
        typeof nicks.resolveLineId !== "function" ||
        typeof nicks.calculate !== "function" ||
        nicks.isReady() !== true
      ) {
        return null;
      }

      const selected = context && context.selected;
      if (
        !Array.isArray(selected) ||
        selected.length !== 32 ||
        !selected.every((horse) => horse)
      ) {
        return null;
      }

      const rarity = selected[0].rare;
      if (!Number.isInteger(rarity) || rarity < 1 || rarity > 5) {
        return null;
      }

      const lineIds = [0, 17, 19, 23, 31].map((index) => {
        const horse = selected[index];
        return nicks.resolveLineId(horse.sonId, horse.son);
      });
      if (lineIds.some((lineId) => lineId === null)) {
        return null;
      }

      const miracleTargetName = selected[19].name;
      const miracleMatchCount = [4, 5, 6, 7].filter(
        (index) => selected[index].name === miracleTargetName
      ).length;

      return nicks.calculate({
        rarity,
        sireLineId: lineIds[0],
        partnerLineIds: lineIds.slice(1),
        miracle: miracleMatchCount === 1,
      });
    } catch (error) {
      return null;
    }
  }

  window.Dabimas.logic.theory.calculateAffinity = calculateAffinity;
})(window);
