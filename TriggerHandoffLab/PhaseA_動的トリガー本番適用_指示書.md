# 開発指示書：Phase A - 動的トリガー連携 本番適用

**対象プロジェクト：** `GetInventoryData`（送信側）／`DistributeInventory`（受信側）
**前提：** `TriggerHandoffLab` での動的ワンタイムトリガー検証が完了していること
**目的：** 検証で確立した「動的ワンタイムトリガー＋Web App呼び出し」の仕組みを本番2プロジェクトへ適用し、固定5分後トリガー方式から脱却する

---

## 0. 背景・前提・決定事項

### 0-1. 決定済みの設計方針（`TriggerHandoffLab_本番適用方針メモ.md` より）

- 送信側＝ `GetInventoryData`、受信側＝ `DistributeInventory`
- 受信側は共有トークン（`API_SHARED_TOKEN`）による簡易認証を行う
- 遅延時間（トリガー発火までの待機）は初期値 30秒（`30000`ミリ秒）
- リトライは最大3回・指数バックオフ（1秒→2秒→4秒）
- **移行はステップ1（並行運用）から開始する**：既存の固定時刻トリガーは削除せず、フェイルセーフとしてそのまま残す。安定稼働を確認した後に頻度削減を検討する（**この削減作業は本Phaseのスコープ外**）

### 0-2. 今回確定した追加事項（ヒデノリさんへの確認済み）

動的トリガーによる配布呼び出しは、以下の**両方の処理完了後**に設定する。

- `updateInventoryDataBatchWithRetry()`（在庫差分更新・1日6回）
- `updateInventoryDataFromGoodsMaster()`（商品マスタ全件同期・1日1回）

商品マスタ同期後も即時配布することで、新商品・廃止商品（`is_active`変化）の反映が早くなる。

### 0-3. 設計上の重要な技術的注意点（必読）

**① GASのWeb AppはHTTPステータスコードを自由に変更できない**

`doPost(e)` がエラーレスポンス（認証失敗など）を返す場合でも、トランスポート上のHTTPステータスコードは基本的に `200` のまま返る。したがって「ステータスコード200＝成功」という判定だけでは、トークン不一致などの**論理的なエラー**を検知できない。

→ 本番実装では、レスポンスボディの `result` フィールド（`'success'` / `'unauthorized'` / `'error'`）で成否を判定する設計に変更する。ステータスコードのチェックは「通信が成立したか」の確認にのみ使う。

**② 動的トリガーと固定時刻トリガーの並行稼働による多重実行リスク**

移行期間中は動的トリガー（発火後30秒程度）と既存の固定時刻トリガーの両方が有効な状態になる。タイミングが重なると `distributeInventoryChanges()` が**同時に2つ実行される**可能性があり、スプレッドシートへの書き込みが競合する恐れがある（単純な「2回実行される」こと自体は冪等性により無害だが、「同時に」実行されることは別の問題）。

→ `LockService` による排他制御を `distributeInventoryChanges()` に追加することを推奨する（Phase A-1 タスク3）。これは方針メモには無かった追加提案であり、必須ではないが安全策として強く推奨する。

### 0-4. 開発の進め方

- アジャイル・スモールステップで進める。各Phase完了ごとに動作確認を行い、ヒデノリさんの確認を得てから次のPhaseに進むこと。
- 既存ファイルへの追記は、既存コードを変更せず追記のみとする（10_Main.エントリーポイント.gs への差分箇所を除く。差分箇所は本指示書内で明示する）。
- 各ファイルのヘッダー・関数ヘッダーのコメントは既存プロジェクトの規約に従うこと。

---

## 1. 変更ファイル一覧

### DistributeInventory（受信側）

| ファイル | 区分 | 内容 |
|---|---|---|
| `16_WebhookReceiver.受信処理.gs` | 新規 | `doPost(e)` / `doGet(e)`、トークン検証 |
| `11_Config.設定管理.gs` | 追記 | `getSharedToken()` 追加 |
| `10_Main.エントリーポイント.gs` | 差分修正 | `distributeInventoryChanges()` に `LockService` 排他制御を追加 |
| `12_Logger.ログ管理.gs` / `13_SupabaseClient.gs` / `14_SupabaseRepository.gs` / `15_SheetRepository.gs` / `トリガー設定.gs` | 変更なし | 既存の固定時刻トリガーもそのまま残す |

### GetInventoryData（送信側）

