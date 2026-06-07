# 開発指示書：Phase 5 - 全体リファクタリング・整理

**プロジェクト名：** NE_在庫情報取得（ネクストエンジン × Supabase 連携）  
**対象フェーズ：** Phase 5（最終フェーズ）  
**前提：** Phase 1〜4 が完了していること  
**目的：** 不要ファイルの削除・README の更新・ヘッダーコメントの整備により、プロジェクト全体を完成形に整える

---

## 1. フェーズ概要

Phase 5 はコードの新規実装を行わない。  
以下の3つの作業でプロジェクトを最終的な完成形に整える。

```
作業1: 不要ファイルの削除
作業2: README.md の全面更新
作業3: 各ファイルのヘッダーコメント最終整備
```

---

## 2. 作業1：不要ファイルの削除

以下のファイルを削除する。  
いずれも Phase 1〜3 で完成したモジュール群（`10_〜17_`）に機能が統合済みである。

### 削除対象ファイル

| ファイル名 | 削除理由 |
|-----------|----------|
| `在庫情報取得_一括処理版.gs` | `13_`・`14_`・`15_` に統合済み |
| `在庫情報_一括取得リトライ版.gs` | `10_Main` および `13_` に統合済み |
| `NE_在庫情報取得_ライブラリ試験.gs` | `00_認証ライブラリ使用必須関数.gs` に置き換え済み |
| `testSupabaseRpc.gs` | Phase 1 で `99_Tests.テスト.gs` に統合済み |
| `Old/Step1_1_ログ機能.gs` | `12_Logger.ログ管理.gs` に統合済み |
| `Old/在庫情報取得.gs` | モジュール構造に置き換え済み |
| `Old/在庫情報取得_高速版.gs` | モジュール構造に置き換え済み |

### 削除後に残るファイル構成

```
【GAS スクリプトファイル】
00_認証ライブラリ使用必須関数.gs
10_Main.エントリーポイント.gs
11_Config.設定管理.gs
12_Logger.ログ管理.gs
13_NextEngineAPI.API通信.gs
14_InventoryLogic.ビジネスロジック.gs
15_SpreadsheetRepository.データ永続化.gs
16_SupabaseClient.Supabase接続.gs        ← Phase 1 で新規作成
17_SupabaseRepository.Supabase永続化.gs  ← Phase 2〜4 で新規作成
トリガー設定.gs
99_Tests.テスト.gs

【ドキュメント・参照ファイル】
README.md                                 ← Phase 5 で全面更新
NE_商品マスタ検索_フィールド一覧.txt      ← 保持（API参照資料）
NE_在庫マスタ検索_フィールド一覧.txt      ← 保持（API参照資料）
_NE_在庫情報取得.txt                      ← 保持（プロジェクト名記録）

【SQL ファイル（参照用）】
upsert_ne_inventory_data.sql              ← 保持（Supabase RPC定義）
upsert_ne_stock_data.sql                  ← 保持（Supabase RPC定義・Phase 3で作成）
```

---

## 3. 作業2：README.md の全面更新

既存の README.md を以下の内容で**全面的に書き直す**。  
既存内容との差分ではなく、下記をそのまま新しい README.md として保存すること。

---

```markdown
# NE_在庫情報取得

## 概要
ネクストエンジン（NE）の商品・在庫データを Google Apps Script（GAS）で取得し、
Google スプレッドシートおよび **Supabase（PostgreSQL）** に同期する自動化プロジェクトです。

認証には NEAuth ライブラリ（`認証_ライブラリ.gs`）を使用しています。
スプレッドシートは既存の IMPORTRANGE 連携を維持しつつ、
Supabase を新たなデータストアとして追加した二重書き込み構成で運用します。

---

## アーキテクチャ

```
ネクストエンジン API
    │
    ↓（GAS が定期取得）
Google Apps Script（本プロジェクト）
    │
    ├─→ Google スプレッドシート（IMPORTRANGE 連携を維持）
    │
    └─→ Supabase / NE_InventoryData テーブル
              │
              └─→ 別プロジェクト・外部システムへの連携（将来）
