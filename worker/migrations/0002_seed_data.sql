INSERT OR IGNORE INTO users (id, role, name, phone, password_hash, created_at, updated_at)
VALUES ('admin-default', 'admin', '管理员', 'admin', NULL, unixepoch() * 1000, unixepoch() * 1000);

INSERT OR IGNORE INTO banks (id, name, description, status, access_type, price, created_at, updated_at)
VALUES
  ('bank-demo', '免费体验题库', '用于体验登录、加入题库、练习、考试、错题和收藏流程。', 'published', 'free', 0, unixepoch() * 1000, unixepoch() * 1000),
  ('bank-electric', '电工理论练习题库', '覆盖基础知识、安全规范、设备维护等章节，适合日常刷题与模拟考试。', 'published', 'paid', 19.9, unixepoch() * 1000, unixepoch() * 1000);

INSERT OR IGNORE INTO chapters (id, bank_id, name, sort_order, created_at)
VALUES
  ('demo-chapter', 'bank-demo', '体验章节', 1, unixepoch() * 1000),
  ('ch-basic', 'bank-electric', '基础知识', 1, unixepoch() * 1000),
  ('ch-safety', 'bank-electric', '安全规范', 2, unixepoch() * 1000),
  ('ch-maintenance', 'bank-electric', '设备维护', 3, unixepoch() * 1000);

INSERT OR IGNORE INTO questions (id, bank_id, chapter_id, type, stem, options_json, answer_json, answer_text, analysis, sort_order, created_at)
VALUES
  ('q-demo-1', 'bank-demo', 'demo-chapter', 'single', '体验题：下面哪个选项是正确答案？', '[{"key":"A","text":"正确答案"},{"key":"B","text":"干扰项"},{"key":"C","text":"干扰项"},{"key":"D","text":"干扰项"}]', '["A"]', 'A', '这是体验题解析。', 1, unixepoch() * 1000),
  ('q-demo-2', 'bank-demo', 'demo-chapter', 'multiple', '体验题：可以同时选择哪些选项？', '[{"key":"A","text":"选项 A"},{"key":"B","text":"选项 B"},{"key":"C","text":"错误项"},{"key":"D","text":"错误项"}]', '["A","B"]', 'A、B', '多选题需要点确认后再判题。', 2, unixepoch() * 1000),
  ('q-demo-3', 'bank-demo', 'demo-chapter', 'judge', '判断题只显示“正确”和“错误”两个选项。', '[]', '["正确"]', '正确', '判断题不再重复显示选项。', 3, unixepoch() * 1000);

INSERT OR IGNORE INTO plans (id, name, type, bank_id, duration_days, price, enabled, created_at)
VALUES
  ('plan-month', '月会员', 'membership', NULL, 30, 29, 1, unixepoch() * 1000),
  ('plan-year', '年会员', 'membership', NULL, 365, 99, 1, unixepoch() * 1000),
  ('plan-electric', '电工题库单库授权', 'bank', 'bank-electric', 365, 19.9, 1, unixepoch() * 1000);
