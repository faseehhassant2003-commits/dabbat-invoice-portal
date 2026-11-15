import "server-only";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { getAuthConfig } from "./config";
import { decryptJson, encryptJson } from "./security";

let pool: Pool | null = null;

function connectionString(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL is required for PostgreSQL storage.");
  return value;
}

function getPool(): Pool {
  pool ??= new Pool({ connectionString: connectionString(), max: 4, idleTimeoutMillis: 10_000 });
  return pool;
}

export function usesDatabaseStorage(): boolean {
  if (process.env.DATABASE_URL?.trim()) return true;
  if (process.env.VERCEL) throw new Error("DATABASE_URL must be connected before deploying this portal to Vercel.");
  return false;
}

function decode<T>(payload: string, validate: (value: T) => void): T {
  const value = decryptJson<T>(payload, getAuthConfig().encryptionKey);
  validate(value);
  return value;
}

export async function readEncryptedRecord<T>(
  key: string,
  fallback: () => T,
  validate: (value: T) => void,
): Promise<T> {
  const result = await getPool().query<{ payload: string }>(
    "SELECT payload FROM dabbat_encrypted_state WHERE key = $1",
    [key],
  );
  if (!result.rows[0]) return fallback();
  return decode(result.rows[0].payload, validate);
}

export async function writeEncryptedRecord<T>(key: string, value: T): Promise<void> {
  await getPool().query(
    `INSERT INTO dabbat_encrypted_state (key, payload, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [key, encryptJson(value, getAuthConfig().encryptionKey)],
  );
}

export async function updateEncryptedRecord<T, R>(
  key: string,
  fallback: () => T,
  validate: (value: T) => void,
  update: (value: T) => R | Promise<R>,
): Promise<R> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO dabbat_encrypted_state (key, payload)
       VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [key, encryptJson(fallback(), getAuthConfig().encryptionKey)],
    );
    const selected = await client.query<{ payload: string }>(
      "SELECT payload FROM dabbat_encrypted_state WHERE key = $1 FOR UPDATE",
      [key],
    );
    const value = decode(selected.rows[0].payload, validate);
    const result = await update(value);
    await client.query(
      "UPDATE dabbat_encrypted_state SET payload = $2, updated_at = NOW() WHERE key = $1",
      [key, encryptJson(value, getAuthConfig().encryptionKey)],
    );
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function advisoryLock(client: PoolClient, name: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`dabbat:${name}`]);
}

export async function withDatabaseLock<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await advisoryLock(client, name);
    const result = await operation();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
