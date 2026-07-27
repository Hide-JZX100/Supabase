/**
 * @file 09_RetryHelper.リトライ共通化.gs
 * @description エクスポネンシャルバックオフによる汎用リトライ処理を提供する共通モジュール。
 * 13_NextEngineAPI.API通信.gs（在庫マスタAPI呼び出し）と 19_DistributeCaller.配布呼び出し.gs
 * （DistributeInventory Webhook呼び出し）の両方で使用されていたリトライロジックを集約・共通化します。
 *
 * ### 依存関係
 * - 参照元: 13_NextEngineAPI.API通信.gs, 19_DistributeCaller.配布呼び出し.gs
 * - 参照先: 12_Logger.ログ管理.gs (logWithLevel, logError, LOG_LEVEL)
 *
 * @version 1.0
 * @see executeWithRetry - 汎用リトライ実行関数
 * @see test_executeWithRetry - 単体テスト用関数
 */

/**
 * エクスポネンシャルバックオフによる汎用リトライ実行関数
 *
 * 【処理フロー】
 * 1. operationFn() を実行する
 * 2. 成功すれば結果を即座に返却
 * 3. 失敗した場合、isNonRetryableError(error) が true を返せば即座にスロー
 * 4. それ以外は 1秒→2秒→4秒 のエクスポネンシャルバックオフ（指定秒数Capあり）で待機し再試行
 * 5. maxRetries 回すべて失敗したら、buildFailureMessage（省略時は既定文言）で
 *    エラーメッセージを組み立ててスローする
 *
 * @param {Function} operationFn - リトライ対象の処理（引数なしの関数）
 * @param {Object} [options] - リトライ動作設定オプション
 * @param {number} [options.maxRetries=3] - 最大リトライ回数
 * @param {boolean} [options.enableRetry=true] - falseの場合はリトライせず1回のみ実行
 * @param {string} [options.context='処理'] - ログ出力用の識別ラベル
 * @param {number} [options.maxWaitSeconds=30] - バックオフ待機時間の最大上限秒数（GAS時間制限対策）
 * @param {function(Error): boolean} [options.isNonRetryableError] - trueならリトライせず即座にスローする判定関数
 * @param {function(number): void} [options.onRetryAttempt] - 2回目以降の試行開始時に呼ばれるコールバック（試行回数を渡す）
 * @param {function(Error): void} [options.onFinalFailure] - 全リトライ失敗確定時に呼ばれるコールバック
 * @param {function(number, Error): string} [options.buildFailureMessage] - 最終エラーメッセージを組み立てる関数
 * @return {*} operationFnの戻り値
 * @throws {Error} isNonRetryableErrorがtrueを返した場合、または全リトライが失敗した場合
 */
function executeWithRetry(operationFn, options) {
    const {
        maxRetries = 3,
        enableRetry = true,
        context = '処理',
        maxWaitSeconds = 30,
        isNonRetryableError = null,
        onRetryAttempt = null,
        onFinalFailure = null,
        buildFailureMessage = null
    } = options || {};

    if (!enableRetry) {
        return operationFn();
    }

    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            if (attempt > 1) {
                if (onRetryAttempt) {
                    onRetryAttempt(attempt);
                }
                logWithLevel(LOG_LEVEL.SUMMARY, `  [${context}] リトライ ${attempt}/${maxRetries}回目...`);
            }

            const result = operationFn();

            if (attempt > 1) {
                logWithLevel(LOG_LEVEL.SUMMARY, `  ✓ [${context}] リトライ成功（${attempt}回目の試行で成功）`);
            }

            return result;

        } catch (error) {
            lastError = error;

            // エラーメッセージの安全な文字列取得（TypeError防止）
            const safeErrorMessage = (error && error.message) ? String(error.message) : String(error);

            if (isNonRetryableError && isNonRetryableError(error)) {
                logError(`  [${context}] 即座に失敗: リトライ不可能なエラー - ${safeErrorMessage}`);
                throw error;
            }

            logError(`  ✗ [${context}] エラー（試行 ${attempt}/${maxRetries}）: ${safeErrorMessage}`);

            if (attempt < maxRetries) {
                // エクスポネンシャルバックオフ: attempt=1失敗後→1秒, 2失敗後→2秒, 3失敗後→4秒... (Cap制御あり)
                const calculatedSeconds = Math.pow(2, attempt - 1);
                const waitSeconds = Math.min(calculatedSeconds, maxWaitSeconds);

                logWithLevel(LOG_LEVEL.SUMMARY, `  → ${waitSeconds}秒後にリトライします...`);
                Utilities.sleep(waitSeconds * 1000);
            }
        }
    }

    const safeLastErrorMsg = (lastError && lastError.message) ? String(lastError.message) : String(lastError);
    const errorMessage = buildFailureMessage
        ? buildFailureMessage(maxRetries, lastError)
        : `[${context}] 処理失敗（${maxRetries}回試行）: ${safeLastErrorMsg}`;

    logError(`  ✗✗✗ ${errorMessage}`);

    if (onFinalFailure) {
        onFinalFailure(lastError);
    }

    throw new Error(errorMessage);
}

