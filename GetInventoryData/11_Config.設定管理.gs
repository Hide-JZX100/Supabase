/**
 * @file Config.gs
 * @description 設定・定数管理モジュール。
 * ネクストエンジン在庫情報取得スクリプト（統合版・完成版）の動作設定を定義します。
 * 
 * ### 改善内容 (v2.0)
 * - ログレベル設定機能（MINIMAL/SUMMARY/DETAILED）
 * - バッチ処理ログの最適化（最初3件+最後3件方式）
 * - エラー発生時のみ詳細情報を自動出力
 * - 処理速度の向上（ログ出力削減により大幅に高速化）
 * 
 * ### 目的
 * 商品コードを配列で渡し、一度のAPIコールで複数商品の在庫情報を効率的に取得します。
 * 在庫マスタAPIをバッチ利用（最大1000件/回）することで、APIレート制限を回避し高速化を実現しています。
 *
 * ### 注意事項
 * - 認証スクリプトで事前にトークンを取得済みである必要があります。
 * - 大量データの場合は自動的にバッチ分割（MAX_ITEMS_PER_CALL）されます。
 *
 * ### スクリプトプロパティの設定方法
 * 1. GASエディタの「プロジェクトの設定」を開く。
 * 2. 以下のキーと値を設定。
 * 
 * | キー | 説明 |
 * | :--- | :--- |
 * | SPREADSHEET_ID | 在庫情報を更新したいスプレッドシートのID |
 * | SHEET_NAME | 在庫情報を更新したいシート名 |
 * | LOG_SHEET_NAME | 実行時間を記録するシート名 |
 * | SUPABASE_URL | SupabaseプロジェクトのURL |
 * | SUPABASE_KEY | Supabaseの anon key |
 * | RECEIVER_WEBAPP_URL | DistributeInventory側のWeb AppデプロイURL |
 * | API_SHARED_TOKEN | DistributeInventoryと共有する認証トークン |
 * | DISTRIBUTE_TRIGGER_DELAY_MS | 動的トリガー発火までの遅延ms（省略時100） |
 *
 * @version 2.0 - ログ最適化版
 * @see getSpreadsheetConfig - スクリプトプロパティから設定を取得
 * @see getStoredTokens - 認証トークンを取得
 */

// API関連定数
const NE_API_URL = 'https://api.next-engine.org';

// スプレッドシート列定義
const COLUMNS = {
    GOODS_CODE: 0,        // A列: 商品コード(GAS Index: 1)
    GOODS_NAME: 1,        // B列: 商品名(GAS Index: 2)
    STOCK_QTY: 2,        // C列: 在庫数(GAS Index: 3)
    ALLOCATED_QTY: 3,    // D列: 引当数(GAS Index: 4)
    FREE_QTY: 4,         // E列: フリー在庫数(GAS Index: 5)
    RESERVE_QTY: 5,      // F列: 予約在庫数(GAS Index: 6)
    RESERVE_ALLOCATED_QTY: 6,  // G列: 予約引当数(GAS Index: 7)
    RESERVE_FREE_QTY: 7, // H列: 予約フリー在庫数(GAS Index: 8)
    DEFECTIVE_QTY: 8,    // I列: 不良在庫数(GAS Index: 9)
    ORDER_REMAINING_QTY: 9,    // J列: 発注残数(GAS Index: 10)
    SHORTAGE_QTY: 10,    // K列: 欠品数(GAS Index: 11)
    JAN_CODE: 11         // L列: JANコード(GAS Index: 12)
};

// 処理設定値
const MAX_ITEMS_PER_CALL = 1000;
const API_WAIT_TIME = 1000;

// ログレベル設定
const LOG_LEVEL = {
    MINIMAL: 1,    // 最小限: 開始/終了/サマリーのみ（本番運用推奨）
    SUMMARY: 2,    // サマリー: バッチ集計 + 最初/最後3件（デフォルト）
    DETAILED: 3    // 詳細: 全商品コード出力（デバッグ用）
};

// リトライ設定
const RETRY_CONFIG = {
    MAX_RETRIES: 3,              // 最大リトライ回数
    ENABLE_RETRY: true,          // リトライ機能の有効/無効
    LOG_RETRY_STATS: true        // リトライ統計のログ出力
};

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * スプレッドシート設定を取得
 */
