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
 * #### 追加テスト
 * @see testIsActiveFiltering   - is_active フィルタリングの動作確認
 *
 * @version 1.1 (is_active フィルタリング テスト追加)
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
// Phase 2: 差分取得テスト
// ============================================================================

/**
 * 【テスト4】差分データの取得テスト
 *
 * 直近2時間前を基準日時とし、Supabase の NE_InventoryData から
 * 更新されたデータを取得するテストです。
 *
 * 【確認ポイント】
 * - エラーなく実行できるか
 * - 取得件数が表示されるか
 * - 取得データが存在する場合、先頭データの各フィールドが正しく表示されるか
 */
function testGetChangedInventory() {
  console.log('=== テスト4: 差分取得テスト ===\n');

  try {
    // 直近2時間前を基準とする
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    console.log('基準日時: ' + twoHoursAgo.toISOString() + ' (2時間前)\n');

    const data = getChangedInventorySince(twoHoursAgo);
    console.log('✓ 差分データ取得成功！');
    console.log('取得件数: ' + data.length + '件\n');

    if (data.length > 0) {
      console.log('【先頭データサンプル】');
      const sample = data[0];
      console.log('  商品コード : ' + sample['商品コード']);
      console.log('  商品名     : ' + sample['商品名']);
      console.log('  在庫数     : ' + sample['在庫数']);
      console.log('  更新日時   : ' + sample['更新日時']);
      console.log('  JANコード  : ' + sample['JANコード']);
    } else {
      console.log('※ 直近2時間以内に更新されたデータはありませんでした。');
    }

  } catch (error) {
    console.error('❌ エラー: ' + error.message);
  }

  console.log('\n=== テスト4 完了 ===');
}

/**
 * 【テスト5】最終実行日時の保存・読み込みテスト
 *
 * 最終実行日時 (SUPABASE_LAST_EXECUTED_AT) の保存と読み込みを往復で行い、
 * 正常に動作するか確認します。
 * 元の設定値を破壊しないように一時退避と復元を行います。
 *
 * 【確認ポイント】
 * - 保存・読み込みがエラーなく実行できるか
 * - 保存した値と読み込んだ値が一致するか
 * - 未設定時のフォールバック値（2時間前など）が正しく計算されるか
 */
function testLastExecutedAt() {
  console.log('=== テスト5: 最終実行日時 保存・読み込み確認 ===\n');

  const properties = PropertiesService.getScriptProperties();
  const originalValue = properties.getProperty('SUPABASE_LAST_EXECUTED_AT');

  try {
    // 1. 未設定状態（フォールバック）のテスト
    console.log('1. 一時的にプロパティを削除してフォールバックを確認します...');
    properties.deleteProperty('SUPABASE_LAST_EXECUTED_AT');

    const fallbackTime = loadLastExecutedAt(2); // 2時間前
    const now = Date.now();
    const expectedTime = now - 2 * 60 * 60 * 1000;

    // 誤差5秒以内であればOKとする
    const diff = Math.abs(fallbackTime.getTime() - expectedTime);
    if (diff < 5000) {
      console.log('  ✓ フォールバック日時の計算は正常です（約2時間前: ' + fallbackTime.toISOString() + '）');
    } else {
      console.log('  ❌ フォールバック日時の計算にズレがあります: ' + fallbackTime.toISOString());
    }

    // 2. 保存と読み込みのテスト
    console.log('\n2. 日時を保存して読み込みを確認します...');
    const savedString = saveLastExecutedAt();
    const loadedTime = loadLastExecutedAt();

    if (loadedTime.toISOString() === savedString) {
      console.log('  ✓ 保存された値 (' + savedString + ') と 読み込まれた値 (' + loadedTime.toISOString() + ') が一致しました！');
    } else {
      console.log('  ❌ 値が一致しません');
      console.log('    保存: ' + savedString);
      console.log('    読込: ' + loadedTime.toISOString());
    }

  } catch (error) {
    console.error('❌ エラー: ' + error.message);
  } finally {
    // 元の値を復元
    console.log('\n3. スクリプトプロパティの元の値を復元します...');
    if (originalValue !== null) {
      properties.setProperty('SUPABASE_LAST_EXECUTED_AT', originalValue);
      console.log('  元の値を復元しました: ' + originalValue);
    } else {
      properties.deleteProperty('SUPABASE_LAST_EXECUTED_AT');
      console.log('  元々未設定だったため、プロパティを削除しました。');
    }
  }

  console.log('\n=== テスト5 完了 ===');
}