| ファイル | 区分 | 内容 |
|---|---|---|
| `18_TriggerManager.トリガー管理.gs` | 新規 | 動的ワンタイムトリガーの作成・自己削除（`TriggerHandoffLab`からの移植） |
| `19_DistributeCaller.配布呼び出し.gs` | 新規 | DistributeInventory呼び出し・リトライ・トリガーハンドラ |
| `11_Config.設定管理.gs` | 追記 | `getReceiverWebAppUrl()` / `getSharedToken()` / `getDistributeTriggerDelayMs()` 追加 |
| `10_Main.エントリーポイント.gs` | 差分修正 | 2箇所（在庫差分更新・商品マスタ全件同期）の末尾にフックを追加 |
| `99_Tests.テスト.gs` | 追記 | 動作確認用テスト関数を追加 |
| `12_Logger.gs` 〜 `17_SupabaseRepository.gs` / `トリガー設定.gs` | 変更なし | 既存の固定時刻トリガーもそのまま残す |

---

## 2. スクリプトプロパティの追加一覧

### DistributeInventory に追加

| キー | 値 |
|---|---|
| `API_SHARED_TOKEN` | 送信側(GetInventoryData)と**同じ値**を設定する共有トークン（ランダムな文字列を推奨） |

### GetInventoryData に追加

| キー | 値 |
|---|---|
| `RECEIVER_WEBAPP_URL` | DistributeInventoryのWeb AppデプロイURL（Phase A-1完了後に取得） |
| `API_SHARED_TOKEN` | 受信側(DistributeInventory)と**同じ値**を設定する共有トークン |
| `DISTRIBUTE_TRIGGER_DELAY_MS` | （任意）トリガー発火までの遅延ミリ秒。未設定時は `30000`（30秒）を既定値とする |

**重要：** `API_SHARED_TOKEN` は両プロジェクトで完全に同じ文字列を設定すること。

---

## Phase A-1: 受信側（DistributeInventory）の実装

### タスク1：`11_Config.設定管理.gs` への追記

```javascript
/**
 * 送信側(GetInventoryData)と共有する認証トークンを取得する
 *
 * 動的トリガー経由のWebhook受信時に、リクエストの正当性を検証するために使用する。
 *
 * @return {string} 共有トークン
 * @throws {Error} API_SHARED_TOKEN が未設定の場合
 */
function getSharedToken() {
    const token = PropertiesService.getScriptProperties().getProperty('API_SHARED_TOKEN');
    if (!token) {
        throw new Error('スクリプトプロパティ API_SHARED_TOKEN が設定されていません。送信側(GetInventoryData)と同じ値を設定してください。');
    }
    return token;
}
```

### タスク2：`16_WebhookReceiver.受信処理.gs` 新規作成

```javascript
/**
 * @file 16_WebhookReceiver.受信処理.gs
 * @description GetInventoryData（送信側）からの動的トリガー経由HTTP呼び出しを受信するモジュール。
 * 共有トークンによる簡易認証を行い、正当なリクエストのみ distributeInventoryChanges() を起動する。
 *
 * ### 依存関係
 * - 参照先: 10_Main.エントリーポイント.gs (distributeInventoryChanges)
 *           11_Config.設定管理.gs (getSharedToken)
 *           12_Logger.ログ管理.gs (logWithLevel, logError)
 *
 * @version 1.0
 * @see doPost - 送信側からのPOSTリクエスト受信処理
 */

/**
 * Web Appとして公開した際のPOSTリクエスト受信処理
 *
 * 【処理フロー】
 * 1. リクエストボディ（JSON）をパースする
 * 2. body.token と getSharedToken() を比較し、一致しない場合は result: 'unauthorized' を返す
 *    （Web AppはHTTPステータスを自由に変更できないため、論理的な成否はボディのresultフィールドで表現する）
 * 3. 一致する場合、distributeInventoryChanges() を呼び出す
 * 4. 処理結果（成功/エラー）をJSONで返す
 *
 * @param {Object} e - GASのイベントオブジェクト（e.postData.contents にPOSTボディが入る）
 * @return {GoogleAppsScript.Content.TextOutput} JSON形式のレスポンス
 */
function doPost(e) {
    const receivedAt = new Date();

    try {
        const body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};

        logWithLevel(LOG_LEVEL.MINIMAL, '=== Webhook受信 === 受信時刻: '
            + Utilities.formatDate(receivedAt, 'JST', 'yyyy/MM/dd HH:mm:ss')
            + ', 送信元: ' + (body.source || '不明'));

        // 共有トークンによる認証
        const expectedToken = getSharedToken();
        if (!body.token || body.token !== expectedToken) {
            logError('Webhook認証エラー: トークンが一致しません（送信元: ' + (body.source || '不明') + '）');
            return ContentService
                .createTextOutput(JSON.stringify({ result: 'unauthorized', message: 'トークンが一致しません' }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        // 配布処理を実行（内部でLockServiceによる多重実行防止を行う。タスク3参照）
        distributeInventoryChanges();

        return ContentService
            .createTextOutput(JSON.stringify({ result: 'success', receivedAt: receivedAt.toISOString() }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        logError('Webhook受信処理エラー: ' + error.message);

        return ContentService
            .createTextOutput(JSON.stringify({ result: 'error', message: error.message }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

/**
 * ブラウザでの簡易動作確認用（GETリクエスト）
 *
 * @param {Object} e - GASのイベントオブジェクト
 * @return {GoogleAppsScript.Content.TextOutput} 簡易な生存確認メッセージ
 */
function doGet(e) {
    return ContentService
        .createTextOutput(JSON.stringify({
            result: 'success',
            message: 'DistributeInventory Webhook受信は正常に稼働しています。'
        }))
        .setMimeType(ContentService.MimeType.JSON);
}
```

