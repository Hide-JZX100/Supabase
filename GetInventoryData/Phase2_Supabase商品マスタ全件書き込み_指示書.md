# 開発指示書：Phase 2 - 商品マスタ全件取得 → Supabase書き込み

**プロジェクト名：** NE_在庫情報取得（ネクストエンジン × Supabase 連携）  
**対象フェーズ：** Phase 2  
**前提：** Phase 1（`16_SupabaseClient.Supabase接続.gs` の作成）が完了していること  
**目的：** `updateInventoryDataFromGoodsMaster()` の処理にSupabaseへの書き込みを追加する

---

## 1. フェーズ概要

Phase 1 で実装した `callSupabaseRpc()` を活用し、  
商品マスタ全件取得処理（1日1回実行）の結果を **スプレッドシートとSupabase の両方** に書き込む。

### 処理フロー（変更後）

```
updateInventoryDataFromGoodsMaster()   ← 10_Main.エントリーポイント.gs
    │
    ├─ Step 3: NE API 全件取得        ← 13_NextEngineAPI.API通信.gs
    │          ↓ goodsMap（Map型）
    ├─ Step 4: データ整形              ← 14_InventoryLogic.ビジネスロジック.gs
    │          ↓ rows（2次元配列）
    ├─ Step 5: スプレッドシートに書き込み  ← 15_SpreadsheetRepository.データ永続化.gs
    │          ↓ goodsMap（Map型）をそのまま使用
    └─ Step 5b:【新規】Supabaseに書き込み  ← 17_SupabaseRepository.Supabase永続化.gs
```

---

## 2. 変更・追加するファイル一覧

```
17_SupabaseRepository.Supabase永続化.gs  ← 【新規作成】
10_Main.エントリーポイント.gs             ← 【一部追記】Step 5b の呼び出しを追加
99_Tests.テスト.gs                        ← 【追記】Phase 2 テスト関数を追加
```

**変更しないファイル（触らないこと）：**

```
11_Config.設定管理.gs
12_Logger.ログ管理.gs
13_NextEngineAPI.API通信.gs
14_InventoryLogic.ビジネスロジック.gs
15_SpreadsheetRepository.データ永続化.gs
16_SupabaseClient.Supabase接続.gs
トリガー設定.gs
```

---

## 3. コーディング規約

Phase 1 と同じ規約に従うこと。要点のみ再掲する。

- **ファイルヘッダー・関数ヘッダーの JSDoc は必須**
- **エラーログは `logError()`（12_Logger.ログ管理.gs）を使うこと**
- **進捗ログは `logWithLevel(LOG_LEVEL.MINIMAL, ...)` を使うこと**
- **エラーは `try-catch` でキャッチ後、`logError()` で記録し `throw` で再スローすること**
- **既存ファイルを変更する場合は追記のみ。既存のコードは削除・変更しないこと**

---

## 4. タスク詳細

---

### タスク1：`17_SupabaseRepository.Supabase永続化.gs` 新規作成

**このファイルの責務：** Supabaseへのデータ書き込みのみ。  
NE API の呼び出しやデータ取得はしない。

#### 依存関係

- **参照元：** `10_Main.エントリーポイント.gs`
- **参照先：**
  - `16_SupabaseClient.Supabase接続.gs`（`callSupabaseRpc`）
  - `12_Logger.ログ管理.gs`（`logWithLevel`, `logError`, `LOG_LEVEL`）

#### 実装する関数

---

**① `buildSupabasePayload(goodsMap)`**

**目的：** NE API から取得した `goodsMap`（Map型）を、  
Supabase RPC 関数が期待する **日本語キーのオブジェクト配列** に変換する。

**引数：**
- `goodsMap` — `fetchAllGoodsData()` の返却値  
  `Map<goods_id, { goods_id, goods_name, goods_jan_code, stock_quantity, ... }>`

**返却値：** 以下の形式のオブジェクト配列

