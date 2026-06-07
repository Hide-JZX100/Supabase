# 開発指示書：Phase 4 - 更新日時による差分取得機能

**プロジェクト名：** NE_在庫情報取得（ネクストエンジン × Supabase 連携）  
**対象フェーズ：** Phase 4  
**前提：** Phase 1〜3 が完了していること  
**目的：** Supabase の `更新日時` 列を活用し、前回実行以降に変化した商品のみを取得する仕組みを構築する

---

## 1. フェーズ概要

Phase 3 までで「ネクストエンジン → Supabase への書き込み」が完成した。  
Phase 4 では「Supabase からの読み取り」機能を実装する。

### 目的と活用シナリオ

1日6回実行される在庫更新のうち、**実際に在庫数が変化した商品だけを把握したい**。

```
【在庫更新の流れ（Phase 3 完了後）】

  NE API → GAS → Supabase (upsert_ne_stock_data)
                    │
                    └─ 差分がある商品だけ 更新日時 を更新
                       差分がない商品は 更新日時 を変更しない

【Phase 4 で追加する機能】

  Supabase → GAS → （将来）別プロジェクト・外部連携
                    │
                    └─ 前回実行日時以降に 更新日時 が変わった商品だけ取得
```

### 処理フローのイメージ

```
getChangedInventorySince(lastExecutedAt)
    │
    ├─ Supabase REST API に GET リクエスト
    │   フィルタ: 更新日時 >= lastExecutedAt
    │
    └─ 変化した商品データの配列を返す
```

---

## 2. 変更・追加するファイル一覧

```
【GAS側】
16_SupabaseClient.Supabase接続.gs        ← 【追記】GET汎用関数を追加
17_SupabaseRepository.Supabase永続化.gs  ← 【追記】差分取得関数を追加
99_Tests.テスト.gs                        ← 【追記】Phase 4 テスト関数を追加
```

**変更しないファイル（触らないこと）：**

```
10_Main.エントリーポイント.gs
11_Config.設定管理.gs
12_Logger.ログ管理.gs
13_NextEngineAPI.API通信.gs
14_InventoryLogic.ビジネスロジック.gs
15_SpreadsheetRepository.データ永続化.gs
トリガー設定.gs
```

---

## 3. コーディング規約

Phase 1〜3 と同じ規約に従うこと。

- **ファイルヘッダー・関数ヘッダーの JSDoc は必須**
- **エラーログは `logError()`（12_Logger.ログ管理.gs）を使うこと**
- **進捗ログは `logWithLevel(LOG_LEVEL.MINIMAL, ...)` を使うこと**
- **エラーは `try-catch` でキャッチ後、`logError()` で記録し `throw` で再スローすること**
- **既存ファイルを変更する場合は追記のみ。既存コードは削除・変更しないこと**

---

## 4. Supabase REST API による読み取りの仕組み

Phase 1〜3 では RPC（POST）で書き込みを行った。  
Phase 4 では REST API の **GET リクエスト** でデータを読み取る。

### エンドポイントとフィルタの仕様

```
GET {SUPABASE_URL}/rest/v1/NE_InventoryData
    ?更新日時=gte.{ISO8601形式の日時}
    &order=更新日時.desc
    &limit={件数上限}

ヘッダー:
  apikey        : {SUPABASE_KEY}
  Authorization : Bearer {SUPABASE_KEY}
  Accept        : application/json
```

### フィルタ演算子の説明

| 演算子 | 意味 | 例 |
|--------|------|----|
| `gte.` | 以上（Greater Than or Equal） | `更新日時=gte.2026-05-25T08:00:00` |
| `order=列名.desc` | 降順ソート | `order=更新日時.desc` |
| `limit=N` | 取得件数上限 | `limit=100` |

### 日時フォーマット（重要）

Supabase に渡す日時は **ISO 8601 形式** である必要がある。  
GAS での変換例：

