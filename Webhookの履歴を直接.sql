-- Webhookの送信リクエストと結果の履歴（直近10件）を直接表示する
SELECT 
  id, 
  status_code, 
  error_msg, 
  content, 
  created 
FROM net._http_response 
ORDER BY created DESC 
LIMIT 10;