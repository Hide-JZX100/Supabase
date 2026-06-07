// ============================================================================
// ログレベル設定
// ============================================================================

/**
 * ログレベル定数
 * 1. MINIMAL  : 開始/終了/サマリーのみ（本番運用推奨）
 * 2. SUMMARY  : バッチ集計 + 最初/最後3件（デフォルト）
 * 3. DETAILED : 全商品コード出力（デバッグ用）
 */
const LOG_LEVEL = {
  MINIMAL: 1,
  SUMMARY: 2,
  DETAILED: 3
};

// ============================================================================
// リトライ設定
// ============================================================================

/**
 * リトライ設定定数
 * Supabase への GET リクエストに対するリトライ動作を制御します。
 */
const RETRY_CONFIG = {
  MAX_RETRIES: 3,         // 最大リトライ回数
  ENABLE_RETRY: true,     // リトライ機能の有効/無効
  LOG_RETRY_STATS: true   // リトライ統計のログ出力
};

// ============================================================================
// スプレッドシート列定義（書き込み先の13列構成）
// ============================================================================

/**
 * 書き込み列の定義（0始まりのインデックス）
 * GetInventoryData の12列に加え、M列（更新日時）を追加した13列構成。
 */
const DISTRIBUTE_COLUMNS = {
  GOODS_CODE: 0,  // A列: 商品コード
  GOODS_NAME: 1,  // B列: 商品名
  STOCK_QTY: 2,  // C列: 在庫数
  ALLOCATED_QTY: 3,  // D列: 引当数
  FREE_QTY: 4,  // E列: フリー在庫数
  RESERVE_QTY: 5,  // F列: 予約在庫数
  RESERVE_ALLOCATED: 6,  // G列: 予約引当数
  RESERVE_FREE: 7,  // H列: 予約フリー在庫数
  DEFECTIVE_QTY: 8,  // I列: 不良在庫数
  ORDER_REMAINING: 9,  // J列: 発注残数
  SHORTAGE_QTY: 10, // K列: 欠品数
  JAN_CODE: 11, // L列: JANコード
  UPDATED_AT: 12  // M列: 更新日時
};

/**
 * スプレッドシートのヘッダー行（1行目）
 * DISTRIBUTE_COLUMNS の列順序と対応します。
 */
const INVENTORY_SHEET_HEADERS = [
  '商品コード',       // A列
  '商品名',           // B列
  '在庫数',           // C列
  '引当数',           // D列
  'フリー在庫数',     // E列
  '予約在庫数',       // F列
  '予約引当数',       // G列
  '予約フリー在庫数', // H列
  '不良在庫数',       // I列
  '発注残数',         // J列
  '欠品数',           // K列
  'JANコード',        // L列
  '更新日時'          // M列
];

/** ヘッダー行の総列数 */
const TOTAL_COLUMNS = INVENTORY_SHEET_HEADERS.length; // 13

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * スクリプトプロパティから書き込み先スプレッドシート設定を全件取得する
 *
 * SHEET_CONFIG_1, SHEET_CONFIG_2, ... というキーを順番に探索し、
 * JSON パースした設定オブジェクトの配列を返します。
 * 連番が途切れた時点で探索を終了します（SHEET_CONFIG_1 がない場合は空配列）。
 *
 * 設定フォーマット例（スクリプトプロパティ）:
 *   SHEET_CONFIG_1 : {"id":"スプレッドシートID","sheet":"在庫管理"}
 *   SHEET_CONFIG_2 : {"id":"スプレッドシートID","sheet":"発注管理"}
 *
 * @return {Array<{id: string, sheet: string}>} 設定オブジェクトの配列
 * @throws {Error} 設定が1件も見つからない場合
 */
function getSheetConfigs() {
  const properties = PropertiesService.getScriptProperties();
  const configs = [];
  let index = 1;

  while (true) {
    const key = 'SHEET_CONFIG_' + index;
    const value = properties.getProperty(key);

    if (!value) break; // 連番が途切れたら終了

    try {
      const config = JSON.parse(value);

      if (!config.id || !config.sheet) {
        throw new Error('id または sheet が設定されていません: ' + value);
      }

      configs.push({
        id: config.id,
        sheet: config.sheet,
        configKey: key
      });

    } catch (parseError) {
      throw new Error('SHEET_CONFIG_' + index + ' のJSON解析に失敗しました: ' + parseError.message);
    }

    index++;
  }

  if (configs.length === 0) {
    throw new Error(
      'スクリプトプロパティに SHEET_CONFIG_1 が設定されていません。\n' +
      '{"id":"スプレッドシートID","sheet":"シート名"} 形式で設定してください。'
    );
  }

  return configs;
}
