-- =================================================================
-- ファイル名: sql/get_table_size_mb.sql
-- 関数名: get_table_size_mb
-- 目的: 指定されたテーブルのデータおよびインデックス等を含む総容量をMB単位で算出する
-- 引数: 
--   - target_table text : 容量を調査したい対象のテーブル名（publicスキーマ内）
-- 戻り値: numeric : テーブルの総容量（MB、小数点以下第2位で四捨五入）
-- 変更履歴:
--   2026-07-19: 新規作成（標準ヘッダーコメントの追加、GRANT文の統合）
-- =================================================================
CREATE OR REPLACE FUNCTION get_table_size_mb(target_table text)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
    SELECT ROUND(pg_total_relation_size('public.' || target_table)::numeric / 1024 / 1024, 2);
$$;

-- 外部（GASなど）からのRPC呼び出しを許可するための権限付与
GRANT EXECUTE ON FUNCTION get_table_size_mb(text) TO anon;