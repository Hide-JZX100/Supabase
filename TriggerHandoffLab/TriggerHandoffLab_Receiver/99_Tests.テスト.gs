/**
 * doPost(e) の動作確認を行うテスト関数
 *
 * 【テスト手順】
 * 1. 擬似的なHTTP POSTリクエストのイベントオブジェクト（e）を作成する
 * 2. doPost(e) を直接呼び出し、返却されるJSONレスポンスを検証する
 * 3. スクリプトプロパティ（LAST_RECEIVED_AT, LAST_RECEIVED_BODY）が正常に更新されていることを確認する
 *
 * @return {void}
 */
function testDoPost() {
    console.log('=== testDoPost 開始 ===');

    // 1. テスト用の擬似イベントオブジェクトを生成
    const testPayload = {
        source: 'TestRunner',
        firedAt: new Date().toISOString(),
        message: 'これはローカルテスト用のメッセージです。'
    };

    const dummyEvent = {
        postData: {
            contents: JSON.stringify(testPayload)
        }
    };

    // 2. doPostの呼び出し
    const response = doPost(dummyEvent);
    const responseContent = response.getContent();

    console.log('レスポンス内容: ' + responseContent);

    // 3. レスポンスの検証
    const resData = JSON.parse(responseContent);
    if (resData.result === 'success') {
        console.log('✓ レスポンス結果: 成功');
    } else {
        console.error('❌ レスポンス結果: 失敗 (' + resData.message + ')');
        return;
    }

    // 4. プロパティの検証
    const props = PropertiesService.getScriptProperties().getProperties();
    console.log('スクリプトプロパティ [LAST_RECEIVED_AT]: ' + props.LAST_RECEIVED_AT);
    console.log('スクリプトプロパティ [LAST_RECEIVED_BODY]: ' + props.LAST_RECEIVED_BODY);

    if (props.LAST_RECEIVED_AT && props.LAST_RECEIVED_BODY) {
        console.log('✓ スクリプトプロパティが正常に書き込まれました。');
    } else {
        console.error('❌ スクリプトプロパティが書き込まれていません。');
    }

    console.log('=== testDoPost 終了 ===');
}