### タスク3（推奨対応）：`distributeInventoryChanges()` への排他制御追加

動的トリガーと固定時刻トリガーの並行稼働期間中、`distributeInventoryChanges()` が同時に2つ走ることを防ぐため、`LockService` で排他制御を追加する。

`10_Main.エントリーポイント.gs` の既存コードに対する**差分**として実装する。

**変更前：**

```javascript
function distributeInventoryChanges() {
  const startTime = new Date();
  logWithLevel(LOG_LEVEL.MINIMAL, '=== 在庫配布処理（差分更新）開始 ===');

  try {
```

**変更後：**

```javascript
function distributeInventoryChanges() {
  // 動的トリガー（Webhook経由）と固定時刻トリガーが同時に発火した場合の
  // 多重実行を防ぐため、排他ロックを取得する。
  // ロックが取得できない場合は「他の実行が処理中」と判断し、今回は処理をスキップする。
  const lock = LockService.getScriptLock();
  const hasLock = lock.tryLock(5000); // 最大5秒待機

  if (!hasLock) {
    console.warn('他の実行が処理中のため、今回の distributeInventoryChanges() 実行をスキップします（多重起動防止）。');
    return;
  }

  const startTime = new Date();
  logWithLevel(LOG_LEVEL.MINIMAL, '=== 在庫配布処理（差分更新）開始 ===');

  try {
```

**末尾の変更（既存の `catch` ブロックの直後に `finally` を追加）：**

既存コードの末尾は以下のようになっている（`sendErrorMail` 呼び出しまでが既存の `catch` ブロックの内容）。

```javascript
  } catch (error) {
    logError('❌ 在庫配布処理（全体）で重大なエラーが発生しました: ' + error.message);

    // 重大エラー通知メールを送信
    const subject = '【重要・エラー】在庫配布処理 重大なエラーが発生しました';
    const body = '在庫配布処理の実行中に、システム全体に影響する重大なエラーが発生しました。処理は中断されています。\n\n' +
      '■ 発生日時: ' + new Date().toLocaleString() + '\n' +
      '■ エラー内容:\n' + error.message + '\n\n' +
      '※ Supabase への接続状態やスクリプトプロパティ（SHEET_CONFIG_1 など）の設定値を確認してください。';
    sendErrorMail(subject, body);
  }
}
```

この `catch` ブロックの直後に、ロック解放のための `finally` を追加する。

```javascript
  } catch (error) {
    logError('❌ 在庫配布処理（全体）で重大なエラーが発生しました: ' + error.message);

    const subject = '【重要・エラー】在庫配布処理 重大なエラーが発生しました';
    const body = '在庫配布処理の実行中に、システム全体に影響する重大なエラーが発生しました。処理は中断されています。\n\n' +
      '■ 発生日時: ' + new Date().toLocaleString() + '\n' +
      '■ エラー内容:\n' + error.message + '\n\n' +
      '※ Supabase への接続状態やスクリプトプロパティ（SHEET_CONFIG_1 など）の設定値を確認してください。';
    sendErrorMail(subject, body);

  } finally {
    // 処理の成否に関わらず、必ずロックを解放する
    lock.releaseLock();
  }
}
```

**注意：** `initializeAllSheets()` 関数（手動実行用の全件初期化）はロック対象に含めない。手動実行であり、トリガーとの競合リスクが低いため。

### タスク4：スクリプトプロパティの設定

`API_SHARED_TOKEN` を設定する（値は任意のランダム文字列。後でGetInventoryData側にも同じ値を設定する）。

### タスク5：Web Appとして（再）デプロイ

1. GASエディタの「デプロイ」→「新しいデプロイ」を選択
2. 種類：「ウェブアプリ」
3. 実行ユーザー：「自分」
4. アクセスできるユーザー：「全員」
5. デプロイ後に発行されるURLを控えておく（Phase A-2で送信側に設定する）

### Phase A-1 完了条件

