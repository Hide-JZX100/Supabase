-- =================================================================
-- ファイル名: sql/get_inventory_changes_paged_verify.sql
-- 目的: get_inventory_changes_paged（Issue #46）の動作確認用SQL。
--       Supabase の SQL Editor で、ファイル全体を一度に実行する。
--       最後の SELECT が、全検証項目の結果を1つの表（check_no / check_name / verdict / detail）で返す。
--       テーブルのデータは変更しない（読み取り専用）。
--       検証用の関数・一時テーブルはセッション内（pg_temp）にのみ作られ、接続終了で消える。
-- 使い方:
--   1. 先に sql/get_inventory_changes_paged.sql を適用しておく。
--   2. このファイル全体を貼り付けて実行する（分割して実行しないこと）。
--   3. 結果の verdict 列がすべて OK（または「参考」）であることを確認する。
-- 検証項目:
--   1 : ページ境界の一致（3条件）。ページングなしの基準クエリと全行・並び順・重複を比較する
--   1b: 旧関数 get_inventory_changes との差分件数（参考。合否には使わない）
--   2 : p_limit の丸め（5000を指定しても1000件以下で返る）
--   3 : カーソル引数の不整合（一部だけ指定）でエラーになる
--   5 : 同一商品コードで記録日時が完全に同じ行の有無（実データの確認。参考）
-- 備考:
--   ・SQL Editor からの直接実行はPostgRESTを通らないため、1,000件の上限を受けない。
--   ・旧関数は「同一日時の行」で前回値が不定になる（idのタイブレーカーが無い）ため、
--     合否の基準は旧関数ではなく、ページングなしの基準クエリ（LAGを「記録日時, id」順で計算）とする。
--   ・DROP TABLE の確認ダイアログが出た場合は、このスクリプト内の一時テーブル（tmp_ref / tmp_paged）を
--     消すだけなので、続行して問題ない。
-- =================================================================


-- -----------------------------------------------------------------
-- 部品: ページ境界の一致確認（1条件分）
--   件数の多い上位N商品コードを対象に、指定ページサイズで最後まで取得し直し、
--   基準クエリ（ページングなし）の結果と比較する。
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.verify_paging(p_page_size integer DEFAULT 7, p_top_n integer DEFAULT 5)
RETURNS TABLE (
    target_count integer,
    page_count integer,
    paged_rows bigint,
    ref_rows bigint,
    only_in_paged bigint,
    only_in_ref bigint,
    order_violations bigint,
    duplicate_ids bigint,
    verdict text
) AS $$
DECLARE
    l_targets text[];
    l_cur_item text := NULL;
    l_cur_at timestamptz := NULL;
    l_cur_id bigint := NULL;
    l_rows integer;
    l_pages integer := 0;
    l_guard integer := 100000;  -- 無限ループ防止
