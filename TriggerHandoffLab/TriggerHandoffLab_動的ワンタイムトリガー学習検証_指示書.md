# 開発指示書：動的ワンタイムトリガー学習検証プロジェクト（TriggerHandoffLab）

**プロジェクト名：** TriggerHandoffLab（学習検証専用・本番プロジェクトとは独立）
**目的：** GASの「動的ワンタイムトリガー」と「プロジェクト間のHTTP連携（Web App呼び出し）」の組み合わせ方を、小さな2つのGASプロジェクトで実地検証し、習熟する。
**最終目標：** ここで得た知見を、既存の `GetInventoryData` → `DistributeInventory` 連携（現在は固定5分後トリガー方式）に適用し、固定待機時間をなくす。

---

## 0. 背景・前提

### 0-1. なぜこの検証プロジェクトが必要か

現状、`GetInventoryData` の在庫更新完了から5分後に `DistributeInventory` が起動するよう、別々の固定時刻トリガーで運用されている。これには以下の課題がある。

- 処理が早く終わっても5分間は無駄に待つ
- 処理が万一5分を超えた場合、配布側が古いデータを読みに行ってしまう可能性がある

これを解消する方法として「ライブラリ化して直接呼び出す」案と「動的ワンタイムトリガーで連携する」案を検討し、後者を学習してから本番に適用する方針となった。

### 0-2. GASの制約（最重要）

`ScriptApp.newTrigger(functionName)` で作成するトリガーは、**そのトリガーを作成したプロジェクト自身の関数しか呼び出せない**。つまり「GetInventoryData側でDistributeInventory側の関数を直接トリガーする」ことはGAS標準APIではできない。

したがって、本検証プロジェクトでは以下の構成で学ぶ。

```
送信側プロジェクト（Sender）
    │
    ├─ メイン処理（ダミー処理）を実行
    │
    ├─ 完了直後、動的ワンタイムトリガーを「自分自身の関数」に対して設定
    │     （ScriptApp.newTrigger().timeBased().after(ms).create()）
    │
    └─ 数十秒後、トリガーが発火 → 送信側の関数が実行される
            │
            └─ その関数の中から UrlFetchApp で
               受信側プロジェクトの Web App URL を呼び出す
                    │
受信側プロジェクト（Receiver）
    │
    └─ doPost(e) で受信し、処理を実行（今回はログ記録のみ）
```

これは送信側にとっては「自分自身への動的トリガー」＋「外部Web AppへのHTTP呼び出し」の組み合わせであり、本番の `GetInventoryData`（送信側）→`DistributeInventory`（受信側）の構図とそのまま対応する。

### 0-3. 開発の進め方

- アジャイル・スモールステップで進める。各Phase完了ごとに動作確認を行い、ヒデノリさんの確認を得てから次のPhaseに進むこと。
- 各ファイルのヘッダーには関数の説明を必ず記述すること。
- 既存コードを修正する場合は、コメントを可能な限り残すか、内容に応じて修正すること。
- 本検証プロジェクトのコードは `GetInventoryData` / `DistributeInventory` のコードには一切触れない（独立した学習用プロジェクトとして新規作成する）。

---

## 1. プロジェクト構成

2つの独立したGASプロジェクトを新規作成する。

```
TriggerHandoffLab_Sender/      ← 送信側（GetInventoryDataの役割を模倣）
├── 10_Main.エントリーポイント.gs
├── 11_Config.設定管理.gs
├── 12_TriggerManager.トリガー管理.gs
├── 13_Caller.外部呼び出し.gs
└── 99_Tests.テスト.gs

TriggerHandoffLab_Receiver/    ← 受信側（DistributeInventoryの役割を模倣）
├── 10_Main.エントリーポイント.gs
├── 11_Config.設定管理.gs
└── 99_Tests.テスト.gs
```

| Lab上の名称 | 本番での対応先 |
|---|---|
| TriggerHandoffLab_Sender | GetInventoryData |
| TriggerHandoffLab_Receiver | DistributeInventory |
| ダミー処理（Sleep） | 商品マスタAPI取得・在庫マスタAPI取得 |
| Web App 受信ログ | distributeInventoryChanges() の実行 |

---

## 2. コーディング規約

既存プロジェクト（GetInventoryData / DistributeInventory）と同じ規約に従うこと。