```javascript
[
    {
        "商品コード": "XXXX-001",
        "商品名": "サンプル商品",
        "在庫数": 10,
        "引当数": 2,
        "フリー在庫数": 8,
        "予約在庫数": 0,
        "予約引当数": 0,
        "予約フリー在庫数": 0,
        "不良在庫数": 0,
        "発注残数": 5,
        "欠品数": 0,
        "JANコード": 4901234567890   // ← 数値型（BIGINT）または null
    },
    ...
]
```

**変換ルール：**

| NE API フィールド名 | Supabase 列名（日本語） | 型変換 |
|---------------------|------------------------|--------|
| `goods_id` | `商品コード` | そのまま（TEXT） |
| `goods_name` | `商品名` | そのまま（TEXT） |
| `stock_quantity` | `在庫数` | `parseInt()` で整数変換。変換失敗時は `0` |
| `stock_allocation_quantity` | `引当数` | 同上 |
| `stock_free_quantity` | `フリー在庫数` | 同上 |
| `stock_advance_order_quantity` | `予約在庫数` | 同上 |
| `stock_advance_order_allocation_quantity` | `予約引当数` | 同上 |
| `stock_advance_order_free_quantity` | `予約フリー在庫数` | 同上 |
| `stock_defective_quantity` | `不良在庫数` | 同上 |
| `stock_remaining_order_quantity` | `発注残数` | 同上 |
| `stock_out_quantity` | `欠品数` | 同上 |
| `goods_jan_code` | `JANコード` | 下記「JANコード変換ルール」参照 |

**JANコード変換ルール（重要）：**

Supabase の `JANコード` 列は `BIGINT` 型。空文字列を送ると型エラーになる。

```javascript
// JANコードの変換ロジック
const jan = item.goods_jan_code;
const janCodeValue = (jan && jan !== '') ? parseInt(jan, 10) : null;
// 空欄・null・undefined → null（NULLとして保存）
// 数値文字列 "4901234567890" → 4901234567890（整数として保存）
```

---

**② `upsertInventoryToSupabase(goodsMap)`**

**目的：** Supabase に全件 upsert する。大量データを安全に送るため、  
チャンク（分割）処理を行う。

**引数：**
- `goodsMap` — `fetchAllGoodsData()` の返却値（Map型）

**返却値：** `{ totalRecords: number, chunks: number, success: boolean }`

**処理フロー：**

1. `buildSupabasePayload(goodsMap)` を呼び出してオブジェクト配列に変換する
2. 配列を **1チャンク500件** に分割する
3. 各チャンクを `callSupabaseRpc('upsert_ne_inventory_data', { json_data: chunk })` で送信する
4. 各チャンクの処理結果をログに記録する
5. 全チャンク完了後に集計結果を返す

**チャンクサイズについて：**

```javascript
const SUPABASE_CHUNK_SIZE = 500; // 1回のRPC呼び出しで送るレコード数
```

この定数はファイル冒頭の定数定義セクションに記述すること（ハードコードしない）。

**ログ出力のイメージ：**

```
Supabaseへの書き込み開始: 3200件 / 7チャンク
  チャンク 1/7: 500件 送信中...
  チャンク 1/7: ✓ 完了（ステータス: 204）
  チャンク 2/7: 500件 送信中...
  チャンク 2/7: ✓ 完了（ステータス: 204）
  ...
Supabaseへの書き込み完了: 3200件
```

**エラーハンドリング：**

- 1チャンクが失敗しても残りのチャンクの処理は継続する（全体を止めない）
- 失敗したチャンクは `logError()` で記録する
- 全チャンク終了後、失敗件数があれば最終ログに記録する

```javascript
// エラーハンドリングのイメージ
let successCount = 0;
let errorCount = 0;

for (let i = 0; i < chunks.length; i++) {
    try {
        const result = callSupabaseRpc('upsert_ne_inventory_data', { json_data: chunks[i] });
        successCount++;
        logWithLevel(LOG_LEVEL.MINIMAL, `  チャンク ${i + 1}/${chunks.length}: ✓ 完了`);
    } catch (error) {
        errorCount++;
        logError(`  チャンク ${i + 1}/${chunks.length}: ✗ 失敗 - ${error.message}`);
        // throw しない（処理を継続させる）
    }
}

if (errorCount > 0) {
    logError(`Supabase書き込み: ${errorCount}チャンクが失敗しました`);
}
```