BEGIN
    SELECT array_agg(s.c) INTO l_targets
    FROM (
        SELECT h."商品コード" AS c
        FROM ne_inventory_history h
        GROUP BY h."商品コード"
        ORDER BY count(*) DESC, h."商品コード"
        LIMIT p_top_n
    ) s;

    -- 基準クエリ（ページングなし。LAGは「記録日時, id」順）
    DROP TABLE IF EXISTS tmp_ref;
    CREATE TEMP TABLE tmp_ref AS
        SELECT
            h."商品コード"::text AS item_code,
            h."記録日時" AS occurrence_at,
            h."在庫数"::integer AS current_quantity,
            (LAG(h."在庫数") OVER w)::integer AS prev_quantity,
            (h."在庫数"::integer - COALESCE((LAG(h."在庫数") OVER w)::integer, h."在庫数"::integer)) AS diff_quantity,
            h."フリー在庫数"::integer AS current_free_quantity,
            (LAG(h."フリー在庫数") OVER w)::integer AS prev_free_quantity,
            (h."フリー在庫数"::integer - COALESCE((LAG(h."フリー在庫数") OVER w)::integer, h."フリー在庫数"::integer)) AS diff_free_quantity,
            h.id AS id
        FROM ne_inventory_history h
        WHERE h."商品コード" = ANY(l_targets)
        WINDOW w AS (PARTITION BY h."商品コード" ORDER BY h."記録日時" ASC, h.id ASC);

    -- ページングで取得した結果の入れ物（seq = 取得順）
    DROP TABLE IF EXISTS tmp_paged;
    CREATE TEMP TABLE tmp_paged AS
        SELECT * FROM get_inventory_changes_paged(l_targets, 1) LIMIT 0;
    ALTER TABLE tmp_paged ADD COLUMN seq bigserial;

    LOOP
        INSERT INTO tmp_paged (item_code, occurrence_at, current_quantity, prev_quantity, diff_quantity,
                               current_free_quantity, prev_free_quantity, diff_free_quantity, id)
            SELECT * FROM get_inventory_changes_paged(l_targets, p_page_size, l_cur_item, l_cur_at, l_cur_id);
        GET DIAGNOSTICS l_rows = ROW_COUNT;
        l_pages := l_pages + 1;
        EXIT WHEN l_rows < p_page_size;

        SELECT t.item_code, t.occurrence_at, t.id
          INTO l_cur_item, l_cur_at, l_cur_id
        FROM tmp_paged t
        ORDER BY t.seq DESC
        LIMIT 1;

        l_guard := l_guard - 1;
        IF l_guard <= 0 THEN
            RAISE EXCEPTION 'ページ数が上限を超えました。ループが終了していません。';
        END IF;
    END LOOP;

    RETURN QUERY
    WITH
    cmp AS (
        SELECT
            (SELECT count(*) FROM tmp_paged) AS paged_cnt,
            (SELECT count(*) FROM tmp_ref) AS ref_cnt,
            (SELECT count(*) FROM (
                SELECT p.item_code, p.occurrence_at, p.current_quantity, p.prev_quantity, p.diff_quantity,
                       p.current_free_quantity, p.prev_free_quantity, p.diff_free_quantity, p.id FROM tmp_paged p
                EXCEPT
                SELECT r.item_code, r.occurrence_at, r.current_quantity, r.prev_quantity, r.diff_quantity,
                       r.current_free_quantity, r.prev_free_quantity, r.diff_free_quantity, r.id FROM tmp_ref r
            ) a) AS only_paged,
            (SELECT count(*) FROM (
                SELECT r.item_code, r.occurrence_at, r.current_quantity, r.prev_quantity, r.diff_quantity,
                       r.current_free_quantity, r.prev_free_quantity, r.diff_free_quantity, r.id FROM tmp_ref r
                EXCEPT
                SELECT p.item_code, p.occurrence_at, p.current_quantity, p.prev_quantity, p.diff_quantity,
                       p.current_free_quantity, p.prev_free_quantity, p.diff_free_quantity, p.id FROM tmp_paged p
            ) b) AS only_ref,
            -- 取得順が (item_code, occurrence_at, id) の昇順になっていない行の数
            (SELECT count(*) FROM (
                SELECT ROW(t.item_code, t.occurrence_at, t.id) AS k,
                       LAG(ROW(t.item_code, t.occurrence_at, t.id)) OVER (ORDER BY t.seq) AS pk
                FROM tmp_paged t
            ) x WHERE x.pk IS NOT NULL AND NOT (x.k > x.pk)) AS order_viol,
            (SELECT count(*) - count(DISTINCT t.id) FROM tmp_paged t) AS dup_ids
    )
    SELECT
        COALESCE(array_length(l_targets, 1), 0),
        l_pages,
        c.paged_cnt,
        c.ref_cnt,
        c.only_paged,
        c.only_ref,
        c.order_viol,
        c.dup_ids,
        CASE
            WHEN c.paged_cnt = c.ref_cnt AND c.only_paged = 0 AND c.only_ref = 0
             AND c.order_viol = 0 AND c.dup_ids = 0
            THEN 'OK'
            ELSE 'NG（要調査）'
        END
    FROM cmp c;
END;
$$ LANGUAGE plpgsql;


-- -----------------------------------------------------------------
-- 全検証項目の実行（結果を1つの表にまとめて返す）
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.verify_all()
RETURNS TABLE (
    check_no text,
    check_name text,
    verdict text,
    detail text
) AS $$
DECLARE
    r record;
    l_cnt bigint;