- **ファイルヘッダー（`@file` JSDoc）必須**：このファイルの目的・依存関係を記述
- **関数ヘッダー（JSDoc）必須**：`@param` / `@return` / `@throws` を記述
- **エラーハンドリング**：`try-catch` でキャッチし、`console.error()` でログ記録後 `throw` で再スロー（このLabでは `logError()` を新規定義してもよいが、シンプルさ優先で `console.error` でも可とする）
- **既存ファイルへの追記時は、既存コードを変更せず追記のみ**
- 命名規則：`NN_英語名.日本語説明.gs`（既存プロジェクトと同じ）

---

## 3. Phase構成

```
Phase 1: 受信側（Receiver）のWeb App構築
Phase 2: 送信側（Sender）の動的トリガー基本動作確認（自己完結・外部呼び出しなし）
Phase 3: 送信側 → 受信側への接続（HTTP連携）
Phase 4: 信頼性向上（重複防止・自己削除・リトライ）
Phase 5: 本番プロジェクトへの適用方針整理（ドキュメントのみ）
```

各Phaseの完了条件を満たしてから次のPhaseに着手すること。

---

## Phase 1: 受信側（Receiver）のWeb App構築

### 目的

送信側からのHTTPリクエストを受け取れる「待ち受け側」を先に作る。これは既存の `00_認証ライブラリ使用必須関数.gs` の `doGet(e)` で経験済みのWeb App公開パターンの応用であり、ハードルは低いはずである。

### タスク1：`10_Main.エントリーポイント.gs`（Receiver）

```javascript
/**
 * @file 10_Main.エントリーポイント.gs
 * @description TriggerHandoffLab_Receiver のメインモジュール。
 * 送信側（Sender）からのHTTP POSTリクエストを受信し、内容をログに記録する。
 * 本番の DistributeInventory における distributeInventoryChanges() 呼び出しの
 * 受け口に相当する役割を学習目的で模倣する。
 *
 * ### 依存関係
 * - 参照先: 11_Config.設定管理.gs
 *
 * @version 1.0
 */

/**
 * Web App として公開した際のPOSTリクエスト受信処理
 *
 * 【処理フロー】
 * 1. リクエストボディ（JSON文字列）を受け取り、パースする
 * 2. 受信内容と受信時刻をログに出力する
 * 3. スクリプトプロパティに「最終受信時刻・最終受信内容」を保存する（動作確認用）
 * 4. 成功レスポンス（JSON）を返却する
 *
 * @param {Object} e - GASのイベントオブジェクト（e.postData.contents にPOSTボディが入る）
 * @return {GoogleAppsScript.Content.TextOutput} JSON形式のレスポンス
 */
function doPost(e) {
    const receivedAt = new Date();

    try {
        const body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};

        console.log('=== 受信 ===');
        console.log('受信時刻: ' + Utilities.formatDate(receivedAt, 'JST', 'yyyy/MM/dd HH:mm:ss'));
        console.log('受信内容: ' + JSON.stringify(body));

        // 動作確認用に最終受信内容をプロパティへ保存
        PropertiesService.getScriptProperties().setProperties({
            'LAST_RECEIVED_AT': receivedAt.toISOString(),
            'LAST_RECEIVED_BODY': JSON.stringify(body)
        });

        return ContentService
            .createTextOutput(JSON.stringify({
                result: 'success',
                receivedAt: receivedAt.toISOString(),
                echo: body
            }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        console.error('受信処理エラー: ' + error.message);

        return ContentService
            .createTextOutput(JSON.stringify({
                result: 'error',
                message: error.message
            }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

/**
 * ブラウザから直接URLを開いた場合の簡易動作確認用（GETリクエスト）
 *
 * @param {Object} e - GASのイベントオブジェクト
 * @return {GoogleAppsScript.Content.TextOutput} 簡易な生存確認メッセージ
 */
function doGet(e) {
    return ContentService
        .createTextOutput(JSON.stringify({
            result: 'success',
            message: 'TriggerHandoffLab_Receiver は正常に稼働しています。POSTリクエストで受信処理が行われます。'
        }))
        .setMimeType(ContentService.MimeType.JSON);
}
```

### タスク2：`11_Config.設定管理.gs`（Receiver）

