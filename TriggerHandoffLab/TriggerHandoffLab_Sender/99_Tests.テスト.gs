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
