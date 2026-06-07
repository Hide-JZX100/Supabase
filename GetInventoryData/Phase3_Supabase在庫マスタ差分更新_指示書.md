# 開発指示書：Phase 3 - 在庫マスタ差分更新 → Supabase書き込み

**プロジェクト名：** NE_在庫情報取得（ネクストエンジン × Supabase 連携）  
**対象フェーズ：** Phase 3  
**前提：** Phase 1・Phase 2 が完了していること  
**目的：** `updateInventoryDataBatchWithRetry()` の処理にSupabaseへの書き込みを追加する

---

## 1. フェーズ概要

### Phase 2 との違い（重要）

| 項目 | Phase 2（商品マスタ） | Phase 3（在庫マスタ） |
|------|----------------------|----------------------|
| 実行頻度 | 1日1回（0:10） | 1日6回 |
| 取得データ | 商品コード・商品名・JANコード・在庫数値 | 在庫数値のみ（商品名・JANコードなし） |
| Supabase更新対象列 | 全列 | 在庫数値列のみ（商品名・JANコードは変更しない） |
| 使用RPC関数 | `upsert_ne_inventory_data` | **`upsert_ne_stock_data`（新規作成が必要）** |
| 処理単位 | 全件を500件チャンクで送信 | バッチ（最大1,000件）ごとに送信 |

在庫マスタAPIは商品名・JANコードを返さないため、  
Phase 2 で使用した `upsert_ne_inventory_data` をそのまま使うと  
Supabase の商品名・JANコードが空になってしまう。  
このため、**在庫数値列のみを更新する専用RPC関数を新規作成する**。

### 処理フロー（変更後）

```
updateInventoryDataBatchWithRetry()       ← 10_Main.エントリーポイント.gs
    │
    └─ バッチループ（1,000件 × N回）
         │
         ├─ NE API 在庫マスタ取得         ← 13_NextEngineAPI.API通信.gs
         │   ↓ inventoryDataMap（Map型）
         ├─ スプレッドシート更新           ← 15_SpreadsheetRepository.データ永続化.gs
         │   ↓ inventoryDataMap をそのまま使用
         └─【新規】Supabaseへの書き込み   ← 17_SupabaseRepository.Supabase永続化.gs
```

---

## 2. 変更・追加するファイル一覧

```
【Supabase側（事前に手動で実行が必要）】
upsert_ne_stock_data.sql                  ← 【新規SQL】Supabaseで実行すること

【GAS側】
17_SupabaseRepository.Supabase永続化.gs  ← 【追記】在庫マスタ用関数を2つ追加
10_Main.エントリーポイント.gs             ← 【追記】バッチループ内にSupabase書き込みを追加
99_Tests.テスト.gs                        ← 【追記】Phase 3 テスト関数を追加
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

## 3. 事前作業：Supabase に新規 RPC 関数を作成する

**これは GAS の実装前に Supabase ダッシュボードで実行する必要がある。**  
SQL Editor で以下を実行してから GAS の実装に進むこと。

### `upsert_ne_stock_data` 関数の SQL

```sql
/*******************************************************************************
 * 関数名: upsert_ne_stock_data
 * 説明: GASから受信した在庫マスタデータ配列（複数件）を展開し、
 *       在庫数値列のみを更新する。
 *       商品名・JANコードは更新しない（商品マスタAPIで取得済みの値を保持）。
 *       在庫数・引当数・フリー在庫数・欠品数のいずれかに差分がある場合のみ
 *       更新日時を更新し、差分がない商品はスキップする。
 *
 * 引数:
 *   - json_data (JSONB): 在庫データオブジェクトの配列
 *                        必須キー: 商品コード, 在庫数, 引当数, フリー在庫数,
 *                                  予約在庫数, 予約引当数, 予約フリー在庫数,
 *                                  不良在庫数, 発注残数, 欠品数
 *******************************************************************************/
