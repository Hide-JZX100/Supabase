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
    return DEFAULT_LOG_LEVEL;
  }

  return parseInt(logLevel, 10);
}
