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

