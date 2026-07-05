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