BEGIN
    -- 検証1: ページ境界の一致（ページサイズ7件・1件・1000件）
    FOR r IN SELECT * FROM (VALUES (7, 5), (1, 3), (1000, 10)) AS v(ps, tn) LOOP
        RETURN QUERY
        SELECT '1'::text,
               ('ページ境界の一致（ページサイズ' || r.ps || '件・上位' || r.tn || '商品コード）')::text,
               pv.verdict,
               ('ページ数=' || pv.page_count || ' / 取得=' || pv.paged_rows || '件 / 基準=' || pv.ref_rows
                || '件 / 差(取得側のみ)=' || pv.only_in_paged || ' / 差(基準側のみ)=' || pv.only_in_ref
                || ' / 順序違反=' || pv.order_violations || ' / id重複=' || pv.duplicate_ids)::text
        FROM pg_temp.verify_paging(r.ps, r.tn) pv;
    END LOOP;

    -- 検証1b（参考）: 直前の検証1（1000件・上位10商品）の取得結果と、旧関数の差分件数
    SELECT count(*) INTO l_cnt
    FROM (
        SELECT p.item_code, p.occurrence_at, p.current_quantity, p.prev_quantity, p.diff_quantity,
               p.current_free_quantity, p.prev_free_quantity, p.diff_free_quantity
        FROM tmp_paged p
        EXCEPT
        SELECT o.item_code, o.occurrence_at, o.current_quantity, o.prev_quantity, o.diff_quantity,
               o.current_free_quantity, o.prev_free_quantity, o.diff_free_quantity
        FROM get_inventory_changes((SELECT array_agg(DISTINCT t.item_code) FROM tmp_paged t)) o
    ) d;
    RETURN QUERY
    SELECT '1b'::text, '旧関数との差分件数（参考）'::text,
           (CASE WHEN l_cnt = 0 THEN 'OK' ELSE '参考（差分あり）' END)::text,
           ('差分=' || l_cnt || '件。同一時刻の行があると、旧関数側の前回値が不定のため差が出ることがある')::text;

    -- 検証2: p_limit の丸め（5000を指定しても1000件以下で返る）
    SELECT count(*) INTO l_cnt
    FROM get_inventory_changes_paged((SELECT array_agg(DISTINCT h."商品コード") FROM ne_inventory_history h), 5000);
    RETURN QUERY
    SELECT '2'::text, 'p_limitの丸め（5000を指定）'::text,
           (CASE WHEN l_cnt <= 1000 THEN 'OK' ELSE 'NG（要調査）' END)::text,
           ('返却=' || l_cnt || '件（期待値: 1000件以下）')::text;

    -- 検証3: カーソル引数の不整合（一部だけ指定）でエラーになる
    BEGIN
        PERFORM * FROM get_inventory_changes_paged(ARRAY['dummy'], 10, 'dummy', NULL, NULL);
        RETURN QUERY
        SELECT '3'::text, 'カーソル引数の不整合でエラーになる'::text, 'NG（要調査）'::text,
               'エラーが発生しませんでした'::text;
    EXCEPTION WHEN raise_exception THEN
        RETURN QUERY
        SELECT '3'::text, 'カーソル引数の不整合でエラーになる'::text, 'OK'::text,
               'エラー発生を確認（意図どおり）'::text;
    END;

    -- 検証5（参考）: 同一商品コードで記録日時が完全に同じ行の有無
    SELECT count(*) INTO l_cnt
    FROM (
        SELECT 1
        FROM ne_inventory_history h
        GROUP BY h."商品コード", h."記録日時"
        HAVING count(*) > 1
    ) s;
    RETURN QUERY
    SELECT '5'::text, '同一時刻の履歴行の有無（実データ）'::text,
           (CASE WHEN l_cnt = 0 THEN 'OK（なし）' ELSE '参考（あり）' END)::text,
           ('該当グループ=' || l_cnt || '件。ある場合、旧関数ではその行の前回値が不定だった')::text;

    RETURN;
END;
$$ LANGUAGE plpgsql;


-- 実行（この結果が最終出力）
SELECT * FROM pg_temp.verify_all();