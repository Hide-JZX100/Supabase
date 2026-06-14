/**
 * ==============================================================================
 * 関数名: doPost
 * 概要: SupabaseからのWebhook（HTTP POSTリクエスト）を自動でキャッチする関数
 * 引数: e (Object) - Supabaseから送信されてくるイベントデータ
 * 戻り値: TextOutput - Supabase側へ処理完了を伝える応答（JSON形式）
 * 設計思想: 最小限のコードでSupabaseからのデータ受信・解析・書き出しを行い、
 *           インフラ間の疎通確認（テスト）を最速で完了させる。
 *           ※複数カラム同期の競合（逆転現象）を防ぐため、LockServiceによる
 *             排他制御（一列に並べて処理する仕組み）を追加。
 * ==============================================================================
 */
function doPost(e) {
    // 【追加】スクリプト全体のロック（鍵）を取得する準備
    var lock = LockService.getScriptLock();

    try {
        // 【追加】最大30秒間、先行する他の処理が終わるのを待つ（一列に並ばせる）
        // 30秒待っても鍵が開かない場合はタイムアウトエラーにします
        if (!lock.tryLock(30000)) {
            return ContentService.createTextOutput(JSON.stringify({ "status": "error", "message": "Lock timeout" }))
                .setMimeType(ContentService.MimeType.JSON);
        }

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

            var itemCode = recordData["item_code"] || "";
            var stock = recordData["stock"] !== undefined ? recordData["stock"] : 0;

            if (type === "INSERT") {
                syncSheet.appendRow([id, itemCode, stock]);

            } else if (type === "UPDATE" || type === "DELETE") {
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

                    if (targetRow !== -1) {
                        if (type === "UPDATE") {
                            syncSheet.getRange(targetRow, 2, 1, 2).setValues([[itemCode, stock]]);
                        } else if (type === "DELETE") {
                            syncSheet.deleteRow(targetRow);
                        }
                    }
                }
            }
        }

        // 【追加】すべての処理が正常に終わったので、鍵をアンロックして次の処理へ譲る
        lock.releaseLock();

        return ContentService.createTextOutput(JSON.stringify({ "status": "success" }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        // 【追加】万が一エラーが起きた場合も、確実に鍵を解除して後続の処理を詰まらせないようにする
        lock.releaseLock();

        console.error("エラーが発生しました: " + error.toString());
        return ContentService.createTextOutput(JSON.stringify({ "status": "error", "message": error.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}