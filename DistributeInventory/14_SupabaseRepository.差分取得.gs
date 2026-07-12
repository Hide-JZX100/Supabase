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

/** Supabase REST API の1回のクエリで取得するレコード数上限（デフォルト上限の 1,000 件に設定） */
const SUPABASE_QUERY_LIMIT = 1000;

/**
 * 指定日時以降に更新された在庫データを取得する（1,000件超のデータに対応するページネーション機能付き）
 *
 * 【処理フロー】
 * 1. 引数の日時を ISO 8601 文字列に変換する。
 * 2. 取得結果を蓄積する配列 `allData` と `offset`（取得開始位置）を初期化。
 * 3. ループ内処理：
 *    a. querySupabaseTable() で 更新日時 >= since, is_active = true, limit=1000, offset=[現在の位置] の条件でリクエスト。
 *    b. 取得データがない、または成否フラグが false の場合はエラーをスロー。
 *    c. 取得データを `allData` に追加。
 *    d. 今回取得した件数が `SUPABASE_QUERY_LIMIT` (1,000) 未満の場合、すべてのデータが取得できたと判断してループを抜ける。
 *    e. 取得件数が上限値と等しい場合、`offset` を 1,000 追加して次のページの読み込みへ進む。
 * 4. 取得した全データを配列で返す（0件の場合は空配列）。
 *
 * @param {Date|string} since - 取得基準日時（この日時以降に更新された商品を取得）
 * @return {Array<Object>} 変化した商品データの配列。is_active が true のレコードのみ。
 * @throws {Error} Supabase への接続エラーや通信エラーが発生した場合
 */
function getChangedInventorySince(since) {
  const sinceStr = (since instanceof Date) ? since.toISOString() : since;

  const sinceJst = Utilities.formatDate(new Date(sinceStr), 'JST', 'yyyy/MM/dd HH:mm:ss');
  logWithLevel(LOG_LEVEL.MINIMAL, '差分取得開始: ' + sinceJst + ' JST (' + sinceStr + ') 以降に更新された商品');

  const allData = [];
  let offset = 0;

  try {
    while (true) {
      logWithLevel(LOG_LEVEL.SUMMARY, '  データ取得中... (オフセット: ' + offset + ', 上限: ' + SUPABASE_QUERY_LIMIT + ')');

      const result = querySupabaseTable('ne_inventory_data', {
        '更新日時': 'gte.' + sinceStr,
        'is_active': 'eq.true',
        'order': '更新日時.desc',
        'limit': SUPABASE_QUERY_LIMIT.toString(),
        'offset': offset.toString()
      });

      if (!result.success || !result.data) {
        throw new Error('Supabase からのデータ取得に失敗しました。');
      }

      const count = result.data.length;
      allData.push(...result.data);

      logWithLevel(LOG_LEVEL.SUMMARY, '    -> ' + count + ' 件取得 (累計: ' + allData.length + ' 件)');

      // 取得した件数が 1,000 件未満であれば、これ以上のデータはないと判断して終了
      if (count < SUPABASE_QUERY_LIMIT) {
        break;
      }

      offset += SUPABASE_QUERY_LIMIT;
    }

    logWithLevel(LOG_LEVEL.MINIMAL, '差分取得完了: 総件数 ' + allData.length + ' 件');
    return allData;

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
  const nowJst = Utilities.formatDate(now, 'JST', 'yyyy/MM/dd HH:mm:ss');
  logWithLevel(LOG_LEVEL.MINIMAL, '最終実行日時を保存: ' + nowJst + ' JST (' + isoString + ')');
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
    const savedJst = Utilities.formatDate(new Date(saved), 'JST', 'yyyy/MM/dd HH:mm:ss');
    logWithLevel(LOG_LEVEL.MINIMAL, '最終実行日時を読み込み: ' + savedJst + ' JST (' + saved + ')');
    return new Date(saved);
  }

  // 未保存時はフォールバック
  const fallback = new Date(Date.now() - fallbackHours * 60 * 60 * 1000);
  const fallbackJst = Utilities.formatDate(fallback, 'JST', 'yyyy/MM/dd HH:mm:ss');
  logWithLevel(LOG_LEVEL.MINIMAL, '最終実行日時が未保存のため ' + fallbackHours + '時間前 を使用: ' + fallbackJst + ' JST (' + fallback.toISOString() + ')');
  return fallback;
}

/**
 * タイムゾーン修正後のログ出力テスト関数
 */
function test_logTimezoneChange() {
  console.log("--- タイムゾーンログ表示テスト開始 ---");

  // 1. 保存用テスト
  const testIso = saveLastExecutedAt();

  // 2. 読み込み用テスト
  const loadedDate = loadLastExecutedAt();

  // 3. 差分取得開始ログテスト
  getChangedInventorySince(loadedDate);

  console.log("--- タイムゾーンログ表示テスト終了 ---");
}