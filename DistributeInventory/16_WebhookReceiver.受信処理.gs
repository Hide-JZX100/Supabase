/**
 * @file 16_WebhookReceiver.受信処理.gs
 * @description GetInventoryData（送信側）からの動的トリガー経由HTTP呼び出しを受信するモジュール。
 * 共有トークンによる簡易認証を行い、正当なリクエストのみ動的ワンタイムトリガーを作成する。
 * doPost自体はトリガー作成と即時レスポンス返却のみを行い、実際の配布処理（distributeInventoryChanges）は
 * 別途トリガー経由で triggeredDistributeInventory() として実行される。
 * これにより doPost 経由の実行特有のログ欠落問題を回避し、通常のトリガー実行ログとして記録される。
 *
 * ### 依存関係
 * - 参照先: 10_Main.エントリーポイント.gs (distributeInventoryChanges)
 *           11_Config.設定管理.gs (getSharedToken)
 *           11_Config.設定管理.gs (getReceiverTriggerDelayMs)
 *           12_Logger.ログ管理.gs (logWithLevel, logError)
 *           18_TriggerManager.トリガー管理.gs (scheduleOneTimeTrigger, cleanupFiredTrigger)
 *
 * @version 2.0 (Phase A: 動的トリガー方式に変更)
 * @see doPost - 送信側からのPOSTリクエスト受信処理
 * @see triggeredDistributeInventory - 動的トリガーから呼び出されるエントリーポイント
 */

/**
 * Web Appとして公開した際のPOSTリクエスト受信処理
 *
 * 【処理フロー】
 * 1. リクエストボディ（JSON）をパースする
 * 2. body.token と getSharedToken() を比較し、一致しない場合は result: 'unauthorized' を返す
 *    （Web AppはHTTPステータスを自由に変更できないため、論理的な成否はボディのresultフィールドで表現する）
 * 3. 一致する場合、scheduleOneTimeTrigger('triggeredDistributeInventory', ...) で
 *    動的ワンタイムトリガーを作成する（配布処理自体はここでは実行しない）
 * 4. トリガー作成の受付結果をJSONで返す（実際の配布完了を待たずに即時返却する）
 *
 * @param {Object} e - GASのイベントオブジェクト（e.postData.contents にPOSTボディが入る）
 * @return {GoogleAppsScript.Content.TextOutput} JSON形式のレスポンス
 */
function doPost(e) {
  const receivedAt = new Date();

  // 受信した内容を一時的に保存
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

    // 配布処理は直接実行せず、動的ワンタイムトリガーに委譲する
    // doPost自体は受付確認のみを返し、実処理はトリガー経由の実行としてログに記録させる
    scheduleOneTimeTrigger('triggeredDistributeInventory', getReceiverTriggerDelayMs());

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'success', receivedAt: receivedAt.toISOString(), message: 'リクエストを受け付けました。配布処理は別トリガーで実行されます。' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    logError('Webhook受信処理エラー: ' + error.message);

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 動的ワンタイムトリガーから呼び出されるエントリーポイント関数
 *
 * doPost(e) から scheduleOneTimeTrigger('triggeredDistributeInventory', ...) という形で
 * 登録され、指定時間後にGASのトリガー機構から自動的に呼び出される。
 * 通常のトリガー実行として記録されるため、doPost単体では確認できなかった
 * 実行ログ（console.log）がここでは正しく「実行数」パネルに記録される。
 *
 * 【処理フロー】
 * 1. distributeInventoryChanges() を実行する（内部のLockServiceによる多重実行防止はそのまま機能する）
 * 2. 処理の成否に関わらず、finally で cleanupFiredTrigger() を呼び出し、
 *    自分自身に紐づくワンタイムトリガーを削除する
 *
 * @return {void}
 */
function triggeredDistributeInventory() {
  console.log('=== triggeredDistributeInventory 発火 ===');
  console.log('発火時刻: ' + Utilities.formatDate(new Date(), 'JST', 'yyyy/MM/dd HH:mm:ss'));

  try {
    distributeInventoryChanges();
  } catch (error) {
    logError('triggeredDistributeInventory 実行中にエラーが発生しました: ' + error.message);
  } finally {
    cleanupFiredTrigger();
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
