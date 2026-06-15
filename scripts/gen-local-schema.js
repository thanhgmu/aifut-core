const fs = require("fs");

let content = fs.readFileSync("apps/api/prisma/schema.prisma", "utf8");

// Replace provider
content = content.replace('provider = "postgresql"', 'provider = "sqlite"');

// Remove all enum blocks
const enumRegex = /^enum \w+ \{[\s\S]*?^\}/gm;
const enumMatches = content.match(enumRegex) || [];
const enumNames = [];
for (const block of enumMatches) {
  const name = block.match(/^enum (\w+)/)[1];
  enumNames.push(name);
}

content = content.replace(enumRegex, "");

// Replace enum type references with String
for (const name of enumNames) {
  // Field type: enum name followed by space, ?, [ or ]
  const regex = new RegExp("(?<=\\s)" + name + "(?=[\\s\\?\\[\\]])", "g");
  content = content.replace(regex, "String");
  // Also handle end-of-line
  const regex2 = new RegExp("(?<=\\s)" + name + "$", "gm");
  content = content.replace(regex2, "String");
}

// Fix Membership unique constraint with nullable workspaceId
content = content.replace(
  "@@unique([tenantId, userId, workspaceId, role])",
  "@@index([tenantId, userId, workspaceId, role])"
);

// Add SQLite file URL
content = content.replace(
  "datasource db {",
  'datasource db {\n  url      = env("DATABASE_URL")'
);

fs.writeFileSync("apps/api/prisma/schema.local.prisma", content);
const lines = content.split("\n").length;
console.log("Created schema.local.prisma - " + lines + " lines");
