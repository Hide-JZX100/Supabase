-- =================================================================
-- ファイル名: sql/rename_tables.sql
-- 目的: Supabaseテーブル名の大文字小文字変更（小文字統一）に伴う移行処理
-- 処理概要:
--   1. テーブル名を参照している既存のRPC関数を削除（DROP）します。
--   2. テーブル名を大文字から小文字へリファクタリング（RENAME）します。
-- 注意: このスクリプトを実行後、各RPC定義SQLファイル（修正後）を
--       順番に実行して、関数を再作成してください。
-- 変更履歴:
--   2026-07-12: 新規作成
-- =================================================================

-- -----------------------------------------------------------------
-- 1. 依存しているRPC関数の削除
-- -----------------------------------------------------------------
-- テーブル定義を参照している関数が存在するとテーブル名の変更ができないため、
-- 事前に削除します。
DROP FUNCTION IF EXISTS public.deactivate_missing_goods(TEXT[]);
DROP FUNCTION IF EXISTS public.upsert_ne_inventory_data(JSONB);
DROP FUNCTION IF EXISTS public.upsert_ne_stock_data(JSONB);
DROP FUNCTION IF EXISTS public.get_inventory_changes(TEXT[]);

-- -----------------------------------------------------------------
-- 2. テーブル名のリネーム（大文字 ➡ 小文字）
-- -----------------------------------------------------------------
-- PostgreSQLでは二重引用符（"）で囲まれた大文字を含むテーブル名を
-- 小文字にリネームします。
ALTER TABLE IF EXISTS public."NE_InventoryData" RENAME TO ne_inventory_data;
ALTER TABLE IF EXISTS public."NE_InventoryHistory" RENAME TO ne_inventory_history;

-- -----------------------------------------------------------------
-- 3. 移行後の確認用クエリ（任意実行）
-- -----------------------------------------------------------------
-- SELECT * FROM public.ne_inventory_data LIMIT 5;
-- SELECT * FROM public.ne_inventory_history LIMIT 5;
