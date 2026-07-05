/**
 * @file InventoryChangesExport/03_SheetWriter.シート書き込み.gs
 * @description Google Spreadsheetの「入力」シートからの商品コード読み込み、
 * および「前後比較」シートへのデータ書き込み処理を担当するモジュール。
 * 
 * スクリプトプロパティ `TARGET_SPREADSHEET_ID` で指定されたスプレッドシートに対して処理を行います。
 * また、入力元および出力先のシート（タブ）名はスクリプトプロパティから動的に変更可能です。
 * シートが存在しない、またはヘッダーが不足している場合は、自動的にヘッダーを書き込み、
 * 見栄えを整えるためのスタイリング（背景色・文字色・太字・中央揃え）を自動適用します。
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
 * 空文字、空行を排除して取得します。
 * シートが空の場合、自動的に1行目に「商品コード」ヘッダーを書き込み、オレンジ色で装飾します。
 * 
 * @return {string[]} 商品コード의配列
 * @throws {Error} スプレッドシートまたは入力シートが存在しない場合
 */
function getItemCodesFromInputSheet_() {
  const ss = getTargetSpreadsheet_();
  const sheetName = getInputSheetName_();
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    throw new Error("入力元シート '" + sheetName + "' が見つかりません。");
  }
  
  let lastRow = sheet.getLastRow();
  
  // シートが完全に空、またはヘッダー行がない場合
  if (lastRow === 0) {
    sheet.getRange(1, 1).setValue("商品コード")
      .setBackground('#e67e22')           // オレンジ系(温かみのある色)
      .setFontColor('#ffffff')            // 白文字
      .setFontWeight('bold')              // 太字
      .setHorizontalAlignment('center');  // 中央揃え
    console.log("入力シート '" + sheetName + "' にヘッダー「商品コード」を自動設定・装飾しました。");
    return [];
  }
  
  if (lastRow < 2) {
    // 1行目にヘッダーがあるが、2行目以降にデータが無い場合
    return [];
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
 * 1行目のヘッダーが存在しない場合は、自動的にヘッダーを書き込み、
 * 背景色や文字色などの装飾を適用して視認性を高めます。
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
  
  // 1. ヘッダー行（1行目）の確認と自動書き込み
  const headers = ["商品コード", "記録日時", "在庫数", "在庫数_前回", "在庫数差分", "フリー在庫数", "フリー在庫数_前回", "フリー在庫数差分"];
  const lastRow = sheet.getLastRow();
  
  let needsHeaderWrite = false;
  if (lastRow === 0) {
    needsHeaderWrite = true;
  } else {
    // 1行目のセルの値を取得してチェック
    const firstRowValues = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const isFirstRowEmpty = firstRowValues.every(function(val) {
      return val === "" || val === null || val === undefined;
    });
    if (isFirstRowEmpty) {
      needsHeaderWrite = true;
    }
  }
  
  if (needsHeaderWrite) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    console.log("出力先シート '" + sheetName + "' にヘッダーを自動設定しました。");
  }
  
  // 毎回、ヘッダーに装飾（スタイリング）を適用・復元して見栄えを整える
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#e67e22')           // オレンジ系(温かみのある色)
    .setFontColor('#ffffff')            // 白文字
    .setFontWeight('bold')              // 太字
    .setHorizontalAlignment('center');  // 中央揃え
  
  // 2. 既存のデータ範囲をクリア（2行目以降すべてクリア、ヘッダーは残す）
  const currentLastRow = sheet.getLastRow();
  if (currentLastRow >= 2) {
    sheet.getRange(2, 1, currentLastRow - 1, headers.length).clearContent();
  }
  
  if (!data || data.length === 0) {
    console.log("書き込むデータがありません。クリア処理のみ実行しました。");
    return;
  }
  
  // 3. データを書き込み用の2次元配列に変換
  const outputValues = data.map(function(row) {
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
  
  // 4. 一括書き込み (案A方式)
  const startRow = 2;
  const startCol = 1;
  const numRows = outputValues.length;
  const numCols = headers.length;
  
  sheet.getRange(startRow, startCol, numRows, numCols).setValues(outputValues);
  console.log("シート '" + sheetName + "' に " + numRows + " 件のデータを書き込みました。");
}