---

#### ファイル全体の構成イメージ

```javascript
/**
 * @file 17_SupabaseRepository.Supabase永続化.gs
 * @description Supabaseへのデータ書き込みモジュール。
 * ...（規約に従ったヘッダーを記述）
 */

// ============================================================================
// 定数定義
// ============================================================================

/** 1回のRPC呼び出しで送信するレコード数 */
const SUPABASE_CHUNK_SIZE = 500;

// ============================================================================
// 公開関数
// ============================================================================

/**
 * NE API取得データをSupabase用ペイロードに変換
 * @param {Map} goodsMap - fetchAllGoodsData() の返却値
 * @return {Array} Supabase RPC 用オブジェクト配列
 */
function buildSupabasePayload(goodsMap) { ... }

/**
 * 在庫データを Supabase に全件 upsert する
 * @param {Map} goodsMap - fetchAllGoodsData() の返却値
 * @return {Object} { totalRecords, chunks, success }
 */
function upsertInventoryToSupabase(goodsMap) { ... }
```

---

### タスク2：`10_Main.エントリーポイント.gs` への追記

`updateInventoryDataFromGoodsMaster()` 関数に **Step 5b** を追加する。

**変更方針：** 既存の Step 5（スプレッドシート書き込み）の直後に追記する。  
既存コードの削除・変更は一切行わないこと。

#### 変更前（既存コード・抜粋）

```javascript
        // Step 5: シート全件書き直し
        logWithLevel(LOG_LEVEL.MINIMAL, 'スプレッドシートへの書き込み中...');
        const writeResult = writeAllInventoryData(sheet, rows);

        // Step 6: 実行タイムスタンプ記録
        recordExecutionTimestamp();
```

#### 変更後（追記後）

```javascript
        // Step 5: シート全件書き直し
        logWithLevel(LOG_LEVEL.MINIMAL, 'スプレッドシートへの書き込み中...');
        const writeResult = writeAllInventoryData(sheet, rows);

        // Step 5b: Supabaseへの書き込み
        logWithLevel(LOG_LEVEL.MINIMAL, 'Supabaseへの書き込み中...');
        const supabaseResult = upsertInventoryToSupabase(goodsMap);
        logWithLevel(LOG_LEVEL.MINIMAL, `Supabase書き込み完了: ${supabaseResult.totalRecords}件`);

        // Step 6: 実行タイムスタンプ記録
        recordExecutionTimestamp();
```

#### 完了ログの追記

関数末尾の完了ログ部分にも Supabase の件数を追記する。

**変更前（既存コード・抜粋）：**

```javascript
        logWithLevel(LOG_LEVEL.MINIMAL, `処理時間  : ${duration}秒`);
        logWithLevel(LOG_LEVEL.MINIMAL, `取得件数  : ${goodsMap.size}件`);
        logWithLevel(LOG_LEVEL.MINIMAL, `書込件数  : ${writeResult.dataRows}行`);
        logWithLevel(LOG_LEVEL.MINIMAL, `処理速度  : ${(goodsMap.size / duration).toFixed(1)}件/秒`);
```

**変更後（追記後）：**

```javascript
        logWithLevel(LOG_LEVEL.MINIMAL, `処理時間  : ${duration}秒`);
        logWithLevel(LOG_LEVEL.MINIMAL, `取得件数  : ${goodsMap.size}件`);
        logWithLevel(LOG_LEVEL.MINIMAL, `書込件数  : ${writeResult.dataRows}行`);
        logWithLevel(LOG_LEVEL.MINIMAL, `Supabase  : ${supabaseResult.totalRecords}件（${supabaseResult.chunks}チャンク）`);
        logWithLevel(LOG_LEVEL.MINIMAL, `処理速度  : ${(goodsMap.size / duration).toFixed(1)}件/秒`);
```

#### ファイルヘッダーの更新

`10_Main.エントリーポイント.gs` の `@file` JSDoc の依存ファイルリストに追記する。

**追記内容（既存の依存ファイルリストの末尾に追加）：**

