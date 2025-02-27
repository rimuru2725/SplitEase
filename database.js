const sqlite3 = require("sqlite3").verbose()

// Connect to SQLite database (creates 'expenses.db' if it doesn't exist)
const db = new sqlite3.Database("./expenses.db", (err) => {
  if (err) {
    console.error("Error opening database:", err.message)
  } else {
    console.log("Connected to SQLite database.")
  }
})

// Create tables
db.serialize(() => {
  // Create Groups Table with creator_id field
  db.run(
    `CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      creator_name TEXT NOT NULL,
      budget REAL DEFAULT 0
    )`,
  )

  // Create Users Table
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      group_id INTEGER NOT NULL,
      FOREIGN KEY(group_id) REFERENCES groups(id)
    )`,
  )

  // Create Expenses Table with split_among field and split_type
  db.run(
    `CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      payer TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      split_among TEXT NOT NULL,
      split_type TEXT DEFAULT 'equal',
      split_values TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(group_id) REFERENCES groups(id)
    )`,
  )

  // Create Budget Alerts Table
  db.run(
    `CREATE TABLE IF NOT EXISTS budget_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      threshold_percentage INTEGER NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(group_id) REFERENCES groups(id)
    )`,
  )

  console.log("Database tables are set up.")
})

module.exports = db
