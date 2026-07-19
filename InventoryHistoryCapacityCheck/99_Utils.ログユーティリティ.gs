/**
 * @file 99_Utils.ログユーティリティ.gs
 * @description システム全体のログ出力制御および日時フォーマットユーティリティ。
 * すべてのログ出力はこのモジュールを経由し、LOG_LEVEL（定数）による制御を行います。
 *
 * ### 依存関係
 * - **参照先**: 00_Config.設定値.gs (LOG_LEVEL, DEFAULT_LOG_LEVEL)
 * - **参照元**: 01_CapacityChecker.容量取得とRPC呼び出し.gs, 02_Notifier.閾値判定とメール通知.gs, 03_Trigger.日付判定（防御的チェック）.gs
 *
 * ### 公開関数
 * @see getCurrentLogLevel  - スクリプトプロパティから現在のログレベルを取得
 * @see logWithLevel        - ログレベルに応じたログ出力（標準出力）
 * @see logError            - エラーログ出力（常に出力、console.error）
 * @see formatJstDateTime   - DateオブジェクトをJSTの文字列フォーマットに変換
 *
 * @version 1.0
 */

/**
 * 現在のログレベルを取得する。
 * スクリプトプロパティ「LOG_LEVEL」の値を取得し数値に変換して返す。未設定の場合は DEFAULT_LOG_LEVEL を返す。
 *
 * 【処理フロー】
 * 1. PropertiesServiceから'LOG_LEVEL'を取得する。
 * 2. プロパティが存在しない場合は、DEFAULT_LOG_LEVEL を返す。
 * 3. 取得したプロパティ値を整数値に変換して返す。
 *
 * @return {number} 現在のログレベル数値 (1: MINIMAL, 2: SUMMARY, 3: DETAILED)
 */
function getCurrentLogLevel() {
  const properties = PropertiesService.getScriptProperties();
  const logLevel = properties.getProperty('LOG_LEVEL');

  if (!logLevel) {
    // DEFAULT_LOG_LEVEL が未定義の場合（ロード順序の変更や他プロジェクトへの移植時）は、
    // 安全のためデフォルトのログレベル（2: SUMMARY）をフォールバックとして使用します。
    return typeof DEFAULT_LOG_LEVEL !== 'undefined' ? DEFAULT_LOG_LEVEL : 2;
  }

  return parseInt(logLevel, 10);
}

/**
 * ログレベルが指定された条件を満たす場合にログを出力する。
 *
 * 【処理フロー】
 * 1. getCurrentLogLevel() から現在のログレベルを取得する。
 * 2. 現在のログレベルが指定された `requiredLevel` 以上の値であれば、console.log() を用いてメッセージを出力する。
 *
 * @param {number} requiredLevel - 出力に必要なログレベル
 * @param {string} message - ログメッセージ
 * @param {...*} args - 追加の引数（プレースホルダ用など）
 */
function logWithLevel(requiredLevel, message, ...args) {
  const currentLevel = getCurrentLogLevel();

  if (currentLevel >= requiredLevel) {
    if (args.length > 0) {
      console.log(message, ...args);
    } else {
      console.log(message);
    }
  }
}

/**
 * エラーログを出力する（ログレベル設定に関わらず常に `console.error` で出力される）。
 *
 * 【処理フロー】
 * 1. 与えられた引数に応じて、console.error() を用いてメッセージを出力する。
 *
 * @param {string} message - エラーメッセージ
 * @param {...*} args - 追加の引数
 */
function logError(message, ...args) {
  if (args.length > 0) {
    console.error(message, ...args);
  } else {
    console.error(message);
  }
}

/**
 * 日付オブジェクトをJSTの「yyyy/MM/dd HH:mm:ss」形式の文字列に変換する。
 *
 * 【処理フロー】
 * 1. 渡された `date` オブジェクトに対し、Utilities.formatDateを用いてJSTタイムゾーンでフォーマットする。
 *
 * @param {Date} date - 変換するDateオブジェクト
 * @return {string} フォーマットされた日付文字列 (例: "2026/07/13 11:30:00")
 */
function formatJstDateTime(date) {
  if (!date || !(date instanceof Date)) {
    date = new Date();
  }
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss');
}

// ============================================================================
// テスト用関数
// ============================================================================

