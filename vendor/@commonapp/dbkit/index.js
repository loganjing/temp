// src/sqlite.ts
import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname, resolve } from "path";

// src/errors.ts
var DbkitError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "DbkitError";
  }
};
var PlaceholderError = class extends DbkitError {
};
var InvalidDriverError = class extends DbkitError {
};
var MissingDatabaseUrlError = class extends DbkitError {
};
var MigrationChecksumError = class extends DbkitError {
};
var MigrationConflictError = class extends DbkitError {
};

// src/placeholders.ts
function scanPlaceholders(sql) {
  const positions = [];
  let state = "normal";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    switch (state) {
      case "normal":
        if (ch === "'") state = "single";
        else if (ch === '"') state = "double";
        else if (ch === "-" && next === "-") {
          state = "line";
          i++;
        } else if (ch === "/" && next === "*") {
          state = "block";
          i++;
        } else if (ch === "?") positions.push(i);
        else if (ch === "$" && /[0-9]/.test(next ?? "")) {
          throw new PlaceholderError(
            `\u4E0D\u652F\u6301\u6DF7\u5408\u5360\u4F4D\u7B26\uFF1ASQL \u542B $N \u5F62\u5F0F\uFF08\u4F4D\u7F6E ${i}\uFF09\uFF0Cdbkit \u4EC5\u63A5\u53D7 ? \u5360\u4F4D\u7B26`
          );
        }
        break;
      case "single":
        if (ch === "'" && next === "'") i++;
        else if (ch === "'") state = "normal";
        break;
      case "double":
        if (ch === '"' && next === '"') i++;
        else if (ch === '"') state = "normal";
        break;
      case "line":
        if (ch === "\n") state = "normal";
        break;
      case "block":
        if (ch === "*" && next === "/") {
          state = "normal";
          i++;
        }
        break;
    }
    i++;
  }
  if (state === "single") throw new PlaceholderError("SQL \u672A\u95ED\u5408\u7684\u5355\u5F15\u53F7\u5B57\u7B26\u4E32");
  if (state === "double") throw new PlaceholderError("SQL \u672A\u95ED\u5408\u7684\u53CC\u5F15\u53F7\u6807\u8BC6\u7B26");
  if (state === "block") throw new PlaceholderError("SQL \u672A\u95ED\u5408\u7684\u5757\u6CE8\u91CA /* */");
  return positions;
}
function compilePlaceholders(sql, driver, params = []) {
  const positions = scanPlaceholders(sql);
  if (params.length !== positions.length) {
    throw new PlaceholderError(
      `\u53C2\u6570\u6570\u91CF\u4E0D\u5339\u914D\uFF1ASQL \u542B ${positions.length} \u4E2A\u5360\u4F4D\u7B26\uFF0C\u4F20\u5165 ${params.length} \u4E2A\u53C2\u6570`
    );
  }
  if (driver === "sqlite") {
    return { text: sql, paramCount: positions.length };
  }
  let result = "";
  let last = 0;
  for (let idx = 0; idx < positions.length; idx++) {
    const pos = positions[idx];
    result += sql.slice(last, pos) + "$" + (idx + 1);
    last = pos + 1;
  }
  result += sql.slice(last);
  return { text: result, paramCount: positions.length };
}

// src/sqlite.ts
var SqliteClient = class _SqliteClient {
  constructor(db, opts = {}) {
    this.db = db;
    this.opts = opts;
    this.driver = "sqlite";
    this.closed = false;
  }
  async queryOne(statement) {
    this.assertNotClosed();
    const { text } = compilePlaceholders(statement.text, "sqlite", statement.params ?? []);
    const row = this.db.prepare(text).get(...statement.params ?? []);
    return row ?? null;
  }
  async queryAll(statement) {
    this.assertNotClosed();
    const { text } = compilePlaceholders(statement.text, "sqlite", statement.params ?? []);
    return this.db.prepare(text).all(...statement.params ?? []);
  }
  async run(statement) {
    this.assertNotClosed();
    const { text } = compilePlaceholders(statement.text, "sqlite", statement.params ?? []);
    const r = this.db.prepare(text).run(...statement.params ?? []);
    return { changes: r.changes };
  }
  async exec(sql) {
    this.assertNotClosed();
    this.db.exec(sql);
  }
  async transaction(fn) {
    this.assertNotClosed();
    this.db.exec("BEGIN");
    let committed = false;
    try {
      const tx = new _SqliteClient(this.db, { closable: false });
      const result = await fn(tx);
      this.db.exec("COMMIT");
      committed = true;
      return result;
    } finally {
      if (!committed) {
        try {
          this.db.exec("ROLLBACK");
        } catch {
        }
      }
    }
  }
  async close() {
    if (this.closed) return;
    const closable = this.opts.closable ?? true;
    if (!closable) {
      throw new DbkitError("\u4E8B\u52A1\u4E2D\u7684 tx client \u4E0D\u80FD\u5355\u72EC\u5173\u95ED");
    }
    this.closed = true;
    this.db.close();
  }
  assertNotClosed() {
    if (this.closed) throw new DbkitError("SqliteClient \u5DF2\u5173\u95ED");
  }
};
function createSqliteClient(path) {
  if (path && path !== ":memory:" && !path.startsWith("file:")) {
    mkdirSync(dirname(resolve(path)), { recursive: true });
  }
  const db = new Database(path);
  if (path !== ":memory:") {
    db.pragma("journal_mode = WAL");
  }
  db.pragma("foreign_keys = ON");
  return new SqliteClient(db);
}