// ============================================================================
// Phase 3: シート書き込みテスト
// ============================================================================

/**
 * 【テスト6】商品コード→行番号 マップ生成テスト
 *
 * スクリプトプロパティで設定された1番目のスプレッドシートの対象シートを開き、
 * 商品コードと行番号の対応マップが正しく生成されるか確認します。
 *
 * 【確認ポイント】
 * - エラーなく実行できるか
 * - 生成されたマップのサイズがログ出力されるか
 * - マップの先頭いくつかのエントリーが表示されるか
 */
function testBuildRowIndexMap() {
  console.log('=== テスト6: 商品コード→行番号 マップ生成確認 ===\n');

  try {
    const configs = getSheetConfigs();
    const config = configs[0]; // 1番目の設定を使用
    console.log('対象スプレッドシート: ' + config.id);
    console.log('対象シート名        : ' + config.sheet);

    const sheet = SpreadsheetApp.openById(config.id).getSheetByName(config.sheet);
    if (!sheet) {
      console.log('❌ シート「' + config.sheet + '」が見つかりません。先にテスト8を実行するか、シートを作成してください。');
      return;
    }

    const map = buildRowIndexMap(sheet);
    console.log('✓ マップ生成成功！');
    console.log('登録件数: ' + map.size + ' 件\n');

    if (map.size > 0) {
      console.log('【マップのエントリーサンプル（最大5件）】');
      let count = 0;
      for (const [code, row] of map) {
        console.log('  商品コード: ' + code + ' -> ' + row + ' 行目');
        count++;
        if (count >= 5) break;
      }
    } else {
      console.log('※ シートにデータがありません（またはヘッダー行のみです）。');
    }

  } catch (error) {
    console.error('❌ エラー: ' + error.message);
  }

  console.log('\n=== テスト6 完了 ===');
}

/**
 * 【テスト7】差分上書き更新テスト
 *
 * スクリプトプロパティで設定された1番目のスプレッドシートの指定シートに対し、
 * テスト用の擬似的な変更データを送信して、既存行の更新および
 * 新規商品の追記が行われるか検証します。
 *
 * 【注意】
 * このテストを実行すると、対象シートにテスト用データが書き込まれます。
 * 必要に応じて、テスト用のスプレッドシートIDとシート名を一時的に
 * スクリプトプロパティ（SHEET_CONFIG_1）に指定して実行してください。
 *
 * 【確認ポイント】
 * - 更新処理がエラーなく終了するか
 * - 既存商品（シートにあるもの）を渡した時に、正しく「更新」としてカウントされるか
 * - 存在しない新規商品を渡した時に、正しく「追記」としてカウントされるか
 */