```

---

## 主な機能

### 1. 商品マスタ全件同期（1日1回 / 0:10 実行）
**実行関数：** `updateInventoryDataFromGoodsMaster`

- NE 商品マスタ API（`/api_v1_master_goods/search`）から全件取得
- ロケーションに `xxxxxx` を含む商品を除外（空欄は取得対象）
- スプレッドシートと Supabase の **両方** に全件書き直し
- ページネーション対応（1,000件 × 最大5ページ）
- 実行完了後に翌日分トリガーを自動登録（自己スケジューリング方式）

### 2. 在庫情報リアルタイム更新（1日6回）
**実行関数：** `updateInventoryDataBatchWithRetry`

- NE 在庫マスタ API（`/api_v1_master_stock/search`）から在庫情報を取得
- スプレッドシートと Supabase の **両方** に在庫数値を更新
- Supabase 側は在庫数値列のみ更新（商品名・JANコードは変更しない）
- 在庫数・引当数・フリー在庫数・欠品数のいずれかに変化がある場合のみ `更新日時` を更新
- 1,000件バッチ処理（約3,200件を約18秒で処理）
- エクスポネンシャルバックオフによる自動リトライ（最大3回）

### 3. 差分取得機能
**提供関数：** `getChangedInventorySince(since)`

- 指定日時以降に `更新日時` が更新された商品のみを Supabase から取得
- `saveLastExecutedAt()` / `loadLastExecutedAt()` で前回実行日時を管理
- 将来の外部連携・通知処理の基盤として利用可能

---

## 取得項目一覧

| 列 | 項目名 | フィールド名 | 更新元 |
|----|--------|-------------|--------|
| A | 商品コード | goods_id | 商品マスタ |
| B | 商品名 | goods_name | 商品マスタ |
| C | 在庫数 | stock_quantity | 商品マスタ / 在庫マスタ |
| D | 引当数 | stock_allocation_quantity | 商品マスタ / 在庫マスタ |
| E | フリー在庫数 | stock_free_quantity | 商品マスタ / 在庫マスタ |
| F | 予約在庫数 | stock_advance_order_quantity | 商品マスタ / 在庫マスタ |
| G | 予約引当数 | stock_advance_order_allocation_quantity | 商品マスタ / 在庫マスタ |
| H | 予約フリー在庫数 | stock_advance_order_free_quantity | 商品マスタ / 在庫マスタ |
| I | 不良在庫数 | stock_defective_quantity | 商品マスタ / 在庫マスタ |
| J | 発注残数 | stock_remaining_order_quantity | 商品マスタ / 在庫マスタ |
| K | 欠品数 | stock_out_quantity | 商品マスタ / 在庫マスタ |
| L | JANコード | goods_jan_code | 商品マスタ |
| - | 更新日時 | - | Supabase（RPC内で自動セット）|

---

## ファイル構成

| ファイル | 役割 |
|---------|------|
| `00_認証ライブラリ使用必須関数.gs` | NE OAuth2 認証・doGet・トークン更新 |
| `10_Main.エントリーポイント.gs` | エントリーポイント・処理オーケストレーション |
| `11_Config.設定管理.gs` | 定数・設定値・トークン取得 |
| `12_Logger.ログ管理.gs` | ログ出力・リトライ統計管理 |
| `13_NextEngineAPI.API通信.gs` | NE API への HTTP リクエスト・トークン更新 |
| `14_InventoryLogic.ビジネスロジック.gs` | 在庫データ取得・整形 |
| `15_SpreadsheetRepository.データ永続化.gs` | スプレッドシートへの書き込み・ログ記録 |
| `16_SupabaseClient.Supabase接続.gs` | Supabase 接続・RPC 呼び出し・REST API 汎用層 |
| `17_SupabaseRepository.Supabase永続化.gs` | Supabase へのデータ書き込み・差分取得 |
| `トリガー設定.gs` | 時間ベーストリガーの登録・削除 |
| `99_Tests.テスト.gs` | 動作確認・診断ツール |

---

## Supabase 構成

### テーブル

| テーブル名 | 用途 |
|-----------|------|
| `public."NE_InventoryData"` | 在庫情報の保存先 |

### RPC 関数

| 関数名 | 呼び出し元 | 用途 |
|--------|-----------|------|
| `upsert_ne_inventory_data` | `updateInventoryDataFromGoodsMaster` | 商品マスタ全件 upsert（全列更新） |
| `upsert_ne_stock_data` | `updateInventoryDataBatchWithRetry` | 在庫マスタ差分 upsert（在庫数値列のみ更新） |

### 差分更新の仕組み

両 RPC 関数とも、以下の列に変化がある場合のみ `更新日時` を更新する。

- 在庫数
- 引当数
- フリー在庫数
- 欠品数

変化がない商品は `更新日時` を変更しない。  
これにより `getChangedInventorySince()` で実際に在庫が変化した商品のみを効率的に取得できる。

---

## スクリプトプロパティ設定

GAS エディタの「プロジェクトの設定」→「スクリプトプロパティ」に以下を設定する。

### NE API 認証

| キー | 値 |
|------|----|
| `CLIENT_ID` | ネクストエンジン クライアントID |
| `CLIENT_SECRET` | ネクストエンジン クライアントシークレット |
| `REDIRECT_URI` | GAS Web アプリのデプロイ URL |
| `ACCESS_TOKEN` | NE アクセストークン（認証後に自動保存） |
| `REFRESH_TOKEN` | NE リフレッシュトークン（認証後に自動保存） |

### スプレッドシート

| キー | 値 |
|------|----|
| `SPREADSHEET_ID` | 在庫データスプレッドシートの ID |
| `SHEET_NAME` | 在庫データシート名 |
| `LOG_SHEET_NAME` | 実行タイムスタンプ記録シート名 |

### Supabase

| キー | 値 |
|------|----|
| `SUPABASE_URL` | `https://xxxxxxxx.supabase.co` |
| `SUPABASE_KEY` | Supabase anon key（publishable key） |
| `SUPABASE_LAST_EXECUTED_AT` | 最終差分取得日時（自動保存・手動設定不要） |

