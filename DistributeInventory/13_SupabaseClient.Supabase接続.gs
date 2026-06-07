
/**
 * Supabase 接続設定をスクリプトプロパティから取得する
 *
 * SUPABASE_URL と SUPABASE_KEY を取得します。
 * いずれかが設定されていない場合はエラーをスローします。
 *
 * @return {{url: string, key: string}} 接続用 URL と API キーのオブジェクト
 * @throws {Error} 必要なスクリプトプロパティが設定されていない場合
 */
function getSupabaseConfig() {
  const properties = PropertiesService.getScriptProperties();
  const url = properties.getProperty('SUPABASE_URL');
  const key = properties.getProperty('SUPABASE_KEY');

  if (!url || !key) {
    throw new Error(
      '必要なスクリプトプロパティが設定されていません。\n' +
      'SUPABASE_URL および SUPABASE_KEY を設定してください。'
    );
  }

  return { url: url, key: key };
}

/**
 * Supabase REST API テーブルへの GET リクエスト汎用ラッパー
 *
 * 指定テーブルに対してクエリパラメータ付きの GET リクエストを送信します。
 * 一時的なネットワークエラーや 5xx エラーが発生した場合は
 * 指数バックオフでリトライします。
 *
 * 【処理フロー】
 * 1. getSupabaseConfig() から URL と API キーを取得
 * 2. クエリパラメータを URL エンコードしてクエリ文字列を構築
 * 3. テーブル名もエンコードして送信先 URL を構築
 * 4. UrlFetchApp.fetch() で GET リクエストを送信（リトライ付き）
 *    - ステータスコード 200 → 正常終了、JSON パースして返却
 *    - 4xx クライアントエラー → リトライせず即座にスロー
 *    - 5xx サーバーエラー / 通信エラー → 指数バックオフでリトライ
 * 5. 全リトライが失敗した場合はエラーログを記録して例外をスロー
 *
 * @param {string} tableName   - テーブル名（日本語名も可）
 * @param {Object} queryParams - クエリパラメータ { 列名: 'operator.value', ... }
 *   例: { '更新日時': 'gte.2024-01-01T00:00:00Z', 'order': '更新日時.desc', 'limit': '5000' }
 * @return {{success: boolean, statusCode: number, data: Array}} レスポンスオブジェクト
 * @throws {Error} HTTP エラーまたは通信エラーの場合
 */
function querySupabaseTable(tableName, queryParams) {
  const config = getSupabaseConfig();

  // クエリ文字列を組み立てる
  const queryString = Object.keys(queryParams)
    .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(queryParams[key]))
    .join('&');

  const url = config.url + '/rest/v1/' + encodeURIComponent(tableName) + '?' + queryString;

  const options = {
    method: 'get',
    headers: {
      'apikey': config.key,
      'Authorization': 'Bearer ' + config.key,
      'Accept': 'application/json'
    },
    muteHttpExceptions: true
  };

  const maxRetries = RETRY_CONFIG.MAX_RETRIES;
  const enableRetry = RETRY_CONFIG.ENABLE_RETRY;
  let lastError = null;

  for (let attempt = 1; attempt <= (enableRetry ? maxRetries : 1); attempt++) {
    try {
      if (attempt > 1) {
        logWithLevel(LOG_LEVEL.SUMMARY, '  Supabase GET リトライ ' + attempt + '/' + maxRetries + '回目... (' + tableName + ')');
      }

      const response = UrlFetchApp.fetch(url, options);
      const statusCode = response.getResponseCode();
      const body = response.getContentText();

      if (statusCode === 200) {
        if (attempt > 1) {
          logWithLevel(LOG_LEVEL.SUMMARY, '  ✓ Supabase GET リトライ成功（' + attempt + '回目の試行で成功）');
        }
        return {
          success: true,
          statusCode: statusCode,
          data: JSON.parse(body)
        };
      }

      const errorMsg = 'ステータスコード ' + statusCode + ': ' + body;

      // 4xx クライアントエラーはリトライ不可のため即座にスロー
      if (statusCode >= 400 && statusCode < 500) {
        logError('Supabase GET クライアントエラー (' + tableName + '): ' + errorMsg);
        throw new Error(errorMsg);
      }

      // 5xx 等はリトライへ
      throw new Error(errorMsg);

    } catch (error) {
      lastError = error;

      // 4xx エラーの場合はリトライループを抜けて即座に再スロー
      if (error.message.includes('ステータスコード 4')) {
        throw error;
      }

      logError('  ✗ Supabase GET エラー（試行 ' + attempt + '/' + maxRetries + '）: ' + error.message);

      if (enableRetry && attempt < maxRetries) {
        const waitSeconds = Math.pow(2, attempt - 1);
        logWithLevel(LOG_LEVEL.SUMMARY, '  → ' + waitSeconds + '秒後にリトライします...');
        Utilities.sleep(waitSeconds * 1000);
      }
    }
  }

  // すべてのリトライが失敗した場合
  const finalErrorMsg = 'Supabase GET 呼び出し失敗（' + maxRetries + '回試行）: ' + lastError.message;
  logError('  ✗✗✗ ' + finalErrorMsg);
  throw new Error(finalErrorMsg);
}
