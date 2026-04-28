-- list_type の CHECK 制約に '保険' を追加
ALTER TABLE public.call_requests
  DROP CONSTRAINT IF EXISTS call_requests_list_type_check;

ALTER TABLE public.call_requests
  ADD CONSTRAINT call_requests_list_type_check
    CHECK (list_type IN ('', '回線', 'MF', 'OK', 'NG', '保険'));
