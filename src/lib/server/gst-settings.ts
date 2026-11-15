import "server-only";
import path from "node:path";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { GstSettings } from "@/lib/types";
import { defaultGstSettings, validateGstSettings } from "@/lib/gst";
import { isDemoMode } from "./config";
import { requireApiSession } from "./auth";
import { readPrivateStore, updatePrivateStore } from "./storage";

function sampleFilename(): string {
  return path.join(/* turbopackIgnore: true */ process.env.DATA_DIR || "data", "sample", "gst-settings.json");
}

export async function getGstSettings(trustedWebhook = false): Promise<GstSettings> {
  if (!isDemoMode()) {
    if (!trustedWebhook) await requireApiSession();
    const settings = (await readPrivateStore()).gstSettings;
    return settings ? validateGstSettings(settings) : defaultGstSettings();
  }
  try { return validateGstSettings(JSON.parse(await readFile(sampleFilename(), "utf8"))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return defaultGstSettings();
    throw new Error("Sample GST settings could not be read. Check the sample data directory.");
  }
}

export async function saveGstSettings(input: unknown): Promise<GstSettings> {
  if (!isDemoMode()) await requireApiSession();
  const settings = validateGstSettings(input);
  if (!isDemoMode()) {
    await updatePrivateStore(store => { store.gstSettings = settings; });
    return settings;
  }
  const filename = sampleFilename();
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const lockfile = `${filename}.lock`;
  let lock;
  try { lock = await open(lockfile, "wx", 0o600); }
  catch { throw new Error("Sample GST settings are busy. Please try again."); }
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(settings), { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(temporary, filename);
  } finally { await unlink(temporary).catch(() => undefined); await lock.close(); await unlink(lockfile).catch(() => undefined); }
  return settings;
}
