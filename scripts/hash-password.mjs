import { randomBytes, scryptSync } from "node:crypto";
import { Writable } from "node:stream";
import readline from "node:readline";

// Read interactively so the password never appears in shell history or arguments.
let hidden = false;
const output = new Writable({ write(chunk, encoding, callback) { if (!hidden) process.stdout.write(chunk); callback(); } });
const prompt = readline.createInterface({ input: process.stdin, output, terminal: true });
process.stdout.write("Choose an owner password (input hidden, at least 14 characters): ");
hidden = true;
prompt.question("", (password) => {
  hidden = false;
  prompt.close();
  process.stdout.write("\n");
  if (password.length < 14 || password.length > 1024) { process.stderr.write("Use between 14 and 1024 characters.\n"); process.exitCode = 1; return; }
  const salt = randomBytes(16).toString("hex");
  process.stdout.write(`ADMIN_PASSWORD_HASH=scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}\n`);
});