```javascript
// Date オブジェクト → ISO 8601 文字列
const isoString = new Date().toISOString();
// 例: "2026-05-25T08:00:00.000Z"  ← UTC

// JST（日本時間）で指定する場合は +09:00 を付ける
// 例: "2026-05-25T08:00:00+09:00"
// → Supabase は タイムゾーン付き文字列を正しく解釈する
```

### レスポンスの形式

```javascript
// 成功時（ステータス 200）
// レスポンスボディは JSON 配列
[
    {
        "商品コード": "XXXX-001",
        "商品名": "サンプル商品A",
        "在庫数": 15,
        "引当数": 3,
        "フリー在庫数": 12,
        "予約在庫数": 0,
        "予約引当数": 0,
        "予約フリー在庫数": 0,
        "不良在庫数": 0,
        "発注残数": 0,
        "欠品数": 0,
        "JANコード": 4901234567890,
        "更新日時": "2026-05-25T08:05:32.123456+00:00"
    },
    ...
]

// データなし（フィルタ条件に一致するレコードがない場合）
[]   ← 空配列（ステータスは 200）
```

---

## 5. タスク詳細

---

### タスク1：`16_SupabaseClient.Supabase接続.gs` に追記

既存の `callSupabaseRpc()` に続けて、**GET リクエスト用の汎用関数**を追記する。  
**既存の `getSupabaseConfig()` と `callSupabaseRpc()` は変更しないこと。**

#### `querySupabaseTable(tableName, queryParams)`

**目的：** Supabase REST API への GET リクエストを汎用的に行う関数。  
RPC（書き込み）に対して、テーブルへの読み取りを担当する。

**引数：**
- `tableName` {string} — テーブル名（例: `"NE_InventoryData"`）
- `queryParams` {Object} — クエリパラメータのオブジェクト（後述）

**返却値：** `{ success: boolean, statusCode: number, data: Array }`

**`queryParams` の形式：**

```javascript
// 呼び出し例
querySupabaseTable('NE_InventoryData', {
    '更新日時': 'gte.2026-05-25T08:00:00+09:00',
    'order': '更新日時.desc',
    'limit': '1000'
});

// URLに変換されるイメージ
// /rest/v1/NE_InventoryData?更新日時=gte.2026-05-25T08:00:00+09:00&order=更新日時.desc&limit=1000
```

**実装のポイント：**

- `queryParams` のキーと値を `encodeURIComponent()` でエンコードして URL クエリ文字列を組み立てる
- テーブル名もエンコードすること（日本語テーブル名対応）
- `muteHttpExceptions: true` を設定してエラーレスポンスの詳細を取得できるようにする
- ステータスコード 200 を正常とする（GET なので 204 は返らない）
- 正常時はレスポンスボディを `JSON.parse()` して `data` に格納して返す
- 異常時は `logError()` で記録後に `throw` する

**実装例：**

```javascript
/**
 * Supabase REST API テーブルへの GET リクエスト汎用ラッパー
 *
 * @param {string} tableName   - テーブル名（日本語名も可）
 * @param {Object} queryParams - クエリパラメータ { 列名: 'operator.value', ... }
 * @return {Object} { success: boolean, statusCode: number, data: Array }
 * @throws {Error} HTTPエラーまたは通信エラーの場合
 */
function querySupabaseTable(tableName, queryParams) {
    const config = getSupabaseConfig();

    // クエリ文字列を組み立てる
    const queryString = Object.keys(queryParams)
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`)
        .join('&');

    const url = `${config.url}/rest/v1/${encodeURIComponent(tableName)}?${queryString}`;

    const options = {
        method: 'get',
        headers: {
            'apikey': config.key,
            'Authorization': `Bearer ${config.key}`,
            'Accept': 'application/json'
        },
        muteHttpExceptions: true
    };

    try {
        const response = UrlFetchApp.fetch(url, options);
        const statusCode = response.getResponseCode();
        const body = response.getContentText();

        if (statusCode === 200) {
            const data = JSON.parse(body);
            return { success: true, statusCode, data };
        } else {
            const message = `Supabase GET エラー (${tableName}): ステータス ${statusCode} - ${body}`;
            logError(message);
            throw new Error(message);
        }
    } catch (error) {
        if (!error.message.includes('Supabase GET エラー')) {
            logError(`Supabase GET 通信エラー (${tableName}):`, error.message);
        }
        throw error;
    }
}
```

**ファイルヘッダーの更新：**

`16_SupabaseClient.Supabase接続.gs` の `@file` JSDoc に以下を追記する。

```javascript
 * @see querySupabaseTable - テーブルへのGETリクエスト汎用ラッパー（Phase 4追加）
