-- ====================================================================
-- View Name   : v_active_shop_master
-- Description : 有効な店舗データのみを抽出するビュー
--               「削除フラグ」が1以外のレコード、またはNULLのレコードのみを保持します。
-- Table Ref   : ne_shop_master
-- Created     : 2026-08-12
-- ====================================================================

-- 有効な店舗データだけを映し出すビュー「v_active_shop_master」を作成（または更新）します
CREATE OR REPLACE VIEW v_active_shop_master AS
SELECT *
FROM "ne_shop_master"  -- 👈 実際のテーブル名に書き換えてください
WHERE "削除フラグ" <> 1 OR "削除フラグ" IS NULL; -- 1（削除）ではない、または空（null）のデータを抽出