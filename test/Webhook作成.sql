-- ==========================================
-- 関数名: supabase_functions.http_request
-- 概要: テーブルのデータ変動（INSERT/UPDATE/DELETE）を検知し、GAS経由で外部システムと同期するためのWebhookトリガー関数。
-- 修正内容:
--   1. pg_netプラグインの正しい関数名「net_http_post」を適用
--   2. body引数の型エラー(42883)を回避するため、payloadをtext型へキャスト(payload::text)
-- ==========================================
CREATE OR REPLACE FUNCTION supabase_functions.http_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 -- プラグインがどこにあっても見つけられるように検索パスを固定する（ここがプロの対策です）
 SET search_path = extensions, public, pg_catalog
 AS $$
DECLARE
  request_id bigint;
  payload jsonb;
  url text := TG_ARGV[0];
  headers jsonb := COALESCE(TG_ARGV[2]::jsonb, '{}'::jsonb);
BEGIN
  -- 届いた新旧データをGASが読みやすいJSONの塊にパッキングする
  payload := jsonb_build_object(
    'old_record', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    'record', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA
  );

  -- 構築したプラグインを使って、安全にGASのURLへPOST送信する
  -- ※関数名を net_http_post に修正し、body を text型 にキャスト
  SELECT extensions.net_http_post(
    url := url,
    body := payload::text, 
    headers := jsonb_build_object('Content-Type', 'application/json') || headers
  ) INTO request_id;

  -- データベースの本来の処理を邪魔せずにデータを返す
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;