### トリガー制御

| キー | 値 |
|------|----|
| `TRIGGER_FUNCTION_NAME` | `updateInventoryDataFromGoodsMaster` または `updateInventoryDataBatchWithRetry` |
| `TRIGGER_MODE` | `TODAY` または `TOMORROW` |
| `LOG_LEVEL` | `1`（MINIMAL）/ `2`（SUMMARY）/ `3`（DETAILED） |
| `TEST_SPREADSHEET_ID` | テスト用スプレッドシートの ID |

---

## トリガー構成

| 時刻 | 関数 | 目的 |
|------|------|------|
| 0:10 | `updateInventoryDataFromGoodsMaster` | 商品マスタ全件同期 |
| 8:00 | `updateInventoryDataBatchWithRetry` | 在庫情報更新 |
| 10:00 | `updateInventoryDataBatchWithRetry` | 在庫情報更新 |
| 13:30 | `updateInventoryDataBatchWithRetry` | 在庫情報更新 |
| 16:00 | `updateInventoryDataBatchWithRetry` | 在庫情報更新 |
| 19:00 | `updateInventoryDataBatchWithRetry` | 在庫情報更新 |
| 21:00 | `updateInventoryDataBatchWithRetry` | 在庫情報更新 |

---

## 初回セットアップ手順

1. **NEAuth ライブラリの追加**
   - 左メニュー「ライブラリ」→ 認証プロジェクトのスクリプト ID を入力
   - 識別子: `NEAuth`、最新バージョンを選択

2. **スクリプトプロパティの設定**
   - 上記「スクリプトプロパティ設定」の全項目を設定する

3. **Web アプリとしてデプロイ**
   - 「デプロイ」→「新しいデプロイ」→ 種類: ウェブアプリ
   - デプロイ後の URL を `REDIRECT_URI` に設定する

4. **NE 認証の実行**
   - `testGenerateAuthUrl()` を実行して認証 URL を取得
   - ブラウザで認証を完了する

5. **動作確認**
   - `verifyConfiguration()` で設定を確認
   - `testSupabaseConnection()` で Supabase 接続を確認
   - `testUpsertInventoryToSupabase()` で書き込みをテスト

6. **トリガーの設定**
   - `setTriggerForGoodsMaster()` で 0:10 のトリガーを登録
   - `setTrigger()` で在庫更新トリガーを登録

---

## 主要テスト関数一覧（99_Tests.テスト.gs）

