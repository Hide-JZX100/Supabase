-- STREAMING_CHUNK:Defining function headers and comments...
/*******************************************************************************
 * 関数名: upsert_ne_inventory_data
 * 説明: GASから受信したネクストエンジンの在庫データ配列（複数件）を展開し、
 *       既存データと「在庫数」「引当数」「フリー在庫数」「欠品数」「JANコード」に
 *       差分がある商品のみを更新する。
 *       主要な在庫情報やJANコードに変化がない商品は処理をスキップし、過去の更新日時を維持する。
 *
 * 引数:
 *   - json_data (JSONB): ネクストエンジンの在庫データオブジェクトの配列
 *
 * 修正履歴:
 * - 2026-05-24: JANコードの型をTEXTからBIGINTに修正
 * - 2026-06-01: 可読性向上のため、インデント・改行およびエイリアスをリファクタリング
 * - 2026-06-07: 更新対象の判定条件（WHERE句）に「JANコード」の不一致判定を追加
 * - 2026-06-25: ネクストエンジンからの更新に合わせ、変更点をヒストリーテーブル（ne_inventory_history）へ保存する処理を追加
 *******************************************************************************/
CREATE OR REPLACE FUNCTION public.upsert_ne_inventory_data(json_data JSONB)
RETURNS VOID AS $$
BEGIN

    WITH upserted AS (

    -- STREAMING_CHUNK:Inserting or updating inventory data...
    -- =========================================================================
    -- 1. JSONデータをテーブル形式に展開し、インサートを実行
    -- =========================================================================
    INSERT INTO public.ne_inventory_data (
        "商品コード", "商品名", "在庫数", "引当数", "フリー在庫数", 
        "予約在庫数", "予約引当数", "予約フリー在庫数", "不良在庫数", 
        "発注残数", "欠品数", "JANコード", "更新日時"
    )
    SELECT 
        "商品コード", "商品名", "在庫数", "引当数", "フリー在庫数", 
        "予約在庫数", "予約引当数", "予約フリー在庫数", "不良在庫数", 
        "発注残数", "欠品数", "JANコード", NOW()
    FROM jsonb_to_recordset(json_data) AS x(
        "商品コード"        TEXT,
        "商品名"            TEXT,
        "在庫数"            INTEGER,
        "引当数"            INTEGER,
        "フリー在庫数"      INTEGER, 
        "予約在庫数"        INTEGER,
        "予約引当数"        INTEGER,
        "予約フリー在庫数"  INTEGER,
        "不良在庫数"        INTEGER,
        "発注残数"          INTEGER,
        "欠品数"            INTEGER,
        "JANコード"         BIGINT
    )
    
    -- STREAMING_CHUNK:Applying conflict resolution and filter conditions...
    -- =========================================================================
    -- 2. 「商品コード」が重複した場合の更新処理（UPSERT）
    -- =========================================================================
    ON CONFLICT ("商品コード")
    DO UPDATE SET
        "商品名"          = EXCLUDED."商品名",
        "在庫数"          = EXCLUDED."在庫数",
        "引当数"          = EXCLUDED."引当数",
        "フリー在庫数"    = EXCLUDED."フリー在庫数",
        "予約在庫数"      = EXCLUDED."予約在庫数",
        "予約引当数"      = EXCLUDED."予約引当数",
        "予約フリー在庫数" = EXCLUDED."予約フリー在庫数",
        "不良在庫数"      = EXCLUDED."不良在庫数",
        "発注残数"        = EXCLUDED."発注残数",
        "欠品数"          = EXCLUDED."欠品数",
        "JANコード"       = EXCLUDED."JANコード",
        "更新日時"        = NOW(),
        "is_active"       = TRUE
        
    -- =========================================================================
    -- 3. 主要な在庫情報（4項目）またはJANコードのいずれかに変更がある場合のみ実際に更新
    -- =========================================================================
    WHERE 
        ne_inventory_data."在庫数"          IS DISTINCT FROM EXCLUDED."在庫数" OR
        ne_inventory_data."引当数"          IS DISTINCT FROM EXCLUDED."引当数" OR
        ne_inventory_data."フリー在庫数"    IS DISTINCT FROM EXCLUDED."フリー在庫数" OR
        ne_inventory_data."欠品数"          IS DISTINCT FROM EXCLUDED."欠品数" OR
        ne_inventory_data."JANコード"         IS DISTINCT FROM EXCLUDED."JANコード" OR
        ne_inventory_data."is_active"    = FALSE  -- 非アクティブからの復活を検知
    RETURNING ne_inventory_data.*
    )

    -- =========================================================================
    -- 4. 差分があった行のみ履歴テーブルへ追記
    -- =========================================================================
    INSERT INTO public.ne_inventory_history (
        "商品コード", "商品名", "在庫数", "引当数", "フリー在庫数",
        "予約在庫数", "予約引当数", "予約フリー在庫数", "不良在庫数",
        "発注残数", "欠品数", "JANコード", "更新日時", "is_active"
    )
    SELECT
        "商品コード", "商品名", "在庫数", "引当数", "フリー在庫数",
        "予約在庫数", "予約引当数", "予約フリー在庫数", "不良在庫数",
        "発注残数", "欠品数", "JANコード", "更新日時", "is_active"
    FROM upserted;

END;
$$ LANGUAGE plpgsql;