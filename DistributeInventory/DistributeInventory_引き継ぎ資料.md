# 引き継ぎ資料：DistributeInventory プロジェクト

**作成日：** 2026年6月  
**引き継ぎ元プロジェクト：** GetInventoryData（書き込み側・稼働中）  
**新規プロジェクト：** DistributeInventory（読み込み・配布側）  
**目的：** Supabase から在庫データを読み込み、複数のスプレッドシートに配布する GAS プロジェクトを新規構築する

\---

## 1\. 背景と全体設計

### システム全体像

```
【GetInventoryData プロジェクト（稼働中・変更なし）】
  ネクストエンジン API
      ↓ GAS が定期取得
  Google スプレッドシート A（メイン・IMPORTRANGE の起点）
  Supabase / ne_inventory_data テーブル
      ↑ 在庫変化があった商品の「更新日時」が更新される

【DistributeInventory プロジェクト（新規構築）】
  Supabase / ne_inventory_data テーブル
      ↓ getChangedInventorySince() で差分取得
  Spreadsheet B（用途別）
  Spreadsheet C（用途別）
  Spreadsheet D（用途別）
```

### 設計方針の決定事項

* **書き込みと読み込みのプロジェクトを分離する**（責務の分離・認証情報の最小化）
* **NE API の認証情報は新プロジェクトに持たせない**（SUPABASE\_KEY のみ使用）
* **差分取得**（`getChangedInventorySince()`）を使い、前回実行以降に変化した商品のみを取得する
* **書き込み列は全13列**（既存12列 ＋ M列として「更新日時」を追加）
* **トリガーは既存の `トリガー設定.gs` のパターンを流用する**

\---

## 2\. 技術スタック

|項目|内容|
|-|-|
|実行環境|Google Apps Script（GAS）|
|データストア|Supabase（PostgreSQL 17）|
|認証|Supabase anon key（publishable key）のみ|
|NE API 認証|**不要**（読み込み専用のため）|
|NEAuth ライブラリ|**不要**|

\---

## 3\. Supabase 接続情報

### プロジェクト

|項目|値|
|-|-|
|プロジェクト名|B\&M Project|
|リージョン|`ap-northeast-1`（東京）|
|PostgreSQL|17.6.1|
|RLS|全テーブルで無効（GAS からは anon key でアクセス可能）|

### スクリプトプロパティ（新プロジェクトに設定するもの）

|キー|値|
|-|-|
|`SUPABASE_URL`|`https://---オーナーが設定---.supabase.co`|
|`SUPABASE_KEY`|Supabase anon key（publishable key）|
|`SUPABASE_LAST_EXECUTED_AT`|自動保存・初回は手動設定不要|
|`LOG_LEVEL`|`2`（SUMMARY 推奨）|
|`TRIGGER_FUNCTION_NAME`|配布処理のメイン関数名|
|`TRIGGER_MODE`|`TODAY` または `TOMORROW`|

\---

## 4. Supabase テーブル定義

### テーブル名

```
public.ne_inventory_data
```

### 列定義

|列名（日本語）|型|備考|
|---|---|---|
|商品コード|TEXT|PRIMARY KEY|
|商品名|TEXT||
|在庫数|INTEGER||
|引当数|INTEGER||
|フリー在庫数|INTEGER||
|予約在庫数|INTEGER||
|予約引当数|INTEGER||
|予約フリー在庫数|INTEGER||
|不良在庫数|INTEGER||
|発注残数|INTEGER||
|欠品数|INTEGER||
|JANコード|BIGINT|NULL あり|
|更新日時|TIMESTAMP WITH TIME ZONE|在庫変化時のみ更新|
|is_active|BOOLEAN|有効フラグ（有効: TRUE, 無効: FALSE）|

### 更新日時の仕組みと有効・無効管理（重要）

Supabase 側の RPC 関数 `upsert_ne_stock_data` が以下の条件で `更新日時` を更新する。

* 在庫数・引当数・フリー在庫数・欠品数のいずれかに変化がある → `更新日時` を `NOW()` に更新
* 上記4列が全て前回と同じ → `更新日時` を変更しない（過去の日時を維持）

これにより「更新日時 >= 前回実行日時」でフィルタすると、**実際に在庫が変化した商品のみ**が取得できる。

