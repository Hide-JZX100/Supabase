/**
 * テーブル容量を評価し、定義された各閾値を超過している場合に通知を送信する。
 * (重複排除は行わず、超過した閾値ごとに個別にメールを送信する)
 *
 * 【処理フロー】
 * 1. CAPACITY_THRESHOLDS で定義された閾値配列を順に走査する。
 * 2. `currentSizeMb` が閾値以上であるか判定する。
 * 3. 閾値以上であれば、`sendCapacityAlertEmail` を呼び出してメール通知を行う。
 *
 * @param {number} currentSizeMb - 現在のテーブル容量（MB）
 */
function checkThresholdsAndNotify(currentSizeMb) {
  logWithLevel(LOG_LEVEL.SUMMARY, `[Notifier] 容量判定を開始します。（現在容量: ${currentSizeMb} MB, 閾値設定: ${CAPACITY_THRESHOLDS.join(', ')} MB）`);

  let notifiedCount = 0;

  CAPACITY_THRESHOLDS.forEach(threshold => {
    if (currentSizeMb >= threshold) {
      logWithLevel(LOG_LEVEL.MINIMAL, `⚠️ 警告: 容量が閾値 ${threshold} MB を超過しています。メール通知を送信します。`);
      sendCapacityAlertEmail(currentSizeMb, threshold);
      notifiedCount++;
    }
  });

  if (notifiedCount === 0) {
    logWithLevel(LOG_LEVEL.SUMMARY, `[Notifier] 閾値を超過している項目はありませんでした。`);
  } else {
    logWithLevel(LOG_LEVEL.SUMMARY, `[Notifier] 合計 ${notifiedCount} 件の通知メールを送信しました。`);
  }
}

/**
 * 容量が閾値を超過したことを通知するアラートメールを送信する。
 *
 * 【処理フロー】
 * 1. 送信先として `Session.getEffectiveUser().getEmail()` を取得する。
 * 2. 500MBの無料枠に対する使用割合を算出する。
 * 3. 送信日時（JST）をフォーマットする。
 * 4. 件名および本文（HTMLまたはテキスト）を生成する。
 * 5. GmailApp.sendEmail() を用いてメールを送信する。
 *
 * @param {number} currentSizeMb - 現在の容量（MB）
 * @param {number} threshold - 超過した閾値（MB）
 */
function sendCapacityAlertEmail(currentSizeMb, threshold) {
  try {
    const recipient = Session.getEffectiveUser().getEmail();
    if (!recipient) {
      throw new Error('実行ユーザーのメールアドレスが取得できませんでした。');
    }

    const checkTimeStr = formatJstDateTime(new Date());
    const usagePercent = ((currentSizeMb / FREE_CAPACITY_LIMIT_MB) * 100).toFixed(2);

    const subject = `[Supabase容量アラート] ${TARGET_TABLE} が ${threshold}MB を超過 (${currentSizeMb}MB)`;

    const body = `※このメールはGAS「InventoryHistoryCapacityCheck」から自動送信されています。

Supabaseのテーブル容量が監視閾値を超過しました。以下の詳細を確認してください。

■ 詳細情報
・監視対象テーブル: ${TARGET_TABLE}
・現在のテーブル容量: ${currentSizeMb} MB
・検知された閾値: ${threshold} MB
・無料枠 (${FREE_CAPACITY_LIMIT_MB} MB) に対する割合: ${usagePercent} %
・確認日時 (JST): ${checkTimeStr}

■ アクション
テーブル容量が上限に近づくと、DBの書き込み制限が発生する可能性があります。
想定外のデータ増加が発生していないか、データ退避処理（削除・アーカイブ）の実施が必要か確認してください。`;

    GmailApp.sendEmail(recipient, subject, body);
    logWithLevel(LOG_LEVEL.SUMMARY, `[Notifier] メール送信成功 (宛先: ${recipient}, 閾値: ${threshold} MB)`);

  } catch (error) {
    logError(`[Notifier] メール送信中にエラーが発生しました: ${error.message}`);
    throw error;
  }
}
