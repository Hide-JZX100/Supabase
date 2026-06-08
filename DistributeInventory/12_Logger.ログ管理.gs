/**
 * @file 12_Logger.ログ管理.gs
 * @description DistributeInventory プロジェクトのログ管理・出力モジュール。
 * システム全体のログ出力を一元管理します。
 * すべてのログ出力はこのファイルの関数を経由することで、
 * ログレベルによる出力制御を統一的に行います。
 *
 * ### 依存関係
 * #### 参照元（このファイルを呼び出すファイル）
 * - 10_Main.gs: メイン処理でのログ出力
 * - 13_SupabaseClient.gs: 接続エラー時のログ出力
 * - 14_SupabaseRepository.gs: 差分取得時のログ出力
 * - 15_SheetRepository.gs: シート書き込み時のログ出力
 *
 * #### 参照先（このファイルが使う定数）
 * - 11_Config.gs: LOG_LEVEL 定数
 *
 * ### ログレベル設定
 * 1. LOG_LEVEL.MINIMAL  (1): 開始・終了・サマリーのみ（本番推奨）
 * 2. LOG_LEVEL.SUMMARY  (2): バッチ集計＋詳細（デフォルト）
 * 3. LOG_LEVEL.DETAILED (3): 全件出力（デバッグ用）
 *
 * @version 1.0
 * @see getCurrentLogLevel
 * @see setLogLevel
 * @see showCurrentLogLevel
 * @see logWithLevel
 * @see logError
 * @see logErrorsToSheet
 */

// ============================================================================
// ログレベル管理
// ============================================================================

/**
 * 現在のログレベルをスクリプトプロパティから取得する
 *
 * 未設定の場合は SUMMARY(2) をデフォルトとしてプロパティに書き込みます。
 *
 * @return {number} 現在のログレベル（1/2/3）
 */
function getCurrentLogLevel() {
  const properties = PropertiesService.getScriptProperties();
  const logLevel = properties.getProperty('LOG_LEVEL');

  if (!logLevel) {
    properties.setProperty('LOG_LEVEL', '2');
    return LOG_LEVEL.SUMMARY;
  }

  return parseInt(logLevel, 10);
}

/**
 * ログレベルを変更してスクリプトプロパティに保存する
 *
 * @param {number} level - 設定するログレベル（1:MINIMAL / 2:SUMMARY / 3:DETAILED）
 * @throws {Error} 無効なログレベルが指定された場合
 */
function setLogLevel(level) {
  if (![1, 2, 3].includes(level)) {
    throw new Error('ログレベルは 1(MINIMAL)、2(SUMMARY)、3(DETAILED) のいずれかを指定してください');
  }

  PropertiesService.getScriptProperties().setProperty('LOG_LEVEL', level.toString());

  const levelName = Object.keys(LOG_LEVEL).find(key => LOG_LEVEL[key] === level);
  console.log('ログレベルを ' + levelName + '(' + level + ') に設定しました');
}

/**
 * 現在のログレベル設定を表示する
 */
function showCurrentLogLevel() {
  const currentLevel = getCurrentLogLevel();
  const levelName = Object.keys(LOG_LEVEL).find(key => LOG_LEVEL[key] === currentLevel);

  console.log('=== 現在のログレベル設定 ===');
  console.log('レベル: ' + levelName + ' (' + currentLevel + ')');
  console.log('');
  console.log('【ログレベルの説明】');
  console.log('1. MINIMAL  : 開始/終了/サマリーのみ（本番運用推奨）');
  console.log('2. SUMMARY  : バッチ集計 + 詳細情報（デフォルト）');
  console.log('3. DETAILED : 全件出力（デバッグ用）');
  console.log('');
  console.log('【変更方法】');
  console.log('setLogLevel(1) // MINIMAL に変更');
  console.log('setLogLevel(2) // SUMMARY に変更');
  console.log('setLogLevel(3) // DETAILED に変更');
}

