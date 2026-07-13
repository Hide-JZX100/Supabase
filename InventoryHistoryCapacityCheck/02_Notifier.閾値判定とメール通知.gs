/**
 * @file 02_Notifier.閾値判定とメール通知.gs
 * @description 取得した容量と事前に定義された閾値（80MB / 90MB / 100MB）を比較判定し、
 * 超過している場合にGmailAppを使用して警告メールを送信するモジュール。
 *
 * ### 依存関係
 * - **参照先**: 00_Config.設定値.gs (TARGET_TABLE, CAPACITY_THRESHOLDS, FREE_CAPACITY_LIMIT_MB, LOG_LEVEL), 99_Utils.ログユーティリティ.gs (logWithLevel, logError, formatJstDateTime)
 * - **参照元**: 03_Trigger.日付判定（防御的チェック）.gs
 *
 * ### 公開関数
 * @see checkThresholdsAndNotify  - テーブル容量を評価し、必要に応じてメール通知を行う
 * @see sendCapacityAlertEmail    - 指定した閾値の警告メールを送信する
 *
 * @version 1.0
 */

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

// ============================================================================
// テスト用関数
// ============================================================================

/**
 * checkThresholdsAndNotify および sendCapacityAlertEmail 関数のテスト
 *
 * 閾値を一時的にテスト用に引き下げるか、テスト用容量を仮定して、
 * メール送信機能が正しく動作し、自分宛てにメールが届くことを確認します。
 *
 * 【テスト手順】
 * 1. GASエディタで本関数を実行する。
 * 2. メール受信ボックス（GASの実行権限を与えたアカウントのGmail）を開き、
 *    「[Supabase容量アラート] ne_inventory_history が 3MB を超過」という件名のメールが届いているか確認する。
 */
function test_checkThresholdsAndNotify() {
  console.log('--- test_checkThresholdsAndNotify 開始 ---');

  try {
    // 1. 直接 sendCapacityAlertEmail をテスト
    console.log('1. 直接メール送信のテスト（ダミー容量 5.5MB、閾値 3MB でテスト）...');
    sendCapacityAlertEmail(5.5, 3);

    // 2. 判定ロジックを含む結合テスト（一時的に定数を置き換えることはGASではできないため、関数にダミーの容量を渡して動作を確認します）
    console.log('2. 閾値判定ロジックのテスト (通常設定 [80, 90, 100] MB に対し、10MB / 85MB / 95MB のテスト容量で判定)...');

    console.log('  -> テストA: 現在容量 10MB (どの閾値も超えないはず)');
    checkThresholdsAndNotify(10); // ログのみでメール送信されないはず

    console.log('  -> テストB: 現在容量 85MB (80MBの閾値だけ超えて1通メールが送信されるはず)');
    checkThresholdsAndNotify(85); // 80MB超過のメールが1通送信される

    console.log('  -> テストC: 現在容量 95MB (80MBと90MBの閾値を超えて2通メールが送信されるはず)');
    checkThresholdsAndNotify(95); // 80MB, 90MB超過のメールが計2通送信される

    console.log('✅ テスト実行完了。Gmailの受信ボックスを確認し、合計3通の警告メール（3MB, 80MB[2通], 90MB[1通]）が届いていることを確認してください。');

  } catch (error) {
    console.error(`❌ テスト失敗: メール送信中にエラーが発生しました。\nエラー内容: ${error.message}`);
  }

  console.log('--- test_checkThresholdsAndNotify 終了 ---');
}
