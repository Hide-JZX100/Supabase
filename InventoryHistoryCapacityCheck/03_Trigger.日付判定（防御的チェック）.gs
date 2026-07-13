/**
 * 容量チェック処理のメインエントリーポイント。
 *
 * 【処理フロー】
 * 1. 現在時刻（JST）が監視対象日（1日、11日、21日、31日）であるか防御的チェックを行う。
 * 2. 対象日でない場合は、スキップログを記録して早期終了する。
 * 3. 対象日の場合は、getTableSizeMb を呼び出してテーブルサイズ（MB）を取得する。
 * 4. 取得したサイズを checkThresholdsAndNotify に渡し、閾値判定とメール送信を行う。
 * 5. 全処理をtry-catchで囲み、例外発生時は `logError` を用いてログを記録する。
 */
function checkCapacityMain() {
  logWithLevel(LOG_LEVEL.MINIMAL, '=== Supabase容量チェック処理 開始 ===');

  try {
    const now = new Date();

    // 防御的チェック: 1の位が1の日のみ処理を続行する
    if (!isTargetDay_(now)) {
      logWithLevel(LOG_LEVEL.MINIMAL, `[Trigger] 本日（JST: ${formatJstDateTime(now)}）は実行対象日（1日・11日・21日・31日）ではないため、処理をスキップします。`);
      logWithLevel(LOG_LEVEL.MINIMAL, '=== Supabase容量チェック処理 終了（スキップ） ===');
      return;
    }

    logWithLevel(LOG_LEVEL.SUMMARY, `[Trigger] 実行対象日を検知しました。処理を続行します。`);

    // 1. 容量取得
    const currentSizeMb = getTableSizeMb(TARGET_TABLE);

    // 2. 閾値判定 & アラート送信
    checkThresholdsAndNotify(currentSizeMb);

    logWithLevel(LOG_LEVEL.MINIMAL, '=== Supabase容量チェック処理 正常終了 ===');

  } catch (error) {
    logError(`[Trigger] 容量チェック処理中に予期せぬエラーが発生しました: ${error.message}`);
    logWithLevel(LOG_LEVEL.MINIMAL, '=== Supabase容量チェック処理 異常終了 ===');
  }
}
