/**
 * @file 14_SupabaseRepository.差分取得.gs
 * @description Supabase からのデータ取得および最終実行日時の管理を行うリポジトリモジュール。
 *
 * ### 依存関係
 * - **参照元**: 10_Main.エントリーポイント.gs, 99_Tests.テスト.gs
 * - **参照先**: 13_SupabaseClient.Supabase接続.gs, 12_Logger.ログ管理.gs, 11_Config.設定管理.gs
 *
 * @version 1.0 (新規作成)
 */

/** Supabase REST API の1回のクエリで取得するレコード数上限 */
const SUPABASE_QUERY_LIMIT = 5000;

/**
 * 指定日時以降に更新された在庫データを取得する
 *
 * 【処理フロー】
 * 1. 引数の日時を ISO 8601 文字列に変換する
 * 2. querySupabaseTable() で 更新日時 >= since の条件でフィルタリングして GET リクエストを送信する
 * 3. 取得データを配列で返す（0件の場合は空配列）
 *
 * @param {Date|string} since - 取得基準日時（この日時以降に更新された商品を取得）
 * @return {Array<Object>} 変化した商品データの配列
 * @throws {Error} Supabase への接続エラーや通信エラーが発生した場合
 */
function getChangedInventorySince(since) {
  const sinceStr = (since instanceof Date) ? since.toISOString() : since;

  logWithLevel(LOG_LEVEL.MINIMAL, '差分取得開始: ' + sinceStr + ' 以降に更新された商品');

  try {
    const result = querySupabaseTable('NE_InventoryData', {
      '更新日時': 'gte.' + sinceStr,
      'order': '更新日時.desc',
      'limit': SUPABASE_QUERY_LIMIT.toString()
    });

    logWithLevel(LOG_LEVEL.MINIMAL, '差分取得完了: ' + result.data.length + '件');
    return result.data;

  } catch (error) {
    logError('差分取得エラー:', error.message);
    throw error;
  }
}

/**
 * 最終実行日時をスクリプトプロパティに保存する
 *
 * 保存キー: SUPABASE_LAST_EXECUTED_AT
 * 保存形式: ISO 8601 文字列（UTC）
 *
 * 【処理フロー】
 * 1. 現在日時（UTC）を取得して ISO 8601 文字列に変換する
 * 2. スクリプトプロパティの 'SUPABASE_LAST_EXECUTED_AT' に保存する
 * 3. 保存した日時文字列をログに出力し、返却する
 *
 * @return {string} 保存されたISO 8601文字列
 */
function saveLastExecutedAt() {
  const now = new Date();
  const isoString = now.toISOString();
  PropertiesService.getScriptProperties()
    .setProperty('SUPABASE_LAST_EXECUTED_AT', isoString);
  logWithLevel(LOG_LEVEL.MINIMAL, '最終実行日時を保存: ' + isoString);
  return isoString;
}

/**
 * 最終実行日時をスクリプトプロパティから読み出す
 *
 * 【処理フロー】
 * 1. スクリプトプロパティから 'SUPABASE_LAST_EXECUTED_AT' を取得する
 * 2. 値が存在すれば、それを Date オブジェクトに変換してログ出力し、返却する
 * 3. 値が存在しない場合、fallbackHours 時間前の日時を計算してログ出力し、返却する
 *
 * @param {number} [fallbackHours=2] - 未保存時のフォールバック時間数（デフォルト: 2）
 * @return {Date} 最終実行日時
 */
function loadLastExecutedAt(fallbackHours = 2) {
  const saved = PropertiesService.getScriptProperties()
    .getProperty('SUPABASE_LAST_EXECUTED_AT');

  if (saved) {
    logWithLevel(LOG_LEVEL.MINIMAL, '最終実行日時を読み込み: ' + saved);
    return new Date(saved);
  }

  // 未保存時はフォールバック
  const fallback = new Date(Date.now() - fallbackHours * 60 * 60 * 1000);
  logWithLevel(LOG_LEVEL.MINIMAL, '最終実行日時が未保存のため ' + fallbackHours + '時間前 を使用: ' + fallback.toISOString());
  return fallback;
}