- [ ] `doGet(e)` をブラウザで開き、生存確認メッセージが表示されること
- [ ] 正しいトークンを含むPOSTリクエストで `result: 'success'` が返り、`distributeInventoryChanges()` が実行されること
- [ ] トークンを誤った値にしたPOSTリクエストで `result: 'unauthorized'` が返ること（このとき `distributeInventoryChanges()` は実行されないことをログで確認）
- [ ] `distributeInventoryChanges()` を意図的に2つ同時実行（例：トリガーと手動実行を同時に行う）し、片方が「多重起動防止」のログでスキップされることを確認する
- [ ] 既存の固定時刻トリガー（`トリガー設定.gs`）が変更されておらず、引き続き動作すること

---

## Phase A-2: 送信側（GetInventoryData）の実装

### タスク1：`11_Config.設定管理.gs` への追記

```javascript
/**
 * 受信側(DistributeInventory)のWeb App URLをスクリプトプロパティから取得する
 *
 * @return {string} 受信側のWeb App URL
 * @throws {Error} RECEIVER_WEBAPP_URL が未設定の場合
 */
function getReceiverWebAppUrl() {
    const url = PropertiesService.getScriptProperties().getProperty('RECEIVER_WEBAPP_URL');
    if (!url) {
        throw new Error('スクリプトプロパティ RECEIVER_WEBAPP_URL が設定されていません。DistributeInventory側のWeb AppデプロイURLを設定してください。');
    }
    return url;
}

/**
 * 受信側(DistributeInventory)と共有する認証トークンを取得する
 *
 * @return {string} 共有トークン
 * @throws {Error} API_SHARED_TOKEN が未設定の場合
 */
function getSharedToken() {
    const token = PropertiesService.getScriptProperties().getProperty('API_SHARED_TOKEN');
    if (!token) {
        throw new Error('スクリプトプロパティ API_SHARED_TOKEN が設定されていません。受信側(DistributeInventory)と同じ値を設定してください。');
    }
    return token;
}

/**
 * 動的トリガーの発火までの遅延時間（ミリ秒）を取得する
 *
 * 未設定の場合は既定値 30000（30秒）を返す。
 *
 * @return {number} 遅延時間（ミリ秒）
 */
function getDistributeTriggerDelayMs() {
    const value = PropertiesService.getScriptProperties().getProperty('DISTRIBUTE_TRIGGER_DELAY_MS');
    return value ? parseInt(value, 10) : 30000;
}
```

### タスク2：`18_TriggerManager.トリガー管理.gs` 新規作成

`TriggerHandoffLab_Sender` の `12_TriggerManager.トリガー管理.gs`（Phase4完了版・重複防止対応済み）をほぼそのまま移植する。ファイル番号のみ `18_` に変更する。

