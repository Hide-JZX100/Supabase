# 開発指示書：Phase 1 - Supabase接続レイヤー実装

**プロジェクト名：** NE_在庫情報取得（ネクストエンジン × Supabase 連携）  
**対象フェーズ：** Phase 1  
**目的：** GAS → Supabase への接続を共通モジュールとして実装する

---

## 1. プロジェクト概要

ネクストエンジン（以下 NE）の在庫情報を Google Apps Script（GAS）で取得し、  
従来のスプレッドシートへの書き込みに加えて **Supabase（PostgreSQL）へも保存する**ための  
接続レイヤーを新規実装する。

### 1-1. 既存プロジェクトの構成

```
00_認証.gs                          ← NE OAuth2認証（認証ライブラリ使用）
10_Main.エントリーポイント.gs        ← メイン処理・オーケストレーション
11_Config.設定管理.gs               ← 定数・設定値・トークン取得
12_Logger.ログ管理.gs               ← ログ出力・リトライ統計管理
13_NextEngineAPI.API通信.gs         ← NE API HTTPリクエスト
14_InventoryLogic.ビジネスロジック.gs ← 在庫データ取得・整形
15_SpreadsheetRepository.データ永続化.gs ← スプレッドシート書き込み
トリガー設定.gs                      ← 時間ベーストリガー管理
99_Tests.テスト.gs                   ← 動作確認・診断ツール
```

### 1-2. Phase 1 で追加・更新するファイル

```
16_SupabaseClient.Supabase接続.gs   ← 【新規作成】Supabase接続・RPC汎用層
11_Config.設定管理.gs               ← 【追記】Supabase設定プロパティを追加
99_Tests.テスト.gs                   ← 【追記】Supabase接続テスト関数を追加
```

---

## 2. コーディング規約

既存ファイルの規約に厳密に従うこと。

### 2-1. ファイルヘッダー（必須）

```javascript
/**
 * @file 16_SupabaseClient.Supabase接続.gs
 * @description （このファイルの目的・役割を記述）
 *
 * ### 依存関係
 * - **参照元**: （このファイルを呼び出すファイル）
 * - **参照先**: （このファイルが使う定数・関数）
 *
 * ### 主要関数
 * @see getSupabaseConfig
 * @see callSupabaseRpc
 *
 * @version 1.0
 */
```

### 2-2. 関数ヘッダー（必須）

```javascript
/**
 * 関数の目的を1行で記述
 *
 * 【処理フロー】（複数ステップある場合）
 * 1. ステップ1
 * 2. ステップ2
 *
 * @param {型} 引数名 - 説明
 * @return {型} 説明
 * @throws {Error} エラーが発生する条件
 */
```

### 2-3. ログ出力

エラーログは既存の `logError()` 関数（12_Logger.ログ管理.gs）を使うこと。

```javascript
// ✅ 正しい
logError(`Supabase RPC 呼び出しエラー (${functionName}):`, error.message);

// ❌ 使わない
console.error('...');
```

### 2-4. エラーハンドリング

エラーは `try-catch` でキャッチし、`logError()` でログ記録後に `throw` で再スローすること。  
呼び出し元がエラーを受け取れるようにする。

### 2-5. スクリプトプロパティの取得パターン

既存の `getSpreadsheetConfig()`（11_Config.設定管理.gs）を参考にすること。

```javascript
function getXxxConfig() {
    const properties = PropertiesService.getScriptProperties();
    const value = properties.getProperty('KEY_NAME');

    if (!value) {
        throw new Error('必要なスクリプトプロパティが設定されていません。...');
    }

    return { value };
}
```

---

## 3. スクリプトプロパティの追加（手動設定が必要）

GASエディタの「プロジェクトの設定」→「スクリプトプロパティ」に以下を追加すること。  
コードには値をハードコードせず、必ずプロパティから取得すること。

| キー | 値の説明 |
|------|----------|
| `SUPABASE_URL` | SupabaseプロジェクトのURL（例: `https://xxxxxxxx.supabase.co`）|
| `SUPABASE_KEY` | Supabaseの anon key（publishable key）|

---

## 4. 実装タスク詳細

---

### タスク1：`16_SupabaseClient.Supabase接続.gs` 新規作成

**このファイルの責務：** Supabase REST API への接続と RPC 呼び出しのみ。  
ビジネスロジックやデータ整形は含めない。

#### 実装する関数

**① `getSupabaseConfig()`**

- スクリプトプロパティから `SUPABASE_URL` と `SUPABASE_KEY` を取得する
- いずれかが未設定の場合はエラーをスロー
- 返却値: `{ url: string, key: string }`

**② `callSupabaseRpc(functionName, params)`**

