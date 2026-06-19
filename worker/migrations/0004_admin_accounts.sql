ALTER TABLE users ADD COLUMN admin_role TEXT NOT NULL DEFAULT 'operator';
ALTER TABLE users ADD COLUMN admin_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN last_login_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_admin_enabled ON users(admin_enabled);