```javascript
/**
 * @file 11_Config.設定管理.gs
 * @description TriggerHandoffLab_Receiver の設定・定数管理モジュール。
 * 現時点では設定項目は少ないが、将来の拡張（受信内容に応じた分岐処理等）に備えて分離する。
 *
 * @version 1.0
 */

// このLabでは固定の認証は設けない（学習目的のため）。
// 本番適用時は、受信側の doPost(e) でトークン等による簡易認証を検討すること。
```

### タスク3：Web Appとしてデプロイ

1. GASエディタの「デプロイ」→「新しいデプロイ」を選択
2. 種類：「ウェブアプリ」
3. 実行ユーザー：「自分」
4. アクセスできるユーザー：「全員」（学習用のため。本番適用時は要検討）
5. デプロイ後に発行されるURL（`https://script.google.com/macros/s/.../exec`）を控えておく
   → このURLはPhase 3で送信側（Sender）のスクリプトプロパティに設定する

### Phase 1 完了条件

- [ ] `doGet(e)` をブラウザで開き、生存確認メッセージが表示されること
- [ ] 任意のツール（curl、Postman、または送信側の仮実装）から `doPost` にJSONを送信し、`実行ログ` に受信内容が出力されること
- [ ] `PropertiesService` に `LAST_RECEIVED_AT` / `LAST_RECEIVED_BODY` が保存されていることを確認できること

---

## Phase 2: 送信側（Sender）の動的トリガー基本動作確認（自己完結）

### 目的

まずは「外部呼び出し」を含めず、**動的ワンタイムトリガーの作成・発火・自己削除**という基本メカニズムだけを送信側プロジェクト内で検証する。ここで以下を理解する。

- `ScriptApp.newTrigger(functionName).timeBased().after(ms).create()` で「指定ミリ秒後に1回だけ実行されるトリガー」を作成できる
- 作成したトリガーは自動では消えない。発火後に放置すると「トリガー一覧」に残り続けるため、発火した関数の中で**自分自身を削除する**処理が必要
- トリガーのユニークID（`trigger.getUniqueId()`）を `PropertiesService` に保存しておくと、発火時に「どのトリガーが自分なのか」を特定して削除できる

### タスク1：`11_Config.設定管理.gs`（Sender）

```javascript
/**
 * @file 11_Config.設定管理.gs
 * @description TriggerHandoffLab_Sender の設定・定数管理モジュール。
 *
 * ### スクリプトプロパティ一覧
 * | キー                  | 説明                                                |
 * |-----------------------|-----------------------------------------------------|
 * | RECEIVER_WEBAPP_URL   | 受信側(Receiver)のWeb AppデプロイURL（Phase3で使用） |
 * | PENDING_TRIGGER_ID    | 発火待ちの動的トリガーのユニークID（自己削除用）      |
 *
 * @version 1.0
 */

/** ダミー処理（メイン処理を模倣）の所要時間（ミリ秒） */
const DUMMY_PROCESS_DURATION_MS = 3000;

/** メイン処理完了からトリガー発火までの遅延時間（ミリ秒）。本番のGetInventoryDataでは数十秒を想定 */
const TRIGGER_DELAY_MS = 15 * 1000; // 15秒（検証用に短めに設定）

/**
 * 受信側(Receiver)のWeb App URLをスクリプトプロパティから取得する
 *
 * @return {string} 受信側のWeb App URL
 * @throws {Error} RECEIVER_WEBAPP_URL が未設定の場合
 */
function getReceiverWebAppUrl() {
    const url = PropertiesService.getScriptProperties().getProperty('RECEIVER_WEBAPP_URL');
    if (!url) {
        throw new Error('スクリプトプロパティ RECEIVER_WEBAPP_URL が設定されていません。Phase1で取得した受信側のWeb App URLを設定してください。');
    }
    return url;
}
```

### タスク2：`12_TriggerManager.トリガー管理.gs`（Sender）

このファイルが本検証プロジェクトの学習の核となる。汎用的に作ることで、将来本番プロジェクトへ移植しやすくする。

