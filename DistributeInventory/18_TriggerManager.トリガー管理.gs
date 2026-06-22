/**
 * 指定した関数を、指定ミリ秒後に1回だけ実行するトリガーを作成する（重複防止版）
 *
 * 【処理フロー】
 * 1. 指定関数名に紐づく既存のトリガーをすべて削除する（重複登録防止）
 * 2. スクリプトプロパティ PENDING_TRIGGER_ID が残っていればクリアする
 * 3. ScriptApp.newTrigger().timeBased().after(delayMs).create() でトリガーを作成する
 * 4. 作成したトリガーのユニークIDをスクリプトプロパティへ保存する
 *
 * @param {string} functionName - トリガーで実行する関数名
 * @param {number} delayMs - 何ミリ秒後に実行するか
 * @return {string} 作成したトリガーのユニークID
 * @throws {Error} トリガー作成に失敗した場合
 */
function scheduleOneTimeTrigger(functionName, delayMs) {
  const existingTriggers = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === functionName);

  if (existingTriggers.length > 0) {
    console.warn(functionName + ' に紐づく既存トリガーが ' + existingTriggers.length
      + ' 件見つかりました。重複防止のため削除します。');
    existingTriggers.forEach(t => ScriptApp.deleteTrigger(t));
  }

  PropertiesService.getScriptProperties().deleteProperty('PENDING_TRIGGER_ID');

  try {
    const trigger = ScriptApp.newTrigger(functionName)
      .timeBased()
      .after(delayMs)
      .create();

    const triggerId = trigger.getUniqueId();
    PropertiesService.getScriptProperties().setProperty('PENDING_TRIGGER_ID', triggerId);

    console.log('動的トリガーを作成しました: 関数=' + functionName
      + ', 発火予定=' + delayMs + 'ms後, トリガーID=' + triggerId);

    return triggerId;

  } catch (error) {
    console.error('動的トリガーの作成に失敗しました: ' + error.message);
    throw error;
  }
}

/**
 * 発火済みのワンタイムトリガーを自分自身で削除する（後始末処理）
 *
 * @return {boolean} トリガーの削除に成功した場合は true、対象が見つからなかった場合は false
 */
function cleanupFiredTrigger() {
  const properties = PropertiesService.getScriptProperties();
  const triggerId = properties.getProperty('PENDING_TRIGGER_ID');

  if (!triggerId) {
    console.log('PENDING_TRIGGER_ID が見つからないため、削除処理をスキップします。');
    return false;
  }

  let deleted = false;

  try {
    const triggers = ScriptApp.getProjectTriggers();
    for (const trigger of triggers) {
      if (trigger.getUniqueId() === triggerId) {
        ScriptApp.deleteTrigger(trigger);
        deleted = true;
        console.log('発火済みトリガーを削除しました: ID=' + triggerId);
        break;
      }
    }

    if (!deleted) {
      console.warn('削除対象のトリガー(ID=' + triggerId + ')が見つかりませんでした。既に削除済みの可能性があります。');
    }

  } catch (error) {
    console.error('トリガー削除中にエラーが発生しました: ' + error.message);

  } finally {
    properties.deleteProperty('PENDING_TRIGGER_ID');
  }

  return deleted;
}

/**
 * 指定した関数名に紐づくトリガーの件数を取得する（デバッグ・テスト用）
 *
 * @param {string} functionName - 確認対象の関数名
 * @return {number} 該当関数に紐づくトリガーの件数
 */
function countTriggersFor(functionName) {
  const triggers = ScriptApp.getProjectTriggers();
  return triggers.filter(t => t.getHandlerFunction() === functionName).length;
}
