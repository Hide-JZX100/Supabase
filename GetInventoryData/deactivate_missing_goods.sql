-- =========================================================================
-- 関数名: deactivate_missing_goods
-- 概要: 送信データ（有効な商品コード一覧）に含まれない商品の is_active フラグを false に更新します。
--       これにより、ネクストエンジン側で削除・非表示になった商品をSupabase側で非活性化します。
--
-- 引数:
--   - active_codes (TEXT[]): 今回の同期処理で取得できた（生存している）商品コードの配列
--
-- 戻り値:
--   - INT: 非活性化（is_active = false に更新）されたレコードの総数
--
-- 処理フロー:
--   1. ne_inventory_data テーブルにおいて、以下の条件に合致するレコードを抽出
--      - 商品コードが引数 active_codes に含まれていない
--      - 現在 is_active が true である
--   2. 該当レコードの is_active を false に更新
--   3. 更新された行数を取得し、戻り値として返却する
--
-- 修正履歴:
-- - 2026-06-25: ネクストエンジンからの更新に合わせ、変更点をヒストリーテーブル（ne_inventory_history）へ保存する処理を追加
-- =========================================================================
CREATE OR REPLACE FUNCTION public.deactivate_missing_goods(active_codes TEXT[])
RETURNS INT AS $$
DECLARE
  updated_count INT;
BEGIN
  -- 安全対策: 配列がNULL、または要素数が0の場合は、全件非活性化を防ぐために 0 を返して終了
  IF active_codes IS NULL OR array_length(active_codes, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- 更新処理
  WITH deactivated AS (
      UPDATE public.ne_inventory_data
      SET "is_active" = false,  
          "更新日時" = NOW()
      WHERE "商品コード" != ALL(active_codes)
        AND "is_active" = true
      RETURNING ne_inventory_data.*
  )
  INSERT INTO public.ne_inventory_history (
      "商品コード", "商品名", "在庫数", "引当数", "フリー在庫数",
      "予約在庫数", "予約引当数", "予約フリー在庫数", "不良在庫数",
      "発注残数", "欠品数", "JANコード", "更新日時", "is_active"
  )
  SELECT
      "商品コード", "商品名", "在庫数", "引当数", "フリー在庫数",
      "予約在庫数", "予約引当数", "予約フリー在庫数", "不良在庫数",
      "発注残数", "欠品数", "JANコード", "更新日時", "is_active"
  FROM deactivated;

  -- 更新された行数を取得
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;