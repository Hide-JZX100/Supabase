/**
 * @file トリガー設定.gs
 * @description DistributeInventory プロジェクトのトリガー制御スクリプト。
 * 指定した時間に自動で実行するための時間ベースのトリガーを設定・削除します。
 * GetInventoryData（在庫取得側）の完了後（5分後）に連動して動作するよう調整されています。
 *
 * ### スクリプトプロパティの設定項目
 * | キー                  | 値の例                       | 説明 |
 * |-----------------------|------------------------------|------|
 * | TRIGGER_FUNCTION_NAME | `distributeInventoryChanges` | 実行するメイン関数名 |
 * | TRIGGER_MODE          | `TODAY` または `TOMORROW`     | トリガー日付モード |
 *
 * @version 1.0 (在庫配布用にカスタマイズ)
 */

// スクリプトプロパティのキー定義
const PROPERTY_KEY_FUNCTION = 'TRIGGER_FUNCTION_NAME';
const PROPERTY_KEY_MODE = 'TRIGGER_MODE';

/**
 * 時間ベースの実行トリガーを一括設定する
 *
 * 【処理フロー】
 * 1. スクリプトプロパティから実行する関数名と実行モード（TODAY/TOMORROW）を取得。
 * 2. 既存の同一関数に紐づくトリガーを削除。
 * 3. executionTimes（GetInventoryDataの完了予定時刻の5分後）に基づいて時間枠を設定。
 * 4. 各時間枠について、モード（当日中のみ、または翌日）に応じてトリガーを登録。
 * 5. 登録の成功・失敗・スキップを集計し、詳細ログを出力。
 *
 * @return {void}
 */
function setTrigger() {
  const properties = PropertiesService.getScriptProperties();
  const functionToTrigger = properties.getProperty(PROPERTY_KEY_FUNCTION);
  const triggerMode = properties.getProperty(PROPERTY_KEY_MODE);

  if (!functionToTrigger) {
    Logger.log(`エラー: スクリプトプロパティ '${PROPERTY_KEY_FUNCTION}' が設定されていません。`);
    return;
  }

  if (!triggerMode) {
    Logger.log(`エラー: スクリプトプロパティ '${PROPERTY_KEY_MODE}' が設定されていません。'TODAY' または 'TOMORROW' を設定してください。`);
    return;
  }

  if (triggerMode !== 'TODAY' && triggerMode !== 'TOMORROW') {
    Logger.log(`エラー: TRIGGER_MODE の値が不正です: '${triggerMode}'。'TODAY' または 'TOMORROW' を設定してください。`);
    return;
  }

  Logger.log(`=== トリガー設定開始 ===`);
  Logger.log(`実行関数: ${functionToTrigger}`);
  Logger.log(`実行モード: ${triggerMode}`);

  // 既存トリガーを削除（重複防止）
  try {
    deleteTriggersForFunction(functionToTrigger, 3, 500);
  } catch (error) {
    Logger.log(`⚠️ 既存トリガー削除でエラー: ${error.message}。処理を継続します。`);
  }

  // 実行したい時刻（[時, 分]）の配列
  // GetInventoryData (8:00, 10:00, 13:30, 16:00, 19:00, 21:00) の約5分後に起動するように設定
  const executionTimes = [
    [8, 5],     // 8:05
    [10, 5],    // 10:05
    [13, 35],   // 13:35
    [16, 5],    // 16:05
    [19, 5],    // 19:05
    [21, 5],    // 21:05
  ];

  const now = new Date();
  let createdCount = 0;
  let skippedCount = 0;
  const failedTriggers = [];

  executionTimes.forEach(function (time) {
    const hour = time[0];
    const minute = time[1];

    const triggerTime = new Date();
    triggerTime.setHours(hour);
    triggerTime.setMinutes(minute);
    triggerTime.setSeconds(0);
    triggerTime.setMilliseconds(0);

    if (triggerMode === 'TOMORROW') {
      triggerTime.setDate(triggerTime.getDate() + 1);
    } else if (triggerMode === 'TODAY') {
      if (triggerTime <= now) {
        Logger.log(`  スキップ: ${hour}:${String(minute).padStart(2, '0')} (既に経過)`);
        skippedCount++;
        return;
      }
    }

    try {
      ScriptApp.newTrigger(functionToTrigger)
        .timeBased()
        .at(triggerTime)
        .create();

      const dateStr = `${triggerTime.getMonth() + 1}/${triggerTime.getDate()}`;
      const timeStr = `${hour}:${String(minute).padStart(2, '0')}`;
      Logger.log(`  ✓ 作成: ${dateStr} ${timeStr}`);
      createdCount++;

    } catch (error) {
      const timeStr = `${hour}:${String(minute).padStart(2, '0')}`;
      const dateStr = `${triggerTime.getMonth() + 1}/${triggerTime.getDate()}`;
      Logger.log(`  ✗ 失敗: ${dateStr} ${timeStr} - ${error.message}`);

      failedTriggers.push({
        time: timeStr,
        date: dateStr,
        scheduledTime: triggerTime,
        errorMessage: error.message
      });
    }
  });

  Logger.log(`=== トリガー設定完了 ===`);
  Logger.log(`作成: ${createdCount} 件`);
  if (skippedCount > 0) Logger.log(`スキップ: ${skippedCount} 件`);
  if (failedTriggers.length > 0) {
    Logger.log(`失敗: ${failedTriggers.length} 件`);
    failedTriggers.forEach(function (failed, index) {
      Logger.log(`  [失敗${index + 1}] ${failed.date} ${failed.time} - ${failed.errorMessage}`);
    });
  }
}

