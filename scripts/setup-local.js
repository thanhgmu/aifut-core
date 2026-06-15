/**
 * AIFUT Local Mode Setup Script
 * Run: node scripts/setup-local.js
 *
 * Prepares the SQLite database for local mode:
 * 1. Generates the Prisma client from schema.local.prisma
 * 2. Pushes the schema to create the SQLite database
 * 3. Seeds default tenant and workspace
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const LOCAL_SCHEMA = path.join(ROOT, "apps/api/prisma/schema.local.prisma");
const LOCAL_OUTPUT = path.join(ROOT, "apps/api/node_modules/.prisma/client-local");

console.log("═".repeat(50));
console.log("  AIFUT Local Mode Setup");
console.log("═".repeat(50));

// Check schema exists
if (!fs.existsSync(LOCAL_SCHEMA)) {
  console.error("✗ schema.local.prisma not found");
  process.exit(1);
}
console.log("✓ Schema found");

// Set env for SQLite
process.env.DATABASE_URL = process.env.DATABASE_URL || "file:./aifut-local.db";

try {
  // Step 1: Generate Prisma client for SQLite
  console.log("\n→ Generating Prisma client (SQLite)...");
  execSync(
    `npx prisma generate --schema="${LOCAL_SCHEMA}"`,
    { cwd: ROOT, stdio: "inherit", env: { ...process.env } }
  );
  console.log("✓ Prisma client generated");

  // Step 2: Push schema to SQLite database
  console.log("\n→ Creating/updating SQLite database...");
  execSync(
    `npx prisma db push --schema="${LOCAL_SCHEMA}" --accept-data-loss`,
    { cwd: ROOT, stdio: "inherit", env: { ...process.env } }
  );
  console.log("✓ Database created");

  // Step 3: Run seed
  console.log("\n→ Seeding default data...");
  execSync(
    `npx ts-node apps/api/src/local-mode/local-seed.ts`,
    { cwd: ROOT, stdio: "inherit", env: { ...process.env } }
  );
  console.log("✓ Seed data created");

  console.log("\n" + "═".repeat(50));
  console.log("  Local mode ready!");
  console.log(`  Database: ${process.env.DATABASE_URL}`);
  console.log("  Start: npm run start:local");
  console.log("═".repeat(50));
} catch (err) {
  console.error("\n✗ Setup failed:", err.message);
  process.exit(1);
}