```

---

### タスク2：`17_SupabaseRepository.Supabase永続化.gs` に追記

既存関数の末尾に以下の3つの関数を追記する。  
**既存の関数は変更しないこと。**

---

#### ① `getChangedInventorySince(since)`

**目的：** 指定日時以降に `更新日時` が更新された商品データを Supabase から取得する。  
在庫に変化があった商品のみが返るため、差分処理や通知に活用できる。

**引数：**
- `since` {Date|string} — 取得基準日時。Date オブジェクトまたは ISO 8601 文字列

**返却値：** `Array` — 変化した商品オブジェクトの配列（0件の場合は空配列）

```javascript
/**
 * 指定日時以降に更新された在庫データを取得する
 *
 * 【処理フロー】
 * 1. 引数の日時を ISO 8601 文字列に変換する
 * 2. querySupabaseTable() で 更新日時 >= since の条件でフィルタリング
 * 3. 取得データを配列で返す（0件の場合は空配列）
 *
 * 【取得上限について】
 * Supabase REST API のデフォルト上限は1,000件。
 * SUPABASE_QUERY_LIMIT 定数で調整可能。
 * 商品数が1,000件を超える場合は将来的にページネーション対応が必要。
 *
 * @param  {Date|string} since - 取得基準日時（この日時以降に更新された商品を取得）
 * @return {Array} 変化した商品データの配列
 * @throws {Error} Supabase への接続エラーの場合
 */
function getChangedInventorySince(since) {
    // Date オブジェクトの場合は ISO 8601 文字列に変換
    const sinceStr = (since instanceof Date) ? since.toISOString() : since;

    logWithLevel(LOG_LEVEL.MINIMAL, `差分取得開始: ${sinceStr} 以降に更新された商品`);

    try {
        const result = querySupabaseTable('NE_InventoryData', {
            '更新日時': `gte.${sinceStr}`,
            'order': '更新日時.desc',
            'limit': SUPABASE_QUERY_LIMIT.toString()
        });

        logWithLevel(LOG_LEVEL.MINIMAL, `差分取得完了: ${result.data.length}件`);
        return result.data;

    } catch (error) {
        logError('差分取得エラー:', error.message);
        throw error;
    }
}
```

---

#### ② `saveLastExecutedAt()`

**目的：** 現在時刻をスクリプトプロパティ `SUPABASE_LAST_EXECUTED_AT` に保存する。  
次回実行時に `loadLastExecutedAt()` で読み出し、差分取得の基準日時として使用する。

```javascript
/**
 * 最終実行日時をスクリプトプロパティに保存する
 *
 * 保存キー: SUPABASE_LAST_EXECUTED_AT
 * 保存形式: ISO 8601 文字列（UTC）
 *
 * 【使用タイミング】
 * getChangedInventorySince() で差分取得を行った直後に呼び出す。
 * 次回実行時に loadLastExecutedAt() で読み出して基準日時として使用する。
 */
