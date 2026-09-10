(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.pedigree = window.Dabimas.logic.pedigree || {};

  const SIRE_PATHS = [
    "F", "FF", "FFF", "FFFF", "FFMF", "FMF", "FMFF", "FMMF",
    "MF", "MFF", "MFFF", "MFMF", "MMF", "MMFF", "MMMF",
  ];
  const MARE_PATHS = [
    "M", "FM", "MM", "FFM", "FMM", "MFM", "MMM", "FFFM",
    "FFMM", "FMFM", "FMMM", "MFFM", "MFMM", "MMFM", "MMMM",
  ];

  // 判定と保存で共用する、盤面31位置の個体解決。入力セルは変更しない。
  function resolveBoardRefs(selected, sideOffset, context = {}) {
    const { nodeTable, resolver } = context;
    const pedigree = window.Dabimas.logic.pedigree;
    const cellRef = (horse) => pedigree.createIdentityRef(horse || {});
    const rootCell = selected[sideOffset];
    const refByPath = new Map([["", cellRef(rootCell)]]);
    const explicitMaresByPath = new Map();
    const explicitMareRefsByPath = new Map();
    SIRE_PATHS.forEach((path, pathIndex) => {
      const horse = selected[sideOffset + pedigree.DESCENDANT_SLOTS[pathIndex]];
      refByPath.set(path, cellRef(horse));
      if (horse?.placeholderMareRef) {
        explicitMareRefsByPath.set(path.slice(0, -1), horse.placeholderMareRef);
      }
      if (typeof horse?.placeholderMareNodeId === "string") {
        explicitMaresByPath.set(path.slice(0, -1), horse.placeholderMareNodeId);
      }
    });
    if (!nodeTable) {
      MARE_PATHS.forEach((path) => refByPath.set(path, null));
      return Object.freeze({ rootRef: refByPath.get(""), mareRefs: MARE_PATHS.map(() => null), refByPath });
    }

    const ids = Array.isArray(rootCell?.mareNodeIds) ? rootCell.mareNodeIds : [];
    const canonicalMasterRef = (pedigreeId) => {
      const nodeId = pedigreeId ? nodeTable.canonicalNodeOf(pedigreeId) : null;
      return typeof nodeId === "string" ? { kind: "master", nodeId } : null;
    };
    const motherRefOf = (ref) => {
      if (!ref || ref.kind === "unknown") return null;
      if (ref.kind === "implied") return ref.motherRef ?? null;
      const mother = resolver?.parentsOf(ref)?.mother;
      if (mother) return mother.kind === "masterPedigree"
        ? canonicalMasterRef(mother.pedigreeId) : mother;
      return typeof ref.nodeId === "string"
        ? canonicalMasterRef(nodeTable.parentsOf(ref.nodeId).mother) : null;
    };
    const masterRef = (nodeId) => typeof nodeId === "string" ? { kind: "master", nodeId } : null;
    // 親位置から母を辿り、明示配置・保存済みの枠を優先順どおりに反映する。
    MARE_PATHS.forEach((path, slot) => {
      const ref = explicitMareRefsByPath.get(path)
        ?? masterRef(explicitMaresByPath.get(path))
        ?? motherRefOf(refByPath.get(path.slice(0, -1)))
        ?? rootCell?.mareRefs?.[slot] ?? masterRef(ids[slot]);
      refByPath.set(path, ref);
    });
    const fillImplied = (path) => {
      if (refByPath.get(path) && refByPath.get(path).kind !== "unknown") return;
      const fatherRef = refByPath.get(path + "F");
      const motherRef = refByPath.get(path + "M");
      if (fatherRef && fatherRef.kind !== "unknown" && motherRef && motherRef.kind !== "unknown") {
        refByPath.set(path, { kind: "implied", fatherRef, motherRef });
      }
    };
    // 位置 p の父は p+"F"、母は p+"M"。どちらも p より深いので、
    // パスの長い順に処理すれば依存関係が解決済みになる。
    const ALL_PATHS = ["", ...SIRE_PATHS, ...MARE_PATHS]
      .sort((a, b) => b.length - a.length);
    ALL_PATHS.forEach(fillImplied);
    const mareRefs = MARE_PATHS.map((path) => {
      const ref = refByPath.get(path);
      return ref?.kind === "unknown" ? null : ref ?? null;
    });
    return Object.freeze({ rootRef: refByPath.get(""), mareRefs, refByPath });
  }

  window.Dabimas.logic.pedigree.resolveBoardRefs = resolveBoardRefs;
})(window);
