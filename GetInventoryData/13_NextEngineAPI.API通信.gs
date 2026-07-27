/**
 * @file 13_NextEngineAPI.gs
 * @description Next Engine API通信・リトライ管理モジュール。
 * Next Engine APIへのHTTPリクエストを担当します。
 * 在庫マスタAPIの呼び出し、トークン自動更新、およびエクスポネンシャルバックオフによるリトライ制御を行います。
 *
 * ### 依存関係
 * - **参照元**: 14_InventoryLogic.gs（在庫データ取得処理）
 * - **参照先**:
 *   - 09_RetryHelper.リトライ共通化.gs (executeWithRetry)
 *   - 11_Config.gs (NE_API_URL, MAX_ITEMS_PER_CALL, RETRY_CONFIG)
 *   - 12_Logger.gs (logWithLevel, logError, logAPIErrorDetail, recordRetryAttempt)
 *
 * ### APIエンドポイント
 * - `POST /api_v1_master_stock/search`
 * - 主な取得フィールド: 在庫数、引当数、フリー在庫数、不良在庫数、発注残数など。
 *
 * ### トークン自動更新の仕組み
 * NE APIはレスポンスに新しいトークンを返す場合があるため、`updateStoredTokens()` で差分がある場合のみ
 * スクリプトプロパティを更新し、APIクォータの浪費を防いでいます。
 *
 * ### リトライの仕組み（エクスポネンシャルバックオフ）
 * `getBatchStockDataWithRetry()` が `getBatchStockData()` をラップし、失敗するたびに待機時間を指数的に
 * 増やして再試行します（1秒 → 2秒 → 4秒）。
 * ※ 認証・権限系エラーは即座にエラーをスローします。
 *
 * @version 2.1
 * @see getBatchStockDataWithRetry - リトライ付き在庫マスタデータ取得
 * @see getBatchStockData - 在庫マスタAPI単体呼び出し（リトライなし）
 * @see updateStoredTokens - トークンをプロパティに保存（差分更新）
 * @see fetchAllGoodsData - 商品マスタAPIで全件取得
 *
 * 【公開関数一覧】
 *  @see getBatchStockDataWithRetry - 【推奨】リトライ付き在庫マスタデータ取得
 *                                    14_InventoryLogic.gs から呼び出される
 *  @see getBatchStockData          - 在庫マスタAPI単体呼び出し（リトライなし）
 *                                    通常は getBatchStockDataWithRetry 経由で使用
 *  @see updateStoredTokens         - トークンをプロパティに保存（差分更新）
 *
 * 【バージョン】v2.1
 * =============================================================================
 */

/**
 * 在庫マスタデータ取得（API呼び出し）
 * @param {Array} goodsCodeList - 商品コードリスト
 * @param {Object} tokens - 認証トークン
 * @param {number} batchNumber - バッチ番号(ログ用)
 * @return {Map} 在庫データマップ (key: stock_goods_id, value: stockData)
 */
