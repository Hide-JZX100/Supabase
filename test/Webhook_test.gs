/**
 * ==============================================================================
 * 関数名: doPost
 * 概要: SupabaseからのWebhook（HTTP POSTリクエスト）を自動でキャッチする関数
 * 引数: e (Object) - Supabaseから送信されてくるイベントデータ
 * 戻り値: TextOutput - Supabase側へ処理完了を伝える応答（JSON形式）
 * 設計思想: 最小限のコードでSupabaseからのデータ受信・解析・書き出しを行い、
 *           インフラ間の疎通確認（テスト）を最速で完了させる。
 *           ※DELETE（削除）イベント時にもデータが記録できるよう、条件分岐を追加。
 * ==============================================================================
 */
function doPost(e) {
    try {
        // 1. スプレッドシートの書き出し先を特定する
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("シート1");

        // 2. 現在の時刻を取得（データがいつ届いたか記録するため）
        var now = new Date();

        // 3. Supabaseから届いた「文字の塊（JSON形式の文字列）」を取り出す
        var jsonString = e.postData.contents;

        // 4. 文字列を、GAS（JavaScript）のオブジェクト形式に復元する
        var data = JSON.parse(jsonString);

        // 5. 復元したオブジェクトから、必要な情報をピンポイントで抜き出す
        var type = data.type;                   // 操作の種類（INSERT, UPDATE, DELETEなど）
        var tableName = data.table;             // 動いたテーブル名

        // 【修正・追加】操作の種類によって、取得するデータの場所を切り替える
        var recordData;
        if (type === "DELETE") {
            // 削除（DELETE）の場合は、消える直前のデータ（old_record）を取得する
            recordData = data.old_record;
        } else {
            // 追加（INSERT）や更新（UPDATE）の場合は、現在の新しいデータ（record）を取得する
            recordData = data.record;
        }

        // 抜き出したデータを文字として保存できるように変換する
        var displayRecord = JSON.stringify(recordData);

        // 6. スプレッドシートの最終行の「次の行」に、データを1行追加する
        // [ 受信時刻, 操作, テーブル名, 届いたデータの中身 ]
        sheet.appendRow([now, type, tableName, displayRecord]);

        // 7. Supabase側に対して「無事に届いたよ（Status: 200）」と返事をする（お作法です）
        return ContentService.createTextOutput(JSON.stringify({ "status": "success" }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        // 万が一エラーが起きた場合は、エラー内容をログに残し、Supabase側にもエラーを返します
        console.error("エラーが発生しました: " + error.toString());
        return ContentService.createTextOutput(JSON.stringify({ "status": "error", "message": error.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}