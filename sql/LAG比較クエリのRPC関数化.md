# 🛠️ 開発指示書: LAG比較クエリのRPC関数化

## 1. 背景と目的
Issue #19 において、`NE_InventoryHistory` テーブルに対するLAG関数を用いた在庫前後比較クエリの動作確認が完了しました。
現状は手動でSQLを実行しているため、GASやSpreadsheetからの再利用性を高めることを目的に、パラメータ（商品コード配列）を明示的に渡せる「RPC関数（ストアドファンクション）」として固定化します。

## 2. 開発・コーディングルール
* **アジャイル＆スモールステップ**: 今回は関数を実装し、単体テストができる状態を目指します。インデックス追加（Issue #18）は保留中のため、インデックスなしの状態で進めます。
* **既存コメント・ヘッダーの維持・アップデート**: コードの変更に合わせて、関数の説明文や変更履歴などのコメントを丁寧に記述・アップデートしてください。
* **日本語カラムの維持**: 元のテーブルの物理名が日本語（`"商品コード"`、`"在庫数"`など）のため、ダブルクォーテーションを省略せずに正確に扱ってください。

## 3. 関数仕様
* **関数名**: `get_inventory_changes`
* **引数**: `target_item_codes text[]` （商品コードの配列）
* **戻り値**: `RETURNS TABLE` （以下の列構成と並び順を厳守）

| 列名 | 型 | 論理名 |
| :--- | :--- | :--- |
| `item_code` | `text` | 商品コード |
| `occurrence_at` | `timestamptz` | 記録日時_JST |
| `current_quantity` | `integer` | 在庫数 |
| `prev_quantity` | `integer` | 在庫数_前回 |
| `diff_quantity` | `integer` | 在庫数差分（今回 - 前回） |
| `current_free_quantity` | `integer` | フリー在庫数 |
| `prev_free_quantity` | `integer` | フリー在庫数_前回 |
| `diff_free_quantity` | `integer` | フリー在庫数差分（今回 - 前回） |

## 4. 実装SQL（DDL）
可読性と将来の拡張性を高めるため、CTE（`WITH`句）を用いて、LAG関数による前回値の取得と、外側での差分計算を分離した構造（美しいアプローチ）で実装してください。また、初回データ（前回値がNULL）の際は、差分がNULLにならないよう `COALESCE` を用いて安全弁を設けてください。


```sql
-- =================================================================
-- 関数名: get_inventory_changes
-- 目的: 指定された商品コード配列に対し、LAG関数を用いて在庫・フリー在庫の前後比較を行う
-- 引数: target_item_codes text[] (商品コードの配列)
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
```