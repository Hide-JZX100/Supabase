-- =================================================================
-- ファイル名: sql/get_inventory_changes_paged.sql
-- 関数名: get_inventory_changes_paged
-- 目的: 指定された商品コード配列に対し、LAG関数を用いて在庫・フリー在庫の前後比較を行い、
--       キーセット方式（カーソル方式）のページングで取得する。
--       Supabase（PostgREST）の1レスポンス最大行数（既定1,000件）による
--       サイレントな取得漏れを防ぐため、旧関数 get_inventory_changes の後継として追加する。
--       （旧関数は切り戻し用に残す。Issue #46）
-- 引数:
--   - target_item_codes text[]        : 比較対象の商品コードの配列
--   - p_limit integer                 : 1回に返す最大件数（既定1000。1〜1000に丸める）
--   - p_after_item_code text          : カーソル（前回ページ最後の行の商品コード）。初回はNULL
--   - p_after_occurrence_at timestamptz : カーソル（前回ページ最後の行の記録日時）。初回はNULL
--   - p_after_id bigint               : カーソル（前回ページ最後の行のid）。初回はNULL
--   ※カーソル3引数は「すべてNULL（初回）」か「すべて非NULL」のどちらかのみ許可する。
-- 戻り値: TABLE (
--   - item_code text : 商品コード
--   - occurrence_at timestamptz : 記録日時
--   - current_quantity integer : 在庫数
--   - prev_quantity integer : 在庫数_前回
--   - diff_quantity integer : 在庫数差分（今回 - 前回、初回は0）
--   - current_free_quantity integer : フリー在庫数
--   - prev_free_quantity integer : フリー在庫数_前回
--   - diff_free_quantity integer : フリー在庫数差分（今回 - 前回、初回は0）
--   - id bigint : 履歴レコードのid（次ページのカーソル用）
-- )
-- 並び順: item_code, occurrence_at, id の昇順（idは同一日時の行を一意に並べるタイブレーカー）
-- 設計メモ:
--   1. 内側の絞り込みでカーソルの商品コードより前を除外する。
--      LAGは商品コードごとに計算するため、除外しても前回値には影響しない（ページが進むほど軽くなる）。
--   2. LAGの並び順は「記録日時, id」。同一日時の行があっても前回値が一意に決まる。
--   3. カーソル条件はLAG計算の「後」（外側）で適用する。
--      先に絞るとページ先頭行の前回値・差分が欠落するため。
--   4. 呼び出し側（GAS）はカーソルの記録日時を文字列のまま渡すこと。
--      Dateに変換するとミリ秒に丸められ、マイクロ秒精度の境界で重複・欠落が起きる。
--   5. 実行方式・権限は旧関数と同じ（SECURITY DEFINERは付けない）。
-- 変更履歴:
--   2026-10-05: 新規作成（Issue #46）
-- =================================================================
CREATE OR REPLACE FUNCTION get_inventory_changes_paged(
    target_item_codes text[],
    p_limit integer DEFAULT 1000,
    p_after_item_code text DEFAULT NULL,
    p_after_occurrence_at timestamptz DEFAULT NULL,
    p_after_id bigint DEFAULT NULL
)
RETURNS TABLE (
    item_code text,
    occurrence_at timestamptz,
    current_quantity integer,
    prev_quantity integer,
    diff_quantity integer,
    current_free_quantity integer,
    prev_free_quantity integer,
    diff_free_quantity integer,
    id bigint
) AS $$
DECLARE
    v_limit integer;
BEGIN
    -- カーソル3引数の整合性チェック（一部だけ指定されると比較がNULLになり、全行が消えてしまうため）
    IF (p_after_item_code IS NULL) <> (p_after_occurrence_at IS NULL)
       OR (p_after_item_code IS NULL) <> (p_after_id IS NULL) THEN
        RAISE EXCEPTION 'カーソル引数（p_after_item_code, p_after_occurrence_at, p_after_id）は、すべてNULLかすべて指定してください。';
    END IF;

    -- 取得件数の正規化（1〜1000）。1000超はPostgRESTの上限で黙って切り捨てられるため、ここで丸める
    v_limit := LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 1000);

    RETURN QUERY
    WITH lag_data AS (
        SELECT
            h.id AS rec_id,
            h."商品コード"::text AS item_cd,
            h."記録日時" AS occurred_at,
            h."在庫数"::integer AS current_qty,
            (LAG(h."在庫数") OVER w)::integer AS prev_qty,
            h."フリー在庫数"::integer AS current_free_qty,
            (LAG(h."フリー在庫数") OVER w)::integer AS prev_free_qty
        FROM
            ne_inventory_history h
        WHERE
            h."商品コード" = ANY(target_item_codes)
            AND (p_after_item_code IS NULL OR h."商品コード" >= p_after_item_code)
        WINDOW w AS (
            PARTITION BY h."商品コード"
            ORDER BY h."記録日時" ASC, h.id ASC
        )
    )
    SELECT
        ld.item_cd,
        ld.occurred_at,
        ld.current_qty,
        ld.prev_qty,
        (ld.current_qty - COALESCE(ld.prev_qty, ld.current_qty)),
        ld.current_free_qty,
        ld.prev_free_qty,
        (ld.current_free_qty - COALESCE(ld.prev_free_qty, ld.current_free_qty)),
        ld.rec_id
    FROM
        lag_data ld
    WHERE
        p_after_item_code IS NULL
        OR (ld.item_cd, ld.occurred_at, ld.rec_id) > (p_after_item_code, p_after_occurrence_at, p_after_id)
    ORDER BY
        ld.item_cd ASC,
        ld.occurred_at ASC,
        ld.rec_id ASC
    LIMIT v_limit;
END;
$$ LANGUAGE plpgsql;