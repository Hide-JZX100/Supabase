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


/**
 * 【テスト2】スクリプトプロパティの設定値確認
 *
 * SHEET_CONFIG_1, SHEET_CONFIG_2, ... が正しいフォーマットで
 * 設定されているか確認します。
 *
 * 【事前準備】
 * スクリプトプロパティに以下を設定してから実行してください。
 *   SHEET_CONFIG_1 : {"id":"スプレッドシートID","sheet":"シート名"}
 *
 * 【確認ポイント】
 * - 設定件数が正しいか
 * - id と sheet が正しく解析されているか
 * - スプレッドシートに実際にアクセスできるか
 */
function testSheetConfigs() {
  console.log('=== テスト2: スクリプトプロパティ設定確認 ===\n');

  try {
    // getSheetConfigs() でスクリプトプロパティを読み込む
    const configs = getSheetConfigs();
    console.log('✓ スクリプトプロパティ読み込み成功');
    console.log('設定件数: ' + configs.length + '件\n');

    configs.forEach((config, index) => {
      console.log('【設定 ' + (index + 1) + ': ' + config.configKey + '】');
      console.log('  スプレッドシートID: ' + config.id);
      console.log('  シート名          : ' + config.sheet);

      // 実際にスプレッドシートにアクセスできるか確認
      try {
        const spreadsheet = SpreadsheetApp.openById(config.id);
        console.log('  ✓ スプレッドシートアクセス成功: ' + spreadsheet.getName());

        const sheet = spreadsheet.getSheetByName(config.sheet);
        if (sheet) {
          console.log('  ✓ シート「' + config.sheet + '」が存在します（現在: ' + sheet.getLastRow() + '行）');
        } else {
          console.log('  ⚠️ シート「' + config.sheet + '」が存在しません（初回書き込み時に自動作成される想定です）');
        }

      } catch (ssError) {
        console.error('  ❌ スプレッドシートにアクセスできません: ' + ssError.message);
        console.error('    スプレッドシートIDが正しいか確認してください');
      }

      console.log('');
    });

  } catch (error) {
    console.error('❌ エラー: ' + error.message);
    console.error('');
    console.error('【設定例】');
    console.error('キー: SHEET_CONFIG_1');
    console.error('値 : {"id":"1BxAbc...","sheet":"在庫管理"}');
  }

  // Supabase 設定の確認
  console.log('【Supabase設定確認】');
  try {
    const config = getSupabaseConfig();
    console.log('✓ SUPABASE_URL: ' + config.url.substring(0, 30) + '...');
    console.log('✓ SUPABASE_KEY: ' + config.key.substring(0, 10) + '...(設定済み)');
  } catch (error) {
    console.error('❌ ' + error.message);
  }

  // 最終実行日時の確認
  console.log('');
  console.log('【最終実行日時設定確認】');
  const savedAt = PropertiesService.getScriptProperties()
    .getProperty('SUPABASE_LAST_EXECUTED_AT');
  if (savedAt) {
    console.log('✓ SUPABASE_LAST_EXECUTED_AT: ' + savedAt);
  } else {
    console.log('⚠️ SUPABASE_LAST_EXECUTED_AT: 未設定（初回実行時はフォールバック値を使用）');
  }

  console.log('\n=== テスト2 完了 ===');
}

