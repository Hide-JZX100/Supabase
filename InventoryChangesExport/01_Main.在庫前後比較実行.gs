/**
 * @file InventoryChangesExport/01_Main.在庫前後比較実行.gs
 * @description 在庫前後比較データエクスポートツールのエントリーポイント。
 * 
 * スプレッドシートの「入力」シートから商品コードを読み込み、
 * Supabaseから在庫の変更履歴を取得して「前後比較」シートに出力します。
 * 本機能は手動実行されることを前提としています。
 */

/**
 * 在庫前後比較データのエクスポート処理を手動実行するエントリーポイント。
 * 
 * ### 処理フロー
 * 1. シート「入力」から商品コード配列を取得します（重複は自動で排除されます）。
 * 2. 商品コードが1件も取得できない場合は、トースト通知および警告ログを出力し処理を中断します。
 * 3. 大量データによるタイムアウト防止のため、上限件数（デフォルト500件）を超えている場合はエラーとし処理を中断します。
 * 4. SupabaseのRPC関数 `get_inventory_changes` を呼び出し、履歴データを取得します。
 * 5. 取得したデータを「前後比較」シートへ一括書き込みします。
 * 6. 処理が正常に完了したことをスプレッドシート上でトースト通知します。
 * 
 * @throws {Error} Supabase接続・RPC呼び出しに失敗した場合、商品コード数が上限を超えている場合、または書き込みエラー時
 */
function runInventoryChangesExport() {
  const startTime = new Date();
  console.log("=== 在庫前後比較データ出力開始 ===");

  try {
    // 1. 入力シートから商品コードを取得（重複排除済み）
    const itemCodes = getItemCodesFromInputSheet_();
    
    // 2. 商品コードが1件も無い場合は処理を中断
    if (!itemCodes || itemCodes.length === 0) {
      console.warn("処理を中断します: 入力シートに商品コードが入力されていません。");
      showToastIfPossible_("処理を中断しました。入力シートに商品コードが入力されていません。", "処理中断", 8);
      console.log("=== 在庫前後比較データ出力終了 ===");
      return;
    }

    // 3. 大量データ制限チェック（タイムアウトおよび高負荷対策）
    const properties = PropertiesService.getScriptProperties();
    const maxLimitProp = properties.getProperty("MAX_ITEM_LIMIT");
    const maxLimit = maxLimitProp ? parseInt(maxLimitProp, 10) : 500; // 未設定時はデフォルト500件限制

    if (itemCodes.length > maxLimit) {
      const errorMsg = "処理対象の商品コード数が上限（" + maxLimit + "件）を超えています。現在の件数: " + itemCodes.length + "件。データを分割して登録してください。";
      console.error(errorMsg);
      showToastIfPossible_(errorMsg, "処理失敗", 10);
      throw new Error(errorMsg);
    }

    console.log("処理対象の商品コード数: " + itemCodes.length + " 件 / 上限: " + maxLimit + " 件");

    // 4. Supabase RPCからデータを取得
    console.log("Supabaseから履歴データを取得中...");
    const data = fetchInventoryChanges_(itemCodes);
    console.log("データ取得成功。 取得件数: " + data.length + " 件");

    // 5. スプレッドシートへ書き込み
    console.log("スプレッドシートへデータを書き込み中...");
    writeInventoryChangesToSheet_(data);

    // 6. 終了ログの出力とスプレッドシート上へのトースト通知
    const endTime = new Date();
    const elapsedTime = ((endTime.getTime() - startTime.getTime()) / 1000).toFixed(2);
    console.log("=== 在庫前後比較データ出力終了 (処理時間: " + elapsedTime + "秒) ===");

    showToastIfPossible_("前後比較データ（" + data.length + "件）の出力が完了しました。(処理時間: " + elapsedTime + "秒)", "処理完了", 8);

  } catch (error) {
    console.error("処理実行中にエラーが発生しました: " + error.toString());
    showToastIfPossible_("エラーが発生しました: " + error.message, "処理失敗", 10);
    // RPC呼び出し失敗時などのエラーをスローして実行を異常終了させる
    throw error;
  }
}

/**
 * 実行コンテキストがUI（スプレッドシート画面）にアクセス可能な場合のみ、トースト通知を表示する。
 * スタンドアロン型スクリプトとして裏側でスプレッドシートを操作している場合など、
 * UIコンテキストが存在しない環境ではエラーをスローせずにログ出力のみを行います。
 * 
 * @param {string} message - トーストに表示するメッセージ
 * @param {string} title - トーストのタイトル
 * @param {number} timeoutSeconds - トーストの表示秒数
 * @private
 */
function showToastIfPossible_(message, title, timeoutSeconds) {
  try {
    // アクティブスプレッドシートが存在し、UI取得がエラーにならない場合のみトーストを表示
    const activeSs = SpreadsheetApp.getActiveSpreadsheet();
    if (activeSs) {
      SpreadsheetApp.getUi();
      activeSs.toast(message, title, timeoutSeconds);
    } else {
      console.log("[Toast Skip] " + title + ": " + message);
    }
  } catch (e) {
    console.log("[Toast Skip (No UI Context)] " + title + ": " + message);
  }
}
