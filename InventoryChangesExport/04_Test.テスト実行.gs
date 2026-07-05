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
      data.forEach(function (row, index) {
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

/**
 * 【テスト】フェーズ3：スプレッドシート読み書きテスト
 * 
 * シート「入力」からのデータ取得、およびシート「前後比較」へのテストデータ書き込みが正常に行えるか検証します。
 * 
 * ### 事前準備
 * 1. スプレッドシート上に「入力」および「前後比較」シートを作成します。
 * 2. 「入力」シートのA2以降にいくつか適当な商品コードを入力しておきます。
 * 3. スクリプトプロパティ `TARGET_SPREADSHEET_ID` を設定します。
 * 
 * ### 検証手順
 * 1. GASのエディタで `test_sheetOperations` を選択して実行します。
 * 2. ログに「入力」シートから読み込んだ商品コード一覧が表示されることを確認します。
 * 3. 「前後比較」シートの2行目以降に、ダミーデータ（TEST-001, TEST-002）が正しく書き込まれることを確認します。
 */
function test_sheetOperations() {
  Logger.log("=== [Test] スプレッドシート読み書きテスト開始 ===");

  try {
    // 1. 読み込みテスト
    Logger.log("--- 1. 入力シートからの商品コード読み込みテスト ---");
    const itemCodes = getItemCodesFromInputSheet_();
    Logger.log("読み込んだ商品コード: " + JSON.stringify(itemCodes));
    Logger.log("取得件数: " + itemCodes.length + " 件");

    // 2. 書き込みテスト
    Logger.log("--- 2. 前後比較シートへのダミーデータ書き込みテスト ---");
    const dummyData = [
      {
        item_code: "TEST-001",
        occurrence_at: "2026-07-05T01:00:00.000Z",
        current_quantity: 10,
        prev_quantity: 8,
        diff_quantity: 2,
        current_free_quantity: 5,
        prev_free_quantity: 4,
        diff_free_quantity: 1
      },
      {
        item_code: "TEST-002",
        occurrence_at: "2026-07-05T02:30:00.000Z",
        current_quantity: 100,
        prev_quantity: null,
        diff_quantity: 0,
        current_free_quantity: 80,
        prev_free_quantity: null,
        diff_free_quantity: 0
      }
    ];

    writeInventoryChangesToSheet_(dummyData);
    Logger.log("ダミーデータの書き込み処理が完了しました。スプレッドシートの「前後比較」シートを確認してください。");

  } catch (error) {
    Logger.log("エラーが発生しました: " + error.toString());
  }

  Logger.log("=== [Test] スプレッドシート読み書きテスト終了 ===");
}
