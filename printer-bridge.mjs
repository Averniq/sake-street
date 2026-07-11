import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_CONFIG_PATH = path.resolve("printer-bridge.config.json");
const ESC = 0x1b;
const GS = 0x1d;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function safeText(value) {
  return String(value ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapText(value, width, indent = "") {
  const text = safeText(value);
  if (!text) return [];
  const lineWidth = Math.max(8, width - indent.length);
  const words = text.split(" ");
  const lines = [];
  let line = "";
  words.forEach((word) => {
    if (!line) {
      line = word;
    } else if (`${line} ${word}`.length <= lineWidth) {
      line += ` ${word}`;
    } else {
      lines.push(`${indent}${line}`);
      line = word;
    }
  });
  if (line) lines.push(`${indent}${line}`);
  return lines;
}

function optionText(options) {
  if (!Array.isArray(options)) return "";
  return options
    .map((option) => {
      const group = safeText(option?.groupName || option?.group_name || "");
      const choice = safeText(option?.choiceName || option?.choice_name || option?.name || "");
      return group && choice ? `${group}: ${choice}` : choice;
    })
    .filter(Boolean)
    .join(", ");
}

function kitchenItems(job) {
  const grouped = new Map();
  (Array.isArray(job.items) ? job.items : []).forEach((item) => {
    const name = safeText(item?.name || "Item") || "Item";
    const options = optionText(item?.options);
    const key = `${name}\u001f${options}`;
    const existing = grouped.get(key) || { name, options, quantity: 0 };
    existing.quantity += Math.max(1, Number(item?.quantity) || 1);
    grouped.set(key, existing);
  });
  return [...grouped.values()];
}

function textBuffer(lines = []) {
  return Buffer.from(`${lines.join("\n")}\n`, "ascii");
}

export function formatKitchenDocketPreview(job, config = {}) {
  const width = Math.min(56, Math.max(32, Number(config.paperWidth) || 42));
  const divider = "-".repeat(width);
  const createdAt = job.created_at ? new Date(job.created_at) : new Date();
  const createdLabel = new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(createdAt);
  const tableName = safeText(job.table_name || "TABLE").toUpperCase();
  const lines = [
    safeText(job.restaurant_name || "RESTAURANT"),
    "*** NEW KITCHEN ORDER ***",
    divider,
    tableName,
    `ORDER #${safeText(job.order_number)}`,
    createdLabel,
    divider,
    "ITEMS"
  ];

  kitchenItems(job).forEach((item) => {
    lines.push(...wrapText(`${item.quantity} x ${item.name}`, width));
    if (item.options) lines.push(...wrapText(item.options, width, "  "));
    lines.push("");
  });

  const note = safeText(job.note);
  if (note) {
    lines.push(divider, "!!! ORDER NOTE !!!");
    lines.push(...wrapText(note.toUpperCase(), width));
  }
  lines.push(divider, "");
  return `${lines.join("\n")}\n`;
}

export function formatKitchenDocket(job, config = {}) {
  const width = Math.min(56, Math.max(32, Number(config.paperWidth) || 42));
  const divider = "-".repeat(width);
  const createdAt = job.created_at ? new Date(job.created_at) : new Date();
  const createdLabel = new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(createdAt);
  const tableName = safeText(job.table_name || "TABLE").toUpperCase();
  const chunks = [
    Buffer.from([ESC, 0x40]),
    Buffer.from([ESC, 0x61, 0x01]),
    Buffer.from([ESC, 0x45, 0x01]),
    Buffer.from([GS, 0x21, 0x11]),
    textBuffer([safeText(job.restaurant_name || "RESTAURANT")]),
    Buffer.from([GS, 0x21, 0x00]),
    textBuffer(["NEW KITCHEN ORDER"]),
    Buffer.from([ESC, 0x45, 0x00]),
    textBuffer([divider]),
    Buffer.from([ESC, 0x45, 0x01]),
    Buffer.from([GS, 0x21, 0x11]),
    textBuffer([tableName, `ORDER #${safeText(job.order_number)}`]),
    Buffer.from([GS, 0x21, 0x00]),
    Buffer.from([ESC, 0x45, 0x00]),
    textBuffer([createdLabel, divider, "ITEMS"]),
    Buffer.from([ESC, 0x61, 0x00])
  ];

  kitchenItems(job).forEach((item) => {
    chunks.push(Buffer.from([ESC, 0x45, 0x01]));
    chunks.push(textBuffer(wrapText(`${item.quantity} x ${item.name}`, width)));
    chunks.push(Buffer.from([ESC, 0x45, 0x00]));
    if (item.options) chunks.push(textBuffer(wrapText(item.options, width, "  ")));
    chunks.push(textBuffer([""]));
  });

  const note = safeText(job.note);
  if (note) {
    chunks.push(Buffer.from([ESC, 0x61, 0x01]));
    chunks.push(textBuffer([divider]));
    chunks.push(Buffer.from([ESC, 0x45, 0x01]));
    chunks.push(Buffer.from([GS, 0x21, 0x11]));
    chunks.push(textBuffer(["ORDER NOTE"]));
    chunks.push(Buffer.from([GS, 0x21, 0x00]));
    chunks.push(Buffer.from([ESC, 0x45, 0x00]));
    chunks.push(Buffer.from([ESC, 0x61, 0x00]));
    chunks.push(textBuffer(wrapText(note.toUpperCase(), width)));
  }

  chunks.push(textBuffer([divider, "", ""]));
  chunks.push(Buffer.from([GS, 0x56, 0x42, 0x00]));
  return Buffer.concat(chunks);
}

export function loadPrinterConfig(configPath = DEFAULT_CONFIG_PATH, options = {}) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing ${configPath}. Copy printer-bridge.config.example.json and add the printer settings.`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const outputMode = config.outputMode === "lan" ? "lan" : "file";
  const required = options.requireCloud === false
    ? []
    : ["supabaseUrl", "publishableKey", "restaurantSlug", "staffEmail", "staffPassword"];
  if (outputMode === "lan") required.push("printerIp");
  const missing = required.filter((key) => !String(config[key] || "").trim() || String(config[key]).startsWith("REPLACE_"));
  if (missing.length) throw new Error(`Printer config is missing: ${missing.join(", ")}`);
  return {
    ...config,
    outputMode,
    outputDirectory: path.resolve(config.outputDirectory || "printer-output"),
    supabaseUrl: String(config.supabaseUrl).replace(/\/$/, ""),
    printerPort: Number(config.printerPort) || 9100,
    copies: Math.min(3, Math.max(1, Number(config.copies) || 1)),
    pollIntervalMs: Math.max(1000, Number(config.pollIntervalMs) || 2500)
  };
}

function printerSocket(config, payload = null) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = net.createConnection({ host: config.printerIp, port: config.printerPort });
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    socket.setTimeout(5000);
    socket.once("error", finish);
    socket.once("timeout", () => finish(new Error("Printer connection timed out.")));
    socket.once("connect", () => {
      socket.setNoDelay(true);
      if (!payload) {
        finish();
        return;
      }
      socket.end(payload, () => finish());
    });
  });
}

export async function checkPrinter(config) {
  await printerSocket(config);
}

export async function printKitchenDocket(config, job) {
  if (config.outputMode === "file") {
    fs.mkdirSync(config.outputDirectory, { recursive: true });
    const orderNumber = safeText(job.order_number || "test").replace(/[^a-z0-9_-]+/gi, "-") || "test";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const basePath = path.join(config.outputDirectory, `order-${orderNumber}-${timestamp}`);
    fs.writeFileSync(`${basePath}.txt`, formatKitchenDocketPreview(job, config), "utf8");
    fs.writeFileSync(`${basePath}.escpos`, formatKitchenDocket(job, config));
    console.log(`[printer] Saved ${basePath}.txt`);
    return;
  }
  const payload = formatKitchenDocket(job, config);
  for (let copy = 0; copy < config.copies; copy += 1) {
    await printerSocket(config, payload);
  }
}

class SupabasePrinterClient {
  constructor(config) {
    this.config = config;
    this.session = null;
  }

  async parse(response) {
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!response.ok) throw new Error(data?.message || data?.msg || data?.error_description || `Supabase error ${response.status}`);
    return data;
  }

  async auth(pathname, body) {
    const response = await fetch(`${this.config.supabaseUrl}/auth/v1/${pathname}`, {
      method: "POST",
      headers: { apikey: this.config.publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return this.parse(response);
  }

  async ensureSession() {
    const now = Math.floor(Date.now() / 1000);
    if (this.session?.access_token && Number(this.session.expires_at || 0) > now + 60) return this.session;
    if (this.session?.refresh_token) {
      try {
        const refreshed = await this.auth("token?grant_type=refresh_token", { refresh_token: this.session.refresh_token });
        this.session = { ...refreshed, expires_at: now + Number(refreshed.expires_in || 3600) };
        return this.session;
      } catch {
        this.session = null;
      }
    }
    const signedIn = await this.auth("token?grant_type=password", {
      email: this.config.staffEmail,
      password: this.config.staffPassword
    });
    this.session = { ...signedIn, expires_at: now + Number(signedIn.expires_in || 3600) };
    return this.session;
  }

  async rpc(name, body) {
    const session = await this.ensureSession();
    const response = await fetch(`${this.config.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: this.config.publishableKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    return this.parse(response);
  }

  claimJob() {
    return this.rpc("claim_kitchen_print_job", { p_restaurant_slug: this.config.restaurantSlug });
  }

  finishJob(orderId, success, error = "") {
    return this.rpc("finish_kitchen_print_job", {
      p_order_id: orderId,
      p_success: success,
      p_error: error || null
    });
  }
}

function testJob() {
  return {
    order_number: "TEST",
    restaurant_name: "SAKE STREET",
    table_name: "PRINTER TEST",
    created_at: new Date().toISOString(),
    note: "LAN printer connection is working.",
    items: [
      { quantity: 1, name: "Salmon carpaccio", options: [] },
      { quantity: 2, name: "Miso soup", options: [{ groupName: "Note", choiceName: "No spring onion" }] }
    ]
  };
}

export async function runBridge(config) {
  const client = new SupabasePrinterClient(config);
  let printerReady = false;
  const destination = config.outputMode === "file"
    ? `files in ${config.outputDirectory}`
    : `${config.printerIp}:${config.printerPort}`;
  console.log(`[printer] Watching ${config.restaurantSlug} orders and sending to ${destination}`);

  while (true) {
    let job = null;
    try {
      if (config.outputMode === "file") {
        fs.mkdirSync(config.outputDirectory, { recursive: true });
        printerReady = true;
      } else if (!printerReady) {
        await checkPrinter(config);
        printerReady = true;
        console.log("[printer] LAN printer connected.");
      }
      job = await client.claimJob();
      if (!job) {
        await sleep(config.pollIntervalMs);
        continue;
      }

      console.log(`[printer] Printing order #${job.order_number} for ${job.table_name}.`);
      await printKitchenDocket(config, job);
      await client.finishJob(job.id, true);
      console.log(`[printer] Order #${job.order_number} printed.`);
    } catch (error) {
      printerReady = false;
      console.error(`[printer] ${error.message}`);
      if (job?.id) {
        await client.finishJob(job.id, false, error.message).catch((finishError) => {
          console.error(`[printer] Could not record print failure: ${finishError.message}`);
        });
      }
      await sleep(Math.max(config.pollIntervalMs, 5000));
    }
  }
}

async function main() {
  const configFlagIndex = process.argv.indexOf("--config");
  const configPath = configFlagIndex >= 0 && process.argv[configFlagIndex + 1]
    ? path.resolve(process.argv[configFlagIndex + 1])
    : DEFAULT_CONFIG_PATH;
  const localOnly = process.argv.includes("--check-printer") || process.argv.includes("--test-print");
  const config = loadPrinterConfig(configPath, { requireCloud: !localOnly });

  if (process.argv.includes("--check-printer")) {
    if (config.outputMode === "file") {
      fs.mkdirSync(config.outputDirectory, { recursive: true });
      console.log(`[printer] File output directory is ready: ${config.outputDirectory}`);
    } else {
      await checkPrinter(config);
      console.log(`[printer] Connected to ${config.printerIp}:${config.printerPort}.`);
    }
    return;
  }
  if (process.argv.includes("--test-print")) {
    await printKitchenDocket(config, testJob());
    console.log("[printer] Test docket sent.");
    return;
  }
  await runBridge(config);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(`[printer] ${error.message}`);
    process.exitCode = 1;
  });
}
