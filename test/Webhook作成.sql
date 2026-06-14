-- ==========================================
-- 関数名: supabase_functions.http_request
-- 概要: テーブルのデータ変動を検知し、GAS経由で外部システムと同期するWebhookトリガー。
-- 修正内容: pg_netプラグインの標準インストール先である「net」スキーマを正しく指定。
-- ==========================================
CREATE OR REPLACE FUNCTION supabase_functions.http_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 -- 検索パスに 'net' を追加して固定
 SET search_path = net, extensions, public, pg_catalog
 AS $$
DECLARE
  request_id bigint;
  payload jsonb;
  url text := TG_ARGV[0];
  headers jsonb := COALESCE(TG_ARGV[2]::jsonb, '{}'::jsonb);
BEGIN
  -- GAS用JSONデータ構築
  payload := jsonb_build_object(
    'old_record', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    'record', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA
  );

  -- プラグインの標準関数（net.http_post）を呼び出し、bodyはjsonb(payload)のまま渡す
  SELECT net.http_post(
    url := url,
    body := payload,
    headers := jsonb_build_object('Content-Type', 'application/json') || headers
  ) INTO request_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;