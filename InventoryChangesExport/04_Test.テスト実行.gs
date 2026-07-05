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
 * 3. 「前後比較」シートの2行目以降に、ダミーデータ（TEST-001, TEST-002）が正しく書き込まれ、
 *    ヘッダー行がオレンジ色で自動装飾されることを確認します。
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

/**
 * 【テスト】フェーズ4/5：統合テスト（正常系・トースト・重複排除）
 * 
 * 入力シートに特定のテストデータを書き込み、メイン処理 `runInventoryChangesExport` を実行して、
 * スプレッドシートへの出力が正しく完了するか一気通貫でテストします。
 * 
 * ### 事前準備
 * 1. スクリプトプロパティ（SUPABASE_URL, SUPABASE_KEY, TARGET_SPREADSHEET_ID）を設定してください。
 * 
 * ### 検証手順
 * 1. GASのエディタで `test_integration_run` を選択して実行します。
 * 2. 処理が正常に走り、実行ログに対象件数分のログが出力されることを確認します。
 * 3. スプレッドシートの「入力」および「前後比較」シートの内容を確認し、正しくデータが配置されていることを確認します。
 */
function test_integration_run() {
  Logger.log("=== [Test] 統合テスト開始 ===");
  
  const ss = getTargetSpreadsheet();
  const inputSheetName = getInputSheetName_();
  const inputSheet = ss.getSheetByName(inputSheetName);
  
  if (!inputSheet) {
    Logger.log("エラー: 入力シート '" + inputSheetName + "' が存在しません。スプレッドシートを確認してください。");
    return;
  }
  
  // テスト用のデータを入力シートに書き込む（既存データはA2以降クリアして上書き）
  const testCodes = [
    ["0010-bb101p-s-gy"],
    ["0010-bb101p-s-gf"]
  ];
  
  const lastRow = inputSheet.getLastRow();
  if (lastRow >= 2) {
    inputSheet.getRange(2, 1, lastRow - 1, 1).clearContent();
  }
  
  // テストコードのセットと装飾の自動生成
  inputSheet.getRange(1, 1).setValue("商品コード")
    .setBackground('#e67e22')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
    
  inputSheet.getRange(2, 1, testCodes.length, 1).setValues(testCodes);
  Logger.log("入力シートにテスト用商品コードをセットしました: " + JSON.stringify(testCodes));
  
  // メイン処理の実行
  Logger.log("メイン処理 runInventoryChangesExport を起動します...");
  try {
    runInventoryChangesExport();
    Logger.log("メイン処理が正常に終了しました。「前後比較」シートのデータおよびスプレッドシートのトースト通知を確認してください。");
  } catch (e) {
    Logger.log("メイン処理実行中にエラーが発生しました: " + e.toString());
  }
  
  Logger.log("=== [Test] 統合テスト終了 ===");
}

/**
 * 【テスト】ステップ5-1：重複排除機能の検証テスト
 * 
 * 入力シートにあえて重複した商品コードを書き込み、読み込み処理で重複が正しく排除され、
 * API送信がユニークな件数のみで行われるか検証します。
 */
function test_integration_duplicate_run() {
  Logger.log("=== [Test] 重複排除機能のテスト開始 ===");
  
  const ss = getTargetSpreadsheet();
  const inputSheetName = getInputSheetName_();
  const inputSheet = ss.getSheetByName(inputSheetName);
  
  if (!inputSheet) {
    Logger.log("エラー: 入力シート '" + inputSheetName + "' が存在しません。");
    return;
  }
  
  // 重複したテストデータを入力シートに書き込みます（gyが重複）
  const testCodes = [
    ["0010-bb101p-s-gy"],
    ["0010-bb101p-s-gy"], // 重複
    ["0010-bb101p-s-gf"],
    ["0010-bb101p-s-gf"]  // 重複
  ];
  
  const lastRow = inputSheet.getLastRow();
  if (lastRow >= 2) {
    inputSheet.getRange(2, 1, lastRow - 1, 1).clearContent();
  }
  
  inputSheet.getRange(2, 1, testCodes.length, 1).setValues(testCodes);
  Logger.log("入力シートに重複を含むテスト用商品コードをセットしました。件数: " + testCodes.length + " 件");
  
  try {
    // 読み込み関数の直接テスト
    const itemCodes = getItemCodesFromInputSheet_();
    Logger.log("読み込み結果の商品コード: " + JSON.stringify(itemCodes));
    Logger.log("重複排除後の件数: " + itemCodes.length + " 件 (期待値: 2件)");
    
    if (itemCodes.length === 2) {
      Logger.log("成功: 重複排除が正常に動作しています。");
    } else {
      Logger.log("失敗: 重複排除が正しく行われていません。");
    }
    
    // 全体処理の実行
    Logger.log("メイン処理 runInventoryChangesExport を起動します...");
    runInventoryChangesExport();
    Logger.log("メイン処理の動作が完了しました。");
  } catch (e) {
    Logger.log("実行中にエラーが発生しました: " + e.toString());
  }
  
  Logger.log("=== [Test] 重複排除機能のテスト終了 ===");
}

