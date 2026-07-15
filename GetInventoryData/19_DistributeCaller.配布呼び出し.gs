/**
 * @file 19_DistributeCaller.配布呼び出し.gs
 * @description DistributeInventory（配布側）のWeb Appを呼び出すモジュール。
 * メイン処理（10_Main.gs）の完了直後に直接呼び出され、HTTP POSTで配布処理を起動する。
 * Phase A（動的トリガー経由）からPhase B（直接呼び出し）へ移行し、
 * トリガー発火の待機時間（実測1〜2分）を解消した。
 *
 * ### 依存関係
 * - 参照元: 10_Main.エントリーポイント.gs（メイン処理完了直後に直接呼び出し）
 * - 参照先: 11_Config.設定管理.gs (getReceiverWebAppUrl, getSharedToken)
 *           12_Logger.ログ管理.gs (logError, sendErrorMail)
 *
 * @version 2.1 (リトライ全滅時のメール通知を追加)
 * @see callDistributeInventory - メイン処理から直接呼び出されるエントリーポイント
 */

/** リトライ設定（DistributeInventory呼び出し用） */
const DISTRIBUTE_CALLER_RETRY_CONFIG = {
    MAX_RETRIES: 3,
    ENABLE_RETRY: true
};

/**
 * メイン処理から直接呼び出されるエントリーポイント関数
 *
 * 10_Main.エントリーポイント.gs のメイン処理（在庫更新・商品マスタ同期）完了直後に
 * 同一実行コンテキスト内で直接呼び出される。トリガー経由の待機時間が発生しない。
 *
 * 【処理フロー】
 * 1. DistributeInventoryへ送信するペイロード（送信元・実行時刻・共有トークン）を構築する
 * 2. callDistributeInventoryWebAppWithRetry() でリトライ付きの送信を行う
 * 3. 送信が全て失敗した場合はログに記録するが、例外は握りつぶす
 *    （既存の固定時刻トリガーがフェイルセーフとして後続で配布を行うため）
 *
 * @return {void}
 */
function callDistributeInventory() {
    console.log('=== callDistributeInventory 発火 ===');
    console.log('発火時刻: ' + Utilities.formatDate(new Date(), 'JST', 'yyyy/MM/dd HH:mm:ss'));

    try {
        const payload = {
            source: 'GetInventoryData',
            firedAt: new Date().toISOString(),
            token: getSharedToken()
        };

        callDistributeInventoryWebAppWithRetry(payload);

    } catch (error) {
        logError('DistributeInventoryへの呼び出しに失敗しました（リトライ含め全て失敗）: ' + error.message);
        // 既存の固定時刻トリガー（フェイルセーフ）が後続で配布を行うため、ここでは握りつぶして継続する

        // リトライ全滅は実行ログのみでは気づきにくいため、メールでも通知する
        const subject = '【警告】DistributeInventoryへのWebhook送信に失敗しました';
        const body = 'DistributeInventoryへのWebhook送信が、リトライを含めて全て失敗しました。\n\n' +
            '■ 発生日時: ' + Utilities.formatDate(new Date(), 'JST', 'yyyy/MM/dd HH:mm:ss') + '\n' +
            '■ エラー内容:\n' + error.message + '\n\n' +
            '※ 固定時刻トリガー（フェイルセーフ）が後続で配布処理を行うため、' +
            '在庫データの配布自体は通常どおり完了する見込みです。\n' +
            '※ ただし根本原因（Web Appのデプロイ設定、OAuth認可状態、共有トークン等）の' +
            '確認を推奨します。';
        sendErrorMail(subject, body);

    }
}

