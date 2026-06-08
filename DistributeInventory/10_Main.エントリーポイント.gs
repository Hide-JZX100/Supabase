/**
 * @file 10_Main.エントリーポイント.gs
 * @description DistributeInventory プロジェクトのメインオーケストレーションモジュール。
 * 定期実行トリガーから呼び出される差分更新の実行や、初期化処理の制御を行います。
 *
 * ### 依存関係
 * - **参照元**: トリガー設定.gs (distributeInventoryChanges がトリガー設定される)
 * - **参照先**:
 *   - 11_Config.設定管理.gs (getSheetConfigs 等の取得)
 *   - 12_Logger.ログ管理.gs (ログ出力、エラーログシート書き込み)
 *   - 14_SupabaseRepository.差分取得.gs (差分データ取得、最終実行日時保存)
 *   - 15_SheetRepository.シート書き込み.gs (スプレッドシート書き込み・初期化)
 *
 * @version 1.0 (新規作成)
 */

/**
 * 【定期トリガー実行用】Supabase から差分データを取得し、登録されたすべてのスプレッドシートに配布する
 *
 * 【処理フロー】
 * 1. 開始ログの出力（ログレベル：MINIMAL）。
 * 2. `loadLastExecutedAt(2)` を呼び出して、前回実行日時（未保存時は2時間前）を取得。
 * 3. `getChangedInventorySince(since)` を呼び出して、Supabase から差分データを取得。
 * 4. 取得レコードが 0件 の場合は、最終実行日時を更新せずに処理を終了。
 * 5. `getSheetConfigs()` を呼び出して、スクリプトプロパティからすべてのスプレッドシート設定を取得。
 * 6. 各スプレッドシートに対して上書き更新を実行：
 *    - スプレッドシートを開き、指定されたシートを取得。
 *    - シートが存在しない場合はエラー。
 *    - `updateInventoryRows(sheet, changedData)` を実行して差分データを上書き。
 *    - 処理中に例外が発生した場合は、エラー内容をスプレッドシートごとのエラーバッファに蓄積し、次のスプレッドシートの処理を続行。
 * 7. ループ終了後、エラーが発生した各スプレッドシートIDに対して `logErrorsToSheet(spreadsheetId, errorDetails)` でエラーログを書き込み。
 * 8. `saveLastExecutedAt()` を呼び出して、今回の実行日時を最終実行日時としてスクリプトプロパティに更新。
 * 9. 完了サマリーをログ出力。
 *
 * @return {void}
 */
function distributeInventoryChanges() {
  const startTime = new Date();
  logWithLevel(LOG_LEVEL.MINIMAL, '=== 在庫配布処理（差分更新）開始 ===');

  try {
    // 前回実行日時を取得
    const since = loadLastExecutedAt(2); // デフォルト2時間前

    // 差分データを取得
    const changedData = getChangedInventorySince(since);
    if (!changedData || changedData.length === 0) {
      logWithLevel(LOG_LEVEL.MINIMAL, '差分データが 0件 のため、処理を終了します。');
      logWithLevel(LOG_LEVEL.MINIMAL, '=== 在庫配布処理 終了 ===');
      return;
    }

    // 配布先スプレッドシート設定の取得
    const configs = getSheetConfigs();
    logWithLevel(LOG_LEVEL.SUMMARY, '配布先スプレッドシート数: ' + configs.length + ' 件');

    // スプレッドシートごとのエラーを格納するバッファ
    const errorMap = new Map(); // key: spreadsheetId, value: Array<{timestamp, context, errorMessage}>

    // 各スプレッドシートに書き込み
    for (const config of configs) {
      logWithLevel(LOG_LEVEL.SUMMARY, 'スプレッドシート処理中: ' + config.configKey + ' (ID: ' + config.id.substring(0, 10) + '..., シート: ' + config.sheet + ')');

      try {
        const spreadsheet = SpreadsheetApp.openById(config.id);
        const sheet = spreadsheet.getSheetByName(config.sheet);
        if (!sheet) {
          throw new Error('シート「' + config.sheet + '」がスプレッドシートに見つかりません。');
        }

        // 差分上書き更新を実行
        updateInventoryRows(sheet, changedData);

      } catch (error) {
        logError('  ❌ スプレッドシート ' + config.configKey + ' の更新中にエラーが発生しました: ' + error.message);

        // エラー情報をバッファに追加
        if (!errorMap.has(config.id)) {
          errorMap.set(config.id, []);
        }
        errorMap.get(config.id).push({
          timestamp: new Date(),
          context: 'distributeInventoryChanges - ' + config.sheet,
          errorMessage: error.message
        });
      }
    }

    // エラーログの書き込み（スプレッドシートごと）
    for (const [spreadsheetId, errorDetails] of errorMap.entries()) {
      logErrorsToSheet(spreadsheetId, errorDetails);
    }

    // 処理完了したため最終実行日時を更新（一部の書き込みエラーがあったとしても、データ取得は成功したため更新する）
    saveLastExecutedAt();

    const duration = ((new Date() - startTime) / 1000).toFixed(1);
    logWithLevel(LOG_LEVEL.MINIMAL, '=== 在庫配布処理 完了（処理時間: ' + duration + ' 秒） ===');

  } catch (error) {
    logError('❌ 在庫配布処理（全体）で重大なエラーが発生しました: ' + error.message);
    // 全体エラー時は最終実行日時を更新しない
  }
}

