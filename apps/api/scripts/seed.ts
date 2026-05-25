import { MembershipRole, PrismaClient } from '@prisma/client';

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
      tenantId: tenant.id,
    },
    create: {
      email: 'admin@aifut.local',
      name: 'Admin',
      tenantId: tenant.id,
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

  const existingMembership = await prisma.membership.findFirst({
    where: {
      tenantId: tenant.id,
      userId: user.id,
      workspaceId: workspace.id,
      role: MembershipRole.OWNER,
    },
  });

  const membership = existingMembership
    ? await prisma.membership.update({
        where: { id: existingMembership.id },
        data: {
          isDefault: true,
        },
      })
    : await prisma.membership.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          workspaceId: workspace.id,
          role: MembershipRole.OWNER,
          isDefault: true,
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
