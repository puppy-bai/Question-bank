PRAGMA foreign_keys = OFF;

ALTER TABLE exam_templates RENAME TO exam_templates_old;

CREATE TABLE exam_templates (
  id TEXT PRIMARY KEY,
  bank_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '默认模拟考试',
  template_json TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE CASCADE
);

INSERT INTO exam_templates (id, bank_id, name, template_json, is_default, created_at, updated_at)
SELECT
  'tpl-' || bank_id || '-default',
  bank_id,
  '默认模拟考试',
  template_json,
  1,
  updated_at,
  updated_at
FROM exam_templates_old;

DROP TABLE exam_templates_old;

CREATE INDEX IF NOT EXISTS idx_exam_templates_bank_id ON exam_templates(bank_id);

PRAGMA foreign_keys = ON;
