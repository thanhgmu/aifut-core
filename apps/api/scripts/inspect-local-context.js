require('dotenv/config');

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL),
});

async function main() {
  const [tenants, users, workspaces, memberships] = await Promise.all([
    prisma.tenant.findMany({ select: { id: true, slug: true, name: true }, take: 10 }),
    prisma.user.findMany({ select: { id: true, email: true, tenantId: true }, take: 10 }),
    prisma.workspace.findMany({ select: { id: true, slug: true, name: true, tenantId: true }, take: 10 }),
    prisma.membership.findMany({
      select: { id: true, tenantId: true, userId: true, workspaceId: true, role: true, isDefault: true },
      take: 20,
    }),
  ]);

  console.log(JSON.stringify({ tenants, users, workspaces, memberships }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
