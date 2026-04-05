import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'aifut-core' },
    update: {
      name: 'AIFUT Core',
    },
    create: {
      name: 'AIFUT Core',
      slug: 'aifut-core',
    },
  });

  const user = await prisma.user.upsert({
    where: { email: 'admin@aifut.local' },
    update: {
      name: 'Admin',
    },
    create: {
      email: 'admin@aifut.local',
      name: 'Admin',
    },
  });

  const membership = await prisma.membership.upsert({
    where: {
      userId_tenantId: {
        userId: user.id,
        tenantId: tenant.id,
      },
    },
    update: {
      role: 'owner',
    },
    create: {
      userId: user.id,
      tenantId: tenant.id,
      role: 'owner',
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: {
      tenantId_slug: {
        tenantId: tenant.id,
        slug: 'default',
      },
    },
    update: {
      name: 'Default Workspace',
    },
    create: {
      name: 'Default Workspace',
      slug: 'default',
      tenantId: tenant.id,
    },
  });

  console.log('Seed completed successfully.');
  console.log({
    tenant,
    user,
    membership,
    workspace,
  });
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
