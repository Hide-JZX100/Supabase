/**
 * 対象のスプレッドシートオブジェクトを取得する
 * スクリプトプロパティ `TARGET_SPREADSHEET_ID` から取得し、未設定の場合はアクティブなスプレッドシートを返します。
 * 
 * @return {GoogleAppsScript.Spreadsheet.Spreadsheet} スプレッドシートオブジェクト
 * @private
 */
function getTargetSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty("TARGET_SPREADSHEET_ID");

  if (spreadsheetId) {
    try {
      return SpreadsheetApp.openById(spreadsheetId);
    } catch (error) {
      throw new Error("スプレッドシートの取得に失敗しました (ID: " + spreadsheetId + "): " + error.toString());
    }
  }

  // フォールバックとしてアクティブなスプレッドシートを使用
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * スクリプトプロパティから入力元のシート名を取得する（デフォルト: "入力"）
 * 
 * @return {string} 入力元シート名
 * @private
 */
function getInputSheetName_() {
  const properties = PropertiesService.getScriptProperties();
  return properties.getProperty("INPUT_SHEET_NAME") || "入力";
}

/**
 * スクリプトプロパティから出力先のシート名を取得する（デフォルト: "前後比較"）
 * 
 * @return {string} 出力先シート名
 * @private
 */
function getOutputSheetName_() {
  const properties = PropertiesService.getScriptProperties();
  return properties.getProperty("OUTPUT_SHEET_NAME") || "前後比較";
}

/**
 * シート「入力」から商品コードの配列を取得する。
 * 空文字、空行、および重複（必要であれば）を排除して取得します。
 * 
 * @return {string[]} 商品コードの配列
 * @throws {Error} スプレッドシートまたは入力シートが存在しない場合
 */
function getItemCodesFromInputSheet_() {
  const ss = getTargetSpreadsheet_();
  const sheetName = getInputSheetName_();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error("入力元シート '" + sheetName + "' が見つかりません。");
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return []; // データ行がない場合
  }

  // A列（2行目〜最終行）の値を取得
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const itemCodes = [];

  for (let i = 0; i < values.length; i++) {
    const code = values[i][0];
    if (code !== null && code !== undefined) {
      const trimmedCode = String(code).trim();
      if (trimmedCode !== "") {
        itemCodes.push(trimmedCode);
      }
    }
  }

  return itemCodes;
}