function getSpreadsheetConfig() {
    const properties = PropertiesService.getScriptProperties();
    const SPREADSHEET_ID = properties.getProperty('SPREADSHEET_ID');
    const SHEET_NAME = properties.getProperty('SHEET_NAME');

    if (!SPREADSHEET_ID || !SHEET_NAME) {
        throw new Error('スプレッドシート設定が不完全です。スクリプトプロパティにSPREADSHEET_IDとSHEET_NAMEを設定してください。');
    }

    return {
        SPREADSHEET_ID,
        SHEET_NAME
    };
}

/**
 * 保存されたトークンを取得
 * (認証.gsで保存されたものを使用)
 */
function getStoredTokens() {
    const properties = PropertiesService.getScriptProperties();
    const accessToken = properties.getProperty('ACCESS_TOKEN');
    const refreshToken = properties.getProperty('REFRESH_TOKEN');

    if (!accessToken || !refreshToken) {
        throw new Error('アクセストークンが見つかりません。先に認証を完了してください。');
    }

    return {
        accessToken,
        refreshToken
    };
}

// ============================================================================
// Supabase設定（16_SupabaseClient.Supabase接続.gs で使用）
// ============================================================================
// スクリプトプロパティ:
//   SUPABASE_URL : SupabaseプロジェクトURL
//   SUPABASE_KEY : Supabase anon key（publishable key）
// ============================================================================

// ============================================================================
// DistributeInventory連携設定（Phase5: 動的トリガー方式）
// スクリプトプロパティ:
//   RECEIVER_WEBAPP_URL         : DistributeInventory側のWeb AppデプロイURL
//   API_SHARED_TOKEN            : DistributeInventoryと共有する認証トークン
//   DISTRIBUTE_TRIGGER_DELAY_MS : 動的トリガー発火までの遅延ms（省略時100）
// ============================================================================

/**
 * 受信側(DistributeInventory)のWeb App URLをスクリプトプロパティから取得する
 *
 * @return {string} 受信側のWeb App URL
 * @throws {Error} RECEIVER_WEBAPP_URL が未設定の場合
 */
function getReceiverWebAppUrl() {
    const url = PropertiesService.getScriptProperties().getProperty('RECEIVER_WEBAPP_URL');
    if (!url) {
        throw new Error('スクリプトプロパティ RECEIVER_WEBAPP_URL が設定されていません。DistributeInventory側のWeb AppデプロイURLを設定してください。');
    }
    return url;
}

/**
 * 受信側(DistributeInventory)と共有する認証トークンを取得する
 *
 * @return {string} 共有トークン
 * @throws {Error} API_SHARED_TOKEN が未設定の場合
 */
function getSharedToken() {
    const token = PropertiesService.getScriptProperties().getProperty('API_SHARED_TOKEN');
    if (!token) {
        throw new Error('スクリプトプロパティ API_SHARED_TOKEN が設定されていません。受信側(DistributeInventory)と同じ値を設定してください。');
    }
    return token;
}

/**
 * 動的トリガーの発火までの遅延時間（ミリ秒）を取得する
 *
 * 未設定の場合は既定値 100（0.1秒）を返す。
 *
 * @return {number} 遅延時間（ミリ秒）
 */
function getDistributeTriggerDelayMs() {
    const value = PropertiesService.getScriptProperties().getProperty('DISTRIBUTE_TRIGGER_DELAY_MS');
    return value ? parseInt(value, 10) : 100;
}

// ============================================================================
// テスト関数
// ============================================================================

/**
 * Phase5追加設定（DistributeInventory連携設定）の取得検証用テスト関数
 * 
 * @description
 * スクリプトプロパティから RECEIVER_WEBAPP_URL, API_SHARED_TOKEN, 
 * DISTRIBUTE_TRIGGER_DELAY_MS を安全に取得できるかをテストログに出力して検証します。
 */
function test_getPhase5Config() {
    console.log('--- Phase5 設定取得テスト開始 ---');
    
    // 遅延時間（デフォルト値100msの確認）
    const delay = getDistributeTriggerDelayMs();
    console.log('[検証] DISTRIBUTE_TRIGGER_DELAY_MS:', delay);

    // Web App URL 取得確認
    try {
        const url = getReceiverWebAppUrl();
        console.log('[検証] RECEIVER_WEBAPP_URL:', url);
    } catch (e) {
        console.log('[検証] RECEIVER_WEBAPP_URL (未設定検知):', e.message);
    }

    // 共有トークン 取得確認
    try {
        const token = getSharedToken();
        console.log('[検証] API_SHARED_TOKEN:', token);
    } catch (e) {
        console.log('[検証] API_SHARED_TOKEN (未設定検知):', e.message);
    }
    
    console.log('--- Phase5 設定取得テスト終了 ---');
}

