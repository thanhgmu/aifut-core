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
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'acme' },
    update: { name: 'Acme Operator Stack' },
    create: {
      slug: 'acme',
      name: 'Acme Operator Stack',
    },
    select: { id: true, slug: true, name: true },
  });

  const user = await prisma.user.upsert({
    where: { email: 'ops@acme.test' },
    update: { tenantId: tenant.id, name: 'Acme Ops' },
    create: {
      tenantId: tenant.id,
      email: 'ops@acme.test',
      name: 'Acme Ops',
    },
    select: { id: true, email: true, tenantId: true },
  });

  const workspace = await prisma.workspace.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'ops' } },
    update: { name: 'Operations' },
    create: {
      tenantId: tenant.id,
      slug: 'ops',
      name: 'Operations',
    },
    select: { id: true, slug: true, name: true, tenantId: true },
  });

  const membership = await prisma.membership.upsert({
    where: {
      tenantId_userId_workspaceId_role: {
        tenantId: tenant.id,
        userId: user.id,
        workspaceId: workspace.id,
        role: 'ADMIN',
      },
    },
    update: { isDefault: true },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      workspaceId: workspace.id,
      role: 'ADMIN',
      isDefault: true,
    },
    select: {
      id: true,
      tenantId: true,
      userId: true,
      workspaceId: true,
      role: true,
      isDefault: true,
    },
  });

  console.log(JSON.stringify({ tenant, user, workspace, membership }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