function saveLastExecutedAt() {
    const now = new Date();
    const isoString = now.toISOString();
    PropertiesService.getScriptProperties()
        .setProperty('SUPABASE_LAST_EXECUTED_AT', isoString);
    logWithLevel(LOG_LEVEL.MINIMAL, `最終実行日時を保存: ${isoString}`);
    return isoString;
}
```

---

#### ③ `loadLastExecutedAt(fallbackHours)`

**目的：** スクリプトプロパティから最終実行日時を読み出す。  
未保存の場合（初回実行時など）は `fallbackHours` 時間前の日時をデフォルトとして返す。

**引数：**
- `fallbackHours` {number} — 未保存時のフォールバック時間数（デフォルト: 2）

**返却値：** {Date} 最終実行日時（または現在時刻 - fallbackHours 時間）

```javascript
/**
 * 最終実行日時をスクリプトプロパティから読み出す
 *
 * 【フォールバックについて】
 * 初回実行時や手動でプロパティを削除した場合など、
 * 保存値が存在しない場合は fallbackHours 時間前の日時を返す。
 * デフォルトは 2時間前（在庫更新の実行間隔を考慮）。
 *
 * @param  {number} fallbackHours - 未保存時のフォールバック時間数（デフォルト: 2）
 * @return {Date} 最終実行日時
 */
function loadLastExecutedAt(fallbackHours = 2) {
    const saved = PropertiesService.getScriptProperties()
        .getProperty('SUPABASE_LAST_EXECUTED_AT');

    if (saved) {
        logWithLevel(LOG_LEVEL.MINIMAL, `最終実行日時を読み込み: ${saved}`);
        return new Date(saved);
    }

    // 未保存時はフォールバック
    const fallback = new Date(Date.now() - fallbackHours * 60 * 60 * 1000);
    logWithLevel(LOG_LEVEL.MINIMAL,
        `最終実行日時が未保存のため ${fallbackHours}時間前 を使用: ${fallback.toISOString()}`);
    return fallback;
}
```

---

#### ④ `SUPABASE_QUERY_LIMIT` 定数の追記

`17_SupabaseRepository.Supabase永続化.gs` の定数定義セクション（ファイル冒頭付近）に追記する。  
**既存の `SUPABASE_CHUNK_SIZE` の定義の直後に追記すること。**

```javascript
/** Supabase REST API の1回のクエリで取得するレコード数上限 */
const SUPABASE_QUERY_LIMIT = 5000;
```

**設定値の根拠：**  
Supabase REST API のデフォルト上限は1,000件だが、  
Supabase プロジェクトの設定で上限を引き上げている場合に備えて5,000件とする。  
商品数が増加した場合はこの値を調整すること。  
現在の商品数（約3,200件）であれば5,000件で全件カバーできる。

---

#### ファイルヘッダーの更新

`17_SupabaseRepository.Supabase永続化.gs` の `@file` JSDoc に以下を追記する。

```javascript
 * ### Phase 4 追加関数（差分取得）
 * @see getChangedInventorySince - 指定日時以降に更新された商品データを取得
 * @see saveLastExecutedAt      - 最終実行日時をスクリプトプロパティに保存
 * @see loadLastExecutedAt      - 最終実行日時をスクリプトプロパティから読み出す
