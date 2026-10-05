/**
 * @file InventoryChangesExport/02_SupabaseClient.Supabase接続.gs
 * @description Supabase RPC関数 `get_inventory_changes_paged` の呼び出しを実行するモジュール。
 *
 * スクリプトプロパティに設定された接続情報（SUPABASE_URL, SUPABASE_KEY）を使用して、
 * SupabaseのAPIに直接リクエストを送信します。
 * Supabase（PostgREST）には1レスポンスあたりの最大行数（既定1,000件）があるため、
 * キーセット方式（カーソル方式）のページングで全件を取得します（Issue #46）。
 * 一時的な通信エラーやサーバーエラー発生時の自動リトライ機能（指数バックオフ対応）を備えています。
 */

/**
 * SupabaseのRPC関数 `get_inventory_changes_paged` を呼び出し、指定された商品コードの在庫前後比較データを取得する。
 * キーセット方式のページングで、全ページを順に取得して1つの配列にまとめて返します。
 * 
 * ### ページングの仕様
 * - 1ページの取得件数: 1,000件（Supabase側の1レスポンス最大行数に合わせた値）
 * - 取得順: 商品コード → 記録日時 → id の昇順（RPC側で固定）
 * - 次ページのカーソル: 直前ページ最後の行の `item_code` / `occurrence_at` / `id`
 *   （`occurrence_at` はマイクロ秒精度を保つため、文字列のまま次回リクエストへ渡す）
 * - 終了条件: 返却件数が1ページの取得件数（1,000件）に満たなかった時点
 * - ページ数のガード: スクリプトプロパティ `MAX_PAGE_LIMIT`（未設定時は200ページ）を超える場合はエラーとし、
 *   無限ループや想定外の大量取得を防ぎます。
 * 
 * @param {string[]} itemCodes - 比較対象の商品コード配列
 * @return {Object[]} RPCから返却された在庫履歴データの配列（全ページ分。オブジェクトの配列）
 * @throws {Error} 商品コードが未指定の場合、ページ数が上限を超えた場合、カーソルを作れない場合、
 *                 または1ページ取得（fetchInventoryChangesPage_）で致命的なエラーが発生した場合
 */
function fetchInventoryChanges_(itemCodes) {
  if (!itemCodes || itemCodes.length === 0) {
    throw new Error("商品コードが指定されていません。");
  }

  const pageSize = 1000;  // 1ページの取得件数（Supabase側の最大行数に合わせる）
  const maxPages = getMaxPageLimit_();

  const allRows = [];
  let cursor = null;      // 初回はカーソルなし（先頭から取得）
  let pageCount = 0;

  while (true) {
    // ページ数のガード（上限に達しているのに、まだ次のページが必要な場合はエラー）
    if (pageCount >= maxPages) {
      throw new Error("取得ページ数が上限（" + maxPages + "ページ）を超えました。取得済み: " + allRows.length + "件。"
        + "商品コードを分割するか、スクリプトプロパティ 'MAX_PAGE_LIMIT' を見直してください。");
    }

    const page = fetchInventoryChangesPage_(itemCodes, cursor, pageSize);
    pageCount++;
    for (let i = 0; i < page.length; i++) {
      allRows.push(page[i]);
    }
    console.log("ページ " + pageCount + ": " + page.length + " 件取得 (累計 " + allRows.length + " 件)");

    // 1ページに満たない件数が返ったら、最後のページ
    if (page.length < pageSize) {
      break;
    }

    // 次ページのカーソルを、最後の行から作成する（occurrence_at は文字列のまま保持）
    const last = page[page.length - 1];
    if (last.item_code === null || last.item_code === undefined ||
      last.occurrence_at === null || last.occurrence_at === undefined ||
      last.id === null || last.id === undefined) {
      throw new Error("次ページのカーソルを作成できません。RPCの戻り値に item_code / occurrence_at / id が含まれていません。"
        + "get_inventory_changes_paged が正しく作成されているか確認してください。");
    }
    cursor = {
      item_code: last.item_code,
      occurrence_at: last.occurrence_at,
      id: last.id
    };
  }
  console.log("全ページの取得が完了しました。 ページ数: " + pageCount + " / 合計: " + allRows.length + " 件");
  return allRows;
}

/**
 * スクリプトプロパティから、取得ページ数の上限を取得する（デフォルト: 200ページ）。
 * 数値として解釈できない値や0以下の値が設定されている場合は、警告を出してデフォルト値を使用します。
 * 
 * @return {number} 取得ページ数の上限
 * @private
 */
function getMaxPageLimit_() {
  const defaultLimit = 200;
  const raw = PropertiesService.getScriptProperties().getProperty("MAX_PAGE_LIMIT");
  if (raw === null || raw === undefined || raw === "") {
    return defaultLimit;
  }
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed <= 0) {
    console.warn("スクリプトプロパティ 'MAX_PAGE_LIMIT' の値が不正です（" + raw + "）。デフォルト値 " + defaultLimit + " を使用します。");
    return defaultLimit;
  }
  return parsed;
}