/**
 * 【手動実行用】全スプレッドシートの指定シートを初期化し、Supabase の全在庫データを一括書き込みする
 *
 * 【処理フロー】
 * 1. 開始確認ログを出力。
 * 2. 基準日時として十分に古い過去の日時（1970年1月1日）を指定し、`getChangedInventorySince()` で Supabase の全件を取得。
 * 3. 取得レコードが 0件 の場合は処理を終了。
 * 4. `getSheetConfigs()` を呼び出して、すべてのスプレッドシート設定を取得。
 * 5. 各スプレッドシートに対して初期化を実行：
 *    - スプレッドシートを開く。
 *    - 指定シート名が存在しない場合は自動作成し、`initializeInventorySheet(sheet, allData)` でヘッダー設定および全件データ書き込みを実行。
 *    - エラー発生時はログに記録し、他のシートの処理を継続。
 * 6. `saveLastExecutedAt()` を呼び出して、今回の実行日時を最終実行日時としてスクリプトプロパティに更新（以降のトリガー実行が差分更新になるようにするため）。
 * 7. 完了ログを出力。
 *
 * @return {void}
 */
function initializeAllSheets() {
  const startTime = new Date();
  logWithLevel(LOG_LEVEL.MINIMAL, '=== 全件初期化処理 開始 ===');

  try {
    // 1970年を基準として全件データを取得
    const epoch = new Date('1970-01-01T00:00:00Z');
    logWithLevel(LOG_LEVEL.MINIMAL, 'Supabase から全在庫データを取得します...');
    const allData = getChangedInventorySince(epoch);

    if (!allData || allData.length === 0) {
      logWithLevel(LOG_LEVEL.MINIMAL, '⚠️ Supabase にデータが存在しません。処理を中断します。');
      return;
    }

    logWithLevel(LOG_LEVEL.MINIMAL, '全在庫データ取得完了: ' + allData.length + ' 件');

    // 配布先設定を取得
    const configs = getSheetConfigs();
    logWithLevel(LOG_LEVEL.SUMMARY, '初期化対象スプレッドシート数: ' + configs.length + ' 件');

    for (const config of configs) {
      logWithLevel(LOG_LEVEL.SUMMARY, 'スプレッドシート初期化中: ' + config.configKey + ' (ID: ' + config.id.substring(0, 10) + '..., シート: ' + config.sheet + ')');

      try {
        const spreadsheet = SpreadsheetApp.openById(config.id);
        let sheet = spreadsheet.getSheetByName(config.sheet);

        if (!sheet) {
          logWithLevel(LOG_LEVEL.SUMMARY, '  シート「' + config.sheet + '」が見つからないため、新規作成します。');
          sheet = spreadsheet.insertSheet(config.sheet);
        }

        // 初期化処理を実行
        initializeInventorySheet(sheet, allData);

      } catch (sheetError) {
        logError('  ❌ スプレッドシート ' + config.configKey + ' の初期化中にエラーが発生しました: ' + sheetError.message);
      }
    }

    // 最終実行日時を現在時刻に更新
    saveLastExecutedAt();

    const duration = ((new Date() - startTime) / 1000).toFixed(1);
    logWithLevel(LOG_LEVEL.MINIMAL, '=== 全件初期化処理 完了（処理時間: ' + duration + ' 秒） ===');

  } catch (error) {
    logError('❌ 全件初期化処理で重大なエラーが発生しました: ' + error.message);
  }
}

