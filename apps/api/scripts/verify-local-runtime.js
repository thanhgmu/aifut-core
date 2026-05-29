require('dotenv/config');

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set. Copy apps\\api\\.env.example to apps\\api\\.env first.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL),
});

async function checkConnection() {
  await prisma.$queryRaw`SELECT 1`;
}

async function collectCounts() {
  const [tenantCount, userCount, workspaceCount, membershipCount] = await Promise.all([
    prisma.tenant.count(),
    prisma.user.count(),
    prisma.workspace.count(),
    prisma.membership.count(),
  ]);

  return { tenantCount, userCount, workspaceCount, membershipCount };
}

async function main() {
  await checkConnection();
  const counts = await collectCounts();

  const missing = Object.entries(counts)
    .filter(([, value]) => value === 0)
    .map(([key]) => key);

  const summary = {
    ok: missing.length === 0,
    apiBase: process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3002',
    counts,
    nextStep:
      missing.length === 0
        ? 'Seeded local runtime context looks ready.'
        : 'Run `node apps/api/scripts/seed-local-runtime-context.js` to create the default tenant/user/workspace set.',
  };

  if (missing.length > 0) {
    summary.missing = missing;
  }

  console.log(JSON.stringify(summary, null, 2));

  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
