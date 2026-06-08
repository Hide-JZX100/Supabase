/**
 * @file 15_SheetRepository.シート書き込み.gs
 * @description スプレッドシートへのデータ書き込みおよび更新を担当するリポジトリモジュール。
 * 商品コードを行の特定キーとし、値の上書き更新および新規追記を行います。
 *
 * ### 依存関係
 * - **参照元**: 10_Main.エントリーポイント.gs, 99_Tests.テスト.gs
 * - **参照先**: 11_Config.設定管理.gs, 12_Logger.ログ管理.gs
 *
 * @version 1.0 (新規作成)
 */

/**
 * シートのA列（商品コード）を走査し、商品コードを行番号に対応付けるマップを生成する
 *
 * 【処理フロー】
 * 1. シートの最終行を取得する。1行未満（ヘッダーのみ等）の場合は空のMapを返す。
 * 2. 2行目から最終行までのA列（商品コード）の値を取得する。
 * 3. 取得した各セルをループ処理し、キー:「商品コードの文字列」、値:「行番号（2始まり）」として Map に登録する。
 * 4. 生成した Map を返す。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 対象シートオブジェクト
 * @return {Map<string, number>} 商品コードを行番号に対応付けた Map
 */
function buildRowIndexMap(sheet) {
  const lastRow = sheet.getLastRow();
  const map = new Map();
  if (lastRow < 2) return map;

  // A2からA列の末尾まで取得
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    const code = values[i][0];
    if (code !== undefined && code !== null && code !== '') {
      map.set(code.toString(), i + 2); // 行番号は i + 2 (1-indexed & 2行目開始のため)
    }
  }
  return map;
}

/**
 * 差分データを既存シートに上書き更新する。商品コードが存在しない行は末尾に追記する。（メモリ上一括更新版）
 *
 * 【処理フロー】
 * 1. 引数の変更データ配列が空の場合は即座に処理終了。
 * 2. シートの最終行を取得する。
 * 3. 2行目から最終行までの全データ（A列〜M列）を getValues() で取得し、メモリ上に保持する（データがなければ空配列）。
 * 4. 既存データの配列から「商品コード -> 配列インデックス（0始まり）」の Map を作成。
 * 5. 変更データを1件ずつループ処理：
 *    a. レコードデータを 11_Config.gs の列定義（13列）に合わせた配列に変換。
 *    b. Map 内に商品コードが存在するか判定。
 *    c. 存在する場合：メモリ上の該当インデックスの行データを上書き。
 *    d. 存在しない場合：メモリ上の配列の末尾に追記。
 *       追記後、同一実行内での重複追記を防ぐため、Map に追加登録（インデックス: 配列の元の長さ）する。
 * 6. メモリ上の全データをシートの2行目から一括書き込み（setValues()）。
 * 7. 更新日時列（M列）の数値フォーマットを 'yyyy/mm/dd hh:mm:ss' に一括設定。
 * 8. 更新件数と追記件数をログ出力し、結果オブジェクトを返却する。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 対象シートオブジェクト
 * @param {Array<Object>} changedData - Supabaseから取得した差分レコードの配列
 * @return {{updated: number, appended: number}} 更新・追記件数のサマリーオブジェクト
 */
