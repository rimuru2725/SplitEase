import { createClient } from "@libsql/client";
import path from "path";

// ═══════════════════════════════════════════════════════════════
// Database Wrapper Interface & Implementation
// ═══════════════════════════════════════════════════════════════

export interface DatabaseWrapper {
  all(sql: string, params?: any[]): Promise<any[]>;
  get(sql: string, params?: any[]): Promise<any>;
  run(sql: string, params?: any[]): Promise<{ lastID?: number; changes?: number }>;
  exec(sql: string): Promise<void>;
}

class LibsqlDatabaseWrapper implements DatabaseWrapper {
  constructor(private executor: any) {}

  getExecutor() {
    return this.executor;
  }

  async all(sql: string, params: any[] = []): Promise<any[]> {
    const res = await this.executor.execute({ sql, args: params });
    return res.rows.map((row: any) => {
      const plain: any = {};
      for (const key of Object.keys(row)) {
        plain[key] = row[key];
      }
      return plain;
    });
  }

  async get(sql: string, params: any[] = []): Promise<any> {
    const res = await this.executor.execute({ sql, args: params });
    const row = res.rows[0];
    if (!row) return null;
    const plain: any = {};
    for (const key of Object.keys(row)) {
      plain[key] = row[key];
    }
    return plain;
  }

  async run(sql: string, params: any[] = []): Promise<{ lastID?: number; changes?: number }> {
    const res = await this.executor.execute({ sql, args: params });
    return {
      lastID: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : undefined,
      changes: res.rowsAffected,
    };
  }

  async exec(sql: string): Promise<void> {
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    
    for (const statement of statements) {
      await this.executor.execute(statement);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Connection Initialization
// ═══════════════════════════════════════════════════════════════

let dbInstance: DatabaseWrapper | null = null;
let clientInstance: any = null;

export async function getDb(): Promise<DatabaseWrapper> {
  if (dbInstance) {
    return dbInstance;
  }

  const databaseUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  let url = "";
  if (databaseUrl) {
    url = databaseUrl;
  } else {
    // Next.js runtime process.cwd() is the 'splitease' folder
    const dbPath = path.resolve(process.cwd(), "../expenses.db");
    url = `file:${dbPath}`;
  }

  clientInstance = createClient({
    url,
    authToken: authToken || undefined,
  });

  dbInstance = new LibsqlDatabaseWrapper(clientInstance);

  // ─── Performance & Safety PRAGMAs (Local only) ────────────────
  const isRemote = url.startsWith("libsql://") || url.startsWith("https://") || url.startsWith("http://");
  if (!isRemote) {
    try {
      await clientInstance.execute("PRAGMA journal_mode = WAL;");
      await clientInstance.execute("PRAGMA foreign_keys = ON;");
      await clientInstance.execute("PRAGMA busy_timeout = 5000;");
    } catch (e) {
      console.warn("Failed to set SQLite PRAGMAs locally:", e);
    }
  }

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

  return dbInstance;
}

// ═══════════════════════════════════════════════════════════════
// Transaction Helper
// ═══════════════════════════════════════════════════════════════

export async function runTransaction<T>(
  db: DatabaseWrapper,
  fn: (txDb: DatabaseWrapper) => Promise<T>
): Promise<T> {
  // Check if underlying executor has transaction capability (i.e. clientInstance)
  if (db instanceof LibsqlDatabaseWrapper) {
    const executor = db.getExecutor();
    // If it's already a transaction, just run the function nested
    if (executor && 'commit' in executor && 'rollback' in executor) {
      return fn(db);
    }
    
    // Start a transaction on the client
    if (clientInstance) {
      const tx = await clientInstance.transaction("write");
      const txWrapper = new LibsqlDatabaseWrapper(tx);
      try {
        const result = await fn(txWrapper);
        await tx.commit();
        return result;
      } catch (error) {
        await tx.rollback();
        throw error;
      } finally {
        tx.close();
      }
    }
  }

  // Fallback if transaction cannot be initialized
  return fn(db);
}
