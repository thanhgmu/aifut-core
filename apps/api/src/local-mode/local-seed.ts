/**
 * AIFUT Local Mode Seed Script
 * Seeds default tenant, workspace, user, and billing plans for local mode.
 */

import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";

const prisma = new PrismaClient();
const DEFAULT_SLUG = process.env.DEFAULT_TENANT_SLUG || "local";

async function seed() {
  console.log("Seeding local mode data...");

  // Upsert tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: DEFAULT_SLUG },
    update: {},
    create: {
      name: "Local Business",
      slug: DEFAULT_SLUG,
    },
  });
  console.log(`  ✓ Tenant: ${tenant.slug} (${tenant.id})`);

  // Upsert default workspace
  const ws = await prisma.workspace.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: "default" } },
    update: {},
    create: {
      name: "Main Workspace",
      slug: "default",
      tenantId: tenant.id,
    },
  });
  console.log(`  ✓ Workspace: ${ws.slug}`);

  // Create local admin user if not exists
  const adminEmail = process.env.LOCAL_ADMIN_EMAIL || "admin@local.aifut.app";
  const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingUser) {
    // Simple hash for local mode — in production use bcrypt
    const passwordHash = process.env.LOCAL_ADMIN_PASSWORD
      ? crypto.createHash("sha256").update(process.env.LOCAL_ADMIN_PASSWORD).digest("hex")
      : null;

    const user = await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Local Admin",
        passwordHash: passwordHash || "local-mode-no-password-set",
        tenantId: tenant.id,
      },
    });

    await prisma.membership.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        workspaceId: ws.id,
        role: "OWNER" as any,
        isDefault: true,
      },
    });
    console.log(`  ✓ Admin user: ${adminEmail}`);
  } else {
    console.log(`  ✓ Admin exists: ${adminEmail}`);
  }

  // Seed billing plans
  const plans = [
    { key: "free", name: "Miễn phí", price: 0, maxUsers: 1, maxWorkflows: 3, aiCallsMonthly: 500, storageGB: 1 },
    { key: "starter", name: "Starter", price: 99000, maxUsers: 3, maxWorkflows: 10, aiCallsMonthly: 5000, storageGB: 10 },
    { key: "pro", name: "Pro", price: 199000, maxUsers: 10, maxWorkflows: 50, aiCallsMonthly: 50000, storageGB: 50 },
    { key: "team", name: "Team", price: 499000, maxUsers: -1, maxWorkflows: -1, aiCallsMonthly: -1, storageGB: 100 },
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { key: plan.key },
      update: {},
      create: {
        ...plan,
        currency: "VND",
        interval: "MONTHLY" as any,
        features: {},
        limits: {},
        isActive: true,
      },
    });
  }
  console.log(`  ✓ ${plans.length} billing plans seeded`);

  // Create billing account for tenant
  const billingAccount = await prisma.billingAccount.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      currency: "VND",
      billingPeriod: "monthly",
      status: "active",
    },
  });
  console.log(`  ✓ Billing account: ${billingAccount.id}`);

  // Subscribe to free plan by default
  const existingSub = await prisma.subscription.findFirst({
    where: { tenantId: tenant.id, status: "active" },
  });
  if (!existingSub) {
    await prisma.subscription.create({
      data: {
        accountId: billingAccount.id,
        planKey: "free",
        tenantId: tenant.id,
        status: "active",
        startedAt: new Date(),
      },
    });
    console.log("  ✓ Subscribed to Free plan");
  }

  console.log("\n✓ Seeding complete!");
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
