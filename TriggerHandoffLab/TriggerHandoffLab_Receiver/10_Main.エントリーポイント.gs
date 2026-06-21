/**
 * Web App として公開した際のPOSTリクエスト受信処理
 *
 * 【処理フロー】
 * 1. リクエストボディ（JSON文字列）を受け取り、パースする
 * 2. 受信内容と受信時刻をログに出力する
 * 3. スクリプトプロパティに「最終受信時刻・最終受信内容」を保存する（動作確認用）
 * 4. 成功レスポンス（JSON）を返却する
 *
 * @param {Object} e - GASのイベントオブジェクト（e.postData.contents にPOSTボディが入る）
 * @return {GoogleAppsScript.Content.TextOutput} JSON形式のレスポンス
 */
function doPost(e) {
    const receivedAt = new Date();

    try {
        const body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};

        console.log('=== 受信 ===');
        console.log('受信時刻: ' + Utilities.formatDate(receivedAt, 'JST', 'yyyy/MM/dd HH:mm:ss'));
        console.log('受信内容: ' + JSON.stringify(body));

        // 動作確認用に最終受信内容をプロパティへ保存
        PropertiesService.getScriptProperties().setProperties({
            'LAST_RECEIVED_AT': receivedAt.toISOString(),
            'LAST_RECEIVED_BODY': JSON.stringify(body)
        });

        return ContentService
            .createTextOutput(JSON.stringify({
                result: 'success',
                receivedAt: receivedAt.toISOString(),
                echo: body
            }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        console.error('受信処理エラー: ' + error.message);

        return ContentService
            .createTextOutput(JSON.stringify({
                result: 'error',
                message: error.message
            }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}
