/**
 * @file 10_Main.エントリーポイント.gs
 * @description TriggerHandoffLab_Sender のメインオーケストレーションモジュール。
 * Phase2時点では「ダミー処理の実行 → 動的トリガーの設定 → 発火確認」のみを行い、
 * 受信側への外部呼び出しはまだ実装しない（Phase3で追加する）。
 *
 * ### 処理フロー (runMainProcess)
 * 1. ダミー処理を実行（Utilities.sleepで疑似的な処理時間を再現）
 * 2. 完了後、12_TriggerManager.gs の scheduleOneTimeTrigger() でワンタイムトリガーを設定
 *
 * ### 処理フロー (onDelayedTrigger) ※トリガーから呼ばれる関数
 * 1. cleanupFiredTrigger() で自分自身のトリガーを削除（後始末）
 * 2. ログ出力のみ（Phase3でここに外部呼び出しを追加する）
 *
 * @version 1.0 (Phase2: 自己完結版)
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
 * 動的トリガーから呼び出される関数（Phase2時点）
 *
 * 【処理フロー】
 * 1. cleanupFiredTrigger() を呼び出し、自分自身のトリガーを削除する
 * 2. 発火確認のログを出力する（Phase3で受信側への送信処理に拡張する）
 *
 * @return {void}
 */
function onDelayedTrigger() {
    console.log('=== onDelayedTrigger 発火 ===');
    console.log('発火時刻: ' + Utilities.formatDate(new Date(), 'JST', 'yyyy/MM/dd HH:mm:ss'));

    // 自己削除（後始末）
    cleanupFiredTrigger();

    console.log('Phase2: ここでは発火確認のみ。Phase3で受信側への送信処理を追加します。');
}
