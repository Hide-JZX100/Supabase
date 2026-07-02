/**
 * @file test/test_get_inventory_changes.gs
 * @description RPC関数 `get_inventory_changes` の動作をGASから検証するためのテストスクリプト。
 * 
 * ### 依存関係
 * - `GetInventoryData/16_SupabaseClient.Supabase接続.gs`
 * 
 * ### テスト方法
 * 1. スタンドアロンテスト (`test_get_inventory_changes_standalone`):
 *    SupabaseのURLとAPIキーを直接書き換えることで、設定不要で即座に動作検証が可能です。
 * 2. プロジェクト統合テスト (`test_get_inventory_changes_project`):
 *    プロジェクトで設定されたスクリプトプロパティを利用し、共通関数の `callSupabaseRpc` 経由で呼び出しを行います。
 *
 * @version 1.0 (2026-07-02 新規作成)
 */

/**
 * 【テスト1】スタンドアロン動作検証テスト
 *
 * スクリプトプロパティを使用せず、URLとAPIキーを直書きしてRPC関数の接続とデータ取得を確認します。
 * 初期の接続確認や、一時的なデバッグに便利です。
 */
function test_get_inventory_changes_standalone() {
  // 1. 接続情報を設定してください（本番URL・Keyをペースト）
  const supabaseUrl = "https://******.supabase.co"; // ここをご自身のURLに書き換えてください
  const supabaseKey = "eyJ〜"; // ここをご自身のanonキーに書き換えてください
  
  // 2. RPC呼び出しのパラメータ設定
  const functionName = "get_inventory_changes";
  const params = {
    target_item_codes: ["TEST_ITEM_A", "A001"] // 検証したい商品コードを配列で指定
  };
  
  const url = supabaseUrl + "/rest/v1/rpc/" + functionName;
  const options = {
    "method": "post",
    "contentType": "application/json",
    "headers": {
      "apikey": supabaseKey,
      "Authorization": "Bearer " + supabaseKey
    },
    "payload": JSON.stringify(params),
    "muteHttpExceptions": true
  };
  
  try {
    Logger.log("--- [Standalone] RPC関数呼び出し開始: " + functionName + " ---");
    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    const body = response.getContentText();
    
    Logger.log("ステータスコード: " + statusCode);
    if (statusCode === 200) {
      const data = JSON.parse(body);
      Logger.log("取得データ件数: " + data.length + " 件");
      if (data.length > 0) {
        Logger.log("--- 取得データ一覧 ---");
        data.forEach(function(row, index) {
          Logger.log(
            "[" + (index + 1) + "] " +
            "商品: " + row.item_code + " | " +
            "日時: " + row.occurrence_at + " | " +
            "在庫: " + row.current_quantity + " (前回: " + row.prev_quantity + ", 差分: " + row.diff_quantity + ") | " +
            "フリー: " + row.current_free_quantity + " (前回: " + row.prev_free_quantity + ", 差分: " + row.diff_free_quantity + ")"
          );
        });
        
        // 必要に応じて、以下のコメントアウトを解除するとJSON生データも全件出力できます
        // Logger.log(JSON.stringify(data, null, 2));
      } else {
        Logger.log("該当データがありませんでした（検証用データの挿入をご確認ください）");
      }
    } else {
      Logger.log("エラーレスポンス: " + body);
    }
  } catch (error) {
    Logger.log("エラーが発生しました: " + error.toString());
  }
}

/**
 * 【テスト2】プロジェクト共通モジュール（callSupabaseRpc）を用いた統合テスト
 *
 * プロジェクトに定義済みの共通処理 `callSupabaseRpc` を使用してRPCを呼び出します。
 * スクリプトプロパティ(SUPABASE_URL, SUPABASE_KEY)が設定されていることを前提とします。
 */
function test_get_inventory_changes_project() {
  const functionName = "get_inventory_changes";
  const params = {
    target_item_codes: ["TEST_ITEM_A", "A001"] // 検証したい商品コードを配列で指定
  };

  try {
    Logger.log("--- [Project] RPC関数呼び出し開始: " + functionName + " ---");
    
    // 16_SupabaseClient.Supabase接続.gs に定義されている callSupabaseRpc を呼び出し
    const result = callSupabaseRpc(functionName, params);
    
    if (result.success) {
      const data = JSON.parse(result.body);
      Logger.log("RPC関数の呼び出しに成功しました！");
      Logger.log("取得データ件数: " + data.length + " 件");
      
      if (data.length > 0) {
        Logger.log("取得データの一覧:");
        data.forEach(function(row, index) {
          Logger.log(
            "[" + (index + 1) + "] " +
            "商品コード: " + row.item_code + " | " +
            "記録日時: " + row.occurrence_at + " | " +
            "現在在庫: " + row.current_quantity + " (前回: " + row.prev_quantity + ", 差分: " + row.diff_quantity + ") | " +
            "現在フリー: " + row.current_free_quantity + " (前回: " + row.prev_free_quantity + ", 差分: " + row.diff_free_quantity + ")"
          );
        });
      }
    } else {
      Logger.log("呼び出し失敗 (ステータスコード: " + result.statusCode + ")");
    }
  } catch (error) {
    Logger.log("テスト実行中にエラーが発生しました: " + error.message);
  }
}