function testUpdateInventoryRows() {
  console.log('=== テスト7: 差分上書き更新テスト ===\n');

  try {
    const configs = getSheetConfigs();
    const config = configs[0];
    const sheet = SpreadsheetApp.openById(config.id).getSheetByName(config.sheet);

    if (!sheet) {
      console.log('❌ シート「' + config.sheet + '」が見つかりません。先にテスト8を実行するか、シートを作成してください。');
      return;
    }

    console.log('書き込み前シートの最終行: ' + sheet.getLastRow() + ' 行\n');

    // テスト用のダミー差分データ（2件）を作成
    // 1件目は既存の商品コード（もしシートにデータがあればそれを上書き）、2件目は新規追加用の商品コード
    let existingGoodsCode = 'TEST-EXISTING-001';

    // シートにデータがあれば、実際の1件目の商品コードを取得して上書きテストに使用
    const map = buildRowIndexMap(sheet);
    if (map.size > 0) {
      existingGoodsCode = map.keys().next().value;
      console.log('既存商品のテストコード: ' + existingGoodsCode + ' (シートから取得)');
    } else {
      console.log('既存商品がないため、テストコード「' + existingGoodsCode + '」で新規作成します。');
    }

    const testChangedData = [
      {
        '商品コード': existingGoodsCode,
        '商品名': 'テスト商品（既存更新テスト）',
        '在庫数': 99,
        'フリー在庫数': 90,
        '引当数': 9,
        '更新日時': new Date().toISOString()
      },
      {
        '商品コード': 'TEST-NEW-' + Math.floor(Math.random() * 10000),
        '商品名': 'テスト商品（新規追記テスト）',
        '在庫数': 5,
        'フリー在庫数': 5,
        '更新日時': new Date().toISOString()
      }
    ];

    console.log('テストデータ書き込み中...');
    const result = updateInventoryRows(sheet, testChangedData);
    console.log('\n✓ 書き込み結果:');
    console.log('  更新件数: ' + result.updated + ' 件 (期待値: ' + (map.size > 0 ? 1 : 0) + ' 以上)');
    console.log('  追記件数: ' + result.appended + ' 件 (期待値: ' + (map.size > 0 ? 1 : 2) + ' 以上)');

    console.log('書き込み後シートの最終行: ' + sheet.getLastRow() + ' 行');

    // === アサーション（書き込み整合性検証） ===
    console.log('\n書き込み結果のアサーション（整合性検証）を実行します...');
    const assertMap = buildRowIndexMap(sheet);

    // 1. 既存行の上書き検証
    const existingRowNo = assertMap.get(existingGoodsCode);
    if (existingRowNo) {
      const rowData = sheet.getRange(existingRowNo, 1, 1, TOTAL_COLUMNS).getValues()[0];
      const name = rowData[DISTRIBUTE_COLUMNS.GOODS_NAME];
      const stock = rowData[DISTRIBUTE_COLUMNS.STOCK_QTY];
      const free = rowData[DISTRIBUTE_COLUMNS.FREE_QTY];
      if (name === 'テスト商品（既存更新テスト）' && Number(stock) === 99 && Number(free) === 90) {
        console.log('  ✓ 既存行の上書き検証OK (' + existingGoodsCode + ': 商品名=' + name + ', 在庫数=' + stock + ', フリー在庫=' + free + ')');
      } else {
        console.error('  ❌ 既存行の上書き検証NG (' + existingGoodsCode + ': 商品名=' + name + ', 在庫数=' + stock + ', フリー在庫=' + free + ')');
      }
    } else {
      console.error('  ❌ 既存テスト行が見つかりません: ' + existingGoodsCode);
    }

    // 2. 新規行の追記検証
    const newGoodsCode = testChangedData[1]['商品コード'];
    const newRowNo = assertMap.get(newGoodsCode);
    if (newRowNo) {
      const rowData = sheet.getRange(newRowNo, 1, 1, TOTAL_COLUMNS).getValues()[0];
      const name = rowData[DISTRIBUTE_COLUMNS.GOODS_NAME];
      const stock = rowData[DISTRIBUTE_COLUMNS.STOCK_QTY];
      if (name === 'テスト商品（新規追記テスト）' && Number(stock) === 5) {
        console.log('  ✓ 新規行の追記検証OK (' + newGoodsCode + ': 商品名=' + name + ', 在庫数=' + stock + ')');
      } else {
        console.error('  ❌ 新規行の追記検証NG (' + newGoodsCode + ': 商品名=' + name + ', 在庫数=' + stock + ')');
      }
    } else {
      console.error('  ❌ 新規テスト行が見つかりません: ' + newGoodsCode);
    }

  } catch (error) {
    console.error('❌ エラー: ' + error.message);
  }

  console.log('\n=== テスト7 完了 ===');
}

