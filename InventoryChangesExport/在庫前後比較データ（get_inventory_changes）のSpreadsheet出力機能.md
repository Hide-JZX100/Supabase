# Issue #23 開発指示書
## 在庫前後比較データ（get_inventory_changes）のSpreadsheet出力機能

---

## 1. 目的
Supabase RPC関数 `get_inventory_changes` の呼び出し結果を、
指定のSpreadsheetへ書き込む機能を実装する。
既存の `GetInventoryData` / `DistributeInventory` とは完全に独立した
新規スタンドアロンGASプロジェクトとして構築する。

## 2. 前提条件・方針（決定済み）
- **プロジェクト構成**：既存プロジェクトとは別の新規GASプロジェクトを作成する
- **出力先**：専用の新規シート「前後比較」を新設する（既存配信シートには触れない）
- **実行トリガー**：手動実行のみ。トリガー設定は行わない
- **接続情報**：URL・APIキーは直書き禁止。スクリプトプロパティに保存する

## 3. スクリプトプロパティ（事前設定が必要な項目）

| キー名 | 必須/任意 | 内容 | デフォルト値（未設定時） |
|---|---|---|---|
| `SUPABASE_URL` | **必須** | SupabaseプロジェクトのURL | - |
| `SUPABASE_KEY` | **必須** | Supabaseのanonキー | - |
| `TARGET_SPREADSHEET_ID` | **必須** | 出力先Spreadsheet of ID | - |
| `INPUT_SHEET_NAME` | 任意 | 商品コードの入力元のシート名 | `"入力"` |
| `OUTPUT_SHEET_NAME` | 任意 | 比較結果の出力先のシート名 | `"前後比較"` |
| `MAX_ITEM_LIMIT` | 任意 | 一度に処理可能な最大商品コード件数 | `500` |


## 4. ファイル構成（命名規則準拠：`NN_英語名.日本語説明.gs`）

```

01_Main.在庫前後比較実行.gs
02_SupabaseClient.Supabase接続.gs
03_SheetWriter.シート書き込み.gs

```

## 5. Spreadsheet仕様

新規Spreadsheet内に以下2シートを作成する。

### シート「入力」
商品コードを手動で入力するためのシート。

| 列 | 内容 |
|---|---|
| A列（2行目以降） | 比較したい商品コード（1行1コード） |

- 1行目はヘッダー（例：「商品コード」）

### シート「前後比較」
実行結果の出力先。実行するたびに既存内容をクリアしてから書き込む（追記ではなく全件上書き）。

| 列 | 内容 | 対応するRPCの戻り値 |
|---|---|---|
| A | 商品コード | item_code |
| B | 記録日時 | occurrence_at |
| C | 在庫数 | current_quantity |
| D | 在庫数_前回 | prev_quantity |
| E | 在庫数差分 | diff_quantity |
| F | フリー在庫数 | current_free_quantity |
| G | フリー在庫数_前回 | prev_free_quantity |
| H | フリー在庫数差分 | diff_free_quantity |

- 1行目はヘッダー行
- 日時（occurrence_at）はUTCで返るため、JSTに変換して書き込む（既存プロジェクトのUTC→JST変換方針を踏襲）

## 6. 実装する関数一覧

### 6-1. `01_Main.在庫前後比較実行.gs`

**関数：`runInventoryChangesExport()`**

- 用途：手動実行のエントリーポイント（唯一、人がスプレッドシートのメニュー等から直接実行する関数）
- 処理内容：
  1. シート「入力」のA列（2行目以降、空白行まで）から商品コード配列を取得する
  2. 商品コードが1件も無い場合は処理を中断し、ログにその旨を出力して終了する
  3. `fetchInventoryChanges_()` を呼び出しRPCの結果を取得する
  4. 取得できたデータを `writeInventoryChangesToSheet_()` に渡してシートへ書き込む
  5. 開始・終了・件数をログ出力する（既存プロジェクトのログ形式に準拠）
- JSDoc必須：`@file`, `@description`, `@throws`（RPC呼び出し失敗時）

### 6-2. `02_SupabaseClient.Supabase接続.gs`

**関数：`fetchInventoryChanges_(itemCodes)`**

- 用途：RPC関数 `get_inventory_changes` をHTTP経由で呼び出す
- 引数：`itemCodes`（string[]） - 商品コードの配列
- 戻り値：RPCから返却されたJSON配列（パース済みオブジェクト配列）
- 処理内容：
  1. スクリプトプロパティから `SUPABASE_URL` / `SUPABASE_KEY` を取得する
  2. `UrlFetchApp.fetch()` でPOSTリクエストを送信する（`test_get_inventory_changes.gs` のスタンドアロンテストと同じリクエスト形式を踏襲）
  3. ステータスコードが200以外の場合はエラーをthrowする（呼び出し元でキャッチしログ出力）
  4. 正常時はレスポンスボディをJSON.parseして返す
- JSDoc必須：`@param {string[]} itemCodes`, `@return {Object[]}`, `@throws`

### 6-3. `03_SheetWriter.シート書き込み.gs`

**関数：`writeInventoryChangesToSheet_(data)`**

- 用途：取得したデータをシート「前後比較」へ一括書き込みする
- 引数：`data`（Object[]） - RPCから取得した配列
- 処理内容：
  1. シート「前後比較」の既存データ範囲をクリアする（ヘッダー行は残す）
  2. `data` を2次元配列に変換する（occurrence_atはJSTに変換）
  3. `setValues()` による一括書き込みで反映する（案A方式。1件ずつ書き込まない）
- JSDoc必須：`@param {Object[]} data`

**関数：`getItemCodesFromInputSheet_()`**

- 用途：シート「入力」から商品コード配列を取得する
- 戻り値：string[]（空文字・空行は除外する）
- JSDoc必須：`@return {string[]}`

## 7. テスト方法

- **単一商品コード**：シート「入力」に商品コードを1件だけ入力し `runInventoryChangesExport()` を実行。「前後比較」シートに正しく1商品分の履歴が出力されることを確認する
- **複数商品コード**：シート「入力」に商品コードを複数件（2〜3件）入力し、同様に実行。商品ごとに前回値が正しくリセットされていること（前商品の最終行の値が次商品の前回値として混入していないこと）を確認する
- **異常系**：シート「入力」を空にして実行し、エラーにならず中断ログが出ることを確認する

## 8. 完了条件（Issue #23と対応）

- [ ] 新規GASプロジェクトを作成し、上記3ファイルを実装する
- [ ] スクリプトプロパティ（SUPABASE_URL / SUPABASE_KEY / TARGET_SPREADSHEET_ID）を設定する
- [ ] 単一商品コード・複数商品コードでの出力確認
- [ ] 既存の `GetInventoryData` / `DistributeInventory` に一切変更が入っていないことを確認する

## 9. 注意事項

- 既存プロジェクトのコードは今回一切修正しない（新規プロジェクトのみで完結させる）
- 各関数のヘッダーには目的・引数・戻り値を必ず記載する（JSDoc形式）
- 命名規則 `NN_英語名.日本語説明.gs` を厳守する
- 今回はトリガー設定を行わない（将来的な自動化はIssue #23の完了後、別Issueで検討する）