CREATE OR REPLACE FUNCTION public.upsert_ne_stock_data(json_data JSONB)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public."NE_InventoryData" (
        "商品コード", "在庫数", "引当数", "フリー在庫数",
        "予約在庫数", "予約引当数", "予約フリー在庫数", "不良在庫数",
        "発注残数", "欠品数", "更新日時"
    )
    SELECT
        "商品コード", "在庫数", "引当数", "フリー在庫数",
        "予約在庫数", "予約引当数", "予約フリー在庫数", "不良在庫数",
        "発注残数", "欠品数", NOW()
    FROM jsonb_to_recordset(json_data) AS x(
        "商品コード"       TEXT,
        "在庫数"           INTEGER,
        "引当数"           INTEGER,
        "フリー在庫数"     INTEGER,
        "予約在庫数"       INTEGER,
        "予約引当数"       INTEGER,
        "予約フリー在庫数" INTEGER,
        "不良在庫数"       INTEGER,
        "発注残数"         INTEGER,
        "欠品数"           INTEGER
    )
    ON CONFLICT ("商品コード")
    DO UPDATE SET
        "在庫数"           = EXCLUDED."在庫数",
        "引当数"           = EXCLUDED."引当数",
        "フリー在庫数"     = EXCLUDED."フリー在庫数",
        "予約在庫数"       = EXCLUDED."予約在庫数",
        "予約引当数"       = EXCLUDED."予約引当数",
        "予約フリー在庫数" = EXCLUDED."予約フリー在庫数",
        "不良在庫数"       = EXCLUDED."不良在庫数",
        "発注残数"         = EXCLUDED."発注残数",
        "欠品数"           = EXCLUDED."欠品数",
        "更新日時"         = NOW()
    WHERE
        public."NE_InventoryData"."在庫数"       IS DISTINCT FROM EXCLUDED."在庫数"  OR
        public."NE_InventoryData"."引当数"       IS DISTINCT FROM EXCLUDED."引当数"  OR
        public."NE_InventoryData"."フリー在庫数" IS DISTINCT FROM EXCLUDED."フリー在庫数" OR
        public."NE_InventoryData"."欠品数"       IS DISTINCT FROM EXCLUDED."欠品数";
