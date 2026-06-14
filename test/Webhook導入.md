# Supabase × GAS Webhook導入・トラブルシューティング手順書

## 1. プロジェクト概要と本手順書の目的
Supabaseのテーブルにおけるデータ変動（INSERT/UPDATE/DELETE）をトリガーとしてWebhookを発行し、GAS（Google Apps Script）を経由してスプレッドシートやネクストエンジン等の外部システムと連携するための基盤構築手順をまとめる。
本ドキュメントは、初期テスト段階での疎通確認（Supabase → GAS → スプレッドシート）を成功させた際の設定手順と、発生したエラーの根本原因・解決策の知見を記録したものである。

## 2. システム構成
* **送信元:** Supabase (PostgreSQL)
* **中継・処理:** Google Apps Script (GAS) `doPost(e)` 関数
* **出力先:** Google スプレッドシート（テスト用）
* **利用拡張機能:** `pg_net`（Supabaseの非同期通信プラグイン）

---

## 3. 導入手順（完全版）

### ステップ1：Supabaseの通信プラグイン（pg_net）の有効化【最重要】
SQLスクリプトからの拡張機能作成（`CREATE EXTENSION`）では、権限等の関係で「名前だけの空箱」状態になるリスクがある。確実な動作のため、必ず管理画面（UI）から有効化を行う。

1. Supabaseダッシュボード左側の歯車アイコン下の **[Database]** をクリック。
2. 左メニューから **[Extensions]** を選択。
3. 検索窓に `pg_net` と入力。
4. 表示された `pg_net` のスイッチをクリックして **[Enable（有効）]** にする。
   *(※これにより、Supabaseの標準仕様である `net` スキーマに通信用プログラムが確実にインストールされる)*

### ステップ2：Webhook送信用トリガー関数の作成
SupabaseのSQL Editorにて、以下のSQLを実行し、データ変動時にGASへPOST送信を行う関数を作成・上書きする。

```sql
-- ==========================================
-- 関数名: supabase_functions.http_request
-- 概要: テーブルのデータ変動を検知し、GAS経由で外部システムと同期するWebhookトリガー。
-- 重要なポイント:
--   1. pg_netプラグインの標準インストール先である「net」スキーマを正しく指定。
--   2. body引数には text 型への変換を行わず、jsonb 型のまま渡す。
-- ==========================================
CREATE SCHEMA IF NOT EXISTS supabase_functions;

CREATE OR REPLACE FUNCTION supabase_functions.http_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 -- プラグインを確実に見つけるため、検索パスに 'net' を追加して固定する
 SET search_path = net, extensions, public, pg_catalog
 AS $$
DECLARE
  request_id bigint;
  payload jsonb;
  url text := TG_ARGV[0];
  headers jsonb := COALESCE(TG_ARGV[2]::jsonb, '{}'::jsonb);
BEGIN
  -- 届いた新旧データをGASが読みやすいJSON形式にパッキングする
  payload := jsonb_build_object(
    'old_record', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    'record', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA
  );

  -- プラグインの標準関数（net.http_post）を呼び出し、Webhookを送信
  SELECT net.http_post(
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
```

### ステップ3：対象テーブルへのトリガー設定
作成した関数（`supabase_functions.http_request`）を、監視したいテーブル（例: `test_webhook`）のトリガーとして設定します。
Supabaseの「SQL Editor」にて以下のSQLを実行するか、または管理画面の [Database] > [Webhooks] から設定を行ってください。

```sql
-- ==========================================
-- トリガー名: trigger_test_to_gas
-- 対象テーブル: public.test_webhook
-- 起動タイミング: AFTER INSERT（データ追加後）
-- 概要: データが挿入された直後、引数に指定したGASのURLへデータを非同期送信する。
-- ==========================================
CREATE TRIGGER trigger_test_to_gas
AFTER INSERT ON public.test_webhook
FOR EACH ROW
EXECUTE FUNCTION supabase_functions.http_request(
  '[https://script.google.com/macros/s/](https://script.google.com/macros/s/)〜〜〜/exec' -- ※ここに実際のGASウェブアプリURLを記述
);
```

---

## 4. 過去の失敗から得た知見（トラブルシューティング記録）

初期設定時に `function extensions.http_post(...) does not exist` などのエラーが頻発した。これらの原因と解決のアプローチは以下の通りである。

### ① 「空箱」問題とプラグインの正しい配置場所
* **事象:** `CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;` を実行しても関数が見つからないエラーが発生。
* **原因:** SQLでの実行時、システム上は `extensions` に存在すると記録されたものの、実際の通信用プログラムが生成されていない「空箱」状態となっていた。また、最新のSupabase仕様では `pg_net` は `net` スキーマに配置されるのが標準である。
* **解決策:** UIのExtensions画面から直接 `pg_net` を有効化し、`net` スキーマに確実な実体を構築。SQL内の関数呼び出しも `extensions.http_post` から `net.http_post` に修正し、検索パス（`search_path`）に `net` を追加した。

### ② PostgreSQLの厳格な「型」と「名前」のルール
* **事象:** `ERROR: 42883: function ... does not exist` エラーが消えない。
* **原因:** PostgreSQLは「関数名」と「引数の型」が完全に一致しないと、別の関数とみなしてエラーを返す。過去のコードでは関数名が `net_http_post` になっていたり、引数として送るJSONデータを `payload::text` と「テキスト型」に変換してしまったりしていた。プラグイン側が求めているのは「`http_post` という関数名」で「`jsonb` 型のデータ」であったため、ミスマッチが起きていた。
* **解決策:** 呼び出す関数名を `net.http_post` に統一し、データを送る際の `::text` キャストを削除。構築したJSONデータ（`payload`）をそのままの型で渡すことで、シグネチャ（関数名と型の組み合わせ）を完全に一致させた。