- Supabase の RPC エンドポイントを呼び出す汎用関数
- エンドポイント URL の形式: `{SUPABASE_URL}/rest/v1/rpc/{functionName}`
- HTTPリクエストの仕様は下記「Supabase REST API 仕様」を参照
- ステータスコード 200 または 204 を正常とする
- それ以外はエラーとして `logError()` でログ出力後にスロー
- 返却値: `{ success: boolean, statusCode: number, body: string }`

#### Supabase REST API 仕様

```
メソッド : POST
エンドポイント: {SUPABASE_URL}/rest/v1/rpc/{functionName}
ヘッダー:
  Content-Type  : application/json
  apikey        : {SUPABASE_KEY}
  Authorization : Bearer {SUPABASE_KEY}
ボディ: JSON.stringify(params)
muteHttpExceptions: true  ← エラー詳細をログに残すため必須
```

#### 参考：動作確認済みのテストスクリプト（testSupabaseRpc.gs より）

```javascript
// このコードをそのまま使うのではなく、実装パターンの参考にすること
const options = {
    "method": "post",
    "contentType": "application/json",
    "headers": {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY
    },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
};
const response = UrlFetchApp.fetch(url, options);
const responseCode = response.getResponseCode();
const responseText = response.getContentText();

if (responseCode === 200 || responseCode === 204) {
    // 成功
} else {
    // エラー
}
```

#### ファイル全体のイメージ

```javascript
/**
 * @file 16_SupabaseClient.Supabase接続.gs
 * @description Supabase接続・RPC呼び出し汎用モジュール。
 * （以下、規約に従ったヘッダーを記述）
 */

/**
 * Supabase接続設定を取得
 */
function getSupabaseConfig() { ... }

/**
 * Supabase RPC関数を呼び出す汎用ラッパー
 * @param {string} functionName - 呼び出すPostgreSQL関数名
 * @param {Object} params - 関数に渡す引数オブジェクト
 * @return {Object} { success, statusCode, body }
 */
function callSupabaseRpc(functionName, params) { ... }
```

---

### タスク2：`11_Config.設定管理.gs` に追記

既存のファイル末尾に以下の内容を追記する（既存コードは一切変更しない）。

追記すべき内容：

1. ファイル冒頭の `@file` JSDoc に Supabase 関連プロパティを追記
2. ファイル末尾に `getSupabaseConfig()` の**参照先**として `16_SupabaseClient.Supabase接続.gs` を示すコメントを追加

追記する箇所のイメージ：

```javascript
// ============================================================================
// Supabase設定（16_SupabaseClient.Supabase接続.gs で使用）
// ============================================================================
// スクリプトプロパティ:
//   SUPABASE_URL : SupabaseプロジェクトURL
//   SUPABASE_KEY : Supabase anon key（publishable key）
// ============================================================================
```

---

### タスク3：`99_Tests.テスト.gs` に追記

既存ファイルの末尾に以下の2つの関数を追記する（既存コードは変更しない）。

#### ① `testSupabaseConnection()`

**目的：** Supabase への接続と `getSupabaseConfig()` の動作確認

- `getSupabaseConfig()` を呼び出し、URL と KEY が取得できるか確認する
- KEY は末尾5文字のみ表示（セキュリティのため全文は表示しない）
- 例: `✅ SUPABASE_URL: https://xxxxxxxx.supabase.co`
- 例: `✅ SUPABASE_KEY: 末尾5文字 = ...xxxxx`

#### ② `testSupabaseRpcCall()`

**目的：** `callSupabaseRpc()` と `upsert_ne_inventory_data` RPC の動作確認

- 動作確認済みのテストスクリプト（`testSupabaseRpc.gs`）の内容を統合・整理したもの
- テスト用ダミーデータ1件でRPCを呼び出す
- ダミーデータは以下の形式で用意する

```javascript
// テスト用ダミーデータ
const dummyData = [
    {
        "商品コード": "TEST-ITEM-001",
        "商品名": "テスト商品（Supabase接続確認用）",
        "在庫数": 10,
        "引当数": 2,
        "フリー在庫数": 8,
        "予約在庫数": 0,
        "予約引当数": 0,
        "予約フリー在庫数": 0,
        "不良在庫数": 0,
        "発注残数": 0,
        "欠品数": 0,
        "JANコード": 1234567890123  // ← 数値型（BIGINT）で渡すこと
    }
];

// RPC呼び出し時のパラメータ形式
const params = { "json_data": dummyData };
```

- `callSupabaseRpc('upsert_ne_inventory_data', params)` を呼び出す
- 成功・失敗それぞれコンソールに分かりやすく出力する
- 実行後に Supabase ダッシュボードでテストデータを確認するよう促すメッセージを出力する

