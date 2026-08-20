/**
 * このコンポーネントの役割ではなく、このファイルの役割:
 * - 選ばれた馬（descendants 15件が確定済み）から、血統表16行ぶんの
 *   「並べ替え済みデータ（retDataForPedigree）」を作る（setDataForPedigree）。
 * - そのデータをどのセルに詰めるかの巡回順（キュー）を作る（getCellIdQue）。
 * - 表示用の小さな純粋関数（isEven・replaceHalfToFull・全兄弟データの検索）。
 *
 * このファイルに置かない処理:
 * - Vue state（selected・factorName・styleFactorClasses 等）への $set。
 *   それは root app 側の setPedigree が担当する。
 * - detail（descendants）の fetch / cache。JSON 分割ロードの通信都合のため
 *   root app 側（ensureHorseDetail・fetchHorseDetailChunk）に残す
 *   （docs/json-split-initial-load-design.md 参照）。
 *
 * 分けている理由:
 * - setDataForPedigree は「descendants が確定済みの馬」を入力として
 *   「並べ替え済みデータ」を返すだけの変換処理で、Vue のインスタンスに
 *   依存しない。root app から切り離すことで、単体で入出力を確認できる。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.logic = window.Dabimas.logic || {};
  window.Dabimas.logic.pedigree = window.Dabimas.logic.pedigree || {};

  // crypto.randomUUID() は secure context（HTTPS / localhost）でしか使えない。
  // LAN IPへの素のHTTPアクセス（実機テスト等）では crypto.randomUUID が
  // 存在せず即例外になるため、getRandomValues（secure context不要）ベースの
  // フォールバックを用意する。
    function generateUuid() {
      if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
      ) {
        return crypto.randomUUID();
      }
      if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
        return (
          hex.slice(0, 4).join("") +
          "-" +
          hex.slice(4, 6).join("") +
          "-" +
          hex.slice(6, 8).join("") +
          "-" +
          hex.slice(8, 10).join("") +
          "-" +
          hex.slice(10, 16).join("")
        );
      }
      // 最終手段（crypto自体が無い極めて古い環境向け）
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }

  // Keyに該当する項目を取得する
        function getValueByKey(data, name) {
          return data.filter(obj => obj.key === name).map(obj => obj.bros);
        }

  //血統表に埋めるために配列を入れ替える
  // horseData: descendants(先祖15件)が確定済みの馬。onChangeMain が ensureHorseDetail で
  // 補完済みのものを渡す想定（未確定なら呼び出し前に呼び出し側で弾く）。
  // brosData: 全兄弟・全姉妹検索用データ（root app の this.brosData をそのまま渡す）。
        function setDataForPedigree(sex, id, horseData, brosData) {
          const retDataForPedigree = Array.from(new Array(16).fill(null));

          if (horseData) {
            // detail（先祖 15 件）が確定していることを前提にする（指摘 F）。
            // onChangeMain が ensureHorseDetail で補完済みのはずだが、念のため防御する。
            if (
              !Array.isArray(horseData.descendants) ||
              horseData.descendants.length !== 15
            ) {
              throw new Error("Horse detail is not loaded.");
            }
            let bros;
            const myId = generateUuid();
            // リストで選択した性別（種牡馬 or 繁殖牝馬）をセット
            // 空以外を選択した場合
            if (horseData.sex === "0" || (horseData.sex === "1" && id === 0)) {
              //牡馬を選択した場合 か 牝馬でも赤いところで牝馬を選択した場合
              // 0番目はデータそのものをセットする
              // retDataForPedigree[0] = {
              //   ...horseData,
              //   selectedHorse: horseData.name,
              //   uuid: myId,
              // };
              bros = getValueByKey(brosData, horseData.name);
              retDataForPedigree[0] = {
                ...horseData,
                selectedHorse: horseData.name,
                uuid: myId,
                selfSelected: true,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: null,
              };

              // 0番目以降は祖全データ＋使用不可フラグを設定（因子配列も念のためコピー）。
              // subName は spread した祖先データの値をそのまま活かす。DB馬の祖先は
              // subName が空なので従来どおりだが、☆保存馬・エディット種牡馬を祖先に
              // 持つ場合はその因名（例「神速」）を保持して表示する。
              bros = getValueByKey(brosData, horseData.descendants[0].name);
              retDataForPedigree[1] = {
                ...horseData.descendants[0],
                factors: [...horseData.descendants[0].factors],
                disabled: true,
                selectedHorse:
                  horseData.sex === "0"
                    ? horseData.name
                    : horseData.descendants[0].name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: horseData.name,
              };

              bros = getValueByKey(brosData, horseData.descendants[1].name);
              retDataForPedigree[2] = {
                ...horseData.descendants[1],
                factors: [...horseData.descendants[1].factors],
                disabled: true,
                selectedHorse:
                  horseData.sex === "0"
                    ? horseData.name
                    : horseData.descendants[0].name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: horseData.descendants[0].name,
              };

              bros = getValueByKey(brosData, horseData.descendants[8].name);
              retDataForPedigree[3] = {
                ...horseData.descendants[8],
                factors: [...horseData.descendants[8].factors],
                disabled: true,
                selectedHorse:
                  horseData.sex === "0"
                    ? horseData.name
                    : horseData.descendants[8].name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: null,
              };

              bros = getValueByKey(brosData, horseData.descendants[2].name);
              retDataForPedigree[4] = {
                ...horseData.descendants[2],
                factors: [...horseData.descendants[2].factors],
                disabled: true,
                selectedHorse:
                  horseData.sex === "0"
                    ? horseData.name
                    : horseData.descendants[0].name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: horseData.descendants[1].name,
              };

              bros = getValueByKey(brosData, horseData.descendants[5].name);
              retDataForPedigree[5] = {
                ...horseData.descendants[5],
                factors: [...horseData.descendants[5].factors],
                disabled: true,
                selectedHorse:
                  horseData.sex === "0"
                    ? horseData.name
                    : horseData.descendants[0].name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: null,
              };

              bros = getValueByKey(brosData, horseData.descendants[9].name);
              retDataForPedigree[6] = {
                ...horseData.descendants[9],
                factors: [...horseData.descendants[9].factors],
                disabled: true,
                selectedHorse:
                  horseData.sex === "0"
                    ? horseData.name
                    : horseData.descendants[8].name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: horseData.descendants[8].name,
              };

              bros = getValueByKey(brosData, horseData.descendants[12].name);
              retDataForPedigree[7] = {
                ...horseData.descendants[12],
                factors: [...horseData.descendants[12].factors],
                disabled: true,
                selectedHorse:
                  horseData.sex === "0"
                    ? horseData.name
                    : horseData.descendants[12].name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: null,
              };

              bros = getValueByKey(brosData, horseData.descendants[3].name);
              retDataForPedigree[8] = {
                ...horseData.descendants[3],
                factors: [...horseData.descendants[3].factors],
                disabled: true,
                selectedHorse:
                  horseData.sex === "0"
                    ? horseData.name
                    : horseData.descendants[0].name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: horseData.descendants[2].name,
              };

              bros = getValueByKey(brosData, horseData.descendants[4].name);
              retDataForPedigree[9] = {
                ...horseData.descendants[4],
                factors: [...horseData.descendants[4].factors],
                disabled: true,
                selectedHorse:
                  horseData.sex === "0"
                    ? horseData.name
                    : horseData.descendants[0].name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: null,
              };

              bros = getValueByKey(brosData, horseData.descendants[6].name);
              retDataForPedigree[10] = {
                ...horseData.descendants[6],
                factors: [...horseData.descendants[6].factors],
                disabled: true,
                selectedHorse:
                  horseData.sex === "0"
                    ? horseData.name
                    : horseData.descendants[0].name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: horseData.descendants[5].name,
              };

              bros = getValueByKey(brosData, horseData.descendants[7].name);
              retDataForPedigree[11] = {
                ...horseData.descendants[7],
                factors: [...horseData.descendants[7].factors],
                disabled: true,
                selectedHorse:
                  horseData.sex === "0"
                    ? horseData.name
                    : horseData.descendants[0].name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: null,
              };

              bros = getValueByKey(brosData, horseData.descendants[10].name);
              retDataForPedigree[12] = {
                ...horseData.descendants[10],
                factors: [...horseData.descendants[10].factors],
                disabled: true,
                selectedHorse:
                  horseData.sex === "0"
                    ? horseData.name
                    : horseData.descendants[8].name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: horseData.descendants[9].name,
              };

              bros = getValueByKey(brosData, horseData.descendants[11].name);
              retDataForPedigree[13] = {
                ...horseData.descendants[11],
                factors: [...horseData.descendants[11].factors],
                disabled: true,
                selectedHorse:
                  horseData.sex === "0"
                    ? horseData.name
                    : horseData.descendants[8].name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: null,
              };

              bros = getValueByKey(brosData, horseData.descendants[13].name);
              retDataForPedigree[14] = {
                ...horseData.descendants[13],
                factors: [...horseData.descendants[13].factors],
                disabled: true,
                selectedHorse:
                  horseData.sex === "0"
                    ? horseData.name
                    : horseData.descendants[12].name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: horseData.descendants[12].name,
              };

              bros = getValueByKey(brosData, horseData.descendants[14].name);
              retDataForPedigree[15] = {
                ...horseData.descendants[14],
                factors: [...horseData.descendants[14].factors],
                disabled: true,
                selectedHorse:
                  horseData.sex === "0"
                    ? horseData.name
                    : horseData.descendants[14].name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: null,
              };
            } else {
              //牝馬を選択した場合
              brosHead = getValueByKey(brosData, horseData.name);
              bros = getValueByKey(brosData, horseData.descendants[0].name);
              retDataForPedigree[0] = {
                ...horseData.descendants[0],
                subName: `(${horseData.name})`,
                factors: [...horseData.descendants[0].factors],
                disabled: true,
                selectedHorse:
                  brosHead.length != 0
                    ? brosHead[0].fullBrothers[0]
                    : horseData.name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  brosHead.length != 0
                    ? brosHead[0].fullBrothers
                    : ["",""],
                fullSisters:
                  brosHead.length != 0
                    ? brosHead[0].fullSisters
                    : ["",""],
                childName:
                  brosHead.length != 0
                    ? brosHead[0].fullBrothers[0]
                    : null,
              };

              bros = getValueByKey(brosData, horseData.descendants[1].name);
              retDataForPedigree[1] = {
                ...horseData.descendants[1],
                subName: `(${horseData.name})`,
                factors: [...horseData.descendants[1].factors],
                disabled: true,
                selectedHorse:
                  brosHead.length != 0
                    ? brosHead[0].fullBrothers[0]
                    : horseData.name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: horseData.descendants[0].name,
              };

              bros = getValueByKey(brosData, horseData.descendants[8].name);
              retDataForPedigree[2] = {
                ...horseData.descendants[8],
                subName: `(${horseData.name})`,
                factors: [...horseData.descendants[8].factors],
                disabled: true,
                selectedHorse:
                  brosHead.length != 0
                    ? brosHead[0].fullBrothers[0]
                    : horseData.name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: null
              };

              bros = getValueByKey(brosData, horseData.descendants[2].name);
              retDataForPedigree[3] = {
                ...horseData.descendants[2],
                subName: `(${horseData.name})`,
                factors: [...horseData.descendants[2].factors],
                disabled: true,
                selectedHorse:
                  brosHead.length != 0
                    ? brosHead[0].fullBrothers[0]
                    : horseData.name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: horseData.descendants[1].name,
              };

              bros = getValueByKey(brosData, horseData.descendants[5].name);
              retDataForPedigree[4] = {
                ...horseData.descendants[5],
                subName: `(${horseData.name})`,
                factors: [...horseData.descendants[5].factors],
                disabled: true,
                selectedHorse:
                  brosHead.length != 0
                    ? brosHead[0].fullBrothers[0]
                    : horseData.name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: null,
              };

              bros = getValueByKey(brosData, horseData.descendants[9].name);
              retDataForPedigree[5] = {
                ...horseData.descendants[9],
                subName: `(${horseData.name})`,
                factors: [...horseData.descendants[9].factors],
                disabled: true,
                selectedHorse:
                  brosHead.length != 0
                    ? brosHead[0].fullBrothers[0]
                    : horseData.name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: horseData.descendants[8].name,
              };

              bros = getValueByKey(brosData, horseData.descendants[12].name);
              retDataForPedigree[6] = {
                ...horseData.descendants[12],
                subName: `(${horseData.name})`,
                factors: [...horseData.descendants[12].factors],
                disabled: true,
                selectedHorse:
                  brosHead.length != 0
                    ? brosHead[0].fullBrothers[0]
                    : horseData.name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: null,
              };

              bros = getValueByKey(brosData, horseData.descendants[3].name);
              retDataForPedigree[7] = {
                ...horseData.descendants[3],
                subName: `(${horseData.name})`,
                factors: [...horseData.descendants[3].factors],
                disabled: true,
                selectedHorse:
                  brosHead.length != 0
                    ? brosHead[0].fullBrothers[0]
                    : horseData.name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: horseData.descendants[2].name,
              };

              bros = getValueByKey(brosData, horseData.descendants[4].name);
              retDataForPedigree[8] = {
                ...horseData.descendants[4],
                subName: `(${horseData.name})`,
                factors: [...horseData.descendants[4].factors],
                disabled: true,
                selectedHorse:
                  brosHead.length != 0
                    ? brosHead[0].fullBrothers[0]
                    : horseData.name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: null,
              };

              bros = getValueByKey(brosData, horseData.descendants[6].name);
              retDataForPedigree[9] = {
                ...horseData.descendants[6],
                subName: `(${horseData.name})`,
                factors: [...horseData.descendants[6].factors],
                disabled: true,
                selectedHorse:
                  brosHead.length != 0
                    ? brosHead[0].fullBrothers[0]
                    : horseData.name,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: horseData.descendants[5].name,
              };

              bros = getValueByKey(brosData, horseData.descendants[7].name);
              retDataForPedigree[10] = {
                ...horseData.descendants[7],
                subName: `(${horseData.name})`,
                factors: [...horseData.descendants[7].factors],
                disabled: true,
                selectedHorse:
                  brosHead.length != 0
                    ? brosHead[0].fullBrothers[0]
                    : horseData.name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: null,
              };

              bros = getValueByKey(brosData, horseData.descendants[10].name);
              retDataForPedigree[11] = {
                ...horseData.descendants[10],
                subName: `(${horseData.name})`,
                factors: [...horseData.descendants[10].factors],
                disabled: true,
                selectedHorse:
                  brosHead.length != 0
                    ? brosHead[0].fullBrothers[0]
                    : horseData.name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: null,
              };

              bros = getValueByKey(brosData, horseData.descendants[11].name);
              retDataForPedigree[12] = {
                ...horseData.descendants[11],
                subName: `(${horseData.name})`,
                factors: [...horseData.descendants[11].factors],
                disabled: true,
                selectedHorse:
                  brosHead.length != 0
                    ? brosHead[0].fullBrothers[0]
                    : horseData.name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: null
              };

              bros = getValueByKey(brosData, horseData.descendants[13].name);
              retDataForPedigree[13] = {
                ...horseData.descendants[13],
                subName: `(${horseData.name})`,
                factors: [...horseData.descendants[13].factors],
                disabled: true,
                selectedHorse:
                  brosHead.length != 0
                    ? brosHead[0].fullBrothers[0]
                    : horseData.name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: horseData.descendants[12].name,
              };

              bros = getValueByKey(brosData, horseData.descendants[14].name);
              retDataForPedigree[14] = {
                ...horseData.descendants[14],
                subName: `(${horseData.name})`,
                factors: [...horseData.descendants[14].factors],
                disabled: true,
                selectedHorse:
                  brosHead.length != 0
                    ? brosHead[0].fullBrothers[0]
                    : horseData.name,
                uuid: myId,
                selfSelected: false,
                fullBrothers:
                  bros.length != 0
                    ? bros[0].fullBrothers
                    : ["",""],
                fullSisters:
                  bros.length != 0
                    ? bros[0].fullSisters
                    : ["",""],
                childName: null
              };
              retDataForPedigree[15] = "broodmares";
            }
          }
          // subName を必ず文字列へ正規化する。DB馬の祖先は subName キーを持たず
          // undefined になり、getCellIdQue 等の subName.substring(...) が落ちるため
          // （従来は各セルで subName:"" と上書きして防いでいた）。ここで一括して
          // undefined→"" にすることで、☆保存馬・エディット種牡馬の因名（例「神速」）
          // は文字列なのでそのまま保持しつつ、DB祖先は "" に揃える。
          // retDataForPedigree[15] は "broodmares" 文字列の番兵になり得るので、
          // オブジェクトのときだけ処理する。
          for (var normIdx = 0; normIdx < retDataForPedigree.length; normIdx++) {
            var normEntry = retDataForPedigree[normIdx];
            if (
              normEntry &&
              typeof normEntry === "object" &&
              typeof normEntry.subName !== "string"
            ) {
              normEntry.subName = "";
            }
          }
          return retDataForPedigree;
        }

  //偶数であることを確認する
  //0は例外でFalseを返す
  //1は例外でTrueを返す
        function isEven(cellNumber) {
          switch (cellNumber) {
            case 0:
              return false;
            case 1:
              return true;
            default:
              return cellNumber % 2 === 0;
          }
        }

  // 半角→全角(英数字)
        function replaceHalfToFull(str) {
          return str.replace(/[!-~]/g, function (s) {
            return String.fromCharCode(s.charCodeAt(0) + 0xfee0);
          });
        }

        function getCellIdQue(cellNo, horseDataList) {
          // 設定するセルの最大値を決める
          var max_cell_id = cellNo;
          while (true) {
            if (max_cell_id * 2 >= 16) {
              max_cell_id = max_cell_id + 1;
              break;
            }

            max_cell_id = max_cell_id * 2 + 1;
            if (max_cell_id * 2 > 16) {
              break;
            }

            // if (Object.keys(horseDataList[15]).length === 0) {
            if (
              horseDataList[15] === "broodmares" ||
              horseDataList[cellNo]?.subName.substring(0, 1) === "("
            ) {
              // 選択したのが繫殖牝馬だった or インブリードしたのが牝馬（赤色のところはのぞく場合）はこっちのルートに入る broodmares
              // 繫殖牝馬だった（赤色のところはのぞく場合）は16番目にNULLを設定しているので
              max_cell_id = (max_cell_id + 1) * 2;
            } else {
              max_cell_id = max_cell_id * 2;
            }
            if (max_cell_id * 2 > 16) {
              break;
            }

            while (true) {
              max_cell_id = max_cell_id * 2;
              if (max_cell_id * 2 > 16) {
                break;
              }
            }
            break;
          }

          //格納するドロップダウンリストの配列作成（初期値は選択したセル）
          var cell_id_que = [cellNo];
          var is_checked = [false];

          var i = 1;
          // 【最適化】indexOfの結果をキャッシュして、毎回の検索を回避
          var index = is_checked.indexOf(false);
          while (index !== -1) {
            is_checked[index] = true;

            if (2 * cell_id_que[index] < max_cell_id) {
              if (
                i === 1 &&
                horseDataList[15] != "broodmares" &&
                horseDataList[cellNo]?.subName.substring(0, 1) != "("
              ) {
                // 初回でかつ 繫殖牝馬だった（赤色のところはのぞく場合）はこちらのルートに
                if (cellNo === 0) {
                  // 0のときだけ例外
                  cell_id_que.push(1);
                } else {
                  cell_id_que.push(2 * cell_id_que[index]);
                }
                is_checked.push(false);
              } else {
                cell_id_que.push(2 * cell_id_que[index]);
                cell_id_que.push(2 * cell_id_que[index] + 1);
                is_checked.push(false);
                is_checked.push(false);
              }
              i++;
            }
            // 【最適化】次のfalseを検索
            index = is_checked.indexOf(false);
          }

          return cell_id_que;
        }

  window.Dabimas.logic.pedigree.generateUuid = generateUuid;
  window.Dabimas.logic.pedigree.getValueByKey = getValueByKey;
  window.Dabimas.logic.pedigree.setDataForPedigree = setDataForPedigree;
  window.Dabimas.logic.pedigree.isEven = isEven;
  window.Dabimas.logic.pedigree.replaceHalfToFull = replaceHalfToFull;
  window.Dabimas.logic.pedigree.getCellIdQue = getCellIdQue;
})(window);
