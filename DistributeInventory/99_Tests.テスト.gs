// ============================================================================
// Phase 1: 基盤確認テスト
// ============================================================================

/**
 * 【テスト1】Supabase 接続確認
 *
 * Supabase の NE_InventoryData テーブルから1件だけ取得して
 * 接続・認証が正常に機能しているか確認します。
 *
 * 【事前準備】
 * スクリプトプロパティに以下を設定してから実行してください。
 *   SUPABASE_URL : Supabase プロジェクトの URL
 *   SUPABASE_KEY : Supabase anon key
 *
 * 【確認ポイント】
 * - "✓ 接続成功" が表示されるか
 * - 取得データのフィールド名（日本語列名）が正しいか
 */
function testSupabaseConnection() {
  console.log('=== テスト1: Supabase 接続確認 ===\n');

  try {
    console.log('1件だけ取得してみます...');

    const result = querySupabaseTable('NE_InventoryData', {
      'limit': '1'
    });

    if (result.success && result.data.length > 0) {
      const sample = result.data[0];
      console.log('✓ 接続成功！\n');
      console.log('【取得データサンプル（1件）】');
      console.log('  商品コード : ' + sample['商品コード']);
      console.log('  商品名     : ' + sample['商品名']);
      console.log('  在庫数     : ' + sample['在庫数']);
      console.log('  更新日時   : ' + sample['更新日時']);
      console.log('');
      console.log('【フィールド一覧】');
      console.log(Object.keys(sample).join(', '));

    } else if (result.success && result.data.length === 0) {
      console.log('⚠️ 接続は成功しましたが、データが0件です。');
      console.log('NE_InventoryData テーブルにデータが存在するか確認してください。');

    } else {
      console.log('❌ 接続に失敗しました');
    }

  } catch (error) {
    console.error('❌ エラー: ' + error.message);
    console.error('');
    console.error('【確認事項】');
    console.error('1. スクリプトプロパティに SUPABASE_URL が設定されているか');
    console.error('2. スクリプトプロパティに SUPABASE_KEY が設定されているか');
    console.error('3. Supabase プロジェクトが起動しているか');
  }

  console.log('\n=== テスト1 完了 ===');
}