/**
 * 【テスト8】シート初期化テスト
 *
 * スクリプトプロパティで設定された1番目のスプレッドシートの指定シートに対し、
 * 全件初期化（クリア＆ヘッダー作成＆データ書き込み）ができるか確認します。
 *
 * 【注意】
 * このテストを実行すると、対象シートの既存データがクリアされます。
 * 必ずテスト用のスプレッドシートまたは、空のシートを指定してテストしてください。
 *
 * 【確認ポイント】
 * - 既存データがクリアされ、ヘッダー行が正しく生成されるか
 * - テスト用のダミーデータ（3件）が一括書き込みされるか
 * - 更新日時列（M列）のフォーマットが適用されているか
 */
function testInitializeSheet() {
  console.log('=== テスト8: シート初期化テスト ===\n');

  try {
    const configs = getSheetConfigs();
    const config = configs[0];
    const spreadsheet = SpreadsheetApp.openById(config.id);
    let sheet = spreadsheet.getSheetByName(config.sheet);

    if (!sheet) {
      console.log('シート「' + config.sheet + '」が存在しないため、新規作成します。');
      sheet = spreadsheet.insertSheet(config.sheet);
    }

    // ダミーの全件データ（3件）
    const dummyAllData = [
      { '商品コード': 'TEST-A001', '商品名': 'テスト商品A', '在庫数': 100, '更新日時': new Date().toISOString() },
      { '商品コード': 'TEST-B002', '商品名': 'テスト商品B', '在庫数': 200, '更新日時': new Date().toISOString() },
      { '商品コード': 'TEST-C003', '商品名': 'テスト商品C', '在庫数': 0, '更新日時': new Date().toISOString() }
    ];

    console.log('初期化処理を実行します...');
    initializeInventorySheet(sheet, dummyAllData);

    console.log('\n✓ 初期化完了後の検証:');
    console.log('  現在の最終行: ' + sheet.getLastRow() + ' 行 (期待値: 4 行)');

    const writtenHeaders = sheet.getRange(1, 1, 1, TOTAL_COLUMNS).getValues()[0];
    console.log('  ヘッダーチェック (A列): ' + (writtenHeaders[0] === '商品コード' ? '✓ OK' : '❌ NG ("' + writtenHeaders[0] + '")'));
    console.log('  ヘッダーチェック (M列): ' + (writtenHeaders[TOTAL_COLUMNS - 1] === '更新日時' ? '✓ OK' : '❌ NG ("' + writtenHeaders[TOTAL_COLUMNS - 1] + '")'));

    const sampleRow = sheet.getRange(2, 1, 1, 3).getValues()[0];
    console.log('  データチェック (A2:C2): ' + sampleRow[0] + ' | ' + sampleRow[1] + ' | 在庫: ' + sampleRow[2]);

  } catch (error) {
    console.error('❌ エラー: ' + error.message);
  }

  console.log('\n=== テスト8 完了 ===');
}

// ============================================================================
// Phase 4: 全体フローテスト
// ============================================================================

/**
 * 【テスト9】在庫配布処理 全体フローテスト
 *
 * 基準日時を直近2時間前に設定した上で、メイン関数 `distributeInventoryChanges()` を実行し、
 * Supabaseからの差分取得からスプレッドシートへの書き込みまでの一連の流れが
 * 正常に動作するか確認します。
 * 元の設定値（SUPABASE_LAST_EXECUTED_AT）を破壊しないように一時退避と復元を行います。
 *
 * 【確認ポイント】
 * - エラーなく実行が完了すること
 * - ログに「在庫配布処理（差分更新）開始」および「完了」が出力されること
 * - スプレッドシートが正しく更新されること（または0件で終了すること）
 */