また、商品マスタ同期時にネクストエンジンで削除された（同期対象から外れた）商品は、`deactivate_missing_goods` RPC関数により `is_active = false`（非活性化）に更新されます。
`DistributeInventory` プロジェクトでは、Supabaseからデータを取得する際に `is_active = true`（有効）な商品のみをフィルタリングして取得します。

---

## 5. 書き込み先スプレッドシートの列構成

GetInventoryData プロジェクト（書き込み側）のスプレッドシートは12列構成だった。  
DistributeInventory プロジェクトでは **13列**（M列に更新日時を追加）で書き込む。

|列|項目名|Supabase 列名|
|-|-|-|
|A|商品コード|商品コード|
|B|商品名|商品名|
|C|在庫数|在庫数|
|D|引当数|引当数|
|E|フリー在庫数|フリー在庫数|
|F|予約在庫数|予約在庫数|
|G|予約引当数|予約引当数|
|H|予約フリー在庫数|予約フリー在庫数|
|I|不良在庫数|不良在庫数|
|J|発注残数|発注残数|
|K|欠品数|欠品数|
|L|JANコード|JANコード|
|M|更新日時|更新日時|

\---

## 6\. 参照できる既存コード（GetInventoryData プロジェクトより）

新プロジェクトでそのまま流用・参考にできる実装が GetInventoryData プロジェクトに存在する。

### 6-1. Supabase 接続（`16_SupabaseClient.Supabase接続.gs`）

新プロジェクトでも同じパターンで実装する。

```javascript
// Supabase接続設定を取得
function getSupabaseConfig() {
    const properties = PropertiesService.getScriptProperties();
    const url = properties.getProperty('SUPABASE_URL');
    const key = properties.getProperty('SUPABASE_KEY');
    if (!url || !key) {
        throw new Error('SUPABASE_URL および SUPABASE_KEY を設定してください。');
    }
    return { url, key };
}

// テーブルへの GET リクエスト汎用ラッパー
function querySupabaseTable(tableName, queryParams) {
    const config = getSupabaseConfig();
    const queryString = Object.keys(queryParams)
        .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(queryParams\\\[key]))
        .join('&');
    const url = config.url + '/rest/v1/' + encodeURIComponent(tableName) + '?' + queryString;
    const options = {
        method: 'get',
        headers: {
            'apikey': config.key,
            'Authorization': 'Bearer ' + config.key,
            'Accept': 'application/json'
        },
        muteHttpExceptions: true
    };
    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    if (statusCode === 200) {
        return { success: true, statusCode, data: JSON.parse(response.getContentText()) };
    } else {
        throw new Error('Supabase GET エラー: ステータス ' + statusCode);
    }
}
```

### 6-2. 差分取得（`14_SupabaseRepository.差分取得.gs`）

```javascript
// 指定日時以降に更新された商品を Supabase から取得する
function getChangedInventorySince(since) {
    const sinceStr = (since instanceof Date) ? since.toISOString() : since;
    const result = querySupabaseTable('NE_InventoryData', {
        '更新日時': 'gte.' + sinceStr,
        'order': '更新日時.desc',
        'limit': '1000'   // 現在の商品数は約3,200件
    });
    return result.data;
}

// 最終実行日時を保存
function saveLastExecutedAt() {
    const isoString = new Date().toISOString();
    PropertiesService.getScriptProperties()
        .setProperty('SUPABASE_LAST_EXECUTED_AT', isoString);
    return isoString;
}

// 最終実行日時を読み出す（未保存時は fallbackHours 時間前を返す）
function loadLastExecutedAt(fallbackHours = 2) {
    const saved = PropertiesService.getScriptProperties()
        .getProperty('SUPABASE_LAST_EXECUTED_AT');
    if (saved) return new Date(saved);
    return new Date(Date.now() - fallbackHours * 60 * 60 * 1000);
}
```

### 6-3. トリガー設定（`トリガー設定.gs`）

GetInventoryData プロジェクトの `トリガー設定.gs` と同じ実装をコピーして使用する。  
スクリプトプロパティ `TRIGGER_FUNCTION_NAME` と `TRIGGER_MODE` で制御する仕組みはそのまま流用できる。

### 6-4. コーディング規約

GetInventoryData プロジェクトの規約をそのまま継承する。