```javascript
/**
 * @file 12_TriggerManager.トリガー管理.gs
 * @description 動的ワンタイムトリガーの作成・削除・自己クリーンアップを担う汎用モジュール。
 * 「指定時間後に1回だけ実行し、実行後は自分自身を削除する」という挙動を
 * 安全に扱うための関数群を提供する。
 *
 * ### 設計方針
 * - トリガー作成時にユニークIDをスクリプトプロパティへ保存する
 * - トリガー発火後の関数は、必ず本ファイルの cleanupFiredTrigger() を呼び出して自己削除する
 * - 同じ関数に対するトリガーが重複して残らないよう、作成前に既存トリガーを確認する
 *
 * @version 1.0
 * @see scheduleOneTimeTrigger - 指定ミリ秒後に1回だけ発火するトリガーを作成
 * @see cleanupFiredTrigger    - 発火済みトリガーを自分自身で削除する
 * @see countTriggersFor       - 指定関数に紐づくトリガー数を確認する（デバッグ用）
 */

/**
 * 指定した関数を、指定ミリ秒後に1回だけ実行するトリガーを作成する
 *
 * 【処理フロー】
 * 1. 同名関数に紐づく既存のペンディングトリガーIDがプロパティに残っていないか確認する
 *    （残っている場合は、何らかの理由で前回削除されなかった可能性があるためログに警告を出す）
 * 2. ScriptApp.newTrigger().timeBased().after(delayMs).create() でトリガーを作成する
 * 3. 作成したトリガーのユニークIDをスクリプトプロパティ「PENDING_TRIGGER_ID」に保存する
 *
 * @param {string} functionName - トリガーで実行する関数名（このプロジェクト内の関数）
 * @param {number} delayMs - 何ミリ秒後に実行するか
 * @return {string} 作成したトリガーのユニークID
 * @throws {Error} トリガー作成に失敗した場合
 */
function scheduleOneTimeTrigger(functionName, delayMs) {
    const properties = PropertiesService.getScriptProperties();
    const existingId = properties.getProperty('PENDING_TRIGGER_ID');

    if (existingId) {
        console.warn('警告: 前回のペンディングトリガーID(' + existingId + ')が残っています。'
            + '前回の発火処理で自己削除に失敗した可能性があります。');
    }

    try {
        const trigger = ScriptApp.newTrigger(functionName)
            .timeBased()
            .after(delayMs)
            .create();

        const triggerId = trigger.getUniqueId();
        properties.setProperty('PENDING_TRIGGER_ID', triggerId);

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
 * トリガーで起動された関数の冒頭、または finally ブロックで必ず呼び出すこと。
 * これにより「トリガー一覧」にゴミが残り続けることを防ぐ。
 *
 * 【処理フロー】
 * 1. スクリプトプロパティから PENDING_TRIGGER_ID を取得する
 * 2. ID が存在しない場合は何もせず終了する（既に削除済み、または手動実行された場合）
 * 3. ScriptApp.getProjectTriggers() から該当IDのトリガーを検索し、見つかれば削除する
 * 4. 削除の成否に関わらず、スクリプトプロパティから PENDING_TRIGGER_ID を削除する
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
            console.warn('削除対象のトリガー(ID=' + triggerId + ')が見つかりませんでした。'
                + '既に削除済みの可能性があります。');
        }

    } catch (error) {
        console.error('トリガー削除中にエラーが発生しました: ' + error.message);

    } finally {
        // 削除の成否に関わらず、プロパティ上の参照はクリアする
        properties.deleteProperty('PENDING_TRIGGER_ID');
    }

    return deleted;
}

/**
 * 指定した関数名に紐づくトリガーの件数を取得する（デバッグ・テスト用）
 *
 * トリガーが正しく1件だけ作成・削除されているかを確認する目的で使用する。
 *
 * @param {string} functionName - 確認対象の関数名
 * @return {number} 該当関数に紐づくトリガーの件数
 */
function countTriggersFor(functionName) {
    const triggers = ScriptApp.getProjectTriggers();
    return triggers.filter(t => t.getHandlerFunction() === functionName).length;
}
```

### タスク3：`10_Main.エントリーポイント.gs`（Sender）— Phase2時点の実装

