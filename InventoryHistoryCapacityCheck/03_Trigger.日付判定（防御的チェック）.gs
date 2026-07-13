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

/**
 * 指定された日付オブジェクト（JST基準）が実行対象日（1の位が1の日）であるかを判定する。
 *
 * 【処理フロー】
 * 1. 日付オブジェクトからJSTタイムゾーン基準の「日」を取得する。
 * 2. 日が 1, 11, 21, 31 のいずれかであるかをチェックする。
 * 3. 該当すれば true、それ以外は false を返す。
 *
 * @param {Date} date - 判定対象の日付オブジェクト
 * @return {boolean} 対象日であれば true、それ以外は false
 * @private
 */
function isTargetDay_(date) {
  // GASはタイムゾーン設定（通常Asia/Tokyo）に基づいて日付を取得するため、
  // Utilities.formatDateで明示的にJSTの「日」を抽出してパースします。
  const dayStr = Utilities.formatDate(date, 'JST', 'd');
  const day = parseInt(dayStr, 10);

  return [1, 11, 21, 31].includes(day);
}

// ============================================================================
// テスト用関数
// ============================================================================

/**
 * isTargetDay_ 関数の動作検証テスト
 *
 * 様々な日付データを引き渡し、1日・11日・21日・31日は true、
 * それ以外は false が返却されるかを検証します。
 *
 * 【テスト手順】
 * 1. GASエディタで本関数を実行する。
 * 2. ログに「✅ isTargetDay_ テスト: すべて成功」と表示されることを確認する。
 */
function test_isTargetDay() {
  console.log('--- test_isTargetDay 開始 ---');

  // テストケース: [年, 月(0始まり), 日, 期待する戻り値]
  const testCases = [
    { date: new Date(2026, 6, 1), expected: true },   // 7月1日
    { date: new Date(2026, 6, 2), expected: false },  // 7月2日
    { date: new Date(2026, 6, 10), expected: false }, // 7月10日
    { date: new Date(2026, 6, 11), expected: true },  // 7月11日
    { date: new Date(2026, 6, 21), expected: true },  // 7月21日
    { date: new Date(2026, 6, 22), expected: false }, // 7月22日
    { date: new Date(2026, 6, 30), expected: false }, // 7月30日
    { date: new Date(2026, 6, 31), expected: true },  // 7月31日
    { date: new Date(2026, 1, 28), expected: false }  // 2月28日
  ];

  let allPassed = true;

  testCases.forEach((tc, idx) => {
    const result = isTargetDay_(tc.date);
    const dateStr = Utilities.formatDate(tc.date, 'JST', 'yyyy/MM/dd');
    if (result === tc.expected) {
      console.log(`✅ ケース ${idx + 1}: ${dateStr} -> 結果: ${result} (期待値通り)`);
    } else {
      console.error(`❌ ケース ${idx + 1}: ${dateStr} -> 結果: ${result} (期待値: ${tc.expected})`);
      allPassed = false;
    }
  });

  if (allPassed) {
    console.log('✅ isTargetDay_ テスト: すべて成功');
  } else {
    console.error('❌ isTargetDay_ テスト: 一部失敗');
  }

  console.log('--- test_isTargetDay 終了 ---');
}

/**
 * checkCapacityMain 関数のテスト（全体結合テスト）
 *
 * 防御的日付判定により、本日の日付が対象日でなければスキップされること、
 * 対象日であれば実際の容量確認が行われることを検証します。
 * また、日付判定を強制的にバイパスしたテストも行います。
 *
 * 【テスト手順】
 * 1. GASエディタで本関数を実行する。
 * 2. ログを確認し、本日の日付に応じた動作（スキップまたは容量取得実行）がされていることを確認する。
 */
function test_checkCapacityMain() {
  console.log('--- test_checkCapacityMain 開始 ---');

  console.log('1. 通常のメイン処理呼び出しテスト（本日日付に基づく判定）:');
  checkCapacityMain();

  console.log('\n2. 対象日（11日）をシミュレートした強制実行テスト:');
  // 一時的に isTargetDay_ をダミー関数に差し替えて、強制的に実行させるテスト
  const originalIsTargetDay = isTargetDay_;
  isTargetDay_ = function (d) {
    console.log(`[シミュレーション] 日付 ${Utilities.formatDate(d, 'JST', 'yyyy/MM/dd')} は強制的に実行対象日と見なします。`);
    return true;
  };

  try {
    checkCapacityMain();
  } catch (e) {
    console.error(`強制実行テスト中にエラーが発生しました: ${e.message}`);
  } finally {
    // 復元
    isTargetDay_ = originalIsTargetDay;
  }

  console.log('--- test_checkCapacityMain 終了 ---');
}