/**
 * SupabaseのRPC関数 `get_inventory_changes_paged` を1回呼び出し、1ページ分の在庫前後比較データを取得する。
 * 通信障害や一時的なサーバーエラーに備え、指数バックオフを用いた自動リトライを実行します。
 * 
 * ### 指数バックオフの仕様
 * - 最大試行回数: 4回（初回実行 + 最大3回の再試行）
 * - 待機時間計算: `2秒 * 2^(再試行回数 - 1)`
 *   - 再試行1回目 (2回目の実行前): 2秒 (2,000ms)
 *   - 再試行2回目 (3回目の実行前): 4秒 (4,000ms)
 *   - 再試行3回目 (4回目の実行前): 8秒 (8,000ms)
 * 
 * @param {string[]} itemCodes - 比較対象の商品コード配列
 * @param {?{item_code: string, occurrence_at: string, id: number}} cursor - 前ページ最後の行の位置。初回は null
 * @param {number} pageSize - 1ページの取得件数（RPCの p_limit に渡す）
 * @return {Object[]} RPCから返却された1ページ分の在庫履歴データの配列（オブジェクトの配列）
 * @throws {Error} スクリプトプロパティが不足している場合、致命的なAPIエラー（400/401等）、または最大リトライ回数を超過した場合
 * @private
 */
function fetchInventoryChangesPage_(itemCodes, cursor, pageSize) {

  // 1. スクリプトプロパティから接続情報を取得
  const properties = PropertiesService.getScriptProperties();
  const supabaseUrl = properties.getProperty("SUPABASE_URL");
  const supabaseKey = properties.getProperty("SUPABASE_KEY");

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("スクリプトプロパティ 'SUPABASE_URL' または 'SUPABASE_KEY' が設定されていません。");
  }

  // 2. RPC呼び出しのパラメータ設定（初回はカーソル引数を省略し、先頭から取得する）
  const functionName = "get_inventory_changes_paged";
  const params = {
    target_item_codes: itemCodes,
    p_limit: pageSize
  };
  if (cursor) {
    params.p_after_item_code = cursor.item_code;
    params.p_after_occurrence_at = cursor.occurrence_at;  // 文字列のまま渡す（Dateに変換しない）
    params.p_after_id = cursor.id;
  }

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

  // 3. 指数バックオフを用いた自動リトライリクエスト送信
  const maxAttempts = 3;      // 最大再試行回数
  const baseDelayMs = 2000;   // 基本待機時間（2秒）

  let attempt = 0;
  let lastError = null;

  while (attempt <= maxAttempts) {
    attempt++;
    try {
      if (attempt > 1) {
        // 指数バックオフによる待機時間の計算: baseDelayMs * 2^(attempt - 2)
        const delayMs = baseDelayMs * Math.pow(2, attempt - 2);
        console.warn("一時的な接続エラーのため、" + delayMs + "ms 後に再試行します (" + (attempt - 1) + " / " + maxAttempts + " 回目)...");
        Utilities.sleep(delayMs);
      }

      const response = UrlFetchApp.fetch(url, options);
      const statusCode = response.getResponseCode();
      const body = response.getContentText();

      // 正常終了時は即座にデータを返す
      if (statusCode === 200) {
        return JSON.parse(body);
      }

      // 4xx / 5xx エラーの場合
      lastError = new Error("Supabase RPC呼び出しエラー (ステータスコード: " + statusCode + "): " + body);

      // リトライすべきステータスコードか検証
      // 429 (レートリミット) または 5xx (サーバー側エラー) 以外は、リトライせずに即時 throw して終了
      const retryableStatuses = [429, 500, 502, 503, 504];
      if (!retryableStatuses.includes(statusCode)) {
        throw lastError;
      }

      console.warn("一時的なサーバーエラーが返されました (ステータスコード: " + statusCode + ")。再試行をスケジュールします。");

    } catch (error) {
      lastError = error;

      // すでに即時 throw されたクライアントエラー（例: 400 Bad Request や 401 Unauthorized など）はそのまま上に投げる
      if (error.message && error.message.indexOf("Supabase RPC呼び出しエラー") !== -1) {
        const isRetryable = error.message.includes("429") ||
          error.message.includes("500") ||
          error.message.includes("502") ||
          error.message.includes("503") ||
          error.message.includes("504");
        if (!isRetryable) {
          throw error;
        }
      }

      console.warn("通信処理中に例外が発生しました (試行: " + attempt + "回目): " + error.toString());
    }
  }

  // すべてのリトライが失敗した場合
  throw new Error("Supabaseとの通信に失敗しました。最大試行回数(" + (maxAttempts + 1) + "回)に達しました。最後のエラー: " + lastError.toString());
}