// ============================================================================
// ログ出力関数
// ============================================================================

/**
 * レベル指定付きログ出力
 *
 * 現在のログレベルが requiredLevel 以上の場合のみ出力します。
 *
 * @param {number} requiredLevel - 出力に必要な最低ログレベル
 * @param {string} message       - ログメッセージ
 * @param {...*}   args          - 追加の引数（省略可）
 */
function logWithLevel(requiredLevel, message, ...args) {
  const currentLevel = getCurrentLogLevel();

  if (currentLevel >= requiredLevel) {
    if (args.length > 0) {
      console.log(message, ...args);
    } else {
      console.log(message);
    }
  }
}

/**
 * エラーログ出力（標準）
 *
 * ログレベルに関わらず常に出力します。
 *
 * @param {string} message - エラーメッセージ
 * @param {...*}   args    - 追加の引数（省略可）
 */
function logError(message, ...args) {
  if (args.length > 0) {
    console.error(message, ...args);
  } else {
    console.error(message);
  }
}

// ============================================================================
// エラーログのスプレッドシート書き込み
// ============================================================================

/**
 * エラーログを指定スプレッドシートの「エラーログ」シートに記録する
 *
 * 書き込み先スプレッドシートごとにエラーを記録します。
 * 「エラーログ」シートが存在しない場合は自動生成してヘッダー行を設定します。
 * 既存のシートがある場合は末尾に追記します。
 *
 * 【処理フロー】
 * 1. spreadsheetId から Spreadsheet を取得
 * 2. 「エラーログ」シートを getSheetByName で取得
 * 3. シートが存在しない場合は insertSheet で作成しヘッダー行を書き込む
 * 4. エラー情報を行データに変換して末尾に追記する
 *
 * @param {string} spreadsheetId  - 書き込み先スプレッドシートID
 * @param {Array}  errorDetails   - エラー情報の配列
 *   各要素: { timestamp: Date, context: string, errorMessage: string }
 * @return {void}
 */
function logErrorsToSheet(spreadsheetId, errorDetails) {
  if (!errorDetails || errorDetails.length === 0) return;

  try {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    let errorSheet = spreadsheet.getSheetByName('エラーログ');

    // エラーログシートが存在しない場合は自動生成してヘッダー行を設定
    if (!errorSheet) {
      errorSheet = spreadsheet.insertSheet('エラーログ');
      const headers = ['発生日時', '処理コンテキスト', 'エラー内容', '記録日時'];
      errorSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      errorSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      errorSheet.getRange(1, 1, 1, headers.length).setBackground('#f3f3f3');
      logWithLevel(LOG_LEVEL.SUMMARY, '「エラーログ」シートを自動生成しました（スプレッドシートID: ' + spreadsheetId + '）');
    }

    const errorRows = errorDetails.map(error => [
      error.timestamp || new Date(),
      error.context || '',
      error.errorMessage || '',
      new Date()
    ]);

    const lastRow = errorSheet.getLastRow();
    const range = errorSheet.getRange(lastRow + 1, 1, errorRows.length, 4);
    range.setValues(errorRows);

    // 日時列のフォーマットを設定
    errorSheet.getRange(lastRow + 1, 1, errorRows.length, 1)
      .setNumberFormat('yyyy/mm/dd hh:mm:ss');
    errorSheet.getRange(lastRow + 1, 4, errorRows.length, 1)
      .setNumberFormat('yyyy/mm/dd hh:mm:ss');

    logWithLevel(LOG_LEVEL.SUMMARY, 'エラーログに ' + errorRows.length + ' 件を記録しました');

  } catch (error) {
    // エラーログ書き込み自体のエラーはコンソールのみ出力（無限ループ防止）
    console.error('エラーログ書き込み中にエラーが発生しました（スプレッドシートID: ' + spreadsheetId + '）:', error.message);
  }
}
