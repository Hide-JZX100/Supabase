/**
 * 指定した関数を、指定ミリ秒後に1回だけ実行するトリガーを作成する
 *
 * 【処理フロー】
 * 1. 同名関数に紐づく既存のペンディングトリガーIDがプロパティに残っていないか確認する
 *    （残っている場合は、何らかの理由で前回削除されなかった可能性があるためログに警告を出す）
 * 2. ScriptApp.newTrigger().timeBased().after(delayMs).create() でトリガーを作成する
 * 3. 作成したトリガーのユニークIDをスクリプトプロパティ「PENDING_TRIGGER_ID」に保存する
 *
 * @param {string} functionName - トリガーで実行する関数名（このプロジェクト内の関数）
 * @param {number} delayMs - 何ミリ秒後に実行するか
 * @return {string} 作成したトリガーのユニークID
 * @throws {Error} トリガー作成に失敗した場合
 */
function scheduleOneTimeTrigger(functionName, delayMs) {
    const properties = PropertiesService.getScriptProperties();
    const existingId = properties.getProperty('PENDING_TRIGGER_ID');

    if (existingId) {
        console.warn('警告: 前回のペンディングトリガーID(' + existingId + ')が残っています。'
            + '前回の発火処理で自己削除に失敗した可能性があります。');
    }

    try {
        const trigger = ScriptApp.newTrigger(functionName)
            .timeBased()
            .after(delayMs)
            .create();

        const triggerId = trigger.getUniqueId();
        properties.setProperty('PENDING_TRIGGER_ID', triggerId);

        console.log('動的トリガーを作成しました: 関数=' + functionName
            + ', 発火予定=' + delayMs + 'ms後, トリガーID=' + triggerId);

        return triggerId;

    } catch (error) {
        console.error('動的トリガーの作成に失敗しました: ' + error.message);
        throw error;
    }
}

