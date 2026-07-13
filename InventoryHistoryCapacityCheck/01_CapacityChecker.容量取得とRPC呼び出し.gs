/**
 * @file 01_CapacityChecker.容量取得とRPC呼び出し.gs
 * @description Supabase REST API (RPC) を呼び出し、監視対象テーブルの容量を取得するモジュール。
 * ネットワーク障害や一時的なサーバーエラーに備え、指数バックオフによる自動リトライ機能を備えています。
 *
 * ### 依存関係
 * - **参照先**: 00_Config.設定値.gs (TARGET_TABLE, RPC_FUNCTION_NAME, RETRY_CONFIG, LOG_LEVEL, getSupabaseConfig), 99_Utils.ログユーティリティ.gs (logWithLevel, logError)
 * - **参照元**: 03_Trigger.日付判定（防御的チェック）.gs
 *
 * ### 公開関数
 * @see getTableSizeMb - 指定テーブルの容量（MB）をSupabaseから取得
 *
 * @version 1.0
 */

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

// ============================================================================
// テスト用関数
// ============================================================================

/**
 * getTableSizeMb関数の動作確認用テスト
 *
 * 実際のSupabaseエンドポイントに対してRPC呼び出しを行い、容量が正しく取得できるかを確認します。
 * 本テストを実行する前に、プロジェクト設定のスクリプトプロパティに
 * 「SUPABASE_URL」と「SUPABASE_KEY」が正しく設定されている必要があります。
 *
 * 【テスト手順】
 * 1. GASエディタで本関数を実行する。
 * 2. ログに「容量取得成功: 〇〇 MB」と出力されるか確認する。
 */
function test_getTableSizeMb() {
  console.log('--- test_getTableSizeMb 開始 ---');
  try {
    const sizeMb = getTableSizeMb(TARGET_TABLE);
    console.log(`✅ テスト成功: ${TARGET_TABLE} の容量は ${sizeMb} MB です。`);
  } catch (error) {
    console.error(`❌ テスト失敗: 容量取得中にエラーが発生しました。\nエラー内容: ${error.message}`);
    console.error('※ スクリプトプロパティ（SUPABASE_URL, SUPABASE_KEY）が正しく設定されていること、およびSupabase側にRPC関数「get_table_size_mb」が定義されていることを確認してください。');
  }
  console.log('--- test_getTableSizeMb 終了 ---');
}