function getBatchStockData(goodsCodeList, tokens, batchNumber) {
    const url = `${NE_API_URL}/api_v1_master_stock/search`;

    // NE APIの複数検索パラメータ: カンマ区切りで最大1000件指定可能
    // 例: "CODE001,CODE002,CODE003"
    const goodsIdCondition = goodsCodeList.join(',');

    const payload = {
        'access_token': tokens.accessToken,
        'refresh_token': tokens.refreshToken,
        'stock_goods_id-in': goodsIdCondition,
        'fields': 'stock_goods_id,stock_quantity,stock_allocation_quantity,stock_defective_quantity,stock_remaining_order_quantity,stock_out_quantity,stock_free_quantity,stock_advance_order_quantity,stock_advance_order_allocation_quantity,stock_advance_order_free_quantity',
        'limit': MAX_ITEMS_PER_CALL.toString()
    };

    const options = {
        'method': 'POST',
        'headers': {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        'payload': Object.keys(payload).map(key =>
            encodeURIComponent(key) + '=' + encodeURIComponent(payload[key])
        ).join('&')
    };

    const stockDataMap = new Map();

    try {
        const response = UrlFetchApp.fetch(url, options);
        const responseText = response.getContentText();
        const responseData = JSON.parse(responseText);

        // NE APIはリクエストのたびにトークンを更新して返す仕様
        // 変更がある場合のみプロパティを更新する（updateStoredTokensで差分チェック済み）
        if (responseData.access_token && responseData.refresh_token) {
            updateStoredTokens(responseData.access_token, responseData.refresh_token);
            tokens.accessToken = responseData.access_token;
            tokens.refreshToken = responseData.refresh_token;
        }

        if (responseData.result === 'success' && responseData.data) {
            responseData.data.forEach(stockData => {
                stockDataMap.set(stockData.stock_goods_id, stockData);
            });
            logWithLevel(LOG_LEVEL.DETAILED, `  API応答: ${responseData.data.length}件取得`);
        } else {
            logAPIErrorDetail(
                '在庫マスタAPI',
                {
                    goodsCodeCount: goodsCodeList.length,
                    firstCode: goodsCodeList[0],
                    lastCode: goodsCodeList[goodsCodeList.length - 1]
                },
                responseData,
                new Error(responseData.message || 'API呼び出しに失敗しました')
            );

            logError(`  在庫マスタAPI エラー: ${responseData.message || 'Unknown error'}`);
        }

        return stockDataMap;

    } catch (error) {
        logAPIErrorDetail(
            '在庫マスタAPI（通信エラー）',
            {
                goodsCodeCount: goodsCodeList.length,
                firstCode: goodsCodeList[0],
                lastCode: goodsCodeList[goodsCodeList.length - 1]
            },
            null,
            error
        );

        logError(`在庫マスタ一括取得エラー: ${error.message}`);
        return stockDataMap;
    }
}

/**
 * トークン更新処理（最適化版）
 * - 変更がある場合のみ更新
 * - 更新日時も記録
 */
function updateStoredTokens(accessToken, refreshToken) {
    const properties = PropertiesService.getScriptProperties();
    const currentAccess = properties.getProperty('ACCESS_TOKEN');
    const currentRefresh = properties.getProperty('REFRESH_TOKEN');

    // 値が変わっていない場合は書き込みをスキップ
    // PropertiesServiceへの書き込みはAPIクォータを消費するため無駄な更新を避ける
    if (accessToken !== currentAccess || refreshToken !== currentRefresh) {
        properties.setProperties({
            'ACCESS_TOKEN': accessToken,
            'REFRESH_TOKEN': refreshToken,
            'TOKEN_UPDATED_AT': new Date().getTime().toString() // 追跡用に更新日時も保存
        });

        // Logger.gsの関数を使用
        logWithLevel(LOG_LEVEL.DETAILED, '  認証トークンを更新しました');
    }
}

// ============================================================================
// リトライ機能付きラッパー
// ============================================================================

/**
 * リトライ処理付き在庫マスタデータ取得
 * 
 * 【変更内容】
 * - 既存のgetBatchStockData関数をラップ
 * - エクスポネンシャルバックオフでリトライ
 * - リトライ統計を記録
 * 
 * @param {Array} goodsCodeList - 商品コードリスト
 * @param {Object} tokens - 認証トークン
 * @param {number} batchNumber - バッチ番号
 * @param {number} maxRetries - 最大リトライ回数
 * @return {Map} 在庫データマップ
 */
function getBatchStockDataWithRetry(goodsCodeList, tokens, batchNumber, maxRetries = RETRY_CONFIG.MAX_RETRIES) {
    return executeWithRetry(
        () => getBatchStockData(goodsCodeList, tokens, batchNumber),
        {
            maxRetries: maxRetries,
            enableRetry: RETRY_CONFIG.ENABLE_RETRY,
            context: '在庫マスタAPI',
            isNonRetryableError: (error) => {
                const msg = (error && error.message) ? String(error.message).toLowerCase() : String(error).toLowerCase();
                return msg.includes('認証') || msg.includes('auth') ||
                    msg.includes('permission') || msg.includes('権限') ||
                    msg.includes('invalid') || msg.includes('token');
            },
            onRetryAttempt: (attempt) => recordRetryAttempt(batchNumber, attempt),
            buildFailureMessage: (maxRetries, lastError) =>
                `API接続失敗（${maxRetries}回試行）: ${(lastError && lastError.message) ? lastError.message : lastError}`,
            onFinalFailure: (lastError) => logAPIErrorDetail(
                '在庫マスタAPI（リトライ失敗）',
                {
                    goodsCodeCount: goodsCodeList.length,
                    firstCode: goodsCodeList[0],
                    lastCode: goodsCodeList[goodsCodeList.length - 1],
                    totalAttempts: maxRetries
                },
                null,
                lastError
            )
        }
    );
}

/**
 * =============================================================================
 * Phase 2: 商品マスタAPI全件取得関数
 * =============================================================================
 *
 * 【追加内容】
 * - fetchAllGoodsData()      : ページネーションで全件取得するメイン関数
 * - fetchGoodsDataOnePage_() : 1ページ分のAPIリクエスト（内部用）
 *
 * 【既存コードへの影響】
 * 追記のみのため既存関数への影響はありません
 *
 * 【取得条件】
 * - ロケーションに xxxxxx を含む商品を除外
 * - ロケーションが空欄の商品は取得対象に含む
 * - 1ページ1000件、4ページ（約3,200件）を想定
 *
 * 【返却データ構造】
 * Map<goods_id, {
 *   goods_id, goods_name, goods_jan_code,
 *   stock_quantity, stock_allocation_quantity,
 *   stock_free_quantity, stock_advance_order_quantity,
 *   stock_advance_order_allocation_quantity,
 *   stock_advance_order_free_quantity,
 *   stock_defective_quantity, stock_remaining_order_quantity,
 *   stock_out_quantity
 * }>
 * =============================================================================
 */

// ----------------------------------------------------------------------------
// 定数定義
// ----------------------------------------------------------------------------

// xxxxxxを含む商品を除外するフィルタ値
// nlikeornull: NULLまたは LIKE条件に合わない値 → 空欄も取得対象に含む
const LOCATION_EXCLUDE_PATTERN = '%xxxxxx%';

// 取得フィールド一覧
// goods_location はフィルタ確認用に含めない（本番では不要）
const GOODS_FETCH_FIELDS = [
    'goods_id',
    'goods_name',
    'goods_jan_code',
    'stock_quantity',
    'stock_allocation_quantity',
    'stock_free_quantity',
    'stock_advance_order_quantity',
    'stock_advance_order_allocation_quantity',
    'stock_advance_order_free_quantity',
    'stock_defective_quantity',
    'stock_remaining_order_quantity',
    'stock_out_quantity'
].join(',');

// ----------------------------------------------------------------------------
// 公開関数
// ----------------------------------------------------------------------------

/**
 * 商品マスタAPIで全件取得（ページネーション対応）
 *
 * 【処理フロー】
 * 1. offset=0 から 1000件ずつ取得
 * 2. 返却件数が limit 未満になったら最終ページと判定して終了
 * 3. 全データを goods_id をキーとした Map で返す
 *
 * @param  {Object} tokens - 認証トークン { accessToken, refreshToken }
 * @return {Map}           - 商品データマップ (key: goods_id, value: 商品データ)
 * @throws {Error}         - 全ページ取得中にエラーが発生した場合
 */
function fetchAllGoodsData(tokens) {
    const LIMIT = MAX_ITEMS_PER_CALL; // 11_Config.gs で定義済みの 1000
    let offset = 0;
    let page = 1;
    let hasNext = true;
    const goodsMap = new Map();

    logWithLevel(LOG_LEVEL.SUMMARY, `商品マスタAPI全件取得開始（フィルタ: xxxxxx除外）`);

    while (hasNext) {
        logWithLevel(LOG_LEVEL.SUMMARY, `  ${page}ページ目取得中 (offset=${offset})`);

        const { data, updatedTokens } = fetchGoodsDataOnePage_(tokens, LIMIT, offset);

        // NE APIはリクエストのたびにトークンを更新して返す仕様
        // 変更がある場合のみ updateStoredTokens() でプロパティを更新する
        if (updatedTokens) {
            updateStoredTokens(updatedTokens.accessToken, updatedTokens.refreshToken);
            tokens.accessToken = updatedTokens.accessToken;
            tokens.refreshToken = updatedTokens.refreshToken;
        }

        // 取得データを Map に格納
        data.forEach(item => goodsMap.set(item.goods_id, item));

        logWithLevel(LOG_LEVEL.SUMMARY, `  取得: ${data.length}件 | 累計: ${goodsMap.size}件`);

        // 返却件数が limit 未満 → 最終ページ判定
        if (data.length < LIMIT) {
            hasNext = false;
            logWithLevel(LOG_LEVEL.SUMMARY, `  最終ページ到達`);
        } else {
            offset += LIMIT;
            page++;

            // API負荷分散のため待機（11_Config.gs の API_WAIT_TIME を流用）
            Utilities.sleep(API_WAIT_TIME);
        }
    }

    logWithLevel(LOG_LEVEL.SUMMARY, `商品マスタAPI全件取得完了: ${goodsMap.size}件`);
    return goodsMap;
}

// ----------------------------------------------------------------------------
// 内部関数（_ サフィックスで内部専用であることを示す）
// ----------------------------------------------------------------------------

/**
 * 商品マスタAPI 1ページ分リクエスト（内部関数）
 *
 * @param  {Object} tokens - 認証トークン
 * @param  {number} limit  - 取得件数（最大1000）
 * @param  {number} offset - 取得開始位置（0始まり）
 * @return {Object}        - { data: Array, updatedTokens: Object|null }
 * @throws {Error}         - APIエラーまたは通信エラーの場合
 */
function fetchGoodsDataOnePage_(tokens, limit, offset) {
    const url = `${NE_API_URL}/api_v1_master_goods/search`;

    const payload = {
        'access_token': tokens.accessToken,
        'refresh_token': tokens.refreshToken,
        'fields': GOODS_FETCH_FIELDS,
        'goods_location-nlikeornull': LOCATION_EXCLUDE_PATTERN,
        'limit': limit.toString(),
        'offset': offset.toString()
    };

    const options = {
        'method': 'POST',
        'headers': { 'Content-Type': 'application/x-www-form-urlencoded' },
        'payload': Object.keys(payload)
            .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(payload[key]))
            .join('&')
    };

    try {
        const response = UrlFetchApp.fetch(url, options);
        const responseData = JSON.parse(response.getContentText());

        if (responseData.result !== 'success') {
            throw new Error(
                `商品マスタAPI エラー: ${responseData.message || 'Unknown error'} (offset=${offset})`
            );
        }

        // トークン更新の差分チェック
        const updatedTokens = (
            responseData.access_token &&
            responseData.refresh_token &&
            (responseData.access_token !== tokens.accessToken ||
                responseData.refresh_token !== tokens.refreshToken)
        ) ? {
            accessToken: responseData.access_token,
            refreshToken: responseData.refresh_token
        } : null;

        return {
            data: responseData.data || [],
            updatedTokens
        };

    } catch (error) {
        logAPIErrorDetail(
            '商品マスタAPI',
            { offset, limit },
            null,
            error
        );
        throw error;
    }
}