/**
 * executeWithRetry 関数の単体テスト用関数
 * GASのスクリプトエディタから直接実行し、各種テストケースのパスを確認できます。
 */
function test_executeWithRetry() {
    Logger.log('=== test_executeWithRetry 開始 ===');

    let passedCount = 0;
    let failedCount = 0;

    function assert(condition, message) {
        if (condition) {
            Logger.log(`[PASS] ${message}`);
            passedCount++;
        } else {
            Logger.log(`[FAIL] ${message}`);
            failedCount++;
        }
    }

    // --- テスト1: 正常系 (1回目で成功) ---
    let callCount1 = 0;
    try {
        const result = executeWithRetry(() => {
            callCount1++;
            return 'SUCCESS';
        }, { maxRetries: 3, context: 'Test1-正常系' });

        assert(result === 'SUCCESS' && callCount1 === 1, 'テスト1: 1回目で成功すること');
    } catch (e) {
        assert(false, `テスト1: 例外発生 - ${e.message}`);
    }

    // --- テスト2: リトライ成功系 (2回目で成功) ---
    let callCount2 = 0;
    let retryAttemptCalled2 = false;
    try {
        const result = executeWithRetry(() => {
            callCount2++;
            if (callCount2 === 1) {
                throw new Error('一時的な接続障害');
            }
            return 'RETRY_SUCCESS';
        }, {
            maxRetries: 3,
            context: 'Test2-リトライ成功',
            onRetryAttempt: (attempt) => {
                if (attempt === 2) retryAttemptCalled2 = true;
            }
        });

        assert(result === 'RETRY_SUCCESS' && callCount2 === 2 && retryAttemptCalled2, 'テスト2: 2回目の試行で成功し、コールバックが呼ばれること');
    } catch (e) {
        assert(false, `テスト2: 例外発生 - ${e.message}`);
    }

    // --- テスト3: 即時失敗系 (isNonRetryableError) ---
    let callCount3 = 0;
    try {
        executeWithRetry(() => {
            callCount3++;
            throw new Error('認証エラー: Token invalid');
        }, {
            maxRetries: 3,
            context: 'Test3-即時失敗',
            isNonRetryableError: (err) => err.message.includes('認証エラー')
        });

        assert(false, 'テスト3: 例外がスローされませんでした');
    } catch (e) {
        assert(e.message.includes('認証エラー') && callCount3 === 1, 'テスト3: 即時失敗でエラーが再スローされること');
    }

    // --- テスト4: 上限失敗系 (規定回数すべて失敗) ---
    let callCount4 = 0;
    let finalFailureCalled4 = false;
    try {
        executeWithRetry(() => {
            callCount4++;
            throw new Error('サーバーエラー 500');
        }, {
            maxRetries: 3,
            context: 'Test4-上限失敗',
            buildFailureMessage: (max, err) => `最終失敗: ${max}回試行 - ${err.message}`,
            onFinalFailure: (err) => {
                finalFailureCalled4 = true;
            }
        });

        assert(false, 'テスト4: 例外がスローされませんでした');
    } catch (e) {
        assert(e.message.includes('最終失敗: 3回試行') && finalFailureCalled4 && callCount4 === 3, 'テスト4: 最大リトライ超過時に失敗メッセージが構築されonFinalFailureが呼ばれること');
    }

    // --- テスト5: enableRetry = false ---
    let callCount5 = 0;
    try {
        executeWithRetry(() => {
            callCount5++;
            throw new Error('エラー発生');
        }, {
            maxRetries: 3,
            enableRetry: false,
            context: 'Test5-リトライ無効'
        });

        assert(false, 'テスト5: 例外がスローされませんでした');
    } catch (e) {
        assert(callCount5 === 1, 'テスト5: enableRetryがfalseの場合、リトライせず1回目で終了すること');
    }

    Logger.log(`=== test_executeWithRetry 完了: 合格 ${passedCount} 件 / 失敗 ${failedCount} 件 ===`);
}
