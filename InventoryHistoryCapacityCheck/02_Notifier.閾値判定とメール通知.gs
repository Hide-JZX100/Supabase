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
