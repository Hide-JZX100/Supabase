/**
 * ==============================================================================
 * 関数名: doPost
 * 概要: SupabaseからのWebhook（HTTP POSTリクエスト）を自動でキャッチする関数
 * 引数: e (Object) - Supabaseから送信されてくるイベントデータ
 * 戻り値: TextOutput - Supabase側へ処理完了を伝える応答（JSON形式）
 * 設計思想: 最小限のコードでSupabaseからのデータ受信・解析・書き出しを行い、
 *           インフラ間の疎通確認（テスト）を最速で完了させる。
 *           ※INSERT（新規追加）イベント発生時に、指定の同期用シートへ
 *             カラムごとにデータを成形して格納する同期処理を追加。
 * ==============================================================================
 */
function doPost(e) {
    try {
        // 1. スプレッドシートの書き出し先を特定する
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var logSheet = ss.getSheetByName("シート1");
        var syncSheet = ss.getSheetByName("test_webhook"); // 【追加】同期用のシートを特定

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
            // 削除（DELETE）の場合は、消える直前のデータ（old_record）を取得する
            recordData = data.old_record;
        } else {
            // 追加（INSERT）や更新（UPDATE）の場合は、現在の新しいデータ（record）を取得する
            recordData = data.record;
        }

        // データ（オブジェクト）の中から「id」の値をピンポイントで抜き出す
        var id = recordData ? recordData.id : "IDなし";

        // 抜き出したデータを文字として保存できるように変換する
        var displayRecord = JSON.stringify(recordData);

        // 6. スプレッドシートの最終行の「次の行」に、データを1行追加する（ログ用）
        logSheet.appendRow([now, type, tableName, id, displayRecord]);

        // 【新設】7. test_webhookシートへのリアルタイム同期処理（まずはINSERTから）
        if (type === "INSERT" && recordData) {
            // カラム名「１」のような全角・マルチバイト文字のキーは、
            // ドット（.）ではなく、ブラケット記法（ ["１"] ）を使うことで安全に取得できます
            var columnValue = recordData["１"];

            // 同期用シートの末尾に [ ID, １の値 ] を綺麗に並べて1行追加
            syncSheet.appendRow([id, columnValue]);
        }

        // 8. Supabase側に対して「無事に届いたよ（Status: 200）」と返事をする（お作法です）
        return ContentService.createTextOutput(JSON.stringify({ "status": "success" }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        // 万が一エラーが起きた場合は、エラー内容をログに残し、Supabase側にもエラーを返します
        console.error("エラーが発生しました: " + error.toString());
        return ContentService.createTextOutput(JSON.stringify({ "status": "error", "message": error.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}