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
 * 1. シート「入力」から商品コード配列を取得します。
 * 2. 商品コードが1件も取得できない場合は、警告ログを出力し処理を中断（終了）します。
 * 3. SupabaseのRPC関数 `get_inventory_changes` を呼び出し、履歴データを取得します。
 * 4. 取得したデータを「前後比較」シートへ一括書き込みします。
 * 
 * @throws {Error} Supabase接続・RPC呼び出しに失敗した場合、またはスプレッドシートへの書き込みでエラーが発生した場合
 */
function runInventoryChangesExport() {
  const startTime = new Date();
  console.log("=== 在庫前後比較データ出力開始 ===");

  try {
    // 1. 入力シートから商品コードを取得
    const itemCodes = getItemCodesFromInputSheet_();
    
    // 2. 商品コードが1件も無い場合は処理を中断
    if (!itemCodes || itemCodes.length === 0) {
      console.warn("処理を中断します: 入力シートに商品コードが入力されていません。");
      console.log("=== 在庫前後比較データ出力終了 ===");
      return;
    }

    console.log("処理対象の商品コード数: " + itemCodes.length + " 件");

    // 3. Supabase RPCからデータを取得
    console.log("Supabaseから履歴データを取得中...");
    const data = fetchInventoryChanges_(itemCodes);
    console.log("データ取得成功。 取得件数: " + data.length + " 件");

    // 4. スプレッドシートへ書き込み
    console.log("スプレッドシートへデータを書き込み中...");
    writeInventoryChangesToSheet_(data);

    // 5. 終了ログの出力
    const endTime = new Date();
    const elapsedTime = ((endTime.getTime() - startTime.getTime()) / 1000).toFixed(2);
    console.log("=== 在庫前後比較データ出力終了 (処理時間: " + elapsedTime + "秒) ===");

  } catch (error) {
    console.error("処理実行中にエラーが発生しました: " + error.toString());
    // RPC呼び出し失敗時などのエラーをスローして実行を異常終了させる
    throw error;
  }
}