```javascript
/**
 * @file 18_TriggerManager.トリガー管理.gs
 * @description 動的ワンタイムトリガーの作成・削除・自己クリーンアップを担う汎用モジュール。
 * 「指定時間後に1回だけ実行し、実行後は自分自身を削除する」という挙動を
 * 安全に扱うための関数群を提供する。
 * TriggerHandoffLab（学習検証プロジェクト）での検証済みロジックを移植したもの。
 *
 * ### 設計方針
 * - トリガー作成時にユニークIDをスクリプトプロパティへ保存する
 * - トリガー発火後の関数は、必ず本ファイルの cleanupFiredTrigger() を呼び出して自己削除する
 * - 同じ関数に対するトリガーが重複して残らないよう、作成前に既存トリガーを削除する
 *
 * @version 1.0
 * @see scheduleOneTimeTrigger - 指定ミリ秒後に1回だけ発火するトリガーを作成（重複防止付き）
 * @see cleanupFiredTrigger    - 発火済みトリガーを自分自身で削除する
 * @see countTriggersFor       - 指定関数に紐づくトリガー数を確認する（デバッグ用）
 */

/**
 * 指定した関数を、指定ミリ秒後に1回だけ実行するトリガーを作成する（重複防止版）
 *
 * 【処理フロー】
 * 1. 指定関数名に紐づく既存のトリガーをすべて削除する（重複登録防止）
 * 2. スクリプトプロパティ PENDING_TRIGGER_ID が残っていればクリアする
 * 3. ScriptApp.newTrigger().timeBased().after(delayMs).create() でトリガーを作成する
 * 4. 作成したトリガーのユニークIDをスクリプトプロパティへ保存する
 *
 * @param {string} functionName - トリガーで実行する関数名
 * @param {number} delayMs - 何ミリ秒後に実行するか
 * @return {string} 作成したトリガーのユニークID
 * @throws {Error} トリガー作成に失敗した場合
 */
function scheduleOneTimeTrigger(functionName, delayMs) {
    const existingTriggers = ScriptApp.getProjectTriggers()
        .filter(t => t.getHandlerFunction() === functionName);

    if (existingTriggers.length > 0) {
        console.warn(functionName + ' に紐づく既存トリガーが ' + existingTriggers.length
            + ' 件見つかりました。重複防止のため削除します。');
        existingTriggers.forEach(t => ScriptApp.deleteTrigger(t));
    }

    PropertiesService.getScriptProperties().deleteProperty('PENDING_TRIGGER_ID');

    try {
        const trigger = ScriptApp.newTrigger(functionName)
            .timeBased()
            .after(delayMs)
            .create();

        const triggerId = trigger.getUniqueId();
        PropertiesService.getScriptProperties().setProperty('PENDING_TRIGGER_ID', triggerId);

        console.log('動的トリガーを作成しました: 関数=' + functionName
            + ', 発火予定=' + delayMs + 'ms後, トリガーID=' + triggerId);

        return triggerId;

    } catch (error) {
        console.error('動的トリガーの作成に失敗しました: ' + error.message);
        throw error;
    }
}

/**
 * 発火済みのワンタイムトリガーを自分自身で削除する（後始末処理）
 *
 * @return {boolean} トリガーの削除に成功した場合は true、対象が見つからなかった場合は false
 */
function cleanupFiredTrigger() {
    const properties = PropertiesService.getScriptProperties();
    const triggerId = properties.getProperty('PENDING_TRIGGER_ID');

    if (!triggerId) {
        console.log('PENDING_TRIGGER_ID が見つからないため、削除処理をスキップします。');
        return false;
    }

    let deleted = false;

    try {
        const triggers = ScriptApp.getProjectTriggers();
        for (const trigger of triggers) {
            if (trigger.getUniqueId() === triggerId) {
                ScriptApp.deleteTrigger(trigger);
                deleted = true;
                console.log('発火済みトリガーを削除しました: ID=' + triggerId);
                break;
            }
        }

        if (!deleted) {
            console.warn('削除対象のトリガー(ID=' + triggerId + ')が見つかりませんでした。既に削除済みの可能性があります。');
        }

    } catch (error) {
        console.error('トリガー削除中にエラーが発生しました: ' + error.message);

    } finally {
        properties.deleteProperty('PENDING_TRIGGER_ID');
    }

    return deleted;
}

/**
 * 指定した関数名に紐づくトリガーの件数を取得する（デバッグ・テスト用）
 *
 * @param {string} functionName - 確認対象の関数名
 * @return {number} 該当関数に紐づくトリガーの件数
 */
function countTriggersFor(functionName) {
    const triggers = ScriptApp.getProjectTriggers();
    return triggers.filter(t => t.getHandlerFunction() === functionName).length;
}
```

### タスク3：`19_DistributeCaller.配布呼び出し.gs` 新規作成