function testFullFlow() {
  console.log('=== テスト9: 在庫配布処理 全体フローテスト ===\n');

  const properties = PropertiesService.getScriptProperties();
  const originalValue = properties.getProperty('SUPABASE_LAST_EXECUTED_AT');

  try {
    // 直近2時間前を基準日時として一時設定する
    const testSince = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    properties.setProperty('SUPABASE_LAST_EXECUTED_AT', testSince);
    console.log('テスト用基準日時を一時設定しました: ' + testSince);

    console.log('\nメイン関数 distributeInventoryChanges() を実行します...');
    distributeInventoryChanges();
    console.log('✓ メイン関数実行完了');

    // 実行後のプロパティ値を確認
    const updatedValue = properties.getProperty('SUPABASE_LAST_EXECUTED_AT');
    console.log('実行後の SUPABASE_LAST_EXECUTED_AT: ' + updatedValue);

  } catch (error) {
    console.error('❌ エラー: ' + error.message);
  } finally {
    // 元のプロパティ値を復元
    console.log('\nスクリプトプロパティの元の値を復元します...');
    if (originalValue !== null) {
      properties.setProperty('SUPABASE_LAST_EXECUTED_AT', originalValue);
      console.log('  元の値を復元しました: ' + originalValue);
    } else {
      properties.deleteProperty('SUPABASE_LAST_EXECUTED_AT');
      console.log('  元々未設定だったため、プロパティを削除しました。');
    }
  }

  console.log('\n=== テスト9 完了 ===');
}

/**
 * 【テスト10】エラーメール送信テスト
 *
 * スクリプトプロパティ `ERROR_NOTIFICATION_EMAIL` が正しく設定されていることを確認し、
 * テスト用のエラーメールを送信します。
 *
 * 【確認ポイント】
 * - エラーなく送信処理が完了すること
 * - 実際に指定のアドレスにメールが届くこと
 */
function testSendErrorMail() {
  console.log('=== テスト10: エラーメール送信テスト ===\n');

  try {
    const properties = PropertiesService.getScriptProperties();
    const email = properties.getProperty('ERROR_NOTIFICATION_EMAIL');

    if (!email || email.trim() === '') {
      console.log('❌ スクリプトプロパティ「ERROR_NOTIFICATION_EMAIL」が設定されていません。');
      console.log('送信テストをスキップします。');
      return;
    }

    console.log('設定されている送信先: ' + email);
    console.log('テストメールを送信します...');

    const subject = '【テスト】在庫配布処理 エラーメール送信テスト';
    const body = 'このメールは DistributeInventory プロジェクトの testSendErrorMail() 関数から送信されたテストメールです。\n\n' +
      '■ 送信日時: ' + new Date().toLocaleString() + '\n' +
      '■ ステータス: 正常動作中\n\n' +
      'このメールを受信できた場合、エラー発生時の通知連携設定は正常に機能しています。';

    sendErrorMail(subject, body);

    console.log('\n✓ テストメール送信処理が完了しました。');
    console.log('  受信トレイを確認し、実際にメールが届いていることをご確認ください。');

  } catch (error) {
    console.error('❌ エラー: ' + error.message);
  }

  console.log('\n=== テスト10 完了 ===');
}

/**
 * 【テスト11】is_active フィルタリングの動作確認
 *
 * getChangedInventorySince() を用いて取得したデータの中に、
 * is_active が false のレコードが含まれていないことを検証します。
 *
 * 【確認ポイント】
 * - 取得したすべてのレコードで 'is_active' が true であること
 * - エラーなく実行完了すること
 */
function testIsActiveFiltering() {
  console.log('=== テスト11: is_active フィルタリング検証 ===\n');

  try {
    // 基準日時として十分に古い過去の日時（1970年1月1日）を指定し、Supabase の全件を取得
    const epoch = new Date('1970-01-01T00:00:00Z');
    console.log('1970-01-01 以降の全データを取得してフィルタリング状態を検証します...');

    const data = getChangedInventorySince(epoch);
    console.log('✓ データ取得成功！ 件数: ' + data.length + '件\n');

    if (data.length === 0) {
      console.log('⚠️ 取得されたデータが 0件 のため、検証をスキップします。');
      console.log('NE_InventoryData テーブルにデータが存在するか確認してください。');
      return;
    }

    let activeCount = 0;
    let inactiveCount = 0;
    let nullOrUndefinedCount = 0;

    for (const record of data) {
      const isActive = record['is_active'];
      if (isActive === true) {
        activeCount++;
      } else if (isActive === false) {
        inactiveCount++;
      } else {
        // is_active カラムが存在しないか、NULL の場合
        nullOrUndefinedCount++;
      }
    }

    console.log('【検証結果】');
    console.log('  is_active = true  の件数: ' + activeCount + ' 件');
    console.log('  is_active = false の件数: ' + inactiveCount + ' 件 (期待値: 0 件)');
    console.log('  is_active が未定義/NULL の件数: ' + nullOrUndefinedCount + ' 件 (期待値: 0 件)');

    if (inactiveCount === 0 && nullOrUndefinedCount === 0) {
      console.log('\n✓ 検証成功: すべての取得レコードが is_active = true でした！');
    } else {
      console.error('\n❌ 検証失敗: is_active が false、または未定義/NULL のレコードが含まれています。');
    }

  } catch (error) {
    console.error('❌ エラー: ' + error.message);
  }

  console.log('\n=== テスト11 完了 ===');
}

