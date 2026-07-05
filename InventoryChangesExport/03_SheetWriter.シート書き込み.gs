/**
 * @file InventoryChangesExport/03_SheetWriter.シート書き込み.gs
 * @description Google Spreadsheetの「入力」シートからの商品コード読み込み、
 * および「前後比較」シートへのデータ書き込み処理を担当するモジュール。
 * 
 * スクリプトプロパティ `TARGET_SPREADSHEET_ID` で指定されたスプレッドシートに対して処理を行います。
 * また、入力元および出力先のシート（タブ）名はスクリプトプロパティから動的に変更可能です。
 */
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

/**
 * 取得した在庫履歴データをシート「前後比較」へ一括書き込みする。
 * 実行するたびに既存のデータ（2行目以降）をクリアしてから書き込みを行います。
 * 
 * @param {Object[]} data - Supabase RPCから取得したレコード配列
 * @throws {Error} スプレッドシートまたは出力先シートが存在しない場合
 */
function writeInventoryChangesToSheet_(data) {
  const ss = getTargetSpreadsheet_();
  const sheetName = getOutputSheetName_();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error("出力先シート '" + sheetName + "' が見つかりません。");
  }

  // 1. 既存のデータ範囲をクリア（2行目以降すべてクリア、ヘッダーは残す）
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, 8).clearContent();
  }

  if (!data || data.length === 0) {
    console.log("書き込むデータがありません。クリア処理のみ実行しました。");
    return;
  }

  // 2. データを書き込み用の2次元配列に変換
  // 列定義：
  // A: 商品コード (item_code)
  // B: 記録日時 (occurrence_at -> JST)
  // C: 在庫数 (current_quantity)
  // D: 在庫数_前回 (prev_quantity)
  // E: 在庫数差分 (diff_quantity)
  // F: フリー在庫数 (current_free_quantity)
  // G: フリー在庫数_前回 (prev_free_quantity)
  // H: フリー在庫数差分 (diff_free_quantity)
  const outputValues = data.map(function (row) {
    let formattedDate = "";
    if (row.occurrence_at) {
      try {
        const utcDate = new Date(row.occurrence_at);
        formattedDate = Utilities.formatDate(utcDate, "JST", "yyyy/MM/dd HH:mm:ss");
      } catch (e) {
        console.warn("日時の変換に失敗しました: " + row.occurrence_at + " | エラー: " + e.toString());
        formattedDate = row.occurrence_at; // 変換失敗時は生データを使用
      }
    }

    return [
      row.item_code || "",
      formattedDate,
      row.current_quantity !== null && row.current_quantity !== undefined ? row.current_quantity : "",
      row.prev_quantity !== null && row.prev_quantity !== undefined ? row.prev_quantity : "",
      row.diff_quantity !== null && row.diff_quantity !== undefined ? row.diff_quantity : "",
      row.current_free_quantity !== null && row.current_free_quantity !== undefined ? row.current_free_quantity : "",
      row.prev_free_quantity !== null && row.prev_free_quantity !== undefined ? row.prev_free_quantity : "",
      row.diff_free_quantity !== null && row.diff_free_quantity !== undefined ? row.diff_free_quantity : ""
    ];
  });

  // 3. 一括書き込み (案A方式)
  const startRow = 2;
  const startCol = 1;
  const numRows = outputValues.length;
  const numCols = 8;

  sheet.getRange(startRow, startCol, numRows, numCols).setValues(outputValues);
  console.log("シート '" + sheetName + "' に " + numRows + " 件のデータを書き込みました。");
}