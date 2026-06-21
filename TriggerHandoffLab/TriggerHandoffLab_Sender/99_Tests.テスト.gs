/**
 * @file 99_Tests.テスト.gs
 * @description TriggerHandoffLab_Sender の動作テストスクリプト。
 * トリガーの作成・カウント・クリーンアップ等の基本動作を検証します。
 *
 * @version 1.0
 */

/**
 * 送信側の動的トリガー作成と件数確認を行うテスト関数
 *
 * 【テスト手順】
 * 1. 既存の onDelayedTrigger トリガーをすべて削除し初期化する
 * 2. 意図的に動的ワンタイムトリガーを1件作成する
 * 3. 作成されたトリガーの件数が 1 であることを検証する
 * 4. 手動で cleanupFiredTrigger() を呼び出し、トリガーが 0 にクリーンアップされるか確認する
 *
 * @return {void}
 */
function testTriggerCreationAndCleanup() {
    console.log('=== testTriggerCreationAndCleanup 開始 ===');

    // 1. 初期化：既存の該当トリガーをすべて削除
    const existingTriggers = ScriptApp.getProjectTriggers()
        .filter(t => t.getHandlerFunction() === 'onDelayedTrigger');
    existingTriggers.forEach(t => ScriptApp.deleteTrigger(t));
    PropertiesService.getScriptProperties().deleteProperty('PENDING_TRIGGER_ID');
    console.log('初期化完了：既存トリガーをクリアしました。');

    // 2. トリガー作成
    const delayMs = 60 * 1000; // テスト用に長めの1分を設定（すぐ消すため）
    const triggerId = scheduleOneTimeTrigger('onDelayedTrigger', delayMs);
    console.log('テスト用トリガー作成: ID=' + triggerId);

    // 3. 件数の検証
    const countAfterCreate = countTriggersFor('onDelayedTrigger');
    console.log('トリガー作成後の件数: ' + countAfterCreate + ' (期待値: 1)');

    if (countAfterCreate === 1) {
        console.log('✓ トリガー作成検証: 成功');
    } else {
        console.error('❌ トリガー作成検証: 失敗');
    }

    // 4. クリーンアップの検証
    const isDeleted = cleanupFiredTrigger();
    const countAfterCleanup = countTriggersFor('onDelayedTrigger');
    console.log('クリーンアップ実行結果: ' + (isDeleted ? '削除成功' : '削除失敗'));
    console.log('クリーンアップ後のトリガー数: ' + countAfterCleanup + ' (期待値: 0)');

    if (countAfterCleanup === 0) {
        console.log('✓ トリガー削除検証: 成功');
    } else {
        console.error('❌ トリガー削除検証: 失敗');
    }

    console.log('=== testTriggerCreationAndCleanup 終了 ===');
}

/**
 * 動的トリガーの自動実行と自己削除を検証するテスト
 *
 * 【テスト手順】
 * 1. runMainProcess() を実行してダミー処理＋トリガー作成を行う
 * 2. 直後に countTriggersFor('onDelayedTrigger') を取得し 1 件であることを確認する
 * 3. TRIGGER_DELAY_MS（15秒）以上待機した後、自動実行ログを確認する
 * 4. 実行後、GASエディタ上のトリガー一覧から自動的に削除されていることを目視で確認する
 *
 * @return {void}
 */
function testRunMainProcessAndAutoTrigger() {
    console.log('=== testRunMainProcessAndAutoTrigger 開始 ===');

    // メインプロセスを実行（トリガーが設定される）
    runMainProcess();

    const count = countTriggersFor('onDelayedTrigger');
    console.log('現在のトリガー数: ' + count + ' (期待値: 1)');

    if (count === 1) {
        console.log('✓ トリガー設定確認: 成功');
        console.log('約15秒後に onDelayedTrigger が自動実行されます。');
        console.log('自動実行完了後、GASエディタの「実行数」ログで onDelayedTrigger が「完了」し、');
        console.log('「トリガー」一覧からトリガーが消えることを確認してください。');
    } else {
        console.error('❌ トリガー設定確認: 失敗');
    }

    console.log('=== testRunMainProcessAndAutoTrigger 終了 ===');
}

/**
 * 送信側から受信側へのHTTP接続テスト
 *
 * 【テスト手順】
 * 1. スクリプトプロパティ RECEIVER_WEBAPP_URL が設定されていることを前提とします。
 * 2. 任意のペイロードを作成して callReceiverWebApp() を呼び出します。
 * 3. 正常に応答（ステータス200）が戻ってくることを確認します。
 *
 * @return {void}
 */
