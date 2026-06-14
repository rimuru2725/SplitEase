const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const path = require("path");

const dbPath = path.resolve(__dirname, "../../expenses.db");
console.log("Opening database at:", dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
    process.exit(1);
  }
});

db.serialize(() => {
  db.all("SELECT id, name, password FROM groups", [], async (err, rows) => {
    if (err) {
      console.error("Error selecting groups:", err.message);
      process.exit(1);
    }

    console.log(`Found ${rows.length} groups in database.`);
    let migratedCount = 0;

    for (const row of rows) {
      // bcrypt hashes normally start with $2a$, $2b$, or $2y$
      const isHashed =
        row.password &&
        (row.password.startsWith("$2a$") ||
          row.password.startsWith("$2b$") ||
          row.password.startsWith("$2y$"));

      if (!isHashed) {
        console.log(`Hashing password for group: "${row.name}"`);
        try {
          const salt = await bcrypt.genSalt(10);
          const hash = await bcrypt.hash(row.password, salt);

          await new Promise((resolve, reject) => {
            db.run("UPDATE groups SET password = ? WHERE id = ?", [hash, row.id], (err) => {
              if (err) {
                console.error(`Error updating group "${row.name}":`, err.message);
                reject(err);
              } else {
                migratedCount++;
                resolve();
              }
            });
          });
        } catch (e) {
          console.error(`Failed to hash password for group "${row.name}":`, e);
        }
      } else {
        console.log(`Group "${row.name}" already has a hashed password.`);
      }
    }

    console.log(`Migration complete. Migrated ${migratedCount} groups.`);
    db.close();
  });
});