```javascript
/**
 * @file 19_DistributeCaller.配布呼び出し.gs
 * @description DistributeInventory（配布側）のWeb Appを呼び出すモジュール。
 * 動的ワンタイムトリガーから呼び出され、HTTP POSTで配布処理を起動する。
 *
 * ### 依存関係
 * - 参照元: 10_Main.エントリーポイント.gs（scheduleOneTimeTriggerの呼び出し元）
 * - 参照先: 11_Config.設定管理.gs (getReceiverWebAppUrl, getSharedToken, getDistributeTriggerDelayMs)
 *           18_TriggerManager.トリガー管理.gs (cleanupFiredTrigger)
 *
 * @version 1.0
 * @see callDistributeInventory - 動的トリガーから呼び出されるエントリーポイント
 */

/** リトライ設定（DistributeInventory呼び出し用） */
const DISTRIBUTE_CALLER_RETRY_CONFIG = {
    MAX_RETRIES: 3,
    ENABLE_RETRY: true
};

/**
 * 動的トリガーから呼び出されるエントリーポイント関数
 *
 * 10_Main.エントリーポイント.gs から scheduleOneTimeTrigger('callDistributeInventory', ...)
 * という形で登録され、指定時間後にGASのトリガー機構から自動的に呼び出される。
 *
 * 【処理フロー】
 * 1. DistributeInventoryへ送信するペイロード（送信元・実行時刻・共有トークン）を構築する
 * 2. callDistributeInventoryWebAppWithRetry() でリトライ付きの送信を行う
 * 3. 送信が全て失敗した場合はログに記録するが、例外は握りつぶす
 *    （既存の固定時刻トリガーがフェイルセーフとして後続で配布を行うため）
 * 4. 送信の成否に関わらず、finally で cleanupFiredTrigger() を呼び出し自分自身のトリガーを削除する
 *
 * @return {void}
 */
function callDistributeInventory() {
    console.log('=== callDistributeInventory 発火 ===');
    console.log('発火時刻: ' + Utilities.formatDate(new Date(), 'JST', 'yyyy/MM/dd HH:mm:ss'));

    try {
        const payload = {
            source: 'GetInventoryData',
            firedAt: new Date().toISOString(),
            token: getSharedToken()
        };

        callDistributeInventoryWebAppWithRetry(payload);

    } catch (error) {
        logError('DistributeInventoryへの呼び出しに失敗しました（リトライ含め全て失敗）: ' + error.message);
        // 既存の固定時刻トリガー（フェイルセーフ）が後続で配布を行うため、ここでは握りつぶして継続する

    } finally {
        cleanupFiredTrigger();
    }
}

/**
 * DistributeInventoryのWeb AppへPOSTリクエストを送信する
 *
 * 【処理フロー】
 * 1. getReceiverWebAppUrl() でURLを取得する
 * 2. UrlFetchApp.fetch() でPOSTリクエストを送信する（muteHttpExceptions: true）
 * 3. 通信レベルのステータスコードが200であることを確認する（200以外は通信エラーとしてスロー）
 * 4. レスポンスボディをJSONパースし、result フィールドが 'success' であることを確認する
 *
 * 【重要】
 * Web Appは認証エラー時もHTTPステータス自体は200を返すため、
 * 成否の判定はステータスコードだけでなく必ずレスポンスボディの result フィールドで行う。
 *
 * @param {Object} payload - 送信するデータオブジェクト（token を含む）
 * @return {{success: boolean, statusCode: number, body: string}} レスポンス情報
 * @throws {Error} 通信エラー、異常なステータスコード、または論理的なエラー（認証失敗等）の場合
 */
function callDistributeInventoryWebApp(payload) {
    const url = getReceiverWebAppUrl();

    const options = {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    logWithLevel(LOG_LEVEL.SUMMARY, 'DistributeInventoryへ送信中... URL=' + url);

    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    const body = response.getContentText();

    if (statusCode !== 200) {
        throw new Error('DistributeInventory呼び出しエラー（通信レベル）: ステータス=' + statusCode + ', 内容=' + body);
    }

    const parsedBody = JSON.parse(body);

    if (parsedBody.result !== 'success') {
        throw new Error('DistributeInventory呼び出しエラー（論理エラー）: ' + (parsedBody.message || JSON.stringify(parsedBody)));
    }

    logWithLevel(LOG_LEVEL.SUMMARY, '送信成功: ' + body);
    return { success: true, statusCode: statusCode, body: body };
}

/**
 * DistributeInventoryのWeb AppへPOSTリクエストを送信する（リトライ付き）
 *
 * 【処理フロー】
 * 1. callDistributeInventoryWebApp() を呼び出す
 * 2. 失敗した場合、最大 DISTRIBUTE_CALLER_RETRY_CONFIG.MAX_RETRIES 回まで
 *    エクスポネンシャルバックオフ（1秒→2秒→4秒）でリトライする
 * 3. 全リトライが失敗した場合はエラーをスローする
 *
 * 【注意】
 * 認証エラー（トークン不一致）の場合もこの関数はリトライを行う。
 * 設定ミスの場合は3回とも失敗するため、エラーログでスクリプトプロパティの設定を確認すること。
 *
 * @param {Object} payload - 送信するデータオブジェクト
 * @return {{success: boolean, statusCode: number, body: string}} レスポンス情報
 * @throws {Error} 全リトライが失敗した場合
 */
function callDistributeInventoryWebAppWithRetry(payload) {
    if (!DISTRIBUTE_CALLER_RETRY_CONFIG.ENABLE_RETRY) {
        return callDistributeInventoryWebApp(payload);
    }

    let lastError = null;

    for (let attempt = 1; attempt <= DISTRIBUTE_CALLER_RETRY_CONFIG.MAX_RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                logWithLevel(LOG_LEVEL.SUMMARY, '  リトライ ' + attempt + '/' + DISTRIBUTE_CALLER_RETRY_CONFIG.MAX_RETRIES + '回目...');
            }
            return callDistributeInventoryWebApp(payload);

        } catch (error) {
            lastError = error;
            logError('  ✗ 送信エラー（試行 ' + attempt + '/' + DISTRIBUTE_CALLER_RETRY_CONFIG.MAX_RETRIES + '）: ' + error.message);

            if (attempt < DISTRIBUTE_CALLER_RETRY_CONFIG.MAX_RETRIES) {
                const waitSeconds = Math.pow(2, attempt - 1);
                Utilities.sleep(waitSeconds * 1000);
            }
        }
    }

    throw new Error('DistributeInventoryへの送信に失敗しました（' + DISTRIBUTE_CALLER_RETRY_CONFIG.MAX_RETRIES + '回試行）: ' + lastError.message);
}
```

### タスク4：`10_Main.エントリーポイント.gs` への差分修正（2箇所）

既存コードの変更は最小限とし、それぞれの処理が正常終了した末尾に1行追加するのみとする。

#### 修正箇所1：`updateInventoryDataBatchWithRetry()` の末尾

