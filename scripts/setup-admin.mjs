import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { Writable } from "node:stream";

function assignment(content, name) {
  const matches = [...content.matchAll(new RegExp(`^[ \\t]*(?:export[ \\t]+)?${name}[ \\t]*=(.*)$`, "gm"))];
  if (matches.length > 1) throw new Error(`Duplicate ${name} entries found. Keep one entry before running setup.`);
  return matches[0];
}

function isEmpty(value) {
  return /^(?:\s*|\s*(?:""|'')\s*)(?:#.*)?$/.test(value ?? "");
}

function hiddenQuestion(prompt, label) {
  process.stdout.write(label);
  return new Promise((resolve, reject) => {
    const cancel = () => reject(new Error("Setup cancelled. No files changed."));
    prompt.once("SIGINT", cancel);
    prompt.once("close", cancel);
    prompt.question("", (answer) => {
      prompt.removeListener("SIGINT", cancel);
      prompt.removeListener("close", cancel);
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Run npm run setup:admin in your own interactive terminal.");
  const project = JSON.parse(await readFile(path.resolve("package.json"), "utf8"));
  if (project.name !== "dabbat-invoice-portal") throw new Error("Run this command from the Dabbat invoice generator folder.");
  const filename = path.resolve(".env.local");
  const beforePrompt = await readFile(filename, "utf8");
  if (!isEmpty(assignment(beforePrompt, "ADMIN_PASSWORD_HASH")?.[1])) throw new Error("An administrator password is already configured. No changes made.");

  // All readline output is discarded; input and history stay off the screen.
  const output = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const prompt = readline.createInterface({ input: process.stdin, output, terminal: true, historySize: 0 });
  let password;
  let confirmation;
  try {
    password = await hiddenQuestion(prompt, "Choose your portal password (at least 14 characters; input hidden): ");
    if (password.length < 14 || password.length > 1024) throw new Error("Use between 14 and 1024 characters. No files changed.");
    confirmation = await hiddenQuestion(prompt, "Enter the password again (input hidden): ");
  } finally { prompt.close(); }
  if (password !== confirmation) throw new Error("Passwords did not match. No files changed.");

  // Read again after the prompt to preserve edits made while setup was waiting.
  const current = await readFile(filename, "utf8");
  const hashEntry = assignment(current, "ADMIN_PASSWORD_HASH");
  if (!isEmpty(hashEntry?.[1])) throw new Error("A password was configured while setup was open. No changes made.");
  const emailEntry = assignment(current, "ADMIN_EMAIL");
  const newline = current.includes("\r\n") ? "\r\n" : "\n";
  const salt = randomBytes(16).toString("hex");
  const encoded = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
  let updated = hashEntry ? current.replace(hashEntry[0], `ADMIN_PASSWORD_HASH=${encoded}`) : current.replace(/\s*$/, newline) + `ADMIN_PASSWORD_HASH=${encoded}${newline}`;
  if (!emailEntry) updated = updated.replace(/\s*$/, newline) + `ADMIN_EMAIL=support@dabbat.in${newline}`;
  else if (isEmpty(emailEntry[1])) updated = updated.replace(emailEntry[0], "ADMIN_EMAIL=support@dabbat.in");

  const temporary = path.join(path.dirname(filename), `.env.local.setup-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, updated, { encoding: "utf8", mode: 0o600, flag: "wx" });
    if (await readFile(filename, "utf8") !== current) throw new Error("The environment file changed during setup. Run the command again; no changes saved.");
    await rename(temporary, filename);
  } finally { await unlink(temporary).catch(() => undefined); }
  process.stdout.write("Portal password saved securely in .env.local. Your other settings are preserved. Sample mode is unchanged.\n");
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