function updateInventoryRows(sheet, changedData) {
  if (!changedData || changedData.length === 0) {
    return { updated: 0, appended: 0 };
  }

  const lastRow = sheet.getLastRow();
  let existingRows = [];

  if (lastRow >= 2) {
    // 2行目から最終行まで一括取得
    existingRows = sheet.getRange(2, 1, lastRow - 1, TOTAL_COLUMNS).getValues();
  }

  // 商品コード -> existingRows のインデックス (0始まり) のマップを作成
  const rowIndexMap = new Map();
  for (let i = 0; i < existingRows.length; i++) {
    const code = existingRows[i][DISTRIBUTE_COLUMNS.GOODS_CODE];
    if (code !== undefined && code !== null && code !== '') {
      rowIndexMap.set(code.toString(), i);
    }
  }

  let updatedCount = 0;
  let appendedCount = 0;

  for (const record of changedData) {
    const goodsCode = record['商品コード'];
    if (goodsCode === undefined || goodsCode === null || goodsCode === '') {
      continue;
    }

    // 13列の行データ配列を作成
    const rowValues = [
      goodsCode.toString(),
      record['商品名'] || '',
      record['在庫数'] || 0,
      record['引当数'] || 0,
      record['フリー在庫数'] || 0,
      record['予約在庫数'] || 0,
      record['予約引当数'] || 0,
      record['予約フリー在庫数'] || 0,
      record['不良在庫数'] || 0,
      record['発注残数'] || 0,
      record['欠品数'] || 0,
      record['JANコード'] || null,
      record['更新日時'] ? new Date(record['更新日時']) : new Date()
    ];

    const goodsCodeStr = goodsCode.toString();
    const arrayIndex = rowIndexMap.get(goodsCodeStr);

    if (arrayIndex !== undefined) {
      // 既存行をメモリ上で上書き
      existingRows[arrayIndex] = rowValues;
      updatedCount++;
    } else {
      // 新規行をメモリ上の配列の末尾に追記
      existingRows.push(rowValues);
      // 同一バッチ内での重複追記を防ぐためMapを更新
      rowIndexMap.set(goodsCodeStr, existingRows.length - 1);
      appendedCount++;
    }
  }

  // メモリ上のデータが存在する場合、一括書き込みを実行
  if (existingRows.length > 0) {
    // 2行目から一括書き込み
    sheet.getRange(2, 1, existingRows.length, TOTAL_COLUMNS).setValues(existingRows);
    // 更新日時列（M列）のフォーマットを一括設定
    sheet.getRange(2, DISTRIBUTE_COLUMNS.UPDATED_AT + 1, existingRows.length, 1)
      .setNumberFormat('yyyy/mm/dd hh:mm:ss');
  }

  logWithLevel(LOG_LEVEL.MINIMAL, 'シート「' + sheet.getName() + '」更新完了 (一括書き込み): 更新 ' + updatedCount + ' 件 / 新規追記 ' + appendedCount + ' 件');
  return { updated: updatedCount, appended: appendedCount };
}

/**
 * スプレッドシートの指定シートを初期化し、全件データを書き込む（初期化専用）
 *
 * 【処理フロー】
 * 1. シート内の既存データ（A〜M列）をクリアする。
 * 2. 1行目にヘッダー行（13列）を設定し、太字かつ背景色（灰色）で装飾する。
 * 3. 引数のデータが空の場合はここで処理を終了する。
 * 4. 全件データ配列を 11_Config.gs の列定義（13列）に沿った2次元配列に整形する。
 * 5. 2行目以降に一括で書き込む（setValues()）。
 * 6. 更新日時列（M列）の数値フォーマットを 'yyyy/mm/dd hh:mm:ss' に設定。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 対象シートオブジェクト
 * @param {Array<Object>} allData - Supabaseから取得した全商品レコードの配列
 * @return {void}
 */
function initializeInventorySheet(sheet, allData) {
  logWithLevel(LOG_LEVEL.MINIMAL, 'シート「' + sheet.getName() + '」の初期化開始: ' + allData.length + ' 件');

  const lastRow = sheet.getLastRow();
  if (lastRow > 0) {
    // A列からM列（TOTAL_COLUMNS = 13）のデータをクリア
    sheet.getRange(1, 1, Math.max(lastRow, 1), TOTAL_COLUMNS).clear({ contentsOnly: true });
  }

  // 1行目にヘッダーを書き込み
  sheet.getRange(1, 1, 1, TOTAL_COLUMNS).setValues([INVENTORY_SHEET_HEADERS]);
  sheet.getRange(1, 1, 1, TOTAL_COLUMNS).setFontWeight('bold');
  sheet.getRange(1, 1, 1, TOTAL_COLUMNS).setBackground('#f3f3f3');

  if (!allData || allData.length === 0) {
    logWithLevel(LOG_LEVEL.MINIMAL, '初期化データが0件のため、ヘッダーのみ作成しました。');
    return;
  }

  // データを2次元配列に変換
  const rows = allData.map(record => {
    return [
      record['商品コード'] ? record['商品コード'].toString() : '',
      record['商品名'] || '',
      record['在庫数'] || 0,
      record['引当数'] || 0,
      record['フリー在庫数'] || 0,
      record['予約在庫数'] || 0,
      record['予約引当数'] || 0,
      record['予約フリー在庫数'] || 0,
      record['不良在庫数'] || 0,
      record['発注残数'] || 0,
      record['欠品数'] || 0,
      record['JANコード'] || null,
      record['更新日時'] ? new Date(record['更新日時']) : new Date()
    ];
  });

  // 2行目から一括書き込み
  sheet.getRange(2, 1, rows.length, TOTAL_COLUMNS).setValues(rows);

  // 更新日時列（M列）のフォーマットを設定
  sheet.getRange(2, DISTRIBUTE_COLUMNS.UPDATED_AT + 1, rows.length, 1)
    .setNumberFormat('yyyy/mm/dd hh:mm:ss');

  logWithLevel(LOG_LEVEL.MINIMAL, 'シート「' + sheet.getName() + '」の初期化完了: ' + rows.length + ' 件書き込み');
}
