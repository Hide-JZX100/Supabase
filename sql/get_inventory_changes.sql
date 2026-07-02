-- =================================================================
-- ファイル名: sql/get_inventory_changes.sql
-- 関数名: get_inventory_changes
-- 目的: 指定された商品コード配列に対し、LAG関数を用いて在庫・フリー在庫の前後比較を行う
-- 引数: 
--   - target_item_codes text[] : 比較対象の商品コードの配列
-- 戻り値: TABLE (
--   - item_code text : 商品コード
--   - occurrence_at timestamptz : 記録日時_JST
--   - current_quantity integer : 在庫数
--   - prev_quantity integer : 在庫数_前回
--   - diff_quantity integer : 在庫数差分（今回 - 前回、初回は0）
--   - current_free_quantity integer : フリー在庫数
--   - prev_free_quantity integer : フリー在庫数_前回
--   - diff_free_quantity integer : フリー在庫数差分（今回 - 前回、初回は0）
-- )
-- 変更履歴:
--   2026-07-02: 新規作成（CTE構造、JST変換、前回値・差分列の追加）
-- =================================================================
CREATE OR REPLACE FUNCTION get_inventory_changes(target_item_codes text[])
RETURNS TABLE (
    item_code text,
    occurrence_at timestamptz,
    current_quantity integer,
    prev_quantity integer,
    diff_quantity integer,
    current_free_quantity integer,
    prev_free_quantity integer,
    diff_free_quantity integer
) AS $$
BEGIN
    RETURN QUERY
    WITH lag_data AS (
        SELECT 
            "商品コード"::text AS item_code, 
            ("記録日時" AT TIME ZONE 'Asia/Tokyo') AS occurrence_at, 
            "在庫数"::integer AS current_qty,
            LAG("在庫数") OVER (
                PARTITION BY "商品コード" 
                ORDER BY "記録日時" ASC
            )::integer AS prev_qty,
            "フリー在庫数"::integer AS current_free_qty,
            LAG("フリー在庫数") OVER (
                PARTITION BY "商品コード" 
                ORDER BY "記録日時" ASC
            )::integer AS prev_free_qty
        FROM 
            "NE_InventoryHistory"
        WHERE 
            "商品コード" = ANY(target_item_codes)
    )
    SELECT 
        ld.item_code,
        ld.occurrence_at,
        ld.current_qty,
        ld.prev_qty,
        (ld.current_qty - COALESCE(ld.prev_qty, ld.current_qty)) AS diff_quantity,
        ld.current_free_qty,
        ld.prev_free_qty,
        (ld.current_free_qty - COALESCE(ld.prev_free_qty, ld.current_free_qty)) AS diff_free_quantity
    FROM 
        lag_data ld
    ORDER BY 
        ld.item_code ASC,
        ld.occurrence_at ASC;
END;
$$ LANGUAGE plpgsql;
