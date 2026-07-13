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

// ============================================================================
// テスト用関数
// ============================================================================

/**
 * getSupabaseConfig関数のテスト
 *
 * プロパティが正常にロードされるか、未設定の場合に適切なエラーがスローされるかを検証します。
 *
 * 【テスト手順】
 * 1. 現状のプロパティをバックアップ
 * 2. テスト用の値をセットして getSupabaseConfig() を呼び出し、値が一致するか確認する
 * 3. プロパティを削除してエラーが正しくスローされるか確認する
 * 4. バックアップからプロパティを復元する
 */
function test_getSupabaseConfig() {
  const properties = PropertiesService.getScriptProperties();

  // 1. バックアップ
  const originalUrl = properties.getProperty('SUPABASE_URL');
  const originalKey = properties.getProperty('SUPABASE_KEY');

  console.log('--- test_getSupabaseConfig 開始 ---');

  try {
    // 2. 正常系テスト
    properties.setProperty('SUPABASE_URL', 'https://test-project.supabase.co');
    properties.setProperty('SUPABASE_KEY', 'test-anon-key-12345');

    const config = getSupabaseConfig();
    if (config.url === 'https://test-project.supabase.co' && config.key === 'test-anon-key-12345') {
      console.log('✅ 正常系テスト: 成功（設定値が一致）');
    } else {
      console.error('❌ 正常系テスト: 失敗（設定値が不一致）');
    }

    // 3. 異常系テスト
    properties.deleteProperty('SUPABASE_URL');
    try {
      getSupabaseConfig();
      console.error('❌ 異常系テスト: 失敗（エラーがスローされませんでした）');
    } catch (e) {
      console.log('✅ 異常系テスト: 成功（期待通りエラーがスローされました: ' + e.message + '）');
    }

  } catch (error) {
    console.error('❌ テスト実行中に予期せぬエラーが発生しました: ' + error.message);
  } finally {
    // 4. 復元
    if (originalUrl) {
      properties.setProperty('SUPABASE_URL', originalUrl);
    } else {
      properties.deleteProperty('SUPABASE_URL');
    }

    if (originalKey) {
      properties.setProperty('SUPABASE_KEY', originalKey);
    } else {
      properties.deleteProperty('SUPABASE_KEY');
    }
    console.log('--- test_getSupabaseConfig 終了 ---');
  }
}