```

---

### タスク3：`99_Tests.テスト.gs` への追記

既存ファイルの末尾に以下の3つの関数を追記する。

---

#### ① `testQuerySupabaseTable()`

**目的：** `querySupabaseTable()` の動作確認（直近1時間のデータを取得）

```javascript
function testQuerySupabaseTable() {
    console.log('=== querySupabaseTable テスト（直近1時間） ===\n');

    try {
        // 1時間前の日時を ISO 8601 形式で用意
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const sinceStr = oneHourAgo.toISOString();

        console.log(`取得基準日時: ${sinceStr}`);
        console.log('Supabaseに問い合わせ中...\n');

        const result = querySupabaseTable('NE_InventoryData', {
            '更新日時': `gte.${sinceStr}`,
            'order': '更新日時.desc',
            'limit': '10'
        });

        console.log('=== テスト結果 ===');
        console.log(`ステータス: ${result.statusCode}`);
        console.log(`取得件数  : ${result.data.length}件`);

        if (result.data.length > 0) {
            console.log('\n【先頭3件】');
            result.data.slice(0, 3).forEach((item, i) => {
                console.log(`[${i + 1}] ${item['商品コード']} | 在庫:${item['在庫数']} | 更新日時:${item['更新日時']}`);
            });
        } else {
            console.log('→ 直近1時間に更新された商品はありませんでした');
            console.log('→ 在庫更新を実行してから再テストしてください');
        }

        console.log('\n✓ querySupabaseTable テスト完了');

    } catch (error) {
        console.error(`テストエラー: ${error.message}`);
    }
}
```

---

#### ② `testGetChangedInventorySince()`

**目的：** `getChangedInventorySince()` の動作確認

```javascript
function testGetChangedInventorySince() {
    console.log('=== getChangedInventorySince テスト ===\n');

    try {
        // テスト1: 直近2時間の変化商品を取得
        console.log('【テスト1】直近2時間の変化商品を取得');
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const changedItems = getChangedInventorySince(twoHoursAgo);

        console.log(`取得件数: ${changedItems.length}件`);
        if (changedItems.length > 0) {
            console.log('\n【先頭3件のサンプル】');
            changedItems.slice(0, 3).forEach((item, i) => {
                console.log(`[${i + 1}] 商品コード: ${item['商品コード']}`);
                console.log(`     在庫数: ${item['在庫数']} | フリー在庫: ${item['フリー在庫数']}`);
                console.log(`     更新日時: ${item['更新日時']}`);
            });
        }

        // テスト2: 未来日時を指定 → 0件になることを確認
        console.log('\n【テスト2】未来日時を指定（0件になるはず）');
        const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const emptyResult = getChangedInventorySince(futureDate);
        console.log(`取得件数: ${emptyResult.length}件 ${emptyResult.length === 0 ? '✓（期待通り）' : '❌（0件になるはず）'}`);

        console.log('\n✓ getChangedInventorySince テスト完了');

    } catch (error) {
        console.error(`テストエラー: ${error.message}`);
    }
}
```

---

#### ③ `testLastExecutedAtFlow()`

**目的：** `saveLastExecutedAt()` → `loadLastExecutedAt()` の保存・読み出しフローの確認

```javascript
function testLastExecutedAtFlow() {
    console.log('=== 最終実行日時 保存・読み出しフロー テスト ===\n');

    try {
        // テスト1: 初回読み出し（保存前）
        console.log('【テスト1】保存前の読み出し（フォールバック動作確認）');
        // 既存の保存値を一時退避
        const props = PropertiesService.getScriptProperties();
        const existing = props.getProperty('SUPABASE_LAST_EXECUTED_AT');
        props.deleteProperty('SUPABASE_LAST_EXECUTED_AT');

        const fallback = loadLastExecutedAt(2);
        const expectedMin = new Date(Date.now() - 2 * 60 * 60 * 1000 - 5000); // 誤差5秒許容
        const isFallbackOk = fallback >= expectedMin;
        console.log(`フォールバック値: ${fallback.toISOString()}`);
        console.log(`期待通りか: ${isFallbackOk ? '✓' : '❌'}`);

        // テスト2: 保存
        console.log('\n【テスト2】現在時刻を保存');
        const saved = saveLastExecutedAt();
        console.log(`保存値: ${saved}`);

        // テスト3: 読み出し
        console.log('\n【テスト3】保存後の読み出し');
        const loaded = loadLastExecutedAt();
        const isMatch = Math.abs(new Date(saved) - loaded) < 1000; // 1秒以内の誤差を許容
        console.log(`読み出し値: ${loaded.toISOString()}`);
        console.log(`保存値と一致: ${isMatch ? '✓' : '❌'}`);

        // 元の保存値を復元
        if (existing) {
            props.setProperty('SUPABASE_LAST_EXECUTED_AT', existing);
            console.log('\n元の保存値を復元しました');
        }

        console.log('\n✓ 最終実行日時フロー テスト完了');

    } catch (error) {
        console.error(`テストエラー: ${error.message}`);
    }
}
```

---

## 6. 使用シナリオと呼び出しパターン（参考）

Phase 4 で実装した関数の典型的な使い方を示す。  
この関数群は将来の別プロジェクトや通知機能から呼び出されることを想定している。

### シナリオA：定期的な差分確認

```javascript
// 別プロジェクトや将来の機能から呼び出すイメージ
function checkStockChanges() {
    // 前回実行日時を読み込む
    const since = loadLastExecutedAt(2); // 未保存時は2時間前

    // 変化した商品を取得
    const changedItems = getChangedInventorySince(since);

    if (changedItems.length === 0) {
        console.log('変化なし');
    } else {
        console.log(`${changedItems.length}件の在庫が変化しました`);
        // → 通知・連携処理などをここに実装
    }

    // 実行日時を保存（次回の基準点として使用）
    saveLastExecutedAt();
}
```

### シナリオB：特定日時からの差分確認

```javascript
// 今日の0:10（商品マスタ更新直後）以降の変化を取得
const since = new Date('2026-05-25T00:10:00+09:00');
const changes = getChangedInventorySince(since);
```

---

## 7. Supabase 側の確認事項

Phase 4 は既存のテーブルと RPC 関数をそのまま使うため、  
Supabase 側での SQL 実行は不要。  
ただし、以下の点を確認しておくこと。

### `更新日時` 列にインデックスがあるか確認

差分取得では `更新日時 >= 指定日時` というフィルタを頻繁に使う。  
商品数が増えた場合のパフォーマンスのために、インデックスがあると望ましい。

```sql
-- 確認クエリ
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'NE_InventoryData'
  AND schemaname = 'public';
