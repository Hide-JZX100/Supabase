/**
 * ==============================================================================
 * 関数名: doPost
 * 概要: SupabaseからのWebhook（HTTP POSTリクエスト）を自動でキャッチする関数
 * 引数: e (Object) - Supabaseから送信されてくるイベントデータ
 * 戻り値: TextOutput - Supabase側へ処理完了を伝える応答（JSON形式）
 * 設計思想: 最小限のコードでSupabaseからのデータ受信・解析・書き出しを行い、
 *           インフラ間の疎通確認（テスト）を最速で完了させる。
 *           ※複数カラム（item_code, stock）の同期に対応。
 * ==============================================================================
 */
function doPost(e) {
    try {
        // 1. スプレッドシートの書き出し先を特定する
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var logSheet = ss.getSheetByName("シート1");
        var syncSheet = ss.getSheetByName("test_webhook");

        // 2. 現在の時刻を取得（データがいつ届いたか記録するため）
        var now = new Date();

        // 3. Supabaseから届いた「文字の塊（JSON形式の文字列）」を取り出す
        var jsonString = e.postData.contents;

        // 4. 文字列を、GAS（JavaScript）のオブジェクト形式に復元する
        var data = JSON.parse(jsonString);

        // 5. 復元したオブジェクトから、必要な情報をピンポイントで抜き出す
        var type = data.type;                   // 操作の種類（INSERT, UPDATE, DELETEなど）
        var tableName = data.table;             // 動いたテーブル名

        // 操作の種類によって、取得するデータの場所を切り替える
        var recordData;
        if (type === "DELETE") {
            recordData = data.old_record;
        } else {
            recordData = data.record;
        }

        // データの中から「id」の値をピンポイントで抜き出す
        var id = recordData ? recordData.id : "IDなし";

        // 抜き出したデータを文字として保存できるように変換する
        var displayRecord = JSON.stringify(recordData);

        // 6. スプレッドシートの最終行の「次の行」に、データを1行追加する（ログ用）
        logSheet.appendRow([now, type, tableName, id, displayRecord]);

        // 7. test_webhookシートへのリアルタイム同期処理（複数カラム対応）
        if (syncSheet && recordData && id !== "IDなし") {

            // 【変更・追加】複数の項目をそれぞれ変数に抜き出す
            var itemCode = recordData["item_code"] || ""; // 商品コード（空なら空文字）
            var stock = recordData["stock"] !== undefined ? recordData["stock"] : 0; // 在庫数（無ければ0）

            if (type === "INSERT") {
                // 【新規追加】A列にid、B列に商品コード、C列に在庫数を綺麗に並べて追加
                syncSheet.appendRow([id, itemCode, stock]);

            } else if (type === "UPDATE" || type === "DELETE") {
                // 【更新・削除】対象のIDがシートの何行目にあるか探す
                var lastRow = syncSheet.getLastRow();
                if (lastRow > 1) {
                    var idValues = syncSheet.getRange(2, 1, lastRow - 1, 1).getValues();
                    var targetRow = -1;

                    for (var i = 0; i < idValues.length; i++) {
                        if (idValues[i][0] == id) {
                            targetRow = i + 2;
                            break;
                        }
                    }

                    // 対象の行が見つかった場合の処理
                    if (targetRow !== -1) {
                        if (type === "UPDATE") {
                            // 【変更】更新時は、B列（商品コード）とC列（在庫数）を両方最新にする
                            // getRange(行, 列, 行数, 列数) で2列分の範囲を指定し、一括で上書きします
                            syncSheet.getRange(targetRow, 2, 1, 2).setValues([[itemCode, stock]]);
                        } else if (type === "DELETE") {
                            // 見つかった行を丸ごと削除する
                            syncSheet.deleteRow(targetRow);
                        }
                    }
                }
            }
        }

        return ContentService.createTextOutput(JSON.stringify({ "status": "success" }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        console.error("エラーが発生しました: " + error.toString());
        return ContentService.createTextOutput(JSON.stringify({ "status": "error", "message": error.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}