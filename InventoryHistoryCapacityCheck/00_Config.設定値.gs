// 監視設定定数
const TARGET_TABLE = 'ne_inventory_history';
const RPC_FUNCTION_NAME = 'get_table_size_mb';
const FREE_CAPACITY_LIMIT_MB = 500; // Supabase無料枠の上限 (500MB)

// 容量アラート閾値 (MB)
const CAPACITY_THRESHOLDS = [80, 90, 100];

// ログレベルの定義
const LOG_LEVEL = {
  MINIMAL: 1, // 最小限（開始・終了・警告・エラー）
  SUMMARY: 2, // サマリー（主要処理ステップの記録）
  DETAILED: 3 // 詳細（デバッグ用）
};

// デフォルトのログレベル
const DEFAULT_LOG_LEVEL = LOG_LEVEL.SUMMARY;

// リトライ設定
const RETRY_CONFIG = {
  MAX_RETRIES: 3,        // 最大リトライ回数
  ENABLE_RETRY: true,    // リトライの有効/無効
  WAIT_SECONDS: 2        // リトライ間の初期ウェイト（秒）
};


/**
 * Supabase接続設定（URLとAPIキー）をスクリプトプロパティから取得する。
 *
 * 【処理フロー】
 * 1. PropertiesServiceから'SUPABASE_URL'および'SUPABASE_KEY'を取得する。
 * 2. どちらか一方でも存在しない場合はエラーをスローする。
 * 3. 取得したURLとキーをオブジェクトに格納して返却する。
 *
 * @return {Object} { url: string, key: string } Supabase接続設定
 * @throws {Error} 必要なスクリプトプロパティが設定されていない場合
 */
function getSupabaseConfig() {
  const properties = PropertiesService.getScriptProperties();
  const url = properties.getProperty('SUPABASE_URL');
  const key = properties.getProperty('SUPABASE_KEY');

  if (!url || !key) {
    throw new Error('必要なスクリプトプロパティが設定されていません。「SUPABASE_URL」および「SUPABASE_KEY」を設定してください。');
  }

  return {
    url: url,
    key: key
  };
}