```

`更新日時` のインデックスが存在しない場合は以下を実行する（任意）：

```sql
-- 更新日時列へのインデックス作成
CREATE INDEX IF NOT EXISTS idx_ne_inventory_updated_at
    ON public."NE_InventoryData" ("更新日時" DESC);
```

---

## 8. 完了条件

以下をすべて満たした状態を Phase 4 完了とする。

- [ ] `querySupabaseTable()` が `16_SupabaseClient.Supabase接続.gs` に追記されている
- [ ] `getChangedInventorySince()` が `17_SupabaseRepository.Supabase永続化.gs` に追記されている
- [ ] `saveLastExecutedAt()` と `loadLastExecutedAt()` が追記されている
- [ ] `SUPABASE_QUERY_LIMIT` 定数が追記されている
- [ ] `testQuerySupabaseTable()` を実行して正常にデータが取得できること
- [ ] `testGetChangedInventorySince()` のテスト2（未来日時）で 0件が返ること
- [ ] `testLastExecutedAtFlow()` が全て ✓ になること
- [ ] 在庫更新（`updateInventoryDataBatchWithRetry()`）を実行した後に `getChangedInventorySince()` を実行し、変化した商品のみが返ることを確認できること
- [ ] 既存ファイルのロジックが変更されていないこと（追記のみ）

---

## 9. 実装しないこと（スコープ外）

以下は Phase 5 で実施する。

- `getChangedInventorySince()` を定期実行トリガーに組み込む処理
- 差分データを使った通知・外部連携処理
- README.md の更新
- `Old/` フォルダのファイル削除整理

---

*以上が Phase 4 の実装指示書です。*  
*Supabase 側のインデックス確認（セクション7）は任意ですが、商品数増加時のパフォーマンスに影響するため実施を推奨します。*