```javascript
 * - 17_SupabaseRepository.gs: Supabaseへのデータ書き込み
```

**処理フロー説明の更新（既存コメントの末尾に追加）：**

```javascript
 * 5b. Supabaseへの全件書き込み (17_SupabaseRepository.gs)
```

---

### タスク3：`99_Tests.テスト.gs` への追記

既存ファイルの末尾に以下の2つの関数を追記する。

#### ① `testBuildSupabasePayload()`

**目的：** `buildSupabasePayload()` の変換ロジック単体テスト

- スプレッドシートから先頭3件の商品データを取得する
- `fetchGoodsDataOnePage_(tokens, 3, 0)` を使って NE API から3件取得する
- 取得データを Map に格納して `buildSupabasePayload()` を呼び出す
- 変換結果をコンソールに出力して以下を目視確認できるようにする
  - 日本語キーになっているか
  - `JANコード` が数値または null になっているか（文字列になっていないか）
  - 数値フィールドが整数になっているか

```
=== buildSupabasePayload テスト ===
変換前 (NE API形式):
  goods_id: XXXX-001
  goods_jan_code: "4901234567890"   ← 文字列

変換後 (Supabase形式):
  商品コード: XXXX-001
  JANコード: 4901234567890          ← 数値
  在庫数: 10                        ← 整数
  ...
✓ 変換テスト完了
```

#### ② `testUpsertInventoryToSupabase()`

**目的：** `upsertInventoryToSupabase()` の結合テスト

- NE API から実際に先頭10件を取得する（`fetchGoodsDataOnePage_(tokens, 10, 0)` を使用）
- 取得したデータで `upsertInventoryToSupabase()` を実行する
- 実行後に Supabase ダッシュボードでの確認を促すメッセージを出力する

```javascript
function testUpsertInventoryToSupabase() {
    console.log('=== Supabase upsert テスト（10件） ===\n');

    try {
        const tokens = getStoredTokens();

        // NE APIから10件取得
        console.log('NE APIから10件取得中...');
        const { data } = fetchGoodsDataOnePage_(tokens, 10, 0);

        if (!data || data.length === 0) {
            console.log('❌ NE APIからデータが取得できませんでした');
            return;
        }

        // テスト用Mapを構築
        const testMap = new Map();
        data.forEach(item => testMap.set(item.goods_id, item));
        console.log(`取得件数: ${testMap.size}件\n`);

        // Supabaseへ書き込み
        console.log('Supabaseへ書き込み中...');
        const result = upsertInventoryToSupabase(testMap);

        // 結果出力
        console.log('\n=== テスト結果 ===');
        console.log(`総レコード数 : ${result.totalRecords}件`);
        console.log(`チャンク数   : ${result.chunks}個`);
        console.log(`成功         : ${result.success ? '✓' : '✗'}`);

        console.log('\n【Supabaseダッシュボードで以下を確認してください】');
        console.log('Table Editor → ne_inventory_data');
        console.log('上記商品コードのデータが更新されているか確認してください。');

    } catch (error) {
        console.error(`テストエラー: ${error.message}`);
    }
}
```

---

## 5. Supabase RPC 仕様（Phase 1 より再掲）

### RPC 関数名
```
upsert_ne_inventory_data
```

### 呼び出し形式

```javascript
callSupabaseRpc('upsert_ne_inventory_data', {
    json_data: [
        {
            "商品コード": "XXXX-001",
            "商品名": "商品名",
            "在庫数": 10,
            "引当数": 2,
            "フリー在庫数": 8,
            "予約在庫数": 0,
            "予約引当数": 0,
            "予約フリー在庫数": 0,
            "不良在庫数": 0,
            "発注残数": 5,
            "欠品数": 0,
            "JANコード": 4901234567890  // 数値 または null
        }
        // ... 最大 SUPABASE_CHUNK_SIZE 件
    ]
});
```

### RPC の動作仕様（重要）

- `在庫数・引当数・フリー在庫数・欠品数` のいずれかに**差分がある場合のみ** `更新日時` を更新する
- 差分がない商品は `更新日時` を変更しない（過去の日時を維持する）
- これにより、次フェーズ（Phase 4）で「最終更新日時以降に変化した商品のみ取得」が可能になる