**変更前：**

```javascript
        recordExecutionTimestamp();

    } catch (error) {
        logError('一括更新エラー:', error.message);
        throw error;
    }
}
```

**変更後：**

```javascript
        recordExecutionTimestamp();

        // 動的トリガーでDistributeInventoryの配布処理を呼び出す（Phase A）
        scheduleOneTimeTrigger('callDistributeInventory', getDistributeTriggerDelayMs());

    } catch (error) {
        logError('一括更新エラー:', error.message);
        throw error;
    }
}
```

#### 修正箇所2：`updateInventoryDataFromGoodsMaster()` の末尾（Step 6の直後）

**変更前：**

```javascript
        // Step 6: 実行タイムスタンプ記録
        recordExecutionTimestamp();

        // Step 7: 翌日分のトリガーを自動登録（自己スケジューリング）
        setTriggerForGoodsMaster();
        logWithLevel(LOG_LEVEL.MINIMAL, '翌日分トリガー登録完了');
```

**変更後：**

```javascript
        // Step 6: 実行タイムスタンプ記録
        recordExecutionTimestamp();

        // Step 6b: 動的トリガーでDistributeInventoryの配布処理を呼び出す（Phase A）
        scheduleOneTimeTrigger('callDistributeInventory', getDistributeTriggerDelayMs());

        // Step 7: 翌日分のトリガーを自動登録（自己スケジューリング）
        setTriggerForGoodsMaster();
        logWithLevel(LOG_LEVEL.MINIMAL, '翌日分トリガー登録完了');
```

ファイルヘッダーの「処理フロー」コメント（`@file` JSDoc内）にも、それぞれ以下を追記する。

```javascript
 * ### 処理フロー (updateInventoryDataBatchWithRetry)
 * （既存のStep記述の末尾に追加）
 * Step X. 動的トリガーでDistributeInventoryを呼び出す (18_TriggerManager.gs / 19_DistributeCaller.gs)
 *
 * ### 処理フロー (updateInventoryDataFromGoodsMaster)
 * Step 6b. 動的トリガーでDistributeInventoryを呼び出す (18_TriggerManager.gs / 19_DistributeCaller.gs)
```

### タスク5：スクリプトプロパティの設定

- `RECEIVER_WEBAPP_URL`：Phase A-1で取得したDistributeInventoryのWeb AppデプロイURL
- `API_SHARED_TOKEN`：DistributeInventory側と**同じ値**
- `DISTRIBUTE_TRIGGER_DELAY_MS`：（任意）未設定なら30000が既定値として使われる

### タスク6：`99_Tests.テスト.gs` への追記

```javascript
/**
 * callDistributeInventory() の単体動作確認テスト
 *
 * 【テスト手順】
 * 1. callDistributeInventory() を直接呼び出す（トリガー経由ではなく手動実行）
 * 2. DistributeInventory側へHTTPリクエストが届き、成功ログが出ることを確認する
 * 3. cleanupFiredTrigger() が呼ばれるため、事前にダミーのPENDING_TRIGGER_IDが
 *    設定されていなくても警告ログのみで正常終了することを確認する
 *
 * @return {void}
 */
function testCallDistributeInventory() {
    console.log('=== testCallDistributeInventory 開始 ===');

    try {
        callDistributeInventory();
        console.log('✓ callDistributeInventory() がエラーなく完了しました。');
        console.log('DistributeInventory側の実行ログで Webhook受信 が記録されているか確認してください。');
    } catch (error) {
        console.error('❌ テスト中に予期しない例外が発生しました: ' + error.message);
    }

    console.log('=== testCallDistributeInventory 終了 ===');
}

/**
 * 在庫差分更新フロー全体（トリガー登録部分）の動作確認テスト
 *
 * 【テスト手順】
 * 1. scheduleOneTimeTrigger('callDistributeInventory', 10000) を直接呼び出す
 *    （本番の getDistributeTriggerDelayMs() より短い10秒に設定し、確認を速くする）
 * 2. countTriggersFor('callDistributeInventory') が 1 であることを確認する
 * 3. 10秒待ってトリガーが自動発火し、DistributeInventory側にリクエストが届くことを確認する
 * 4. 発火後、トリガーが自動的に削除されていることを確認する
 *
 * @return {void}
 */
function testDistributeTriggerEndToEnd() {
    console.log('=== testDistributeTriggerEndToEnd 開始 ===');

    scheduleOneTimeTrigger('callDistributeInventory', 10000);

    const count = countTriggersFor('callDistributeInventory');
    console.log('トリガー設定後の件数: ' + count + ' (期待値: 1)');

    if (count === 1) {
        console.log('✓ トリガー設定確認: 成功');
        console.log('約10秒後に callDistributeInventory が自動実行されます。実行ログとトリガー一覧を確認してください。');
    } else {
        console.error('❌ トリガー設定確認: 失敗');
    }

    console.log('=== testDistributeTriggerEndToEnd 終了 ===');
}
```