/**
 * 特定の関数に紐づく既存のトリガーをすべて削除する（リトライ・バックオフ付き）
 *
 * @param {string} functionName - 削除対象のトリガーが実行する関数名
 * @param {number} [maxRetry=3] - 最大リトライ回数
 * @param {number} [baseSleepMs=500] - 削除間のウエイト時間(ms)
 * @return {void}
 */
function deleteTriggersForFunction(functionName, maxRetry = 3, baseSleepMs = 500) {
  const triggers = ScriptApp.getProjectTriggers();
  const targetTriggers = triggers.filter(t => t.getHandlerFunction() === functionName);

  if (targetTriggers.length === 0) {
    Logger.log(`既存トリガー削除: 0 件 (対象なし)`);
    return;
  }

  Logger.log(`削除対象トリガー: ${targetTriggers.length} 件`);

  let deletedCount = 0;
  let failedCount = 0;
  const failedTriggers = [];

  targetTriggers.forEach(function (trigger, index) {
    let success = false;

    for (let attempt = 0; attempt < maxRetry; attempt++) {
      try {
        if (attempt > 0) {
          const waitTime = baseSleepMs * Math.pow(2, attempt - 1);
          Logger.log(`  トリガー削除リトライ ${attempt + 1}/${maxRetry} (${waitTime}ms待機)`);
          Utilities.sleep(waitTime);
        }

        ScriptApp.deleteTrigger(trigger);
        deletedCount++;
        success = true;

        if (index < targetTriggers.length - 1) {
          Utilities.sleep(baseSleepMs);
        }
        break;

      } catch (error) {
        if (attempt === maxRetry - 1) {
          Logger.log(`  ✗ トリガー削除失敗(${maxRetry}回試行): ${error.message}`);
          failedCount++;
          failedTriggers.push({
            handlerFunction: trigger.getHandlerFunction(),
            triggerId: trigger.getUniqueId(),
            errorMessage: error.message
          });
        }
      }
    }
  });

  Logger.log(`既存トリガー削除: 成功 ${deletedCount} 件, 失敗 ${failedCount} 件`);

  if (failedCount > 0) {
    Logger.log(`⚠️ トリガー削除に失敗したトリガーが ${failedCount} 件あります。`);
    if (failedCount === targetTriggers.length) {
      throw new Error(`全${targetTriggers.length}件のトリガー削除に失敗しました。`);
    }
  }
}