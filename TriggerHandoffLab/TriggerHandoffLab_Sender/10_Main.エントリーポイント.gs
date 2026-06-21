/**
 * @file 10_Main.エントリーポイント.gs
 * @description TriggerHandoffLab_Sender のメインオーケストレーションモジュール。
 *
 * ### 処理フロー (runMainProcess)
 * 1. ダミー処理を実行（Utilities.sleepで疑似的な処理時間を再現）
 * 2. 完了後、12_TriggerManager.gs の scheduleOneTimeTrigger() でワンタイムトリガーを設定
 *
 * ### 処理フロー (onDelayedTrigger) ※トリガーから呼ばれる関数
 * 1. try-finally を用いて、送信の成否に関わらず必ず cleanupFiredTrigger() で自己トリガーを削除
 * 2. callReceiverWebAppWithRetry() で受信側へ通信する（リトライ付き）
 *
 * @version 1.1 (Phase 4: 信頼性向上版)
 */

/**
 * メイン処理（ダミー）。本番の updateInventoryDataFromGoodsMaster() 等に相当する。
 *
 * 【処理フロー】
 * 1. 処理開始ログを出力
 * 2. DUMMY_PROCESS_DURATION_MS の間 sleep し、API呼び出し等の処理時間を模倣する
 * 3. 処理完了後、scheduleOneTimeTrigger() で「onDelayedTrigger」関数を
 *    TRIGGER_DELAY_MS 後に1回だけ実行するよう設定する
 *
 * @return {void}
 */
function runMainProcess() {
    console.log('=== メイン処理開始（ダミー） ===');
    const startTime = new Date();

    // ダミー処理：実際のAPI取得・書き込み処理時間を模倣
    Utilities.sleep(DUMMY_PROCESS_DURATION_MS);

    const duration = ((new Date() - startTime) / 1000).toFixed(1);
    console.log('=== メイン処理完了（処理時間: ' + duration + '秒） ===');

    // 動的ワンタイムトリガーを設定
    scheduleOneTimeTrigger('onDelayedTrigger', TRIGGER_DELAY_MS);
    console.log(TRIGGER_DELAY_MS + 'ms後に onDelayedTrigger が自動実行されます。');
}

/**
 * 動的トリガーから呼び出される関数（Phase4版）
 *
 * 【処理フロー】
 * 1. 受信側Web Appへ payload を送信する（リトライ付き）
 * 2. finallyブロックで必ず cleanupFiredTrigger() を呼び出し、自分自身のトリガーを削除する
 *
 * @return {void}
 */
function onDelayedTrigger() {
    console.log('=== onDelayedTrigger 発火 ===');
    console.log('発火時刻: ' + Utilities.formatDate(new Date(), 'JST', 'yyyy/MM/dd HH:mm:ss'));

    try {
        const payload = {
            source: 'TriggerHandoffLab_Sender',
            firedAt: new Date().toISOString(),
            message: '動的トリガー経由での送信テスト（リトライ対応版）'
        };

        callReceiverWebAppWithRetry(payload);

    } catch (error) {
        console.error('受信側への送信に失敗しました（リトライ含め全て失敗）: ' + error.message);
        // 本番適用時はここでメール通知等を検討する

    } finally {
        // 送信の成否に関わらず、必ず自分自身のトリガーを削除する
        cleanupFiredTrigger();
    }
}
