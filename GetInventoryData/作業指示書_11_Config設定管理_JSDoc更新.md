# 作業指示書：11_Config.設定管理.gs JSDocヘッダー更新

## 目的
Phase5（動的トリガー方式）導入時に追加されたスクリプトプロパティが、
ファイル冒頭のJSDocコメント内「スクリプトプロパティの設定方法」表に
未記載のため追記する。**コメントのみの修正であり、実行コードへの変更は一切ない。**

## 対象ファイル
`GetInventoryData/11_Config.設定管理.gs`

## 修正内容（diff）

ファイル冒頭のJSDocコメント、24〜30行目付近の表に3行追加する。

```diff
  * | キー | 説明 |
  * | :--- | :--- |
  * | SPREADSHEET_ID | 在庫情報を更新したいスプレッドシートのID |
  * | SHEET_NAME | 在庫情報を更新したいシート名 |
  * | LOG_SHEET_NAME | 実行時間を記録するシート名 |
  * | SUPABASE_URL | SupabaseプロジェクトのURL |
  * | SUPABASE_KEY | Supabaseの anon key |
+ * | RECEIVER_WEBAPP_URL | DistributeInventory側のWeb AppデプロイURL |
+ * | API_SHARED_TOKEN | DistributeInventoryと共有する認証トークン |
+ * | DISTRIBUTE_TRIGGER_DELAY_MS | 動的トリガー発火までの遅延ms（省略時100） |
```

併せて、ファイル末尾寄りの以下のコメント見出しの直前に、
上記3項目が「Phase5で追加された設定」であることが分かる一文を追加する
（既存の説明文はそのまま残すこと）。

```diff
  * ============================================================================
  * Supabase設定（16_SupabaseClient.Supabase接続.gs で使用）
  * ============================================================================
+ * ※ 以下は Phase5（動的トリガー方式）導入時に追加された設定です。
  * スクリプトプロパティ:
  *   SUPABASE_URL : SupabaseプロジェクトURL
  *   SUPABASE_KEY : Supabase anon key（publishable key）
  * ============================================================================
```

## 禁止事項
- 関数の実装（`getReceiverWebAppUrl` 等）には一切手を加えない
- 既存の説明文は削除せず、追記のみ行う

## 検証手順
1. GASエディタで `11_Config.設定管理.gs` を開き、コメント部分のみが変更されていることを目視確認する
2. 保存後、構文エラーが出ないことを確認する（コメントのみなので実行テストは不要）
3. `updateInventoryDataFromGoodsMaster` または `updateInventoryDataBatchWithRetry` を1回実行し、これまで通り正常終了することを確認する（念のための回帰確認）
