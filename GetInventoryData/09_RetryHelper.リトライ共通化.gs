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
