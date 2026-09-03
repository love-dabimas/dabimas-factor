/**
 * このファイルの役割:
 * - root app の data() が返す初期状態オブジェクトを1つだけ作る
 *   （window.Dabimas.app.createInitialState）。
 * - INDEX_GENERATION_ASSIGNMENTS（32行の世代割り当て配列）をここで
 *   再宣言し、初期状態オブジェクトの中で使う。
 *
 * このファイルに置かない処理:
 * - rowConfigs / rowConfigsBloodmare（created() で Object.freeze 代入する
 *   非リアクティブプロパティ）。horses / siblingGroups 等、実行時に
 *   this へ直接代入される非リアクティブプロパティも同様にここへは
 *   追加しない（docs/index-split-completion-plan.md §2.4 参照。
 *   リアクティブ化コストが増え、挙動も変わり得るため）。
 *
 * 分けている理由:
 * - index.html の new Vue({...}) に全部書くと変更箇所が広がるため、
 *   初期状態の定義だけをまとめて見えるようにする
 *   （docs/index-split-completion-plan.md Phase 4-8）。
 */
(function (window) {
  window.Dabimas = window.Dabimas || {};
  window.Dabimas.app = window.Dabimas.app || {};

  // index.html のモジュールスコープにあった定数を同名で再宣言する。
  // これによりオブジェクト本体を1文字も変えずに移動できる（逐語移動原則）。
  var INDEX_GENERATION_ASSIGNMENTS = window.Dabimas.constants.pedigreeIndexes.INDEX_GENERATION_ASSIGNMENTS;

  window.Dabimas.app.createInitialState = function () {
        return {
          // rowConfigs / rowConfigsBloodmare は created() で非リアクティブに設定する
          // （vue/logic/pedigree/row-configs.js、Object.freeze 済み）。
          // ここで data() に書くと Vue 2 が32行分の headCells まで再帰的に
          // reactive化してしまい起動コストが増えるため、あえて宣言しない。
          INDEX_GENERATION_ASSIGNMENTS,
          // "home" | "category" | "settings"。settings は永続化せず、
          // home との間だけで直接切り替える。vue/app/main.js が
          // workspaceSync.boot() の解決を待ってから new Vue(...) するため、
          // ここに来た時点で workspaceSync.resolvedInitialScreen は確定している。
          // workspaceSync 未ロード時（万一）は本体単独動作のフェイルセーフとして
          // "category" とする。
          currentScreen:
            (window.Dabimas.workspaceSync && window.Dabimas.workspaceSync.resolvedInitialScreen) ||
            "category",
          nicksReady: false,
          onNicksReadyHandler: null,
          windowSize: 0,
          // メモの
          inputed: Array.from(new Array(32).fill(null)),
          // メモ種牡馬
          inputedMemoStallion: null,
          // メモ繫殖牝馬
          inputedMemoBroodmare: null,
          dispColor: Array.from(new Array(32).fill("")),
          horseDataLists: [[], [], []],
          factorCd: Array.from(new Array(32), () => new Array(3).fill("00")),
          selected: Array.from(new Array(32).fill(null)),
          // 親系統
          parentLines: Array.from(new Array(32).fill("")),
          // 子系統
          category: Array.from(new Array(32).fill(null)),
          // アプリ全体で共有する子系統カラー設定（appMeta から非同期で復元）。
          sireLineColorSettings: null,
          stallions: [],
          stallionsBase: [],
          broodmares: [],
          broodmaresBase: [],
          theoryOmoshiro: [1, 3, 5, 7],
          theoryMigoto: [9, 11, 13, 15],
          // 全兄弟
          brosData:[],
          // JSON 分割ロード用の状態（summary + detail chunk）
          horseDetailChunks: {},
          horseDetailChunkPromises: {},
          customHorseDetails: {},
          customHorseDb: null,
          savedHorseSummaries: [],
          editStallions: [],
          horseSummaryLoaded: false,
          horseSummaryChunkSize: 128,
          horseDetailTotalChunks: 0,
          horseDetailPreloadStarted: false,
          horseDetailLoadingIndexes: {},
          horseDetailError: { show: false, message: "" },
          // インブリードボタン押下フラグを一次元配列で定義（-1：未クリック　1：クリック　0:使用不可）
          isInbreedButtonClicked: Array.from(new Array(32).fill(0)),
          // styleInbreedButtonClasses（インブリードさせるボタン定義）を一次元配列で定義
          styleInbreedButtonClasses: Array.from(new Array(32).fill("")),
          // styleFactorClassesを二次元配列で定義
          styleFactorClasses: Array.from(new Array(32), () =>
            new Array(3).fill("00")
          ),
          // factorNameを二次元配列で定義
          factorName: Array.from(new Array(32), () => new Array(3).fill("")),

          // styleParentLineClassesを一次元配列で定義
          styleParentLineClasses: Array.from(new Array(32).fill("")),
          // 合計因子数表示（走中強雷因子も）
          factorNumtoString: Array.from(new Array(14).fill("00")),
          // インブリードされた因子数表示（走中強雷因子も）
          inbreedFactorNumtoString: Array.from(new Array(14).fill("00")),
          // 子系統数
          categoryNumtoString: "00",

          // 配合理論
          styleThoeryClass: "",
          // 危険な配合（judgeInbreed が返す dangerous）。
          // 配合理論の表示で最優先（theory_08）になる。
          dangerousCombination: false,

          // 工程診断（vue/logic/plan/plan-diagnosis.js）の結果。
          // 画面セッション内だけの派生データで、保存も自動再計算もしない。
          // 選択が変わった結果は snapshotHash の不一致で無効化される（仕様 §13）。
          planDiagnosis: null,
          planDiagnosisRunning: false,
          planDiagnosisPanelVisible: false,

          // リストで選択された性別
          selectedSex: null,

          // 子系統を表示させるフラグ
          dispCategory: 0,
          // ボタン表示名
          dispButtonName: '子系統',

          // インブリードされているところを格納する変数
          inbreedList: Array.from(new Array(32).fill(null)),
          // 同名・全兄妹の組み合わせ一覧
          sameNameGroups: [],
          sameNameSpecialChecks: [],
          sameNameSpecialChecksByIndex: Array.from(new Array(32).fill(false)),
          reload: 0,
          size: {},
          combinationDialogVisible: false,
          inbreedLogTimer: null,
          deferInbreedCount: false,
          deferredInbreedCountRequested: false,
          // インブリード例外ルール
          inbreedExceptions: [],
          isCapturingScreenshot: false,
          html2CanvasLoadPromise: null,
          lockedMobileAppHeight: null,
          mobileRowHeight: 18,
          onOrientationChangeHandler: null,
          onViewportGeometryChangeHandler: null,
          mobileViewportGeometryTimerId: null,
          mobileViewportLockTimerIds: []
        };
      };
})(window);