/**
 * 【テスト】ステップ5-2：自動リトライ機能の検証テスト（異常系URLによる擬似通信エラー）
 * 
 * 一時的にスクリプトプロパティの接続URLを無効なものに書き換えることで、通信例外を発生させ、
 * 自動リトライ処理（3回）が正しく行われ、最終的に最大試行回数超過のエラーが投げられるか検証します。
 * 
 * ### 注意
 * このテストを実行すると、一時的にスクリプトプロパティ `SUPABASE_URL` の内容が書き換わります。
 * テスト終了時に自動的に元のURLに復元されますが、エラーで中断した場合はプロパティの再確認をしてください。
 */
function test_fetchWithRetry_Failure() {
  Logger.log("=== [Test] 自動リトライ機能テスト開始 ===");
  
  const properties = PropertiesService.getScriptProperties();
  const originalUrl = properties.getProperty("SUPABASE_URL");
  
  if (!originalUrl) {
    Logger.log("エラー: スクリプトプロパティ 'SUPABASE_URL' が設定されていません。元の状態を特定できないため、テストを中断します。");
    return;
  }
  
  try {
    // 1. URLを無効なものに書き換え通信エラーを擬似的に起こす
    const dummyUrl = "https://invalid-supabase-url-for-retry-test.co";
    properties.setProperty("SUPABASE_URL", dummyUrl);
    Logger.log("接続先URLを一時的に無効なURLに変更しました: " + dummyUrl);
    
    // 2. RPC取得を実行（通信失敗によりリトライが走るはず）
    Logger.log("RPC通信を呼び出します（3秒間隔でリトライが3回発生するのを確認します）...");
    fetchInventoryChanges_(["A001"]);
    
    Logger.log("失敗: 通信エラーが発生するはずですが、正常終了しました。");
  } catch (error) {
    Logger.log("キャッチしたエラー (期待値): " + error.toString());
    
    if (error.message.indexOf("最大試行回数") !== -1) {
      Logger.log("成功: 最大試行回数に達して自動リトライが諦められたことを確認しました。");
    } else {
      Logger.log("警告: 想定外のエラーメッセージです。");
    }
  } finally {
    // 3. 元のURLに戻す（必須）
    properties.setProperty("SUPABASE_URL", originalUrl);
    Logger.log("接続先URLを元の設定に復元しました。");
  }
  
  Logger.log("=== [Test] 自動リトライ機能テスト終了 ===");
}

/**
 * 【テスト】フェーズ4：統合テスト（異常系：入力空）
 * 
 * 入力シートを空にした状態でメイン処理を実行し、エラーとならずに
 * 警告メッセージで正常に処理が中断することを確認します。
 */
function test_integration_empty_run() {
  Logger.log("=== [Test] 統合テスト（異常系：入力空）開始 ===");
  
  const ss = getTargetSpreadsheet();
  const inputSheetName = getInputSheetName_();
  const inputSheet = ss.getSheetByName(inputSheetName);
  
  if (!inputSheet) {
    Logger.log("エラー: 入力シート '" + inputSheetName + "' が存在しません。");
    return;
  }
  
  // 入力データをクリア（ヘッダーのみ残す、または完全に空にする）
  const lastRow = inputSheet.getLastRow();
  if (lastRow >= 2) {
    inputSheet.getRange(2, 1, lastRow - 1, 1).clearContent();
  }
  
  Logger.log("入力シートの商品コードを空にしました。メイン処理を実行します...");
  try {
    runInventoryChangesExport();
    Logger.log("メイン処理がエラーを投げずに終了したことを確認してください。");
  } catch (e) {
    Logger.log("エラー: 空データ実行時にもかかわらずエラーがスローされました: " + e.toString());
  }
  
  Logger.log("=== [Test] 統合テスト（異常系：入力空）終了 ===");
}
