/**
 * @file 99_Tests.テスト.gs
 * @description DistributeInventory プロジェクトの動作確認・診断ツール。
 * 各フェーズの実装完了時に対応するテスト関数を実行して動作を確認します。
 *
 * ### テスト関数一覧
 * #### Phase 1: 基盤確認
 * @see testSupabaseConnection - Supabase 接続確認（1件取得）
 * @see testSheetConfigs       - スクリプトプロパティの設定値確認
 * @see testLogLevel           - ログレベル設定確認
 *
 * #### Phase 2: 差分取得確認（Phase 2実装後に使用）
 * @see testGetChangedInventory - 差分取得の動作確認
 * @see testLastExecutedAt      - 最終実行日時の保存・読み込み確認
 *
 * #### Phase 3: シート書き込み確認（Phase 3実装後に使用）
 * @see testBuildRowIndexMap    - 行番号マップ生成確認
 * @see testUpdateInventoryRows - テスト用スプレッドシートへの書き込み確認
 * @see testInitializeSheet     - 初期化関数の動作確認
 *
 * #### Phase 4: 全体フロー確認（Phase 4実装後に使用）
 * @see testFullFlow            - distributeInventoryChanges() の全体動作確認
 *
 * @version 1.0 (Phase 1 テスト実装)
 */

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

/**
 * 【テスト3】ログレベル設定確認
 *
 * ログレベルの取得・変更が正しく動作するか確認します。
 */
function testLogLevel() {
  console.log('=== テスト3: ログレベル設定確認 ===\n');

  // 現在のログレベルを表示
  showCurrentLogLevel();

  console.log('\n--- 各ログレベルの出力確認 ---');

  // 各レベルのログ出力テスト
  console.log('\n■ MINIMAL レベルの出力（currentLevel >= 1 で表示）:');
  logWithLevel(LOG_LEVEL.MINIMAL, '  → MINIMAL ログ（常に表示）');

  console.log('\n■ SUMMARY レベルの出力（currentLevel >= 2 で表示）:');
  logWithLevel(LOG_LEVEL.SUMMARY, '  → SUMMARY ログ（SUMMARY/DETAILED で表示）');

  console.log('\n■ DETAILED レベルの出力（currentLevel >= 3 で表示）:');
  logWithLevel(LOG_LEVEL.DETAILED, '  → DETAILED ログ（DETAILED のみで表示）');

  console.log('\n■ エラーログ出力（常に表示）:');
  logError('  → エラーログ（ログレベルに関わらず常に表示）');

  console.log('\n=== テスト3 完了 ===');
}

// ============================================================================
// Phase 2 以降のテスト関数（実装後に追記予定）
// ============================================================================
// testGetChangedInventory()  → Phase 2 実装後に追記
// testLastExecutedAt()       → Phase 2 実装後に追記
// testBuildRowIndexMap()     → Phase 3 実装後に追記
// testUpdateInventoryRows()  → Phase 3 実装後に追記
// testInitializeSheet()      → Phase 3 実装後に追記
// testFullFlow()             → Phase 4 実装後に追記
