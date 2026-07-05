/**
 * @file InventoryChangesExport/02_SupabaseClient.Supabase接続.gs
 * @description Supabase RPC関数 `get_inventory_changes` の呼び出しを実行するモジュール。
 *
 * スクリプトプロパティに設定された接続情報（SUPABASE_URL, SUPABASE_KEY）を使用して、
 * SupabaseのAPIに直接リクエストを送信します。
 */

/**
 * SupabaseのRPC関数 `get_inventory_changes` を呼び出し、指定された商品コードの在庫前後比較データを取得する
 *
 * @param {string[]} itemCodes - 比較対象の商品コード配列
 * @return {Object[]} RPCから返却された在庫履歴データの配列（オブジェクトの配列）
 * @throws {Error} スクリプトプロパティが不足している場合、またはHTTP通信エラー・ステータスコードが200以外の場合
 */
function fetchInventoryChanges_(itemCodes) {
  if (!itemCodes || itemCodes.length === 0) {
    throw new Error("商品コードが指定されていません。");
  }

  // 1. スクリプトプロパティから接続情報を取得
  const properties = PropertiesService.getScriptProperties();
  const supabaseUrl = properties.getProperty("SUPABASE_URL");
  const supabaseKey = properties.getProperty("SUPABASE_KEY");

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("スクリプトプロパティ 'SUPABASE_URL' または 'SUPABASE_KEY' が設定されていません。");
  }

  // 2. RPC呼び出しのパラメータ設定
  const functionName = "get_inventory_changes";
  const params = {
    target_item_codes: itemCodes
  };

  const url = supabaseUrl + "/rest/v1/rpc/" + functionName;
  const options = {
    "method": "post",
    "contentType": "application/json",
    "headers": {
      "apikey": supabaseKey,
      "Authorization": "Bearer " + supabaseKey
    },
    "payload": JSON.stringify(params),
    "muteHttpExceptions": true
  };

  // 3. HTTPリクエストの送信と例外処理
  let response;
  try {
    response = UrlFetchApp.fetch(url, options);
  } catch (error) {
    throw new Error("Supabaseとの通信に失敗しました: " + error.toString());
  }

  const statusCode = response.getResponseCode();
  const body = response.getContentText();

  // 4. ステータスコードの検証と戻り値の処理
  if (statusCode !== 200) {
    throw new Error("Supabase RPC呼び出しエラー (ステータスコード: " + statusCode + "): " + body);
  }

  try {
    return JSON.parse(body);
  } catch (parseError) {
    throw new Error("レスポンスデータのパースに失敗しました: " + parseError.toString());
  }
}