### Phase A-2 完了条件

- [ ] `testCallDistributeInventory()` を実行し、DistributeInventory側に正しくリクエストが届き、`result: 'success'` が返ること
- [ ] `testDistributeTriggerEndToEnd()` を実行し、トリガーが正しく作成・発火・自己削除されること
- [ ] `RECEIVER_WEBAPP_URL` を意図的に誤った値にし、3回リトライ後にエラーログが出て、それでも `cleanupFiredTrigger()` が実行されトリガーが残らないことを確認する（その後、正しい値に戻す）
- [ ] 既存の固定時刻トリガー（`トリガー設定.gs`）が変更されておらず、引き続き動作すること

---

## Phase A-3: 結合テスト・並行運用確認

### 目的

Phase A-1・A-2を実際の本番処理（`updateInventoryDataBatchWithRetry()` / `updateInventoryDataFromGoodsMaster()`）から動かし、固定時刻トリガーとの並行稼働下で問題なく動作することを確認する。

### タスク1：在庫差分更新からのエンドツーエンド確認

1. `updateInventoryDataBatchWithRetry()` を本番環境で実行する
2. 完了ログの後、約30秒後に `callDistributeInventory` が自動実行されることを確認する
3. DistributeInventory側の実行ログで、Webhook受信および `distributeInventoryChanges()` の実行が記録されていることを確認する
4. 配布先スプレッドシートが実際に更新されていることを確認する

### タスク2：商品マスタ全件同期からのエンドツーエンド確認

1. `updateInventoryDataFromGoodsMaster()` を本番環境で実行する
2. Step 6b で動的トリガーが設定され、約30秒後に配布処理が起動することを確認する
3. 新商品・廃止商品が存在するタイミングで実行できる場合は、配布先スプレッドシートの `is_active` 関連の反映も確認する

### タスク3：固定時刻トリガーとの並行稼働確認

1. 動的トリガーの発火タイミングと、既存の固定時刻トリガー（例: 8:05）が近い時間に重なるケースを意図的に作る、または翌日の通常運用でログを観察する
2. DistributeInventory側のログで「他の実行が処理中のため、今回の distributeInventoryChanges() 実行をスキップします」というログが出た場合、Phase A-1タスク3の排他制御が正常に機能していることを意味する
3. 重複実行によるエラーやデータ不整合が発生していないことを確認する

### タスク4：障害シナリオの確認

1. DistributeInventory側のWeb Appを一時的にデプロイ解除（またはURLを意図的に誤らせる）し、送信側のリトライ・フェイルセーフが機能することを確認する
   - 送信側：3回リトライ後にエラーログを記録し、例外を握りつぶして処理を継続すること
   - 受信側の固定時刻トリガーが、後続のタイミングで通常通り配布処理を行い、結果的にデータが反映されること
2. 確認後、Web Appの状態を正常に戻す

### Phase A-3 完了条件

- [ ] タスク1〜4の全項目で異常なく動作することを確認した
- [ ] 最低3日間、通常運用下で動的トリガー経由の配布が正常に動作し、固定時刻トリガーとの重複によるエラーが発生していないことをログで確認した

---

## 4. 完了条件チェックリスト（全体）

- [ ] Phase A-1〜A-3が全て完了し、各完了条件を満たしていること
- [ ] `API_SHARED_TOKEN` が両プロジェクトで一致していること
- [ ] 在庫差分更新・商品マスタ全件同期の両方から、動的トリガー経由で配布処理が起動すること
- [ ] 認証失敗時に `result: 'unauthorized'` が返り、配布処理が実行されないこと
- [ ] `LockService` による多重実行防止が機能していること
- [ ] 既存の固定時刻トリガー（送信側・受信側いずれも）が変更されておらず、フェイルセーフとして稼働していること
- [ ] README.md（両プロジェクト）に、動的トリガー連携の概要とスクリプトプロパティ追加分が反映されていること（Phase A完了後に更新）

---

## 5. 実装しないこと（スコープ外）

- 既存の固定時刻トリガーの**削除・頻度削減**（安定稼働を一定期間確認した後、別のPhase Bとして着手する）
- `初期化処理(initializeAllSheets())` へのロック制御の追加（手動実行のため対象外とする）
- Webhookの認証強化（OAuth等の本格的な認証への切り替え）。共有トークン方式で当面は十分と判断する
- 複数の受信先（DistributeInventory以外）への同時配信

---

*以上がPhase A（動的トリガー連携 本番適用）の指示書です。*
*各Phase完了時にヒデノリさんへ動作確認結果を報告し、確認を得てから次のPhaseに進んでください。*
