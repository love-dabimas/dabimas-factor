(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.pedigree = window.Dabimas.logic.pedigree || {};

  // 保存した祖先セルは id を持たないため、伝播済みの ref からも取得する。
  function createIdentityRef(horse) {
    if (horse?.source === "edit") {
      const savedRef = horse.identityRef?.kind === "edit" ? horse.identityRef : null;
      const id = horse.id || savedRef?.id;
      return id
        ? { kind: "edit", id, baseHorseId: horse.baseHorseId ?? savedRef?.baseHorseId }
        : { kind: "unknown" };
    }
    if (horse?.source === "custom" || horse?.customHorseId) {
      const savedRef = horse.identityRef?.kind === "custom" ? horse.identityRef : null;
      const id = horse.customHorseId || horse.id || savedRef?.id;
      return id ? { kind: "custom", id } : { kind: "unknown" };
    }
    if (horse?.identityRef) return horse.identityRef;
    return typeof horse?.nodeId === "string"
      ? { kind: "master", nodeId: horse.nodeId }
      : { kind: "unknown" };
  }

  function buildIdentityResolver(sources = {}) {
    const { nodeTable, customRecordsById, editRecordsById, baseHorseNodeIdById } = sources;
    const lookup = (records, id) => records instanceof Map
      ? records.get(id)
      : records && Object.prototype.hasOwnProperty.call(records, id)
        ? records[id] : null;
    const masterNodeId = (ref) => {
      if (ref?.kind === "master") return ref.nodeId;
      if (ref?.kind !== "edit") return null;
      const record = lookup(editRecordsById, ref.id);
      return lookup(baseHorseNodeIdById, record?.baseHorseId || ref.baseHorseId);
    };
    const identityKey = (ref) => {
      if (ref?.kind === "master" && ref.nodeId) return "master:" + ref.nodeId;
      if ((ref?.kind === "custom" || ref?.kind === "edit") && ref.id) {
        return ref.kind + ":" + ref.id;
      }
      return null;
    };
    const crossHorseKey = (ref) => {
      if (ref?.kind === "custom") return identityKey(ref);
      const node = nodeTable?.getNode(masterNodeId(ref));
      return node ? "pedigree:" + node.pedigreeId : null;
    };
    const parentComparisonKey = (ref) => {
      if (ref?.kind === "custom" || ref?.kind === "edit") return identityKey(ref);
      if (ref?.kind === "masterPedigree") {
        return nodeTable?.getPedigree(ref.pedigreeId)
          ? "master-base:" + ref.pedigreeId : null;
      }
      if (ref?.kind !== "master") return null;
      const node = nodeTable?.getNode(ref.nodeId);
      if (!node) return null;
      return node.subname == null || node.subname === "" || /^[0-9]+$/.test(node.subname)
        ? "master-base:" + node.pedigreeId
        : "master-variant:" + ref.nodeId;
    };
    const parentsOf = (ref) => {
      if (ref?.kind === "custom") {
        const record = lookup(customRecordsById, ref.id);
        if (!record?.fatherRef && !record?.motherRef) return null;
        return { father: record.fatherRef ?? null, mother: record.motherRef ?? null };
      }
      const nodeId = masterNodeId(ref);
      if (!nodeTable?.getNode(nodeId)) return null;
      const parents = nodeTable.parentsOf(nodeId);
      // 親は pedigree ID から直接比較する。canonical variant を経由しない。
      const parentRef = (pedigreeId) => pedigreeId
        ? { kind: "masterPedigree", pedigreeId } : null;
      return { father: parentRef(parents.father), mother: parentRef(parents.mother) };
    };
    const sameKnownKey = (keyOf, a, b) => {
      const key = keyOf(a);
      return key !== null && key === keyOf(b);
    };
    return Object.freeze({
      identityKey,
      crossHorseKey,
      parentComparisonKey,
      parentsOf,
      sameCrossHorse: (a, b) => sameKnownKey(crossHorseKey, a, b),
      sameKnownParent: (a, b) => sameKnownKey(parentComparisonKey, a, b),
    });
  }

  window.Dabimas.logic.pedigree.createIdentityRef = createIdentityRef;
  window.Dabimas.logic.pedigree.buildIdentityResolver = buildIdentityResolver;
})(window);
