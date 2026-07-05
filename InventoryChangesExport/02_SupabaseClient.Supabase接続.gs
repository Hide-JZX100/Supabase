/**
 * @file InventoryChangesExport/02_SupabaseClient.Supabase接続.gs
 * @description Supabase RPC関数 `get_inventory_changes` の呼び出しを実行するモジュール。
 *
 * スクリプトプロパティに設定された接続情報（SUPABASE_URL, SUPABASE_KEY）を使用して、
 * SupabaseのAPIに直接リクエストを送信します。
 * 一時的な通信エラーやサーバーエラー発生時の自動リトライ機能（指数バックオフ対応）を備えています。
 */

/**
 * SupabaseのRPC関数 `get_inventory_changes` を呼び出し、指定された商品コードの在庫前後比較データを取得する。
 * 通信障害や一時的なサーバーエラーに備え、指数バックオフを用いた自動リトライを実行します。
 * 
 * ### 指数バックオフの仕様
 * - 最大試行回数: 4回（初回実行 + 最大3回の再試行）
 * - 待機時間計算: `2秒 * 2^(再試行回数 - 1)`
 *   - 再試行1回目 (2回目の実行前): 2秒 (2,000ms)
 *   - 再試行2回目 (3回目の実行前): 4秒 (4,000ms)
 *   - 再試行3回目 (4回目の実行前): 8秒 (8,000ms)
 * 
 * @param {string[]} itemCodes - 比較対象の商品コード配列
 * @return {Object[]} RPCから返却された在庫履歴データの配列（オブジェクトの配列）
 * @throws {Error} スクリプトプロパティが不足している場合、致命的なAPIエラー（400/401等）、または最大リトライ回数を超過した場合
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

  // 3. 指数バックオフを用いた自動リトライリクエスト送信
  const maxAttempts = 3;      // 最大再試行回数
  const baseDelayMs = 2000;   // 基本待機時間（2秒）
  
  let attempt = 0;
  let lastError = null;

  while (attempt <= maxAttempts) {
    attempt++;
    try {
      if (attempt > 1) {
        // 指数バックオフによる待機時間の計算: baseDelayMs * 2^(attempt - 2)
        const delayMs = baseDelayMs * Math.pow(2, attempt - 2);
        console.warn("一時的な接続エラーのため、" + delayMs + "ms 後に再試行します (" + (attempt - 1) + " / " + maxAttempts + " 回目)...");
        Utilities.sleep(delayMs);
      }

      const response = UrlFetchApp.fetch(url, options);
      const statusCode = response.getResponseCode();
      const body = response.getContentText();

      // 正常終了時は即座にデータを返す
      if (statusCode === 200) {
        return JSON.parse(body);
      }

      // 4xx / 5xx エラーの場合
      lastError = new Error("Supabase RPC呼び出しエラー (ステータスコード: " + statusCode + "): " + body);
      
      // リトライすべきステータスコードか検証
      // 429 (レートリミット) または 5xx (サーバー側エラー) 以外は、リトライせずに即時 throw して終了
      const retryableStatuses = [429, 500, 502, 503, 504];
      if (!retryableStatuses.includes(statusCode)) {
        throw lastError;
      }
      
      console.warn("一時的なサーバーエラーが返されました (ステータスコード: " + statusCode + ")。再試行をスケジュールします。");

    } catch (error) {
      lastError = error;
      
      // すでに即時 throw されたクライアントエラー（例: 400 Bad Request や 401 Unauthorized など）はそのまま上に投げる
      if (error.message && error.message.indexOf("Supabase RPC呼び出しエラー") !== -1) {
        const isRetryable = error.message.includes("429") || 
                            error.message.includes("500") || 
                            error.message.includes("502") || 
                            error.message.includes("503") || 
                            error.message.includes("504");
        if (!isRetryable) {
          throw error;
        }
      }
      
      console.warn("通信処理中に例外が発生しました (試行: " + attempt + "回目): " + error.toString());
    }
  }

  // すべてのリトライが失敗した場合
  throw new Error("Supabaseとの通信に失敗しました。最大試行回数(" + (maxAttempts + 1) + "回)に達しました。最後のエラー: " + lastError.toString());
}
