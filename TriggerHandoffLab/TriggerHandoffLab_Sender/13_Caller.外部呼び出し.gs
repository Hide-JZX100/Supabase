/**
 * @file 13_Caller.外部呼び出し.gs
 * @description 受信側(Receiver)のWeb Appを呼び出すためのHTTP通信モジュール。
 * UrlFetchAppを用いてPOSTリクエストを送信する。
 *
 * ### 依存関係
 * - 参照先: 11_Config.設定管理.gs (getReceiverWebAppUrl)
 *
 * @version 1.0
 * @see callReceiverWebApp - 受信側Web AppへPOSTリクエストを送信する
 */

/**
 * 受信側(Receiver)のWeb AppへPOSTリクエストを送信する
 *
 * 【処理フロー】
 * 1. getReceiverWebAppUrl() でURLを取得する
 * 2. 送信するペイロード（実行時刻・送信元識別子等）をJSON化する
 * 3. UrlFetchApp.fetch() でPOSTリクエストを送信する（muteHttpExceptions: true）
 * 4. ステータスコードが200の場合は成功として応答内容を返す
 * 5. それ以外はエラーとしてログ出力後にスローする
 *
 * @param {Object} payload - 送信するデータオブジェクト
 * @return {{success: boolean, statusCode: number, body: string}} レスポンス情報
 * @throws {Error} 通信エラーまたは異常なステータスコードの場合
 */
function callReceiverWebApp(payload) {
    const url = getReceiverWebAppUrl();

    const options = {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    console.log('受信側Web Appへ送信中... URL=' + url);
    console.log('送信内容: ' + JSON.stringify(payload));

    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    const body = response.getContentText();

    if (statusCode === 200) {
        console.log('送信成功: ステータス=' + statusCode + ', レスポンス=' + body);
        return { success: true, statusCode: statusCode, body: body };
    } else {
        const errorMsg = '受信側Web App呼び出しエラー: ステータス=' + statusCode + ', 内容=' + body;
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
}

/** リトライ設定（受信側Web App呼び出し用） */
const CALLER_RETRY_CONFIG = {
    MAX_RETRIES: 3,
    ENABLE_RETRY: true
};

/**
 * 受信側(Receiver)のWeb AppへPOSTリクエストを送信する（リトライ付き）
 *
 * 【処理フロー】
 * 1. callReceiverWebApp() を呼び出す
 * 2. 失敗した場合、最大 CALLER_RETRY_CONFIG.MAX_RETRIES 回まで
 *    エクスポネンシャルバックオフ（1秒→2秒→4秒）でリトライする
 * 3. 全リトライが失敗した場合はエラーをスローする
 *
 * @param {Object} payload - 送信するデータオブジェクト
 * @return {{success: boolean, statusCode: number, body: string}} レスポンス情報
 * @throws {Error} 全リトライが失敗した場合
 */
function callReceiverWebAppWithRetry(payload) {
    if (!CALLER_RETRY_CONFIG.ENABLE_RETRY) {
        return callReceiverWebApp(payload);
    }

    let lastError = null;

    for (let attempt = 1; attempt <= CALLER_RETRY_CONFIG.MAX_RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                console.log('  リトライ ' + attempt + '/' + CALLER_RETRY_CONFIG.MAX_RETRIES + '回目...');
            }
            return callReceiverWebApp(payload);

        } catch (error) {
            lastError = error;
            console.error('  ✗ 送信エラー（試行 ' + attempt + '/' + CALLER_RETRY_CONFIG.MAX_RETRIES + '）: ' + error.message);

            if (attempt < CALLER_RETRY_CONFIG.MAX_RETRIES) {
                const waitSeconds = Math.pow(2, attempt - 1);
                console.log('  → ' + waitSeconds + '秒後にリトライします...');
                Utilities.sleep(waitSeconds * 1000);
            }
        }
    }

    throw new Error('受信側への送信に失敗しました（' + CALLER_RETRY_CONFIG.MAX_RETRIES + '回試行）: ' + lastError.message);
}