```javascript
/**
 * @file 10_Main.エントリーポイント.gs
 * @description TriggerHandoffLab_Sender のメインオーケストレーションモジュール。
 * Phase2時点では「ダミー処理の実行 → 動的トリガーの設定 → 発火確認」のみを行い、
 * 受信側への外部呼び出しはまだ実装しない（Phase3で追加する）。
 *
 * ### 処理フロー (runMainProcess)
 * 1. ダミー処理を実行（Utilities.sleepで疑似的な処理時間を再現）
 * 2. 完了後、12_TriggerManager.gs の scheduleOneTimeTrigger() でワンタイムトリガーを設定
 *
 * ### 処理フロー (onDelayedTrigger) ※トリガーから呼ばれる関数
 * 1. cleanupFiredTrigger() で自分自身のトリガーを削除（後始板）
 * 2. ログ出力のみ（Phase3でここに外部呼び出しを追加する）
 *
 * @version 1.0 (Phase2: 自己完結版)
 */

/**
 * メイン処理（ダミー）。本番の updateInventoryDataFromGoodsMaster() 等に相当する。
 *
 * 【処理フロー】
 * 1. 処理開始ログを出力
 * 2. DUMMY_PROCESS_DURATION_MS の間 sleep し、API呼び出し等の処理時間を模倣する
 * 3. 処理完了後、scheduleOneTimeTrigger() で「onDelayedTrigger」関数を
 *    TRIGGER_DELAY_MS 後に1回だけ実行するよう設定する
 *
 * @return {void}
 */
function runMainProcess() {
    console.log('=== メイン処理開始（ダミー） ===');
    const startTime = new Date();

    // ダミー処理：実際のAPI取得・書き込み処理時間を模倣
    Utilities.sleep(DUMMY_PROCESS_DURATION_MS);

    const duration = ((new Date() - startTime) / 1000).toFixed(1);
    console.log('=== メイン処理完了（処理時間: ' + duration + '秒） ===');

    // 動的ワンタイムトリガーを設定
    scheduleOneTimeTrigger('onDelayedTrigger', TRIGGER_DELAY_MS);
    console.log(TRIGGER_DELAY_MS + 'ms後に onDelayedTrigger が自動実行されます。');
}

/**
 * 動的トリガーから呼び出される関数（Phase2時点）
 *
 * 【処理フロー】
 * 1. cleanupFiredTrigger() を呼び出し、自分自身のトリガーを削除する
 * 2. 発火確認のログを出力する（Phase3で受信側への送信処理に拡張する）
 *
 * @return {void}
 */
function onDelayedTrigger() {
    console.log('=== onDelayedTrigger 発火 ===');
    console.log('発火時刻: ' + Utilities.formatDate(new Date(), 'JST', 'yyyy/MM/dd HH:mm:ss'));

    // 自己削除（後始末）
    cleanupFiredTrigger();

    console.log('Phase2: ここでは発火確認のみ。Phase3で受信側への送信処理を追加します。');
}
```

### Phase 2 完了条件

- [ ] `runMainProcess()` を手動実行し、ログに「メイン処理完了」「トリガー設定」が出力されること
- [ ] `TRIGGER_DELAY_MS` 後に `onDelayedTrigger()` が自動実行されること（実行数のログ画面で確認）
- [ ] `onDelayedTrigger()` 実行後、GASエディタの「トリガー」一覧に**トリガーが残っていない**ことを確認する（自己削除の成功確認）
- [ ] `countTriggersFor('onDelayedTrigger')` を実行し、`0` が返ることを確認する
- [ ] `runMainProcess()` を連続2回実行した場合に、警告ログ（前回のペンディングIDが残っている等）が出ないこと（出る場合は削除タイミングに問題がある）

---

## Phase 3: 送信側 → 受信側への接続（HTTP連携）

### 目的

Phase2で確立した「ワンタイムトリガーの発火」を使って、実際に受信側（Receiver）のWeb Appを呼び出す。

### タスク1：`13_Caller.外部呼び出し.gs`（Sender）

