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