/**
 * 【テスト12】Webhook受信のトークン認証テスト（エラー・正常系）
 *
 * doPost(e) の挙動を手動（モック）イベントで検証します。
 * スクリプトプロパティ「API_SHARED_TOKEN」が設定されている必要があります。
 * ※一時的にダミートークンを設定して検証します。
 */
function testWebhookReceiver() {
  console.log('=== テスト12: Webhook受信 (doPost) 認証検証 ===\n');

  const properties = PropertiesService.getScriptProperties();
  const originalToken = properties.getProperty('API_SHARED_TOKEN');

  // テスト用トークンを設定
  const testToken = 'test_shared_token_12345';
  properties.setProperty('API_SHARED_TOKEN', testToken);

  try {
    // 1. 認証失敗テスト (トークン不一致)
    console.log('--- 1. 認証失敗テスト (不正なトークン) ---');
    const mockEventFail = {
      postData: {
        contents: JSON.stringify({
          source: 'TestSender',
          token: 'invalid_token'
        })
      }
    };
    const responseFail = doPost(mockEventFail);
    const resultFail = JSON.parse(responseFail.getContentText());
    console.log('レスポンス: ' + responseFail.getContentText());
    if (resultFail.result === 'unauthorized') {
      console.log('✓ 期待通り認証エラーとなりました。');
    } else {
      console.error('❌ エラー: 認証エラーが返されませんでした。');
    }

    // 2. 正常系テスト (正しいトークン)
    // ※ 実際に distributeInventoryChanges() が実行されるため、Supabaseやスプレッドシートの接続が稼働している必要があります。
    console.log('\n--- 2. 正常系テスト (正しいトークン) ---');
    const mockEventSuccess = {
      postData: {
        contents: JSON.stringify({
          source: 'TestSender',
          token: testToken
        })
      }
    };
    const responseSuccess = doPost(mockEventSuccess);
    const resultSuccess = JSON.parse(responseSuccess.getContentText());
    console.log('レスポンス: ' + responseSuccess.getContentText());
    if (resultSuccess.result === 'success') {
      console.log('✓ 期待通り正常終了しました。');
    } else {
      console.error('❌ エラー: 正常終了しませんでした。内容: ' + JSON.stringify(resultSuccess));
    }

  } catch (error) {
    console.error('❌ エラー: ' + error.message);
  } finally {
    // スクリプトプロパティを元に戻す
    if (originalToken) {
      properties.setProperty('API_SHARED_TOKEN', originalToken);
    } else {
      properties.deleteProperty('API_SHARED_TOKEN');
    }
  }

  console.log('\n=== テスト12 完了 ===');
}

/**
 * 最後にWebhookで受信したデータをスクリプトプロパティから読み出してログ出力する
 */
function printLastReceived() {
  const data = PropertiesService.getScriptProperties().getProperty('LAST_RECEIVED_DATA');
  if (data) {
    console.log('--- 最後に受信したデータ ---');
    console.log(data);

    // JSONとして展開して個別の値を確認する場合
    try {
      const body = JSON.parse(data);
      console.log('送信元 (source): ' + body.source);
      console.log('発火日時 (firedAt): ' + body.firedAt);
      console.log('トークン (token): ' + body.token);
    } catch (e) {
      console.error('JSONパースエラー: ' + e.message);
    }
  } else {
    console.log('受信データ (LAST_RECEIVED_DATA) はまだ保存されていません。');
  }
}