-- =================================================================
-- ファイル名: test/verify_get_inventory_changes.sql
-- 目的: RPC関数 `get_inventory_changes` の動作をSQLのみで検証するためのテストスクリプト
-- 使い方: 
--   Supabaseの SQL Editor にこのスクリプト全体を貼り付けて実行してください。
--   トランザクション(BEGIN...ROLLBACK)を使用しているため、データベース内の本番データを
--   汚さずに安全に動作確認が可能です。
-- 変更履歴:
--   2026-07-02: 新規作成
-- =================================================================

BEGIN;

-- 1. テストデータの作成
-- NE_InventoryHistory テーブルに、検証用の架空の商品（TEST_ITEM_A）の履歴データを時系列順に挿入します。
-- ※ 記録日時は JST タイムゾーンで挿入します。
INSERT INTO "NE_InventoryHistory" (
    "商品コード", 
    "商品名", 
    "記録日時", 
    "在庫数", 
    "引当数", 
    "フリー在庫数",
    "is_active"
) VALUES 
('TEST_ITEM_A', 'テスト商品A', '2026-07-02 10:00:00+09', 10, 0, 10, true), -- 初回（前回データなし）
('TEST_ITEM_A', 'テスト商品A', '2026-07-02 11:00:00+09', 15, 2, 13, true), -- 在庫数+5, フリー在庫数+3
('TEST_ITEM_A', 'テスト商品A', '2026-07-02 12:00:00+09', 12, 3, 9, true);  -- 在庫数-3, フリー在庫数-4

-- 2. 作成したRPC関数の呼び出しと結果確認
-- 引数には検証用商品のコードを配列形式（ARRAY['TEST_ITEM_A']）で渡します。
SELECT 
    item_code,
    occurrence_at,
    current_quantity,
    prev_quantity,
    diff_quantity,
    current_free_quantity,
    prev_free_quantity,
    diff_free_quantity
FROM 
    get_inventory_changes(ARRAY['TEST_ITEM_A']);

-- 3. トランザクションのロールバック
-- ロールバックを行うことで、上記で挿入したテストデータがデータベースから完全に削除され、
-- 本番環境をクリーンな状態に維持します。
ROLLBACK;
