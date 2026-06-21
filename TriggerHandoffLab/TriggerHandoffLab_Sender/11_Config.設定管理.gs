/**
 * @file 11_Config.設定管理.gs
 * @description TriggerHandoffLab_Sender の設定・定数管理モジュール。
 *
 * ### スクリプトプロパティ一覧
 * | キー                  | 説明                                                |
 * |-----------------------|-----------------------------------------------------|
 * | RECEIVER_WEBAPP_URL   | 受信側(Receiver)のWeb AppデプロイURL（Phase3で使用） |
 * | PENDING_TRIGGER_ID    | 発火待ちの動的トリガーのユニークID（自己削除用）      |
 *
 * @version 1.0
 */

/** ダミー処理（メイン処理を模倣）の所要時間（ミリ秒） */
const DUMMY_PROCESS_DURATION_MS = 3000;

/** メイン処理完了からトリガー発火までの遅延時間（ミリ秒）。本番のGetInventoryDataでは数十秒を想定 */
const TRIGGER_DELAY_MS = 15 * 1000; // 15秒（検証用に短めに設定）

/**
 * 受信側(Receiver)のWeb App URLをスクリプトプロパティから取得する
 *
 * @return {string} 受信側のWeb App URL
 * @throws {Error} RECEIVER_WEBAPP_URL が未設定の場合
 */
function getReceiverWebAppUrl() {
    const url = PropertiesService.getScriptProperties().getProperty('RECEIVER_WEBAPP_URL');
    if (!url) {
        throw new Error('スクリプトプロパティ RECEIVER_WEBAPP_URL が設定されていません。Phase1で取得した受信側のWeb App URLを設定してください。');
    }
    return url;
}