| 関数名 | 目的 |
|--------|------|
| `verifyConfiguration()` | 設定値・トークンの確認 |
| `testRetryFunction()` | NE API 接続・リトライ動作確認 |
| `showSREDashboard()` | システム健全性の一覧表示 |
| `testSupabaseConnection()` | Supabase 接続確認 |
| `testSupabaseRpcCall()` | Supabase RPC 動作確認（ダミーデータ） |
| `testBuildSupabasePayload()` | 商品マスタデータの変換確認 |
| `testUpsertInventoryToSupabase()` | 商品マスタ→Supabase 書き込みテスト |
| `testBuildStockPayload()` | 在庫マスタデータの変換確認 |
| `testUpsertStockToSupabase()` | 在庫マスタ→Supabase 書き込みテスト |
| `testQuerySupabaseTable()` | Supabase REST API 読み取りテスト |
| `testGetChangedInventorySince()` | 差分取得動作確認 |
| `testLastExecutedAtFlow()` | 実行日時の保存・読み出し確認 |
| `testPhase5_IntegrationTest()` | 商品マスタ全件取得の統合テスト |
```

---

## 4. 作業3：各ファイルのヘッダーコメント最終整備

Phase 1〜4 の実装を経て変更・追記されたファイルのヘッダーを  
現状に合わせて最終整備する。

### 整備対象と確認ポイント

---

#### `10_Main.エントリーポイント.gs`

**確認・更新する箇所：**

`@file` JSDoc の「依存ファイルと役割分担」セクションに Phase 1〜4 での追加を反映する。

```javascript
 * ### 依存ファイルと役割分担
 * - 11_Config.gs: 設定値・定数・トークン取得
 * - 12_Logger.gs: ログ出力・リトライ統計管理
 * - 13_NextEngineAPI.gs: NE APIへのHTTPリクエスト
 * - 14_InventoryLogic.gs: 在庫データの取得・整形
 * - 15_SpreadsheetRepository.gs: スプレッドシートへの書き込み
 * - 17_SupabaseRepository.gs: Supabaseへのデータ書き込み（全件・差分）
```

`updateInventoryDataFromGoodsMaster()` の処理フローコメントを更新する：

```javascript
 * ### 処理フロー (updateInventoryDataFromGoodsMaster)
 * Step 1. リトライ統計リセット        (12_Logger.gs)
 * Step 2. スプレッドシート・シート取得 (11_Config.gs)
 * Step 3. 商品マスタAPIで全件取得      (13_NextEngineAPI.gs)
 * Step 4. データ整形                   (14_InventoryLogic.gs)
 * Step 5. シート全件書き直し           (15_SpreadsheetRepository.gs)
 * Step 5b. Supabaseへの全件書き込み    (17_SupabaseRepository.gs)
 * Step 6. 実行タイムスタンプ記録       (15_SpreadsheetRepository.gs)
```

`@version` を更新する：

```javascript
 * @version 3.0 (Supabase対応)
```

---

#### `16_SupabaseClient.Supabase接続.gs`

**確認・更新する箇所：**

Phase 4 で `querySupabaseTable()` が追加されたため、`@file` の公開関数一覧を更新する。

```javascript
 * ### 公開関数
 * @see getSupabaseConfig   - Supabase接続設定を取得
 * @see callSupabaseRpc     - RPC関数への汎用POSTラッパー
 * @see querySupabaseTable  - テーブルへの汎用GETラッパー（Phase 4追加）
```

`@version` を更新する：

```javascript
 * @version 1.1 (Phase 4: querySupabaseTable 追加)
```

---

#### `17_SupabaseRepository.Supabase永続化.gs`

**確認・更新する箇所：**

Phase 2〜4 で段階的に追加された全関数が `@file` の公開関数一覧に記載されているか確認する。  
記載がなければ以下の形式で追記する。

```javascript
 * ### Phase 2（商品マスタ全件書き込み）
 * @see buildSupabasePayload      - goodsMapをSupabase用配列に変換
 * @see upsertInventoryToSupabase - 商品マスタデータを全件upsert（500件チャンク）
 *
 * ### Phase 3（在庫マスタ差分書き込み）
 * @see buildStockPayload         - inventoryDataMapをSupabase用配列に変換
 * @see upsertStockToSupabase     - 在庫数値をバッチ単位でupsert
 *
 * ### Phase 4（差分取得）
 * @see getChangedInventorySince  - 指定日時以降に更新された商品を取得
 * @see saveLastExecutedAt        - 最終実行日時をプロパティに保存
 * @see loadLastExecutedAt        - 最終実行日時をプロパティから読み出す
```

`@version` を更新する：

```javascript
 * @version 1.3 (Phase 4: 差分取得機能追加)
```

---

#### `99_Tests.テスト.gs`

**確認・更新する箇所：**

`@file` の推奨実行順序を Phase 1〜4 の追加関数を含めた形に更新する。

```javascript
 * ### 推奨実行順序
 * #### 初回セットアップ時
 * 1. `verifyConfiguration()`         : 設定値・トークンの確認
 * 2. `testSupabaseConnection()`       : Supabase接続の確認
 * 3. `testSupabaseRpcCall()`          : Supabase RPC動作確認
 * 4. `testRetryFunction()`            : NE API接続とリトライ動作の確認
 * 5. `testUpsertInventoryToSupabase()`: 商品マスタ→Supabase書き込みテスト
 * 6. `testUpsertStockToSupabase()`    : 在庫マスタ→Supabase書き込みテスト
 * 7. `testGetChangedInventorySince()` : 差分取得の確認
 * 8. `showSREDashboard()`             : システム全体の健全性確認
 *
 * #### トラブル発生時
 * 1. `verifyConfiguration()`         : 設定値の再確認
 * 2. `testSupabaseConnection()`       : Supabase接続の再確認
 * 3. `testRetryFunction()`            : NE API応答の確認
 * 4. `showSREDashboard()`             : エラーログ・リトライ統計の確認