```javascript
/**
 * @file 13_Caller.外部呼び出し.gs
 * @description 受信側(Receiver)のWeb Appを呼び出すためのHTTP通信モジュール。
 * UrlFetchAppを用いてPOSTリクエストを送信する。
 *
 * ### 依存関係
 * - 参照先: 11_Config.設定管理.gs (getReceiverWebAppUrl)
 *
 * @version 1.0
 * @see callReceiverWebApp - 受信側Web AppへPOSTリクエストを送信する
 */

/**
 * 受信側(Receiver)のWeb AppへPOSTリクエストを送信する
 *
 * 【処理フロー】
 * 1. getReceiverWebAppUrl() でURLを取得する
 * 2. 送信するペイロード（実行時刻・送信元識別子等）をJSON化する
 * 3. UrlFetchApp.fetch() でPOSTリクエストを送信する（muteHttpExceptions: true）
 * 4. ステータスコードが200の場合は成功として応答内容を返す
 * 5. それ以外はエラーとしてログ出力後にスローする
 *
 * @param {Object} payload - 送信するデータオブジェクト
 * @return {{success: boolean, statusCode: number, body: string}} レスポンス情報
 * @throws {Error} 通信エラーまたは異常なステータスコードの場合
 */
function callReceiverWebApp(payload) {
    const url = getReceiverWebAppUrl();

    const options = {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    console.log('受信側Web Appへ送信中... URL=' + url);
    console.log('送信内容: ' + JSON.stringify(payload));

    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    const body = response.getContentText();

    if (statusCode === 200) {
        console.log('送信成功: ステータス=' + statusCode + ', レスポンス=' + body);
        return { success: true, statusCode: statusCode, body: body };
    } else {
        const errorMsg = '受信側Web App呼び出しエラー: ステータス=' + statusCode + ', 内容=' + body;
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
}
```

### タスク2：`10_Main.エントリーポイント.gs`（Sender）— `onDelayedTrigger` の拡張

既存の `onDelayedTrigger()` 内のログ出力部分を以下のように置き換える（追記ではなく、Phase2で仮置きしたログ部分の置換）。

**変更前：**

```javascript
    // 自己削除（後始末）
    cleanupFiredTrigger();

    console.log('Phase2: ここでは発火確認のみ。Phase3で受信側への送信処理を追加します。');
```

**変更後：**

```javascript
    // 自己削除（後始末）
    cleanupFiredTrigger();

    // 受信側Web Appへ送信
    try {
        const payload = {
            source: 'TriggerHandoffLab_Sender',
            firedAt: new Date().toISOString(),
            message: '動的トリガー経由での送信テスト'
        };

        callReceiverWebApp(payload);

    } catch (error) {
        console.error('受信側への送信に失敗しました: ' + error.message);
        // Phase4でリトライ処理を追加する
    }
```

関数ヘッダーのJSDocコメントも、Phase3版の処理内容に合わせて更新すること（「2. 発火確認のログを出力する」を「2. 受信側Web Appへ payload を送信する」に修正）。

### Phase 3 完了条件

- [ ] 送信側のスクリプトプロパティ `RECEIVER_WEBAPP_URL` に、Phase1で取得した受信側URLが設定されていること
- [ ] `runMainProcess()` を実行し、`TRIGGER_DELAY_MS` 後に受信側へPOSTリクエストが届くこと
- [ ] 受信側の実行ログに送信内容（`source`, `firedAt`, `message`）が正しく出力されること
- [ ] 受信側のスクリプトプロパティ `LAST_RECEIVED_AT` / `LAST_RECEIVED_BODY` が更新されること
- [ ] 送信側のトリガー一覧に処理後トリガーが残っていないこと（Phase2と同様に確認）

---

## Phase 4: 信頼性向上（重複防止・自己削除・リトライ）

### 目的

実運用を想定し、以下の3点を強化する。

1. **重複トリガー防止**：何らかの理由で `runMainProcess()` が短時間に複数回実行された場合に、トリガーが多重に作成されないようにする
2. **送信失敗時のリトライ**：受信側が一時的に応答しない場合に備え、既存の `callSupabaseRpc()` と同様の指数バックオフでリトライする
3. **トリガー削除の保証**：`onDelayedTrigger()` 内で例外が発生しても、必ず `cleanupFiredTrigger()` が呼ばれるようにする（`try-finally` の徹底）

### タスク1：`scheduleOneTimeTrigger()` の重複防止強化（`12_TriggerManager.トリガー管理.gs`）

既存の警告ログのみだった処理を、実際に「既存の同名トリガーを削除してから新規作成する」処理に変更する。

```javascript
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
    // 同名関数に紐づく既存トリガーを先に削除（重複防止）
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
```

### タスク2：`callReceiverWebApp()` のリトライ対応（`13_Caller.外部呼び出し.gs`）

