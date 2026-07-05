/**
 * @file InventoryChangesExport/04_Test.テスト実行.gs
 * @description 在庫前後比較データのSpreadsheet出力機能のテスト実行および検証用スクリプト。
 * 
 * 各フェーズで実装したモジュールの単体テストおよび全体の統合テストを実行するための関数を定義しています。
 */

/**
 * 【テスト】フェーズ2：Supabase接続テスト
 * 
 * `fetchInventoryChanges_` 関数を呼び出して、Supabaseから指定した商品コードのデータが正常に取得できるか検証します。
 * 
 * ### 事前準備
 * 以下のスクリプトプロパティが設定されていることを確認してください。
 * - `SUPABASE_URL`
 * - `SUPABASE_KEY`
 * 
 * ### 検証手順
 * 1. GASのエディタで `test_fetchInventoryChanges` を選択して実行します。
 * 2. 実行ログに、指定した商品コード（例: `"TEST_ITEM_A"`, `"A001"`）の前後比較データが表示されることを確認します。
 */
function test_fetchInventoryChanges() {
  const testItemCodes = ["TEST_ITEM_A", "A001"];
  
  Logger.log("=== [Test] Supabase接続テスト開始 ===");
  Logger.log("テスト対象商品コード: " + JSON.stringify(testItemCodes));
  
  try {
    const data = fetchInventoryChanges_(testItemCodes);
    Logger.log("データ取得成功！ 件数: " + data.length + " 件");
    
    if (data.length > 0) {
      data.forEach(function(row, index) {
        Logger.log(
          "[" + (index + 1) + "] " +
          "商品: " + row.item_code + " | " +
          "日時: " + row.occurrence_at + " | " +
          "在庫: " + row.current_quantity + " (前回: " + row.prev_quantity + ", 差分: " + row.diff_quantity + ") | " +
          "フリー: " + row.current_free_quantity + " (前回: " + row.prev_free_quantity + ", 差分: " + row.diff_free_quantity + ")"
        );
      });
    } else {
      Logger.log("警告: 指定した商品コードのデータが存在しないか、変更履歴がありません。");
    }
  } catch (error) {
    Logger.log("エラーが発生しました: " + error.toString());
  }
  
  Logger.log("=== [Test] Supabase接続テスト終了 ===");
}