END;
$$ LANGUAGE plpgsql;
```

### 動作確認（SQL実行後）

```sql
-- 関数が作成されているか確認
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('upsert_ne_inventory_data', 'upsert_ne_stock_data');
```

2行表示されれば準備完了。

---

## 4. コーディング規約

Phase 1・2 と同じ規約に従うこと。

- **ファイルヘッダー・関数ヘッダーの JSDoc は必須**
- **エラーログは `logError()`（12_Logger.ログ管理.gs）を使うこと**
- **進捗ログは `logWithLevel(LOG_LEVEL.MINIMAL, ...)` を使うこと**
- **エラーは `try-catch` でキャッチ後、`logError()` で記録し呼び出し元に返すこと**
- **既存ファイルを変更する場合は追記のみ。既存コードは削除・変更しないこと**

---

## 5. タスク詳細

---

### タスク1：`17_SupabaseRepository.Supabase永続化.gs` に追記

既存ファイルの末尾に以下の2つの関数を追加する。  
**既存の `buildSupabasePayload()` と `upsertInventoryToSupabase()` は変更しないこと。**

---

#### ① `buildStockPayload(inventoryDataMap)`

**目的：** 在庫マスタ取得データ（`inventoryDataMap`）を  
Supabase RPC `upsert_ne_stock_data` が期待する **日本語キーのオブジェクト配列** に変換する。

**引数：**
- `inventoryDataMap` — `getBatchInventoryDataWithRetry()` の返却値  
  `Map<goodsCode, inventoryData>`

**返却値：** 以下の形式のオブジェクト配列

```javascript
[
    {
        "商品コード": "XXXX-001",
        "在庫数": 10,
        "引当数": 2,
        "フリー在庫数": 8,
        "予約在庫数": 0,
        "予約引当数": 0,
        "予約フリー在庫数": 0,
        "不良在庫数": 0,
        "発注残数": 5,
        "欠品数": 0
        // 商品名・JANコードは含めない
    },
    ...
]
```

**変換ルール：**

| inventoryData フィールド名 | Supabase 列名（日本語） | 備考 |
|---------------------------|------------------------|------|
| `goods_id` | `商品コード` | そのまま（TEXT） |
| `stock_quantity` | `在庫数` | 既に `parseInt()` 済みだがフォールバックとして `\|\| 0` を付ける |
| `stock_allocated_quantity` | `引当数` | 同上 |
| `stock_free_quantity` | `フリー在庫数` | 同上 |
| `stock_advance_order_quantity` | `予約在庫数` | 同上 |
| `stock_advance_order_allocation_quantity` | `予約引当数` | 同上 |
| `stock_advance_order_free_quantity` | `予約フリー在庫数` | 同上 |
| `stock_defective_quantity` | `不良在庫数` | 同上 |
| `stock_remaining_order_quantity` | `発注残数` | 同上 |
| `stock_out_quantity` | `欠品数` | 同上 |
| `goods_name` | **送信しない** | 商品名は在庫マスタAPIでは取得しないため含めない |
| JANコード関連 | **送信しない** | 同上 |

**実装例：**

```javascript
function buildStockPayload(inventoryDataMap) {
    const payload = [];

    for (const [goodsCode, data] of inventoryDataMap) {
        payload.push({
            "商品コード":       goodsCode,
            "在庫数":           data.stock_quantity           || 0,
            "引当数":           data.stock_allocated_quantity || 0,
            "フリー在庫数":     data.stock_free_quantity      || 0,
            "予約在庫数":       data.stock_advance_order_quantity || 0,
            "予約引当数":       data.stock_advance_order_allocation_quantity || 0,
            "予約フリー在庫数": data.stock_advance_order_free_quantity || 0,
            "不良在庫数":       data.stock_defective_quantity        || 0,
            "発注残数":         data.stock_remaining_order_quantity  || 0,
            "欠品数":           data.stock_out_quantity              || 0
        });
    }

    return payload;
}
```

---

#### ② `upsertStockToSupabase(inventoryDataMap)`

**目的：** バッチ1回分の在庫データを Supabase に送信する。  
バッチはすでに最大1,000件に分割されて渡されるため、  
この関数内での再分割は行わない（1回のRPC呼び出しで送る）。

**引数：**
- `inventoryDataMap` — バッチ1回分の在庫データ Map（最大1,000件）

**返却値：** `{ records: number, success: boolean }`

**処理フロー：**

1. `inventoryDataMap` が空の場合は即座に `{ records: 0, success: true }` を返す
2. `buildStockPayload(inventoryDataMap)` を呼び出してオブジェクト配列に変換する
3. `callSupabaseRpc('upsert_ne_stock_data', { json_data: payload })` を呼び出す
4. 成功・失敗を返却値に含めて返す

**エラーハンドリング：**

- 失敗時は `logError()` で記録する
- **`throw` しない** — バッチ全体の処理を止めないようにするため
- 失敗時は `{ records: payload.length, success: false }` を返す

**実装例：**

```javascript
function upsertStockToSupabase(inventoryDataMap) {
    if (inventoryDataMap.size === 0) {
        return { records: 0, success: true };
    }

    const payload = buildStockPayload(inventoryDataMap);

    try {
        callSupabaseRpc('upsert_ne_stock_data', { json_data: payload });
        return { records: payload.length, success: true };
    } catch (error) {
        logError(`Supabase在庫更新エラー: ${error.message}`);
        return { records: payload.length, success: false };
    }
}
```

---

### タスク2：`10_Main.エントリーポイント.gs` への追記

`updateInventoryDataBatchWithRetry()` のバッチループ内に  
Supabase書き込みを追加する。

**変更方針：**
- スプレッドシートへの書き込み（`updateBatchInventoryData()`）の直後に追記する
- 既存コードの削除・変更は一切行わないこと
- Supabaseの書き込みが失敗してもバッチループは継続すること（`upsertStockToSupabase` が throw しない設計）

#### 変更箇所の特定

`updateInventoryDataBatchWithRetry()` 関数内、バッチループの以下の部分の直後：

```javascript
                // ★★★ ここを変更: リトライ対応版の関数を使用 ★★★
                const inventoryDataMap = getBatchInventoryDataWithRetry(batch, tokens, batchNumber);

                const batchEndTime = new Date();
                const batchDuration = (batchEndTime - batchStartTime) / 1000;

                // バッチ単位で一括更新（既存コードをそのまま使用）
                const updateResult = updateBatchInventoryData(
                    sheet,
                    batch,
                    inventoryDataMap,
                    rowIndexMap
                );