/**
 * DistributeInventoryのWeb AppへPOSTリクエストを送信する
 *
 * 【処理フロー】
 * 1. getReceiverWebAppUrl() でURLを取得する
 * 2. UrlFetchApp.fetch() でタイムアウト30秒制限（timeoutSeconds: 30）を設けてPOSTリクエストを送信する（muteHttpExceptions: true）
 * 3. 通信レベルのステータスコードが200であることを確認する（200以外は通信エラーとしてスロー）
 * 4. レスポンスボディをJSONパースし、result フィールドが 'success' であることを確認する
 *
 * 【重要】
 * Web Appは認証エラー時もHTTPステータス自体は200を返すため、
 * 成否の判定はステータスコードだけでなく必ずレスポンスボディの result フィールドで行う。
 *
 * @param {Object} payload - 送信するデータオブジェクト（token を含む）
 * @return {{success: boolean, statusCode: number, body: string}} レスポンス情報
 * @throws {Error} 通信エラー、異常なステータスコード、または論理的なエラー（認証失敗等）の場合
 */
function callDistributeInventoryWebApp(payload) {
    const url = getReceiverWebAppUrl();

    const options = {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
        timeoutSeconds: 30
    };

    logWithLevel(LOG_LEVEL.SUMMARY, 'DistributeInventoryへ送信中... URL=' + url);

    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    const body = response.getContentText();

    if (statusCode !== 200) {
        throw new Error('DistributeInventory呼び出しエラー（通信レベル）: ステータス=' + statusCode + ', 内容=' + body);
    }

    const parsedBody = JSON.parse(body);

    if (parsedBody.result !== 'success') {
        throw new Error('DistributeInventory呼び出しエラー（論理エラー）: ' + (parsedBody.message || JSON.stringify(parsedBody)));
    }

    logWithLevel(LOG_LEVEL.SUMMARY, '送信成功: ' + body);
    return { success: true, statusCode: statusCode, body: body };
}

/**
 * DistributeInventoryのWeb AppへPOSTリクエストを送信する（リトライ付き）
 *
 * 【処理フロー】
 * 1. callDistributeInventoryWebApp() を呼び出す
 * 2. 失敗した場合、最大 DISTRIBUTE_CALLER_RETRY_CONFIG.MAX_RETRIES 回まで
 *    エクスポネンシャルバックオフ（1秒→2秒→4秒）でリトライする
 * 3. 全リトライが失敗した場合はエラーをスローする
 *
 * 【注意】
 * 認証エラー（トークン不一致）の場合もこの関数はリトライを行う。
 * 設定ミスの場合は3回とも失敗するため、エラーログでスクリプトプロパティの設定を確認すること。
 *
 * @param {Object} payload - 送信するデータオブジェクト
 * @return {{success: boolean, statusCode: number, body: string}} レスポンス情報
 * @throws {Error} 全リトライが失敗した場合
 */
function callDistributeInventoryWebAppWithRetry(payload) {
    if (!DISTRIBUTE_CALLER_RETRY_CONFIG.ENABLE_RETRY) {
        return callDistributeInventoryWebApp(payload);
    }

    let lastError = null;

    for (let attempt = 1; attempt <= DISTRIBUTE_CALLER_RETRY_CONFIG.MAX_RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                logWithLevel(LOG_LEVEL.SUMMARY, '  リトライ ' + attempt + '/' + DISTRIBUTE_CALLER_RETRY_CONFIG.MAX_RETRIES + '回目...');
            }
            return callDistributeInventoryWebApp(payload);

        } catch (error) {
            lastError = error;
            logError('  ✗ 送信エラー（試行 ' + attempt + '/' + DISTRIBUTE_CALLER_RETRY_CONFIG.MAX_RETRIES + '）: ' + error.message);

            if (attempt < DISTRIBUTE_CALLER_RETRY_CONFIG.MAX_RETRIES) {
                const waitSeconds = Math.pow(2, attempt - 1);
                Utilities.sleep(waitSeconds * 1000);
            }
        }
    }

    throw new Error('DistributeInventoryへの送信に失敗しました（' + DISTRIBUTE_CALLER_RETRY_CONFIG.MAX_RETRIES + '回試行）: ' + lastError.message);
}
