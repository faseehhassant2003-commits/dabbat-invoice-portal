import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("Set DATABASE_URL before running npm run db:setup.");

const pool = new Pool({ connectionString, max: 1 });
try {
  const migration = await readFile(path.resolve("migrations/001_encrypted_state.sql"), "utf8");
  await pool.query(migration);

  const dataDir = path.resolve(process.env.DATA_DIR || "data");
  const records = [
    ["private-store", path.join(dataDir, "private.enc.json")],
    ["invoice-store", path.join(dataDir, "live", "invoices.enc.json")],
  ];
  for (const [key, filename] of records) {
    let payload;
    try { payload = await readFile(filename, "utf8"); }
    catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    const result = await pool.query(
      `INSERT INTO dabbat_encrypted_state (key, payload)
       VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [key, payload],
    );
    process.stdout.write(`${key}: ${result.rowCount === 1 ? "imported" : "already exists; unchanged"}\n`);
  }
  process.stdout.write("Database schema is ready.\n");
} finally {
  await pool.end();
}
