/**
 * @file 16_WebhookReceiver.受信処理.gs
 * @description GetInventoryData（送信側）からの動的トリガー経由HTTP呼び出しを受信するモジュール。
 * 共有トークンによる簡易認証を行い、正当なリクエストのみ distributeInventoryChanges() を起動する。
 *
 * ### 依存関係
 * - 参照先: 10_Main.エントリーポイント.gs (distributeInventoryChanges)
 *           11_Config.設定管理.gs (getSharedToken)
 *           12_Logger.ログ管理.gs (logWithLevel, logError)
 *
 * @version 1.0
 * @see doPost - 送信側からのPOSTリクエスト受信処理
 */

/**
 * Web Appとして公開した際のPOSTリクエスト受信処理
 *
 * 【処理フロー】
 * 1. リクエストボディ（JSON）をパースする
 * 2. body.token と getSharedToken() を比較し、一致しない場合は result: 'unauthorized' を返す
 *    （Web AppはHTTPステータスを自由に変更できないため、論理的な成否はボディのresultフィールドで表現する）
 * 3. 一致する場合、distributeInventoryChanges() を呼び出す
 * 4. 処理結果（成功/エラー）をJSONで返す
 *
 * @param {Object} e - GASのイベントオブジェクト（e.postData.contents にPOSTボディが入る）
 * @return {GoogleAppsScript.Content.TextOutput} JSON形式のレスポンス
 */
function doPost(e) {
  const receivedAt = new Date();

  // doPost(e) の try ブロック内の先頭付近に追記
  const contents = e.postData && e.postData.contents ? e.postData.contents : '{}';
  PropertiesService.getScriptProperties().setProperty('LAST_RECEIVED_DATA', contents);

  try {
    const body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};

    logWithLevel(LOG_LEVEL.MINIMAL, '=== Webhook受信 === 受信時刻: '
      + Utilities.formatDate(receivedAt, 'JST', 'yyyy/MM/dd HH:mm:ss')
      + ', 送信元: ' + (body.source || '不明'));

    // 共有トークンによる認証
    const expectedToken = getSharedToken();
    if (!body.token || body.token !== expectedToken) {
      logError('Webhook認証エラー: トークンが一致しません（送信元: ' + (body.source || '不明') + '）');
      return ContentService
        .createTextOutput(JSON.stringify({ result: 'unauthorized', message: 'トークンが一致しません' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 配布処理を実行（内部でLockServiceによる多重実行防止を行う。タスク3参照）
    distributeInventoryChanges();

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'success', receivedAt: receivedAt.toISOString() }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    logError('Webhook受信処理エラー: ' + error.message);

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ブラウザでの簡易動作確認用（GETリクエスト）
 *
 * @param {Object} e - GASのイベントオブジェクト
 * @return {GoogleAppsScript.Content.TextOutput} 簡易な生存確認メッセージ
 */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      result: 'success',
      message: 'DistributeInventory Webhook受信は正常に稼働しています。'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
