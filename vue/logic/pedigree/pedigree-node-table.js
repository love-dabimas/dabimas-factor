/**
 * pedigreeNodes.json の圧縮配列を、血統判定から参照できる索引へ変換する。
 * この段階では判定ロジックへ接続せず、ID と親情報の問い合わせだけを提供する。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.pedigree = window.Dabimas.logic.pedigree || {};

  function buildFieldIndexes(fields, requiredFields, label) {
    if (!Array.isArray(fields)) {
      throw new Error(label + " fields are missing");
    }
    const indexes = {};
    requiredFields.forEach((field) => {
      const index = fields.indexOf(field);
      if (index < 0) {
        throw new Error(label + " field is missing: " + field);
      }
      indexes[field] = index;
    });
    return indexes;
  }

  function buildNodeTable(json) {
    if (!json || !json.pedigrees || !json.nodes) {
      throw new Error("pedigree nodes data is invalid");
    }

    const pedigreeIndexes = buildFieldIndexes(
      json.pedigreeFields,
      ["name", "father", "mother", "kiseki", "sireLineBaseId"],
      "pedigree"
    );
    const nodeIndexes = buildFieldIndexes(
      json.nodeFields,
      ["pedigreeId", "subname", "effects"],
      "node"
    );
    const pedigrees = new Map();
    const nodes = new Map();
    const variantsByPedigree = new Map();
    const pedigreeIdsByName = new Map();

    Object.keys(json.pedigrees).forEach((pedigreeId) => {
      const values = json.pedigrees[pedigreeId];
      if (!Array.isArray(values)) {
        throw new Error("pedigree row is invalid: " + pedigreeId);
      }
      const pedigree = Object.freeze({
        name: values[pedigreeIndexes.name],
        father: values[pedigreeIndexes.father],
        mother: values[pedigreeIndexes.mother],
        kiseki: values[pedigreeIndexes.kiseki],
        sireLineBaseId: values[pedigreeIndexes.sireLineBaseId],
      });
      pedigrees.set(pedigreeId, pedigree);
      const ids = pedigreeIdsByName.get(pedigree.name) || [];
      ids.push(pedigreeId);
      pedigreeIdsByName.set(pedigree.name, ids);
    });

    Object.keys(json.nodes).forEach((nodeId) => {
      const values = json.nodes[nodeId];
      if (!Array.isArray(values)) {
        throw new Error("node row is invalid: " + nodeId);
      }
      // pedigreeId は nodeId から分解せず、nodeFields が指す値をそのまま使う。
      const pedigreeId = values[nodeIndexes.pedigreeId];
      const node = Object.freeze({
        pedigreeId,
        subname: values[nodeIndexes.subname],
        effects: values[nodeIndexes.effects],
      });
      nodes.set(nodeId, node);
      const variants = variantsByPedigree.get(pedigreeId) || [];
      variants.push(nodeId);
      variantsByPedigree.set(pedigreeId, variants);
    });

    variantsByPedigree.forEach((variants) => variants.sort());

    return Object.freeze({
      datasetVersion: json.datasetVersion,
      getNode(nodeId) {
        return nodes.get(nodeId) || null;
      },
      getPedigree(pedigreeId) {
        return pedigrees.get(pedigreeId) || null;
      },
      parentsOf(nodeId) {
        const node = nodes.get(nodeId);
        const pedigree = node ? pedigrees.get(node.pedigreeId) : null;
        return {
          father: pedigree ? pedigree.father : null,
          mother: pedigree ? pedigree.mother : null,
        };
      },
      variantsOf(pedigreeId) {
        return (variantsByPedigree.get(pedigreeId) || []).slice();
      },
      findByName(name) {
        const result = [];
        (pedigreeIdsByName.get(name) || []).forEach((pedigreeId) => {
          result.push(...(variantsByPedigree.get(pedigreeId) || []));
        });
        return result.sort();
      },
    });
  }

  window.Dabimas.logic.pedigree.buildNodeTable = buildNodeTable;
})(window);
