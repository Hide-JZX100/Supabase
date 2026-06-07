
/**
 * Supabase 接続設定をスクリプトプロパティから取得する
 *
 * SUPABASE_URL と SUPABASE_KEY を取得します。
 * いずれかが設定されていない場合はエラーをスローします。
 *
 * @return {{url: string, key: string}} 接続用 URL と API キーのオブジェクト
 * @throws {Error} 必要なスクリプトプロパティが設定されていない場合
 */
function getSupabaseConfig() {
  const properties = PropertiesService.getScriptProperties();
  const url = properties.getProperty('SUPABASE_URL');
  const key = properties.getProperty('SUPABASE_KEY');

  if (!url || !key) {
    throw new Error(
      '必要なスクリプトプロパティが設定されていません。\n' +
      'SUPABASE_URL および SUPABASE_KEY を設定してください。'
    );
  }

  return { url: url, key: key };
}