既存の `13_NextEngineAPI.API通信.gs` の `getBatchStockDataWithRetry()` と同じ指数バックオフのパターンを流用する。

```javascript
/** リトライ設定（受信側Web App呼び出し用） */
const CALLER_RETRY_CONFIG = {
    MAX_RETRIES: 3,
    ENABLE_RETRY: true
};

/**
 * 受信側(Receiver)のWeb AppへPOSTリクエストを送信する（リトライ付き）
 *
 * 【処理フロー】
 * 1. callReceiverWebApp() を呼び出す
 * 2. 失敗した場合、最大 CALLER_RETRY_CONFIG.MAX_RETRIES 回まで
 *    エクスポネンシャルバックオフ（1秒→2秒→4秒）でリトライする
 * 3. 全リトライが失敗した場合はエラーをスローする
 *
 * @param {Object} payload - 送信するデータオブジェクト
 * @return {{success: boolean, statusCode: number, body: string}} レスポンス情報
 * @throws {Error} 全リトライが失敗した場合
 */
function callReceiverWebAppWithRetry(payload) {
    if (!CALLER_RETRY_CONFIG.ENABLE_RETRY) {
        return callReceiverWebApp(payload);
    }

    let lastError = null;

    for (let attempt = 1; attempt <= CALLER_RETRY_CONFIG.MAX_RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                console.log('  リトライ ' + attempt + '/' + CALLER_RETRY_CONFIG.MAX_RETRIES + '回目...');
            }
            return callReceiverWebApp(payload);

        } catch (error) {
            lastError = error;
            console.error('  ✗ 送信エラー（試行 ' + attempt + '/' + CALLER_RETRY_CONFIG.MAX_RETRIES + '）: ' + error.message);

            if (attempt < CALLER_RETRY_CONFIG.MAX_RETRIES) {
                const waitSeconds = Math.pow(2, attempt - 1);
                console.log('  → ' + waitSeconds + '秒後にリトライします...');
                Utilities.sleep(waitSeconds * 1000);
            }
        }
    }

    throw new Error('受信側への送信に失敗しました（' + CALLER_RETRY_CONFIG.MAX_RETRIES + '回試行）: ' + lastError.message);
}
```

`10_Main.エントリーポイント.gs` 内の `callReceiverWebApp(payload)` 呼び出しを `callReceiverWebAppWithRetry(payload)` に置き換える。

### タスク3：`onDelayedTrigger()` の try-finally 徹底

```javascript
function onDelayedTrigger() {
    console.log('=== onDelayedTrigger 発火 ===');
    console.log('発火時刻: ' + Utilities.formatDate(new Date(), 'JST', 'yyyy/MM/dd HH:mm:ss'));

    try {
        const payload = {
            source: 'TriggerHandoffLab_Sender',
            firedAt: new Date().toISOString(),
            message: '動的トリガー経由での送信テスト（リトライ対応版）'
        };

        callReceiverWebAppWithRetry(payload);

    } catch (error) {
        console.error('受信側への送信に失敗しました（リトライ含め全て失敗）: ' + error.message);
        // 本番適用時はここでメール通知等を検討する

    } finally {
        // 送信の成否に関わらず、必ず自分自身のトリガーを削除する
        cleanupFiredTrigger();
    }
}
```

### Phase 4 完了条件

- [ ] `runMainProcess()` を短時間に2回連続実行しても、トリガーが2重に作成されないこと（`countTriggersFor('onDelayedTrigger')` が常に0または1であることを確認）
- [ ] 受信側のWeb AppデプロイURLを一時的に誤った値に変更し、送信が3回リトライされてエラーログが出ることを確認する（その後正しいURLに戻す）
- [ ] リトライ失敗時にも `cleanupFiredTrigger()` が実行され、トリガーが残らないことを確認する
- [ ] `99_Tests.テスト.gs`（Sender/Receiver両方）に、上記確認を自動化するテスト関数が追加されていること

### タスク4：`99_Tests.テスト.gs`（Sender）の参考実装

