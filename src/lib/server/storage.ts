import "server-only";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { getAuthConfig } from "./config";
import { decryptJson, encryptJson } from "./security";
import type { GstSettings } from "@/lib/types";

export interface ShopifyToken {
  shop: string;
  accessToken: string;
  scope: string;
  expiresAt: number | null;
  refreshToken: string | null;
  refreshExpiresAt: number | null;
}
export interface GoogleMailToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
  testedAt: number | null;
}
export type EmailDeliveryStatus = "pending" | "sent" | "failed";
export interface EmailDeliveryRecord {
  invoiceId: string;
  orderId: string;
  recipient: string;
  status: EmailDeliveryStatus;
  provider: "smtp" | "gmail-api";
  updatedAt: number;
  sentAt?: number;
  messageId?: string;
  lastError?: string;
  activeRequestId?: string;
  lockExpiresAt?: number;
  requestIds: string[];
  attempts: number;
}
export interface ShopifyWebhookRecord {
  id: string;
  topic: string;
  orderId: string;
  receivedAt: number;
  status: "processing" | "processed" | "ignored" | "failed";
}
export interface PrivateStore {
  version: 1;
  sessions: { id: string; expiresAt: number }[];
  oauth: { state: string; sessionId: string; expiresAt: number }[];
  googleOauth?: { state: string; sessionId: string; expiresAt: number }[];
  loginAttempts: { count: number; resetAt: number };
  shopify?: ShopifyToken;
  googleMail?: GoogleMailToken;
  emailDeliveries?: EmailDeliveryRecord[];
  shopifyWebhooks?: ShopifyWebhookRecord[];
  gstSettings?: GstSettings;
}
const emptyStore = (): PrivateStore => ({ version: 1, sessions: [], oauth: [], loginAttempts: { count: 0, resetAt: 0 } });

// In-process serialization plus a disk lock protects writes across Next route
// bundles/workers sharing a disk. Distributed hosting still needs a database.
let queue: Promise<unknown> = Promise.resolve();

export async function withStorageLock<T>(name: "private" | "shopify-token", operation: () => Promise<T>): Promise<T> {
  const config = getAuthConfig();
  await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
  const lockfile = path.join(config.dataDir, `${name}.lock`);
  let lock: Awaited<ReturnType<typeof open>> | null = null;
  // Token refresh includes a network request with a 20-second deadline.
  const retries = name === "shopify-token" ? 300 : 50;
  for (let attempt = 0; attempt < retries; attempt++) {
    try { lock = await open(lockfile, "wx", 0o600); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (!lock) throw new Error("Private portal storage is busy. Please try again.");
  try { return await operation(); }
  finally { await lock.close(); await unlink(lockfile).catch(() => undefined); }
}
export async function readPrivateStore(): Promise<PrivateStore> {
  const config = getAuthConfig();
  try {
    const store = decryptJson<PrivateStore>(await readFile(path.join(config.dataDir, "private.enc.json"), "utf8"), config.encryptionKey);
    if (store.version !== 1 || !Array.isArray(store.sessions) || !Array.isArray(store.oauth)) throw new Error("Invalid private store.");
    return store;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw new Error("Unable to decrypt private storage. Check the encryption key and disk.");
  }
}

export function updatePrivateStore<T>(update: (store: PrivateStore) => T | Promise<T>): Promise<T> {
  const task = queue.then(() => withStorageLock("private", async () => {
    const config = getAuthConfig();
    const store = await readPrivateStore();
    const now = Date.now();
    store.sessions = store.sessions.filter((session) => session.expiresAt > now);
    store.oauth = store.oauth.filter((nonce) => nonce.expiresAt > now);
    if (store.googleOauth) store.googleOauth = store.googleOauth.filter((nonce) => nonce.expiresAt > now);
    const result = await update(store);
    await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
    const target = path.join(config.dataDir, "private.enc.json");
    const temporary = `${target}.${randomBytes(8).toString("hex")}.tmp`;
    try {
      await writeFile(temporary, encryptJson(store, config.encryptionKey), { mode: 0o600, flag: "wx" });
      await rename(temporary, target);
    } finally { await unlink(temporary).catch(() => undefined); }
    return result;
  }));
  queue = task.catch(() => undefined);
  return task;
}