---

## 6. goodsMap のデータ構造（参照用）

`fetchAllGoodsData()` が返す Map の value 構造：

```javascript
{
    goods_id: "XXXX-001",                              // 商品コード
    goods_name: "サンプル商品",                         // 商品名
    goods_jan_code: "4901234567890",                    // JANコード（文字列 or 空文字列）
    stock_quantity: "10",                               // 在庫数（文字列で返る場合あり）
    stock_allocation_quantity: "2",                     // 引当数
    stock_free_quantity: "8",                           // フリー在庫数
    stock_advance_order_quantity: "0",                  // 予約在庫数
    stock_advance_order_allocation_quantity: "0",       // 予約引当数
    stock_advance_order_free_quantity: "0",             // 予約フリー在庫数
    stock_defective_quantity: "0",                      // 不良在庫数
    stock_remaining_order_quantity: "5",                // 発注残数
    stock_out_quantity: "0"                             // 欠品数
}
```

**注意：** NE API は数値フィールドを文字列で返す場合があるため、  
`buildSupabasePayload()` 内で必ず `parseInt()` で整数変換すること。

---

## 7. 完了条件

以下をすべて満たした状態を Phase 2 完了とする。

- [ ] `17_SupabaseRepository.Supabase永続化.gs` が作成されている
- [ ] `buildSupabasePayload()` が goodsMap を日本語キーのオブジェクト配列に変換できる
- [ ] `JANコード` が空の場合に `null`、値がある場合に整数で変換できている
- [ ] `upsertInventoryToSupabase()` が 500件チャンクで分割送信できる
- [ ] チャンクの一部が失敗しても処理が継続する（全体停止しない）
- [ ] `10_Main.エントリーポイント.gs` に Step 5b が追記されている
- [ ] `testBuildSupabasePayload()` を実行して変換結果が正しいことを目視確認できる
- [ ] `testUpsertInventoryToSupabase()` を実行してステータスコード 204 が返ること
- [ ] Supabase ダッシュボードの `ne_inventory_data` テーブルにデータが書き込まれていること
- [ ] `更新日時` 列が正しくセットされていること
- [ ] 既存ファイルのロジックが変更されていないこと（`10_Main` は追記のみ）

---

## 8. 実装しないこと（スコープ外）

以下は Phase 3 以降で実装する。

- `updateInventoryDataBatchWithRetry()` の Supabase 対応（Phase 3）
- `更新日時` を使った差分取得機能（Phase 4）
- 17_SupabaseRepository.gs への在庫差分更新用関数の追加（Phase 3）

---

## 9. 参考：既存の類似処理（パターン確認用）

### スプレッドシートへの全件書き込み（15_SpreadsheetRepository.データ永続化.gs より）

Supabase の `upsertInventoryToSupabase()` は、この関数に相当する役割を担う。  
同様のログ出力パターン・エラーハンドリングを参考にすること。

```javascript
function writeAllInventoryData(sheet, rows) {
    logWithLevel(LOG_LEVEL.SUMMARY, `シート書き込み開始: ${rows.length}行`);
    // ...
    logWithLevel(LOG_LEVEL.SUMMARY, `データ書き込み完了: ${rows.length}行`);
    return { headerWritten: true, dataRows: rows.length };
}
```

### チャンク分割のパターン（既存コードより）

既存の `updateInventoryDataBatchWithRetry()` にある `goodsCodeList.slice()` のパターンを参考にすること。

```javascript
// 既存のバッチ分割パターン（10_Main.エントリーポイント.gs より）
for (let i = 0; i < goodsCodeList.length; i += MAX_ITEMS_PER_CALL) {
    const batch = goodsCodeList.slice(i, i + MAX_ITEMS_PER_CALL);
    const batchNumber = Math.floor(i / MAX_ITEMS_PER_CALL) + 1;
    // ...
}
```

---

*以上が Phase 2 の実装指示書です。*  
*疑問点があれば実装前に確認してください。*