```

`@version` を更新する：

```javascript
 * @version 2.4 (Phase 4: 差分取得テスト追加)
```

---

## 5. 完了条件チェックリスト

### 作業1：ファイル削除

- [ ] `在庫情報取得_一括処理版.gs` が削除されている
- [ ] `在庫情報_一括取得リトライ版.gs` が削除されている
- [ ] `NE_在庫情報取得_ライブラリ試験.gs` が削除されている
- [ ] `testSupabaseRpc.gs` が削除されている
- [ ] `Old/Step1_1_ログ機能.gs` が削除されている
- [ ] `Old/在庫情報取得.gs` が削除されている
- [ ] `Old/在庫情報取得_高速版.gs` が削除されている
- [ ] 削除後もプロジェクトがエラーなく実行できること（`verifyConfiguration()` で確認）

### 作業2：README.md 更新

- [ ] README.md が本指示書のセクション3の内容に更新されている
- [ ] アーキテクチャ図が正しく記述されている
- [ ] スクリプトプロパティの全項目が記載されている
- [ ] Supabase RPC 関数が2つ（`upsert_ne_inventory_data`・`upsert_ne_stock_data`）記載されている
- [ ] テスト関数一覧が全て記載されている

### 作業3：ヘッダーコメント整備

- [ ] `10_Main.エントリーポイント.gs` の依存ファイルリストに `17_SupabaseRepository.gs` が記載されている
- [ ] `10_Main.エントリーポイント.gs` の `@version` が `3.0` になっている
- [ ] `16_SupabaseClient.Supabase接続.gs` に `querySupabaseTable` が公開関数として記載されている
- [ ] `17_SupabaseRepository.Supabase永続化.gs` に Phase 2〜4 の全関数が記載されている
- [ ] `99_Tests.テスト.gs` の推奨実行順序が Phase 1〜4 の全テスト関数を含んでいる

### 最終動作確認

- [ ] `verifyConfiguration()` が正常に完了する
- [ ] `testSupabaseConnection()` が正常に完了する
- [ ] `updateInventoryDataFromGoodsMaster()` を実行してスプレッドシート・Supabase 両方に書き込まれる
- [ ] `updateInventoryDataBatchWithRetry()` を実行してスプレッドシート・Supabase 両方に書き込まれる
- [ ] `getChangedInventorySince()` で在庫更新後に変化した商品のみが取得される
- [ ] `showSREDashboard()` でエラーなし・システム正常が確認できる

---

## 6. Phase 1〜5 全体の変更サマリー（参照用）

Phase 5 完了後のプロジェクト全体の変更内容を以下に整理する。

### 新規追加したファイル

| ファイル | 追加フェーズ | 主な内容 |
|---------|------------|---------|
| `16_SupabaseClient.Supabase接続.gs` | Phase 1 | `getSupabaseConfig`・`callSupabaseRpc`・`querySupabaseTable` |
| `17_SupabaseRepository.Supabase永続化.gs` | Phase 2〜4 | Supabase書き込み・差分取得・実行日時管理 |

### 追記したファイル

| ファイル | 追記フェーズ | 主な追記内容 |
|---------|------------|------------|
| `10_Main.エントリーポイント.gs` | Phase 2・3 | Step 5b（Supabase書き込み）を2箇所追記 |
| `11_Config.設定管理.gs` | Phase 1 | Supabase設定プロパティのコメントを追記 |
| `99_Tests.テスト.gs` | Phase 1〜4 | Supabase関連テスト関数を計8個追記 |

### Supabase に追加した RPC 関数

| 関数名 | 追加フェーズ | 用途 |
|--------|------------|------|
| `upsert_ne_inventory_data` | Phase 2 以前（既存） | 商品マスタ全列 upsert |
| `upsert_ne_stock_data` | Phase 3 | 在庫数値列のみ upsert |

---

*以上が Phase 5（最終フェーズ）の実装指示書です。*  
*全フェーズの完了後、`showSREDashboard()` と `verifyConfiguration()` で最終確認を行ってください。*
