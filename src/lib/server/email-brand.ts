import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

let logo: Buffer | undefined;
export function getEmailLogo(): Buffer {
  return logo ??= readFileSync(path.join(process.cwd(), "public", "brand", "dabbat-logo.png"));
}
