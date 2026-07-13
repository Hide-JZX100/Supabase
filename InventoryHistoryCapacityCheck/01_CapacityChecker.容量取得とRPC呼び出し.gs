/**
 * SupabaseのRPC関数を呼び出して、指定されたテーブルの容量（MB）を取得する。
 *
 * 【処理フロー】
 * 1. getSupabaseConfig() から接続情報（URL、APIキー）を取得する。
 * 2. RPCのエンドポイントURLを構築する。
 * 3. リクエストボディとヘッダーを設定する。
 * 4. 設定された最大リトライ回数までループ処理を行う。
 *    - UrlFetchApp.fetch を呼び出す。
 *    - ステータスコードが 200 または 204 の場合、結果（数値）をパースして返却する。
 *    - 4xx のクライアントエラーの場合は、リトライせずに即座に例外をスローする。
 *    - 5xx などのサーバーエラーや通信エラーの場合は、指数バックオフで待機してリトライする。
 * 5. 全てのリトライが失敗した場合は、エラーログを記録して例外を再スローする。
 *
 * @param {string} tableName - 容量を確認する対象テーブル名
 * @return {number} テーブル容量（MB）
 * @throws {Error} 通信エラーまたはAPIエラーが発生した場合
 */
function getTableSizeMb(tableName) {
  const config = getSupabaseConfig();
  const url = config.url + '/rest/v1/rpc/' + RPC_FUNCTION_NAME;

  const payload = {
    target_table: tableName
  };

  const options = {
    "method": "post",
    "contentType": "application/json",
    "headers": {
      "apikey": config.key,
      "Authorization": "Bearer " + config.key
    },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  const maxRetries = RETRY_CONFIG.MAX_RETRIES;
  const enableRetry = RETRY_CONFIG.ENABLE_RETRY;
  const initialWaitSeconds = RETRY_CONFIG.WAIT_SECONDS;
  let lastError = null;

  logWithLevel(LOG_LEVEL.SUMMARY, `[Supabase RPC] ${tableName} の容量チェックを開始します。`);

  for (let attempt = 1; attempt <= (enableRetry ? maxRetries : 1); attempt++) {
    try {
      if (attempt > 1) {
        logWithLevel(LOG_LEVEL.SUMMARY, `  Supabase RPC リトライ ${attempt}/${maxRetries}回目...`);
      }

      const response = UrlFetchApp.fetch(url, options);
      const statusCode = response.getResponseCode();
      const body = response.getContentText();

      // 正常レスポンス
      if (statusCode === 200 || statusCode === 204) {
        const sizeMb = parseFloat(body);
        if (isNaN(sizeMb)) {
          throw new Error(`レスポンスのパースに失敗しました。受信データ: ${body}`);
        }

        logWithLevel(LOG_LEVEL.SUMMARY, `[Supabase RPC] 容量取得成功: ${sizeMb} MB`);
        return sizeMb;
      }

      // エラーレスポンスの処理
      const errorMsg = `Supabase RPC エラー (ステータス: ${statusCode}): ${body}`;

      // 4xx クライアントエラーはリトライしない
      if (statusCode >= 400 && statusCode < 500) {
        logError(`[Supabase RPC] クライアントエラーのためリトライをスキップします。${errorMsg}`);
        throw new Error(errorMsg);
      }

      // 5xx サーバーエラーはリトライへ
      throw new Error(errorMsg);

    } catch (error) {
      lastError = error;

      // クライアントエラー（4xx）はキャッチしてそのまま再スロー（リトライ脱出）
      if (error.message.indexOf('ステータス: 4') !== -1) {
        throw error;
      }

      logError(`[Supabase RPC] 試行 ${attempt}/${maxRetries} 失敗: ${error.message}`);

      if (attempt < maxRetries) {
        // 指数バックオフによる待機
        const waitTimeSeconds = Math.pow(2, attempt - 1) * initialWaitSeconds;
        logWithLevel(LOG_LEVEL.SUMMARY, `  ${waitTimeSeconds}秒待機した後に再試行します...`);
        Utilities.sleep(waitTimeSeconds * 1000);
      }
    }
  }

  // 全てのリトライが失敗した場合
  const finalErrorMsg = `Supabase RPCへの接続にすべて失敗しました。最終エラー: ${lastError ? lastError.message : '未知のエラー'}`;
  logError(`[Supabase RPC] ${finalErrorMsg}`);
  throw new Error(finalErrorMsg);
}