```

#### 変更後（`updateBatchInventoryData()` の呼び出し直後に追記）

```javascript
                // バッチ単位で一括更新（既存コードをそのまま使用）
                const updateResult = updateBatchInventoryData(
                    sheet,
                    batch,
                    inventoryDataMap,
                    rowIndexMap
                );

                // Supabaseへの書き込み（バッチ単位）
                const supabaseResult = upsertStockToSupabase(inventoryDataMap);
                if (!supabaseResult.success) {
                    logWithLevel(LOG_LEVEL.MINIMAL,
                        `  Supabase書き込み失敗（バッチ${batchNumber}）: ${supabaseResult.records}件`);
                }
```

#### ファイルヘッダーの更新

`10_Main.エントリーポイント.gs` の `@file` JSDoc の依存ファイルリストに追記する。  
Phase 2 で追記した行の末尾に続けて追加する：

```javascript
 * - 17_SupabaseRepository.gs: Supabaseへのデータ書き込み（在庫マスタ更新を含む）
```

※ Phase 2 で既に `17_SupabaseRepository.gs` への参照が追記されている場合は、  
その行のコメント内容を上記のように更新するだけでよい。

---

### タスク3：`99_Tests.テスト.gs` への追記

既存ファイルの末尾に以下の2つの関数を追記する。

#### ① `testBuildStockPayload()`

**目的：** `buildStockPayload()` の変換ロジック単体テスト

```javascript
function testBuildStockPayload() {
    console.log('=== buildStockPayload テスト ===\n');

    try {
        // スプレッドシートから先頭3件の商品コードを取得
        const { SPREADSHEET_ID, SHEET_NAME } = getSpreadsheetConfig();
        const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
        const codes = sheet.getRange(2, 1, 3, 1).getValues()
            .map(r => r[0]).filter(c => c);

        const tokens = getStoredTokens();

        // 在庫マスタAPIから3件取得
        const inventoryDataMap = getBatchInventoryDataWithRetry(codes, tokens, 0);

        console.log(`取得件数: ${inventoryDataMap.size}件\n`);

        // 変換実行
        const payload = buildStockPayload(inventoryDataMap);

        // 結果確認
        console.log('【変換結果（先頭1件）】');
        if (payload.length > 0) {
            const sample = payload[0];
            console.log(`商品コード    : ${sample['商品コード']}`);
            console.log(`在庫数        : ${sample['在庫数']} (${typeof sample['在庫数']})`);
            console.log(`引当数        : ${sample['引当数']}`);
            console.log(`フリー在庫数  : ${sample['フリー在庫数']}`);
            console.log(`商品名        : ${sample['商品名'] !== undefined ? '❌ 含まれている（削除すること）' : '✓ 含まれていない'}`);
            console.log(`JANコード     : ${sample['JANコード'] !== undefined ? '❌ 含まれている（削除すること）' : '✓ 含まれていない'}`);
        }

        console.log('\n✓ buildStockPayload テスト完了');

    } catch (error) {
        console.error(`テストエラー: ${error.message}`);
    }
}
```

#### ② `testUpsertStockToSupabase()`

**目的：** `upsertStockToSupabase()` の結合テスト  
（実際に在庫マスタAPIからデータを取得してSupabaseに書き込む）

```javascript
function testUpsertStockToSupabase() {
    console.log('=== Supabase 在庫マスタ upsert テスト（10件） ===\n');

    try {
        // スプレッドシートから先頭10件の商品コードを取得
        const { SPREADSHEET_ID, SHEET_NAME } = getSpreadsheetConfig();
        const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
        const lastRow = sheet.getLastRow();
        const codes = sheet.getRange(2, 1, Math.min(10, lastRow - 1), 1)
            .getValues().map(r => r[0]).filter(c => c).slice(0, 10);

        console.log(`テスト対象: ${codes.join(', ')}\n`);

        const tokens = getStoredTokens();

        // 在庫マスタAPIから取得
        console.log('在庫マスタAPIから取得中...');
        const inventoryDataMap = getBatchInventoryDataWithRetry(codes, tokens, 0);
        console.log(`取得件数: ${inventoryDataMap.size}件\n`);

        // Supabaseへ書き込み
        console.log('Supabaseへ書き込み中...');
        const result = upsertStockToSupabase(inventoryDataMap);

        // 結果出力
        console.log('\n=== テスト結果 ===');
        console.log(`レコード数  : ${result.records}件`);
        console.log(`成功        : ${result.success ? '✓' : '✗'}`);

        console.log('\n【Supabaseダッシュボードで以下を確認してください】');
        console.log('Table Editor → NE_InventoryData');
        console.log('上記商品コードの在庫数が更新されているか確認してください。');
        console.log('商品名・JANコードが変わっていないことも確認してください。');
        console.log('在庫数が変化していない商品は 更新日時 が変わっていないはずです。');

    } catch (error) {
        console.error(`テストエラー: ${error.message}`);
    }
}
```

---

## 6. `inventoryDataMap` のデータ構造（参照用）

`getBatchInventoryDataWithRetry()` が返す Map の value 構造  
（`14_InventoryLogic.ビジネスロジック.gs` の `getBatchInventoryDataWithRetry()` より）：

```javascript
{
    goods_id: "XXXX-001",                            // 商品コード（string）
    goods_name: '',                                   // 空文字（在庫マスタAPIでは取得しない）
    stock_quantity: 10,                               // 在庫数（parseInt済み、number）
    stock_allocated_quantity: 2,                      // 引当数
    stock_free_quantity: 8,                           // フリー在庫数
    stock_defective_quantity: 0,                      // 不良在庫数
    stock_advance_order_quantity: 0,                  // 予約在庫数
    stock_advance_order_allocation_quantity: 0,       // 予約引当数
    stock_advance_order_free_quantity: 0,             // 予約フリー在庫数
    stock_remaining_order_quantity: 5,                // 発注残数
    stock_out_quantity: 0                             // 欠品数
}
```

**注意：** `14_InventoryLogic.gs` で既に `parseInt()` 変換済みのため、  
`buildStockPayload()` 内での再変換は不要だが、  
念のため `|| 0` のフォールバックは付けること。

---

## 7. Phase 2 との関数名対応表

混乱を避けるため、Phase 2 と Phase 3 の関数名を整理する。

| 役割 | Phase 2（商品マスタ全件） | Phase 3（在庫マスタ差分） |
|------|--------------------------|--------------------------|
| ペイロード変換 | `buildSupabasePayload(goodsMap)` | `buildStockPayload(inventoryDataMap)` |
| Supabase書き込み | `upsertInventoryToSupabase(goodsMap)` | `upsertStockToSupabase(inventoryDataMap)` |
| 使用RPC関数 | `upsert_ne_inventory_data` | `upsert_ne_stock_data` |
| チャンク分割 | あり（500件） | なし（バッチ単位で1回送信） |

---

## 8. 完了条件

以下をすべて満たした状態を Phase 3 完了とする。

- [ ] Supabase に `upsert_ne_stock_data` 関数が作成されている
- [ ] `testSupabaseConnection()` から新しいRPC関数の存在が確認できている
- [ ] `17_SupabaseRepository.Supabase永続化.gs` に `buildStockPayload()` と `upsertStockToSupabase()` が追記されている
- [ ] `10_Main.エントリーポイント.gs` のバッチループ内に Supabase 書き込みが追記されている
- [ ] `testBuildStockPayload()` を実行して変換結果に商品名・JANコードが含まれていないことを確認
- [ ] `testUpsertStockToSupabase()` を実行してステータスコード 204 が返ること
- [ ] Supabase ダッシュボードで商品名・JANコードが変わっていないことを確認
- [ ] 在庫数に変化がなかった商品の `更新日時` が変わっていないことを確認
- [ ] 既存ファイルのロジックが変更されていないこと（追記のみ）
- [ ] `updateInventoryDataBatchWithRetry()` を実際に実行してエラーが出ないことを確認

---

## 9. 実装しないこと（スコープ外）

以下は Phase 4 以降で実装する。

- `更新日時` を使った差分取得機能（Phase 4）
- Supabase から変更商品のみを取得するクエリ（Phase 4）
- README.md の更新（Phase 5）

---

*以上が Phase 3 の実装指示書です。*  
*Supabase への SQL 実行（セクション3）を必ず先に完了させてから GAS の実装を進めてください。*