// src/config.ts
function createDbConfig(options = {}) {
  const driver = options.driver ?? process.env.DB_DRIVER ?? "sqlite";
  if (driver !== "sqlite" && driver !== "postgres") {
    throw new InvalidDriverError(
      `\u4E0D\u652F\u6301\u7684 DB_DRIVER: ${String(driver)}\uFF0C\u4EC5\u652F\u6301 'sqlite' | 'postgres'`
    );
  }
  const postgresUrl = options.postgresUrl ?? process.env.DATABASE_URL;
  if (driver === "postgres" && !postgresUrl) {
    throw new MissingDatabaseUrlError(
      "postgres \u6A21\u5F0F\u5FC5\u987B\u63D0\u4F9B DATABASE_URL \u6216 postgresUrl"
    );
  }
  const envPool = readPoolFromEnv();
  return {
    driver,
    sqlitePath: options.sqlitePath ?? process.env.DB_PATH ?? "./data/helpdesk.db",
    postgresUrl,
    postgresPool: { ...envPool, ...options.postgresPool }
  };
}
function readPoolFromEnv() {
  const pool = {};
  const max = process.env.DB_POOL_MAX;
  const idle = process.env.DB_POOL_IDLE_TIMEOUT_MS;
  const connTimeout = process.env.DB_POOL_CONNECTION_TIMEOUT_MS;
  const ssl = process.env.DB_SSL;
  if (max !== void 0) pool.max = Number(max);
  if (idle !== void 0) pool.idleTimeoutMillis = Number(idle);
  if (connTimeout !== void 0) pool.connectionTimeoutMillis = Number(connTimeout);
  if (ssl !== void 0) pool.ssl = ssl.toLowerCase() === "true";
  return pool;
}

// src/migrations.ts
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";
var ADVISORY_LOCK_KEY = 20250817;
async function scanMigrationFiles(directory, driver) {
  const dir = join(directory, driver);
  let files;
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();
  const result = [];
  for (const name of sqlFiles) {
    const content = await readFile(join(dir, name), "utf8");
    const checksum = createHash("sha256").update(content).digest("hex");
    result.push({ name, content, checksum });
  }
  return result;
}
async function ensureMigrationsTable(db, tableName) {
  await db.exec(`CREATE TABLE IF NOT EXISTS ${tableName} (
    name TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
}
async function getAppliedMigrations(db, tableName) {
  const rows = await db.queryAll({
    text: `SELECT name, checksum, applied_at FROM ${tableName} ORDER BY name`
  });
  return rows.map((r) => ({ name: r.name, checksum: r.checksum, appliedAt: r.applied_at }));
}
async function runMigrations(db, options) {
  const tableName = options.tableName ?? "commonapp_migrations";
  await ensureMigrationsTable(db, tableName);
  const files = await scanMigrationFiles(options.directory, db.driver);
  const applied = await getAppliedMigrations(db, tableName);
  const appliedMap = new Map(applied.map((a) => [a.name, a]));
  for (const f of files) {
    const rec = appliedMap.get(f.name);
    if (rec && rec.checksum !== f.checksum) {
      throw new MigrationChecksumError(
        `migration ${f.name} \u5185\u5BB9\u5DF2\u53D8\u66F4\uFF08checksum \u4E0D\u4E00\u81F4\uFF09\uFF0C\u4E0D\u5141\u8BB8\u4FEE\u6539\u5DF2\u6267\u884C\u7684 migration`
      );
    }
  }
  for (const f of files) {
    if (appliedMap.has(f.name)) continue;
    await db.transaction(async (tx) => {
      if (db.driver === "postgres") {
        await tx.exec(`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})`);
      }
      await tx.exec(f.content);
      await tx.run({
        text: `INSERT INTO ${tableName} (name, checksum, applied_at) VALUES (?, ?, ?)`,
        params: [f.name, f.checksum, (/* @__PURE__ */ new Date()).toISOString()]
      });
    });
  }
  return getMigrationStatus(db, options);
}
async function getMigrationStatus(db, options) {
  const tableName = options.tableName ?? "commonapp_migrations";
  await ensureMigrationsTable(db, tableName);
  const files = await scanMigrationFiles(options.directory, db.driver);
  const applied = await getAppliedMigrations(db, tableName);
  const appliedNames = new Set(applied.map((a) => a.name));
  return {
    applied,
    pending: files.filter((f) => !appliedNames.has(f.name)).map((f) => f.name)
  };
}

// src/sqlite-runtime.ts
function createDb(config) {
  if (config.driver !== "sqlite") {
    throw new InvalidDriverError("This portable distribution supports SQLite only");
  }
  return createSqliteClient(config.sqlitePath);
}
function createMemoryDb() {
  return createSqliteClient(":memory:");
}
export {
  DbkitError,
  InvalidDriverError,
  MigrationChecksumError,
  MigrationConflictError,
  MissingDatabaseUrlError,
  PlaceholderError,
  SqliteClient,
  compilePlaceholders,
  createDb,
  createDbConfig,
  createMemoryDb,
  createSqliteClient,
  getMigrationStatus,
  runMigrations
};
