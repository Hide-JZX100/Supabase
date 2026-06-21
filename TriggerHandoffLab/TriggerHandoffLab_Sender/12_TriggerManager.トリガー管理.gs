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

/**
 * 発火済みのワンタイムトリガーを自分自身で削除する（後始末処理）
 *
 * トリガーで起動された関数の冒頭、または finally ブロックで必ず呼び出すこと。
 * これにより「トリガー一覧」にゴミが残り続けることを防ぐ。
 *
 * 【処理フロー】
 * 1. スクリプトプロパティから PENDING_TRIGGER_ID を取得する
 * 2. ID が存在しない場合は何もせず終了する（既に削除済み、または手動実行された場合）
 * 3. ScriptApp.getProjectTriggers() から該当IDのトリガーを検索し、見つかれば削除する
 * 4. 削除の成否に関わらず、スクリプトプロパティから PENDING_TRIGGER_ID を削除する
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
            console.warn('削除対象のトリガー(ID=' + triggerId + ')が見つかりませんでした。'
                + '既に削除済みの可能性があります。');
        }

    } catch (error) {
        console.error('トリガー削除中にエラーが発生しました: ' + error.message);

    } finally {
        // 削除の成否に関わらず、プロパティ上の参照はクリアする
        properties.deleteProperty('PENDING_TRIGGER_ID');
    }

    return deleted;
}

/**
 * 指定した関数名に紐づくトリガーの件数を取得する（デバッグ・テスト用）
 *
 * トリガーが正しく1件だけ作成・削除されているかを確認する目的で使用する。
 *
 * @param {string} functionName - 確認対象の関数名
 * @return {number} 該当関数に紐づくトリガーの件数
 */
function countTriggersFor(functionName) {
    const triggers = ScriptApp.getProjectTriggers();
    return triggers.filter(t => t.getHandlerFunction() === functionName).length;
}
