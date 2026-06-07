// ============================================================================
// ログレベル管理
// ============================================================================

/**
 * 現在のログレベルをスクリプトプロパティから取得する
 *
 * 未設定の場合は SUMMARY(2) をデフォルトとしてプロパティに書き込みます。
 *
 * @return {number} 現在のログレベル（1/2/3）
 */
function getCurrentLogLevel() {
  const properties = PropertiesService.getScriptProperties();
  const logLevel = properties.getProperty('LOG_LEVEL');

  if (!logLevel) {
    properties.setProperty('LOG_LEVEL', '2');
    return LOG_LEVEL.SUMMARY;
  }

  return parseInt(logLevel, 10);
}

/**
 * ログレベルを変更してスクリプトプロパティに保存する
 *
 * @param {number} level - 設定するログレベル（1:MINIMAL / 2:SUMMARY / 3:DETAILED）
 * @throws {Error} 無効なログレベルが指定された場合
 */
function setLogLevel(level) {
  if (![1, 2, 3].includes(level)) {
    throw new Error('ログレベルは 1(MINIMAL)、2(SUMMARY)、3(DETAILED) のいずれかを指定してください');
  }

  PropertiesService.getScriptProperties().setProperty('LOG_LEVEL', level.toString());

  const levelName = Object.keys(LOG_LEVEL).find(key => LOG_LEVEL[key] === level);
  console.log('ログレベルを ' + levelName + '(' + level + ') に設定しました');
}

/**
 * 現在のログレベル設定を表示する
 */
function showCurrentLogLevel() {
  const currentLevel = getCurrentLogLevel();
  const levelName = Object.keys(LOG_LEVEL).find(key => LOG_LEVEL[key] === currentLevel);

  console.log('=== 現在のログレベル設定 ===');
  console.log('レベル: ' + levelName + ' (' + currentLevel + ')');
  console.log('');
  console.log('【ログレベルの説明】');
  console.log('1. MINIMAL  : 開始/終了/サマリーのみ（本番運用推奨）');
  console.log('2. SUMMARY  : バッチ集計 + 詳細情報（デフォルト）');
  console.log('3. DETAILED : 全件出力（デバッグ用）');
  console.log('');
  console.log('【変更方法】');
  console.log('setLogLevel(1) // MINIMAL に変更');
  console.log('setLogLevel(2) // SUMMARY に変更');
  console.log('setLogLevel(3) // DETAILED に変更');
}