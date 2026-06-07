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