function testHttpCommunication() {
    console.log('=== testHttpCommunication 開始 ===');

    try {
        const payload = {
            source: 'testHttpCommunication',
            firedAt: new Date().toISOString(),
            message: '手動テスト実行による接続疎通確認'
        };

        const response = callReceiverWebApp(payload);
        
        if (response.success && response.statusCode === 200) {
            console.log('✓ HTTP通信テスト: 成功');
            console.log('応答ボディ: ' + response.body);
        } else {
            console.error('❌ HTTP通信テスト: 失敗 (ステータスコード=' + response.statusCode + ')');
        }

    } catch (error) {
        console.error('❌ HTTP通信テスト: エラー発生 - ' + error.message);
    }

    console.log('=== testHttpCommunication 終了 ===');
}

/**
 * 重複トリガー防止のテスト
 *
 * 【テスト手順】
 * 1. runMainProcess() を短時間に意図的に2回連続で呼び出します。
 * 2. 同名関数に紐づく既存トリガーが自動削除され、最終的なトリガー数が1件以下になることを確認します。
 *
 * @return {void}
 */
function testTriggerDeduplication() {
    console.log('=== testTriggerDeduplication 開始 ===');

    // 2回連続実行
    runMainProcess();
    runMainProcess();

    const count = countTriggersFor('onDelayedTrigger');
    console.log('現在のトリガー数: ' + count + ' (期待値: 1)');

    if (count <= 1) {
        console.log('✓ 重複トリガー防止テスト: 成功');
    } else {
        console.error('❌ 重複トリガー防止テスト: 失敗 (トリガー数が複数検出されました: ' + count + '件)');
    }

    console.log('=== testTriggerDeduplication 終了 ===');
}

/**
 * 送信失敗時のリトライ動作およびトリガー削除保証のテスト
 *
 * 【テスト手順】
 * 1. 一時的に無効なウェブアプリURLを設定します。
 * 2. onDelayedTrigger() を手動で呼び出します。
 * 3. ログで3回のリトライが実行され、最終的に失敗することを確認します。
 * 4. 失敗後も cleanupFiredTrigger() が finally ブロックで確実に実行され、
 *    トリガーが削除されていることを確認します。
 *
 * @return {void}
 */
function testRetryAndCleanupOnFailure() {
    console.log('=== testRetryAndCleanupOnFailure 開始 ===');

    const properties = PropertiesService.getScriptProperties();
    const originalUrl = properties.getProperty('RECEIVER_WEBAPP_URL');

    try {
        // 1. 一時的に無効なURLを設定し、擬似的にトリガーIDをプロパティへ設定
        properties.setProperty('RECEIVER_WEBAPP_URL', 'https://script.google.com/macros/s/INVALID_URL_FOR_TEST/exec');

        // トリガーオブジェクトをダミーで作成して登録する
        // (実際にonDelayedTriggerを手動で実行するため、手動実行時の自己削除が機能するかを確認)
        const trigger = ScriptApp.newTrigger('onDelayedTrigger')
            .timeBased()
            .after(10 * 60 * 1000) // 10分後（実行されないようにする）
            .create();
        properties.setProperty('PENDING_TRIGGER_ID', trigger.getUniqueId());

        console.log('検証：無効なURLに設定しました。これからリトライ処理が行われます...');
        
        // 2. onDelayedTrigger() の手動呼び出し（内部でリトライが動き、エラーがスローされ、finallyでトリガーが消える）
        onDelayedTrigger();

        // 3. トリガーの削除確認
        const count = countTriggersFor('onDelayedTrigger');
        console.log('処理終了後のトリガー数: ' + count + ' (期待値: 0)');

        if (count === 0) {
            console.log('✓ エラー時クリーンアップ検証: 成功 (トリガーは正常に削除されました)');
        } else {
            console.error('❌ エラー時クリーンアップ検証: 失敗 (トリガーが残っています)');
            // 残ったゴミをクリーンアップ
            ScriptApp.deleteTrigger(trigger);
        }

    } catch (error) {
        console.error('テスト実行中に予期せぬエラーが発生しました: ' + error.message);
    } finally {
        // 4. 元のURLに戻す
        if (originalUrl) {
            properties.setProperty('RECEIVER_WEBAPP_URL', originalUrl);
        } else {
            properties.deleteProperty('RECEIVER_WEBAPP_URL');
        }
        properties.deleteProperty('PENDING_TRIGGER_ID');
        console.log('テスト設定の復元完了');
    }

    console.log('=== testRetryAndCleanupOnFailure 終了 ===');
}