---

## 5. JANコードの型について（重要）

Supabase テーブルの `JANコード` 列は `BIGINT` 型で定義されている。  
GAS から送信するデータでは、以下のルールに従うこと。

| 条件 | 送信する値 |
|------|----------|
| JANコードが存在する | 数値型（整数）で送信 例: `1234567890123` |
| JANコードが空文字・null・undefined | `null` で送信（文字列の `""` は不可）|

変換ロジックの参考：

```javascript
// JANコードをBIGINT対応の値に変換する
// Phase 2 で 17_SupabaseRepository.Supabase永続化.gs に実装予定
// このフェーズでは意識しておく程度でよい
const janCode = item.goods_jan_code;
const janCodeValue = (janCode && janCode !== '') ? parseInt(janCode, 10) : null;
```

---

## 6. Supabase テーブル・RPC 仕様

### テーブル名
```
public."NE_InventoryData"
```

### テーブル列定義

| 列名 | 型 | 備考 |
|------|----|------|
| 商品コード | TEXT | PRIMARY KEY |
| 商品名 | TEXT | |
| 在庫数 | INTEGER | |
| 引当数 | INTEGER | |
| フリー在庫数 | INTEGER | |
| 予約在庫数 | INTEGER | |
| 予約引当数 | INTEGER | |
| 予約フリー在庫数 | INTEGER | |
| 不良在庫数 | INTEGER | |
| 発注残数 | INTEGER | |
| 欠品数 | INTEGER | |
| JANコード | BIGINT | NULLあり |
| 更新日時 | TIMESTAMP | RPC内で `NOW()` を自動セット |

### RPC 関数名
```
upsert_ne_inventory_data
```

### RPC 引数

| 引数名 | 型 |
|--------|----|
| `json_data` | JSONB（上記テーブル列と対応するオブジェクトの配列）|

### RPC の動作仕様

- 受け取ったデータを `NE_InventoryData` テーブルに INSERT する
- `商品コード` が既存の場合は UPDATE（UPSERT）
- **在庫数・引当数・フリー在庫数・欠品数のいずれかに差分がある場合のみ `更新日時` を更新する**
- 差分がない場合は `更新日時` を変更しない（過去の日時を維持する）

---

## 7. 完了条件

以下をすべて満たした状態を Phase 1 完了とする。

- [ ] `16_SupabaseClient.Supabase接続.gs` が作成されている
- [ ] `getSupabaseConfig()` がスクリプトプロパティから URL/KEY を正しく取得できる
- [ ] `callSupabaseRpc()` が Supabase RPC を呼び出せる
- [ ] `11_Config.設定管理.gs` に Supabase プロパティの説明コメントが追記されている
- [ ] `99_Tests.テスト.gs` に `testSupabaseConnection()` と `testSupabaseRpcCall()` が追記されている
- [ ] `testSupabaseRpcCall()` を実行してステータスコード 200 または 204 が返ること
- [ ] Supabase ダッシュボードの `NE_InventoryData` テーブルにテストデータが書き込まれていること
- [ ] 既存ファイルのコードが一切変更されていないこと（追記のみ）

---

## 8. 実装しないこと（スコープ外）

以下は Phase 2 以降で実装する。このフェーズでは手をつけないこと。

- NE API からのデータ取得（13_NextEngineAPI.API通信.gs）
- Supabase へのデータ整形・変換（17_SupabaseRepository.Supabase永続化.gs）
- スプレッドシートへの書き込み変更（15_SpreadsheetRepository.データ永続化.gs）
- `10_Main.エントリーポイント.gs` の変更

---

## 9. 参考：既存コードのパターン（規約確認用）

### 既存の設定取得関数（11_Config.設定管理.gs より抜粋）

```javascript
/**
 * スプレッドシート設定を取得
 */
function getSpreadsheetConfig() {
    const properties = PropertiesService.getScriptProperties();
    const SPREADSHEET_ID = properties.getProperty('SPREADSHEET_ID');
    const SHEET_NAME = properties.getProperty('SHEET_NAME');

    if (!SPREADSHEET_ID || !SHEET_NAME) {
        throw new Error('スプレッドシート設定が不完全です。...');
    }

    return {
        SPREADSHEET_ID,
        SHEET_NAME
    };
}
```

### 既存のエラーログ（12_Logger.ログ管理.gs より）

```javascript
/**
 * エラーログ出力（標準）
 */
function logError(message, ...args) {
    if (args.length > 0) {
        console.error(message, ...args);
    } else {
        console.error(message);
    }
}
```

---

*以上が Phase 1 の実装指示書です。*  
*疑問点があれば実装前に確認してください。*