/**
 * ログユーティリティのテスト
 *
 * ログレベルに応じたログ出力制御および日付フォーマット処理の動作を確認します。
 *
 * 【テスト手順】
 * 1. ログレベルプロパティをバックアップ
 * 2. ログレベルを MINIMAL (1) に設定し、SUMMARY や DETAILED のログが出力されないことを確認
 * 3. ログレベルを DETAILED (3) に設定し、すべてのログが出力されることを確認
 * 4. formatJstDateTime にテスト用日付を渡し、変換結果の文字列形式を確認
 * 5. バックアップからプロパティを復元する
 */
function test_logUtils() {
  const properties = PropertiesService.getScriptProperties();
  const originalLogLevel = properties.getProperty('LOG_LEVEL');

  console.log('--- test_logUtils 開始 ---');

  try {
    // 日付フォーマットのテスト
    const testDate = new Date(2026, 6, 13, 11, 30, 0); // 2026/07/13 11:30:00
    const formatted = formatJstDateTime(testDate);
    if (formatted === '2026/07/13 11:30:00') {
      console.log('✅ 日付フォーマットテスト: 成功 (' + formatted + ')');
    } else {
      console.error('❌ 日付フォーマットテスト: 失敗 (' + formatted + ')');
    }

    // ログレベル: MINIMAL (1) でのテスト
    properties.setProperty('LOG_LEVEL', '1');
    console.log('--- ログレベル1 (MINIMAL) テスト (次の2つのログのみ出力されれば成功) ---');
    logWithLevel(LOG_LEVEL.MINIMAL, '-> [出力されるべき] MINIMALログ');
    logWithLevel(LOG_LEVEL.SUMMARY, '-> [非表示] SUMMARYログ');
    logWithLevel(LOG_LEVEL.DETAILED, '-> [非表示] DETAILEDログ');
    logError('-> [出力されるべき] 常時エラーログ');

    // ログレベル: DETAILED (3) でのテスト
    properties.setProperty('LOG_LEVEL', '3');
    console.log('--- ログレベル3 (DETAILED) テスト (次の4つすべてが出力されれば成功) ---');
    logWithLevel(LOG_LEVEL.MINIMAL, '-> [出力されるべき] MINIMALログ');
    logWithLevel(LOG_LEVEL.SUMMARY, '-> [出力されるべき] SUMMARYログ');
    logWithLevel(LOG_LEVEL.DETAILED, '-> [出力されるべき] DETAILEDログ');
    logError('-> [出力されるべき] 常時エラーログ');

  } catch (error) {
    console.error('❌ テスト中にエラーが発生しました: ' + error.message);
  } finally {
    // 復元
    if (originalLogLevel) {
      properties.setProperty('LOG_LEVEL', originalLogLevel);
    } else {
      properties.deleteProperty('LOG_LEVEL');
    }
    console.log('--- test_logUtils 終了 ---');
  }
}

/**
 * getCurrentLogLevelにおける未定義フォールバック動作の検証テスト
 *
 * スクリプトプロパティ「LOG_LEVEL」を未設定にした状態で、
 * 関数が例外をスローせずにデフォルト値（DEFAULT_LOG_LEVEL または 2）を
 * 正常に返却することを確認します。
 *
 * 【テスト手順】
 * 1. GASエディタで本関数を実行する。
 * 2. ログを確認し、「✅ テスト成功: プロパティ未設定時に期待通りのログレベル (〇) が返却されました。」と出力されることを確認する。
 */
function test_getCurrentLogLevel_fallback() {
  console.log('--- test_getCurrentLogLevel_fallback 開始 ---');
  const properties = PropertiesService.getScriptProperties();
  const originalLogLevel = properties.getProperty('LOG_LEVEL');

  try {
    // 一時的にプロパティを削除してデフォルト値の取得を発生させる
    properties.deleteProperty('LOG_LEVEL');
    const level = getCurrentLogLevel();

    const expectedLevel = typeof DEFAULT_LOG_LEVEL !== 'undefined' ? DEFAULT_LOG_LEVEL : 2;
    if (level === expectedLevel) {
      console.log(`✅ テスト成功: プロパティ未設定時に期待通りのログレベル (${level}) が返却されました。`);
    } else {
      console.error(`❌ テスト失敗: 返却された値 (${level}) が期待値 (${expectedLevel}) と異なります。`);
    }
  } catch (error) {
    console.error(`❌ テスト失敗: エラーが発生しました: ${error.message}`);
  } finally {
    // 復元
    if (originalLogLevel) {
      properties.setProperty('LOG_LEVEL', originalLogLevel);
    } else {
      properties.deleteProperty('LOG_LEVEL');
    }
    console.log('--- test_getCurrentLogLevel_fallback 終了 ---');
  }
}