```javascript
/**
 * 動的トリガーの重複防止・自己削除を検証するテスト
 *
 * 【処理フロー】
 * 1. runMainProcess() を意図的に2回連続実行する
 * 2. countTriggersFor('onDelayedTrigger') が 1 以下であることを確認する
 * 3. TRIGGER_DELAY_MS + 5秒待機後、トリガーが0件になっていることを確認する
 *    （GASの実行時間制限に注意し、待機が長すぎる場合は手動で再実行して確認すること）
 */
function testTriggerDeduplication() {
    console.log('=== 重複防止テスト ===');

    runMainProcess();
    runMainProcess(); // 意図的に連続実行

    const count = countTriggersFor('onDelayedTrigger');
    console.log('現在のトリガー数: ' + count + ' (期待値: 1以下)');

    if (count > 1) {
        console.error('❌ 重複防止が機能していません');
    } else {
        console.log('✓ 重複防止は正常に機能しています');
    }
}
```

---

## Phase 5: 本番プロジェクトへの適用方針整理

### 目的

Phase1〜4で得た知見を、実際の `GetInventoryData` と `DistributeInventory` にどう適用するかを整理する。**このPhaseではコードの変更は行わない**（ドキュメント作成のみ）。

### タスク：適用方針メモの作成

以下の観点を整理したメモ（Markdown）を作成する。

1. **どちらが送信側／受信側になるか**
   - 送信側＝ `GetInventoryData`（`updateInventoryDataFromGoodsMaster()` / `updateInventoryDataBatchWithRetry()` の末尾）
   - 受信側＝ `DistributeInventory`（`distributeInventoryChanges()` をWeb App経由で呼べるようにする）

2. **DistributeInventory側に必要な変更**
   - 現在の `distributeInventoryChanges()` は時間主導型トリガーのみで起動している
   - Web Appとして公開し、`doPost(e)` から `distributeInventoryChanges()` を呼び出す関数を新設する必要がある
   - 既存の時間主導型トリガー（`トリガー設定.gs`）と動的トリガー起動を併用するか、動的トリガーのみに一本化するかを検討する

3. **GetInventoryData側に必要な変更**
   - `12_TriggerManager.トリガー管理.gs` 相当のファイルを新規追加（本Labのものをほぼそのまま移植可能）
   - `updateInventoryDataBatchWithRetry()` の末尾（`recordExecutionTimestamp()` の直後）で `scheduleOneTimeTrigger('callDistributeInventory', 30000)` のように設定
   - `updateInventoryDataFromGoodsMaster()` も同様に末尾へ追加するか検討（商品マスタ更新後も配布が必要かどうかによる）

4. **遅延時間（TRIGGER_DELAY_MS）の決定**
   - 本Labでは15秒で検証したが、本番では実処理時間のばらつきを考慮し、30秒程度を初期値として様子を見る
   - リトライ機構があるため、多少早すぎてもリトライで吸収できる設計にしておくと安全

5. **既存の固定時刻トリガー（トリガー設定.gs）の扱い**
   - 動的トリガー方式が安定稼働するまでは、既存の固定時刻トリガーを「フェイルセーフ」として残しておくことを推奨する
   - 安定稼働を確認できた後に、固定時刻トリガーを削除する

### Phase 5 完了条件

- [ ] 上記5項目を整理したメモが作成されていること
- [ ] 本番への適用は別途、新しい指示書（Phase A以降）として切り出して着手すること（本検証プロジェクトの指示書はここで完了とする）

---

## 4. 完了条件チェックリスト（全体）

- [ ] Phase1〜4が全て完了し、各完了条件を満たしていること
- [ ] 送信側・受信側それぞれのGASプロジェクトが、エラーなく一連の流れ（メイン処理→トリガー発火→HTTP送信→受信）を実行できること
- [ ] トリガーの蓄積（ゴミ）が発生しないことを複数回の実行で確認できていること
- [ ] Phase5の適用方針メモが作成されていること

## 5. 実装しないこと（スコープ外）

- 本番の `GetInventoryData` / `DistributeInventory` のコード変更（このLabでは一切行わない）
- 受信側Web Appの認証強化（トークン検証等）。学習目的のため今回は省略するが、本番適用時には検討が必要であることをPhase5のメモに明記すること
- 複数の受信先への同時配信（本Labでは送信先は1つのみ）

---

*以上がTriggerHandoffLab（動的ワンタイムトリガー学習検証プロジェクト）の指示書です。*
*各Phase完了時にヒデノリさんへ動作確認結果を報告し、確認を得てから次のPhaseに進んでください。*