* **ファイル命名規則：** `NN_英語名.日本語説明.gs`
* **ファイルヘッダー：** `@file` JSDoc 必須
* **関数ヘッダー：** `@param` / `@return` / `@throws` 必須
* **ログ出力：** `logWithLevel(LOG_LEVEL.MINIMAL, ...)` を使用
* **エラーログ：** `logError()` を使用
* **エラー処理：** `try-catch` → `logError()` → `throw` で再スロー

\---

## 7\. 新プロジェクトのファイル構成（案）

```
DistributeInventory/
├── 10_Main.エントリーポイント.gs       ← メイン処理・オーケストレーション
├── 11_Config.設定管理.gs              ← 定数・設定値（ログレベル等）
├── 12_Logger.ログ管理.gs              ← ログ出力（GetInventoryDataから流用）
├── 13_SupabaseClient.Supabase接続.gs  ← Supabase GET リクエスト
├── 14_SupabaseRepository.差分取得.gs  ← getChangedInventorySince 等
├── 15_SheetRepository.シート書き込み.gs ← 各スプレッドシートへの書き込み
├── トリガー設定.gs                     ← GetInventoryDataから流用
├── 99_Tests.テスト.gs                  ← 動作確認・診断ツール
└── README.md
```

※ ファイル番号は GetInventoryData との混同を避けるため振り直している。

\---

## 8\. メイン処理の設計（実装前の合意事項）

### 処理フロー

```
distributeInventoryChanges()   ← トリガーに設定するメイン関数
    │
    ├─ Step 1: 前回実行日時を読み込む（loadLastExecutedAt）
    │
    ├─ Step 2: 差分データを Supabase から取得（getChangedInventorySince）
    │          変化なし（0件）の場合はここで終了
    │
    ├─ Step 3: 各スプレッドシートに書き込む
    │          複数シートの設定をループで処理
    │
    └─ Step 4: 今回の実行日時を保存（saveLastExecutedAt）
```

### 複数スプレッドシートの管理方針

スプレッドシートの設定（ID・シート名）はスクリプトプロパティで管理する。  
将来的にスプレッドシートが増減しても、コードを変更せずにプロパティ追加で対応できる設計にする。

設定例（スクリプトプロパティ）：

```
SHEET_CONFIG_1  : {"id":"スプレッドシートID\\\_B","sheet":"在庫管理"}
SHEET_CONFIG_2  : {"id":"スプレッドシートID\\\_C","sheet":"発注管理"}
SHEET_CONFIG_3  : {"id":"スプレッドシートID\\\_D","sheet":"欠品アラート"}
```

\---

## 9\. 未決定事項（新スレッドで決める）

以下の点を新スレッドの最初に確認・決定してから設計・実装に入ること。

1. **書き込み方式**

   * 差分データを既存シートに「上書き更新」する（商品コードで行を特定して該当行だけ更新）
   * または、差分データだけを「追記」する（ログ的な使い方）
   * または、毎回「全件書き直し」する（最もシンプルだが差分取得の恩恵が薄い）
2. **書き込み先スプレッドシートの数と用途**

   * 何枚のスプレッドシートに書き込むか
   * 各スプレッドシートで列の絞り込みやフィルタ（例：欠品数 >= 1 のみ）が必要か
3. **実行タイミング**

   * 在庫更新（GetInventoryData）の直後に実行したいか
   * 独立したスケジュールで実行するか

\---

## 10\. GetInventoryData プロジェクトの現状（参考）

### 稼働状況

* **2026年5月末から本番稼働・安定稼働を確認済み**
* トリガー実行中（0:10 商品マスタ全件 ＋ 1日6回 在庫差分）
* スプレッドシートと Supabase の両方への書き込みが正常に動作

### 実績データ規模

* 商品数：約 3,200件
* 全件取得時間：約 5〜6秒（API取得 ＋ Supabase 書き込み合計）
* 在庫差分更新時間：約 18〜20秒（1,000件バッチ × 4回）

### Supabase の実績

* `ne_inventory_data` テーブル：約 3,200行
* `upsert_ne_inventory_data` RPC：商品マスタ全件 upsert（全列更新）
* `upsert_ne_stock_data` RPC：在庫マスタ差分 upsert（在庫数値列のみ更新）
* 差分なし商品の `更新日時` は変更されないことを確認済み

\---

*この資料を新スレッドの最初のメッセージとして Claude に渡してください。*  
*セクション 9「未決定事項」への回答を添えると、スムーズに設計・実装フェーズに入れます。*

