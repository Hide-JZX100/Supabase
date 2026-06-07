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