-- ============================================================
-- Mykonos3β Seed Data
-- DEFAULT_USERS の初期データ投入
-- ============================================================

INSERT INTO public.users
  (name, is_admin, is_line_prechecker, is_super_admin, password, availability_status, non_working_days, available_products, comment)
VALUES
  ('脇本隆太',   true,  true,  true,  'NNE040121',    '受付可', '{}', '{回線,水}', ''),
  ('中込賢三',   true,  true,  true,  'RedBullGOAT33','受付可', '{}', '{回線,水}', ''),
  ('島袋南海',   true,  false, false, 'NNE040121',    '受付可', '{}', '{回線,水}', ''),
  ('戸田直希',   true,  false, false, 'NNE040121',    '受付可', '{}', '{回線,水}', ''),
  ('手塚紗也花', false, true,  false, 'NNE040121',    '受付可', '{}', '{回線,水}', ''),
  ('樋口脩祐',   false, false, false, 'NNE040121',    '受付可', '{}', '{回線,水}', ''),
  ('中尾孝祐',   false, false, false, 'NNE040121',    '受付可', '{}', '{回線,水}', ''),
  ('長島摩里愛', false, false, false, 'NNE040121',    '受付可', '{}', '{回線,水}', ''),
  ('秋吉聖良',   false, false, false, 'NNE040121',    '受付可', '{}', '{回線,水}', ''),
  ('向原将太',   false, false, false, 'NNE040121',    '受付可', '{}', '{回線,水}', ''),
  ('内堀智博',   false, false, false, 'NNE040121',    '受付可', '{}', '{回線,水}', ''),
  ('中川恭紀',   false, false, false, 'NNE040121',    '受付可', '{}', '{回線,水}', '')
ON CONFLICT (name) DO NOTHING;
