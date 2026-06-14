import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import path from "path";

let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  // Next.js runtime process.cwd() is the 'splitease' folder
  const dbPath = path.resolve(process.cwd(), "../expenses.db");

  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.verbose().Database,
  });

  // ─── Performance & Safety PRAGMAs ────────────────────────────
  await dbInstance.run("PRAGMA journal_mode = WAL;");
  await dbInstance.run("PRAGMA foreign_keys = ON;");
  await dbInstance.run("PRAGMA busy_timeout = 5000;");

  // ─── Core Tables ─────────────────────────────────────────────
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      creator_name TEXT NOT NULL,
      budget REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      group_id INTEGER NOT NULL,
      FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      payer TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      category TEXT DEFAULT 'Others',
      split_among TEXT NOT NULL,
      split_type TEXT DEFAULT 'equal',
      split_values TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS budget_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      threshold_percentage INTEGER NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      from_user TEXT NOT NULL,
      to_user TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE
    );
  `);

  // ─── New Tables ──────────────────────────────────────────────

  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recurring_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      payer TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      category TEXT DEFAULT 'Others',
      split_among TEXT NOT NULL,
      split_type TEXT DEFAULT 'equal',
      split_values TEXT DEFAULT NULL,
      frequency TEXT NOT NULL,
      next_due_date TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE
    );
  `);

  // ─── Performance Indexes ─────────────────────────────────────

  await dbInstance.exec(`
    CREATE INDEX IF NOT EXISTS idx_expenses_group_id ON expenses(group_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);
    CREATE INDEX IF NOT EXISTS idx_users_group_id ON users(group_id);
    CREATE INDEX IF NOT EXISTS idx_settlements_group_id ON settlements(group_id);
    CREATE INDEX IF NOT EXISTS idx_budget_alerts_group_id ON budget_alerts(group_id);
    CREATE INDEX IF NOT EXISTS idx_activity_log_group_id ON activity_log(group_id);
    CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_recurring_expenses_group_id ON recurring_expenses(group_id);
  `);

  // ─── Legacy Migration (safe no-op if column exists) ──────────
  try {
    await dbInstance.run("ALTER TABLE expenses ADD COLUMN category TEXT DEFAULT 'Others';");
  } catch {
    // Column already exists, safe to ignore
  }

  return dbInstance;
}

// ═══════════════════════════════════════════════════════════════
// Transaction Helper
// ═══════════════════════════════════════════════════════════════

/**
 * Execute multiple database operations within a single transaction.
 * Automatically rolls back on error.
 *
 * @example
 * ```ts
 * await runTransaction(db, async (db) => {
 *   await db.run("INSERT INTO groups ...");
 *   await db.run("INSERT INTO users ...");
 * });
 * ```
 */
export async function runTransaction<T>(
  db: Database,
  fn: (db: Database) => Promise<T>
): Promise<T> {
  await db.run("BEGIN TRANSACTION;");
  try {
    const result = await fn(db);
    await db.run("COMMIT;");
    return result;
  } catch (error) {
    await db.run("ROLLBACK;");
    throw error;
  }
}
