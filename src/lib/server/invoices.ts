import "server-only";
import path from "node:path";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { InvoiceRecord, Order } from "@/lib/types";
import { sampleInvoices, sampleOrders } from "@/lib/sample-data";
import { assertInvoiceOrder, makeInvoiceSnapshot, type InvoiceSnapshot } from "@/lib/invoice-core";
import { getAuthConfig, isDemoMode } from "./config";
import { requireApiSession } from "./auth";
import { decryptJson, encryptJson } from "./security";
import { getOrder } from "./orders";
import { getSeller } from "./seller";
import { assertPdfTextValues } from "@/lib/pdf-fonts";
import { getGstSettings } from "./gst-settings";

type InvoiceStore = { version: 1; snapshots: InvoiceSnapshot[] };

async function access(trustedWebhook = false) {
  const sample = isDemoMode();
  if (!sample && !trustedWebhook) await requireApiSession();
  if (trustedWebhook && sample) throw new Error("Shopify webhooks are disabled in sample mode.");
  if (!sample && process.env.SHOPIFY_CUSTOMER_DATA_APPROVED !== "true") throw new Error("Customer data access is disabled. Review protected customer data approval in Settings.");
  const config = sample ? null : getAuthConfig();
  const directory = path.join(/* turbopackIgnore: true */ config?.dataDir || path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || "data"), sample ? "sample" : "live");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return { sample, directory, filename: path.join(/* turbopackIgnore: true */ directory, sample ? "invoices.json" : "invoices.enc.json"), key: config?.encryptionKey };
}
type Access = Awaited<ReturnType<typeof access>>;

function sampleSeed(): InvoiceStore {
  const seller = getSeller();
  return { version: 1, snapshots: sampleInvoices.map((invoice) => {
    const order = sampleOrders.find((item) => item.id === invoice.orderId);
    if (!order) throw new Error("Sample invoice order was not found.");
    return structuredClone({ invoice, order, seller });
  }) };
}

async function readStore(storage: Access): Promise<InvoiceStore> {
  try {
    const text = await readFile(storage.filename, "utf8");
    const data = storage.sample ? JSON.parse(text) as InvoiceStore : decryptJson<InvoiceStore>(text, storage.key!);
    if (data.version !== 1 || !Array.isArray(data.snapshots)) throw new Error("Unsupported invoice history format.");
    if (data.snapshots.some((snapshot) => snapshot.invoice.source !== (storage.sample ? "sample" : "shopify"))) throw new Error("Invoice data source does not match the portal mode.");
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return storage.sample ? sampleSeed() : { version: 1, snapshots: [] };
    throw new Error("Invoice history could not be read. Check the data directory and encryption key.");
  }
}

async function saveStore(storage: Access, store: InvoiceStore) {
  const temporary = `${storage.filename}.${randomUUID()}.tmp`;
  const content = storage.sample ? JSON.stringify(store) : encryptJson(store, storage.key!);
  try {
    await writeFile(temporary, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(temporary, storage.filename);
  } finally { await unlink(temporary).catch(() => undefined); }
}

async function withWriteLock<T>(storage: Access, callback: () => Promise<T>): Promise<T> {
  const lockfile = path.join(storage.directory, "invoices.lock");
  let lock: Awaited<ReturnType<typeof open>> | null = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { lock = await open(lockfile, "wx", 0o600); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (!lock) throw new Error("Invoice history is busy. Please try again in a moment.");
  try { return await callback(); }
  finally { await lock.close(); await unlink(lockfile).catch(() => undefined); }
}

export async function listInvoices(): Promise<InvoiceRecord[]> {
  const storage = await access();
  const data = await readStore(storage);
  return data.snapshots.map((snapshot) => snapshot.invoice).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function getInvoiceSnapshot(id: string, trustedWebhook = false): Promise<InvoiceSnapshot | null> {
  if (id.length > 80 || !/^[a-zA-Z0-9-]+$/.test(id)) return null;
  const storage = await access(trustedWebhook);
  return (await readStore(storage)).snapshots.find((snapshot) => snapshot.invoice.id === id) || null;
}

export async function createInvoice(orderId: string): Promise<InvoiceRecord> {
  const storage = await access();
  const saved = (await readStore(storage)).snapshots.find(snapshot => snapshot.invoice.orderId === orderId);
  if (saved) return saved.invoice;
  const order = await getOrder(orderId);
  if (!order) throw new Error("Order not found.");
  return createInvoiceForOrder(order, storage, false);
}

export async function createInvoiceForWebhook(order: Order): Promise<InvoiceRecord> {
  const storage = await access(true);
  return createInvoiceForOrder(order, storage, true);
}

async function createInvoiceForOrder(order: Order, storage: Access, trustedWebhook: boolean): Promise<InvoiceRecord> {
  const saved = (await readStore(storage)).snapshots.find(snapshot => snapshot.invoice.orderId === order.id);
  if (saved) return saved.invoice;
  assertInvoiceOrder(order);
  const seller = getSeller(await getGstSettings(trustedWebhook));
  if (!storage.sample && !seller.address.length) throw new Error("Add the seller's real business address in SELLER_ADDRESS before generating live invoices.");
  if (!storage.sample && (!order.billing?.name.trim() || !order.billing.lines.length)) throw new Error("This order has no complete billing address. Review the customer details in Shopify before invoicing.");
  assertPdfTextValues({ order, seller });
  return withWriteLock(storage, async () => {
    const data = await readStore(storage);
    const existing = data.snapshots.find((snapshot) => snapshot.invoice.orderId === order.id);
    if (existing) return existing.invoice;
    const now = new Date();
    const year = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Kolkata" }).format(now);
    const prefix = `${storage.sample ? "SAMPLE" : "DB"}-${year}-`;
    const sequence = data.snapshots.reduce((maximum, snapshot) => snapshot.invoice.number.startsWith(prefix) ? Math.max(maximum, Number(snapshot.invoice.number.slice(prefix.length)) || 0) : maximum, 0) + 1;
    const snapshot = makeInvoiceSnapshot(order, seller, `${prefix}${String(sequence).padStart(4, "0")}`, now);
    data.snapshots.push(snapshot);
    await saveStore(storage, data);
    return snapshot.invoice;
  });
}
