-- 1. 通信プラグイン（pg_net）をシステム専用の部屋に確実にONにする
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- 2. Webhook用の部屋（スキーマ）を強制的に作成する
CREATE SCHEMA IF NOT EXISTS supabase_functions;

-- 3. UI（画面）が欲しがっている「荷物配送用の関数（http_request）」を手動で完璧に設置する
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
  SELECT extensions.net_http_post(
    url := url,
    body := payload,
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