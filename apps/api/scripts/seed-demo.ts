import { WorkflowStatus } from '@prisma/client';
import 'dotenv/config';
import { MembershipRole, PrismaClient, BillingInterval } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomBytes, scrypt as scryptCallback } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL must be set before running the seed script.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(connectionString),
});

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

async function main() {
  console.log('🌱 Seeding demo data...\n');

  // ── 1. Demo Tenant ──────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: { name: 'Demo Company' },
    create: { name: 'Demo Company', slug: 'demo' },
  });
  console.log(`✅ Tenant: ${tenant.name} (${tenant.slug})`);

  // ── 2. Demo User (admin@demo.local / Demo@123) ──────────────────────────
  const passwordHash = await hashPassword('Demo@123');
  const user = await prisma.user.upsert({
    where: { email: 'admin@demo.local' },
    update: { name: 'Demo Admin', tenantId: tenant.id, passwordHash },
    create: {
      email: 'admin@demo.local',
      name: 'Demo Admin',
      tenantId: tenant.id,
      passwordHash,
    },
  });
  console.log(`✅ User: ${user.email} / Demo@123`);

  // ── 3. Default Workspace ────────────────────────────────────────────────
  const workspace = await prisma.workspace.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'default' } },
    update: { name: 'Main Workspace' },
    create: { name: 'Main Workspace', slug: 'default', tenantId: tenant.id },
  });
  console.log(`✅ Workspace: ${workspace.name}`);

  // ── 4. Membership (OWNER) ──────────────────────────────────────────────
  const existingMembership = await prisma.membership.findFirst({
    where: { tenantId: tenant.id, userId: user.id, workspaceId: workspace.id, role: MembershipRole.OWNER },
  });
  const membership = existingMembership
    ? await prisma.membership.update({ where: { id: existingMembership.id }, data: { isDefault: true } })
    : await prisma.membership.create({
        data: { userId: user.id, tenantId: tenant.id, workspaceId: workspace.id, role: MembershipRole.OWNER, isDefault: true },
      });
  console.log(`✅ Membership: ${membership.role} (default=${membership.isDefault})`);

  // ── 5. Billing Plans ────────────────────────────────────────────────────
  const plans = [
    { key: 'free', name: 'Free', price: 0, currency: 'VND', interval: BillingInterval.MONTHLY, maxUsers: 1, maxWorkflows: 3, aiCallsMonthly: 100, storageGB: 1, features: { templates: false, api: false, support: 'community' }, limits: { workflows: 3, storage: 1, aiCalls: 100 } },
    { key: 'starter', name: 'Starter', price: 199000, currency: 'VND', interval: BillingInterval.MONTHLY, maxUsers: 3, maxWorkflows: 10, aiCallsMonthly: 1000, storageGB: 10, features: { templates: true, api: true, support: 'email' }, limits: { workflows: 10, storage: 10, aiCalls: 1000 } },
    { key: 'pro', name: 'Professional', price: 499000, currency: 'VND', interval: BillingInterval.MONTHLY, maxUsers: 10, maxWorkflows: 50, aiCallsMonthly: 10000, storageGB: 50, features: { templates: true, api: true, support: 'priority' }, limits: { workflows: 50, storage: 50, aiCalls: 10000 } },
    { key: 'team', name: 'Team', price: 999000, currency: 'VND', interval: BillingInterval.MONTHLY, maxUsers: 50, maxWorkflows: 200, aiCallsMonthly: 100000, storageGB: 200, features: { templates: true, api: true, support: 'dedicated' }, limits: { workflows: 200, storage: 200, aiCalls: 100000 } },
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { key: plan.key },
      update: plan,
      create: plan,
    });
  }
  console.log(`✅ Plans: ${plans.map(p => p.key).join(', ')}`);

  // ── 6. Billing Account + Pro Subscription ──────────────────────────────
  const billingAccount = await prisma.billingAccount.upsert({
    where: { tenantId: tenant.id },
    update: { currency: 'VND', status: 'active' },
    create: { tenantId: tenant.id, currency: 'VND', status: 'active', billingPeriod: 'monthly' },
  });
  console.log(`✅ Billing Account: ${billingAccount.id}`);

  let subscriptionId: string | null = null;
  const proPlan = await prisma.subscriptionPlan.findUnique({ where: { key: 'pro' } });
  if (proPlan) {
    const existingSub = await prisma.subscription.findFirst({
      where: { accountId: billingAccount.id, planKey: 'pro' },
    });
    if (!existingSub) {
      const sub = await prisma.subscription.create({
        data: {
          accountId: billingAccount.id,
          planKey: 'pro',
          tenantId: tenant.id,
          status: 'ACTIVE',
          startedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      subscriptionId = sub.id;
      console.log('✅ Subscription: Pro plan activated');
    } else {
      subscriptionId = existingSub.id;
      console.log('✅ Subscription: Pro plan (already exists)');
    }
  }

  // ── 7. Invoice + Payment Transaction (for Payment Page demo) ──────────
  if (billingAccount && subscriptionId) {
    const existingInvoice = await prisma.invoice.findFirst({
      where: { accountId: billingAccount.id, number: 'INV-2026-00001' },
    });
    if (!existingInvoice) {
      const invoice = await prisma.invoice.create({
        data: {
          accountId: billingAccount.id,
          tenantId: tenant.id,
          subscriptionId,
          number: 'INV-2026-00001',
          description: 'Professional Plan - Monthly Subscription',
          amount: 499000,
          currency: 'VND',
          status: 'paid',
          dueDate: new Date(),
          paidAt: new Date(),
        },
      });
      console.log(`✅ Invoice: ${invoice.number} (${invoice.amount}₫, paid)`);

      // Create a successful payment transaction linked to this invoice
      await prisma.paymentTransaction.create({
        data: {
          invoiceId: invoice.id,
          accountId: billingAccount.id,
          tenantId: tenant.id,
          gateway: 'vnpay',
          gatewayTxId: `VNP${Date.now()}`,
          amount: 499000,
          currency: 'VND',
          status: 'success',
          paidAt: new Date(),
          paymentUrl: '',
          paymentMethod: 'qr',
          metadata: { orderId: `AIFUT-DEMO-${Date.now()}`, type: 'subscription_renewal' },
        },
      });
      console.log('✅ PaymentTransaction: VNPay success (demo)');
    } else {
      console.log('✅ Invoice + PaymentTransaction: already exist');
    }
  }

  // ── 8. Sample Workflow Templates ──────────────────────────────────────
  const demoWorkflows = [
    {
      key: 'booking-reminder',
      name: 'Booking Reminder',
      description: 'Send Zalo/email reminder 24h before appointment',
      industry: 'Services',
      status: 'ACTIVE' as WorkflowStatus,
      config: {
        nodes: [
          { type: 'TRIGGER', config: { event: 'booking.created' } },
          { type: 'CONDITION', config: { expression: 'booking.date - now() < 24h' } },
          { type: 'SEND', config: { channel: 'zalo', template: 'booking-reminder', to: '{{customer.phone}}' } },
          { type: 'SEND', config: { channel: 'email', template: 'booking-confirm', to: '{{customer.email}}' } },
        ],
      },
    },
    {
      key: 'order-confirm',
      name: 'Order Confirmation',
      description: 'Multi-channel order confirmation with delivery tracking',
      industry: 'F&B',
      status: 'ACTIVE' as WorkflowStatus,
      config: {
        nodes: [
          { type: 'TRIGGER', config: { event: 'order.created' } },
          { type: 'SEND', config: { channel: 'email', template: 'order-confirm', to: '{{customer.email}}' } },
          { type: 'SEND', config: { channel: 'sms', template: 'order-sms', to: '{{customer.phone}}' } },
          { type: 'WAIT', config: { duration: '1h' } },
          { type: 'CONDITION', config: { expression: 'order.status == "delivered"' } },
          { type: 'SEND', config: { channel: 'zalo', template: 'feedback-request', to: '{{customer.phone}}' } },
        ],
      },
    },
    {
      key: 'feedback-collect',
      name: 'Feedback Collection',
      description: 'Auto-collect feedback after service completion',
      industry: 'Services',
      status: 'ACTIVE' as WorkflowStatus,
      config: {
        nodes: [
          { type: 'TRIGGER', config: { event: 'service.completed' } },
          { type: 'WAIT', config: { duration: '2h' } },
          { type: 'SEND', config: { channel: 'zalo', template: 'feedback-form', to: '{{customer.phone}}' } },
          { type: 'SEND', config: { channel: 'email', template: 'feedback-email', to: '{{customer.email}}' } },
        ],
      },
    },
    {
      key: 'welcome-series',
      name: 'Welcome Series',
      description: '5-day onboarding automation for new customers',
      industry: 'Education',
      status: 'DRAFT' as WorkflowStatus,
      config: {
        nodes: [
          { type: 'TRIGGER', config: { event: 'customer.created' } },
          { type: 'SEND', config: { channel: 'email', template: 'welcome-email', to: '{{customer.email}}' } },
          { type: 'WAIT', config: { duration: '1d' } },
          { type: 'SEND', config: { channel: 'zalo', template: 'welcome-zalo', to: '{{customer.phone}}' } },
          { type: 'WAIT', config: { duration: '3d' } },
          { type: 'CONDITION', config: { expression: 'customer.lifetime_value > 0' } },
          { type: 'SEND', config: { channel: 'email', template: 'vip-offer', to: '{{customer.email}}' } },
        ],
      },
    },
    {
      key: 'cron-report',
      name: 'Weekly Report',
      description: 'Automated weekly business performance report',
      industry: 'Technology',
      status: 'ACTIVE' as WorkflowStatus,
      config: {
        nodes: [
          { type: 'SCHEDULE', config: { cron: '0 9 * * 1' } },
          { type: 'SEND', config: { channel: 'email', template: 'weekly-report', to: 'admin@demo.local' } },
          { type: 'SEND', config: { channel: 'webhook', template: 'report-webhook', url: 'https://hooks.demo.local/report' } },
        ],
      },
    },
  ];

  for (const wt of demoWorkflows) {
    const { config, ...workflowData } = wt;
    await prisma.workflowTemplate.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: wt.key } },
      update: { name: wt.name, description: wt.description, industry: wt.industry, metadata: config },
      create: { ...workflowData, tenantId: tenant.id, workspaceId: workspace.id, metadata: config },
    });
  }
  console.log(`✅ Workflow Templates: ${demoWorkflows.length}`);

  // ── 9. Notification Templates ─────────────────────────────────────────
  const notifTemplates = [
    { key: 'booking-reminder', name: 'Booking Reminder', channel: 'ZALO', subjectTemplate: 'Nhắc lịch hẹn', bodyTemplate: 'Xin chào {{customer_name}}, bạn có lịch hẹn vào {{time}} ngày {{date}}. Vui lòng xác nhận: {{confirm_link}}', format: 'text' },
    { key: 'booking-confirm', name: 'Booking Confirmation', channel: 'EMAIL', subjectTemplate: 'Xác nhận đặt lịch - {{business_name}}', bodyTemplate: '<h2>Xác nhận lịch hẹn</h2><p>Xin chào {{customer_name}},</p><p>Lịch hẹn của bạn đã được xác nhận:</p><ul><li>Thời gian: {{time}} - {{date}}</li><li>Địa điểm: {{address}}</li></ul>', format: 'html' },
    { key: 'order-confirm', name: 'Order Confirmation', channel: 'EMAIL', subjectTemplate: 'Xác nhận đơn hàng #{{order_id}}', bodyTemplate: '<h2>Cảm ơn bạn đã đặt hàng!</h2><p>Đơn hàng #{{order_id}} đang được xử lý.</p><p>Chi tiết: {{order_details}}</p>', format: 'html' },
    { key: 'feedback-request', name: 'Feedback Request', channel: 'ZALO', subjectTemplate: 'Đánh giá dịch vụ', bodyTemplate: 'Cảm ơn bạn đã sử dụng dịch vụ! {{customer_name}} ơi, hãy đánh giá trải nghiệm của bạn: {{feedback_link}}', format: 'text' },
    { key: 'weekly-report', name: 'Weekly Performance Report', channel: 'EMAIL', subjectTemplate: 'Báo cáo tuần {{week}} - {{business_name}}', bodyTemplate: '<h2>Báo cáo hiệu suất tuần {{week}}</h2><p>Xin chào,</p><p>Đây là báo cáo tự động:</p><ul><li>Đơn hàng mới: {{new_orders}}</li><li>Khách hàng mới: {{new_customers}}</li><li>Doanh thu: {{revenue}}</li></ul>', format: 'html' },
  ];

  for (const nt of notifTemplates) {
    await prisma.notificationTemplate.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: nt.key } },
      update: { name: nt.name, channel: nt.channel as any, subjectTemplate: nt.subjectTemplate, bodyTemplate: nt.bodyTemplate, format: nt.format },
      create: { ...nt, tenantId: tenant.id, channel: nt.channel as any },
    });
  }
  console.log(`✅ Notification Templates: ${notifTemplates.length}`);

  // ── 10. Sample Entitlements ────────────────────────────────────────────
  const entitlements = [
    { key: 'max_workflows', value: '50', kind: 'LIMIT' },
    { key: 'max_storage_gb', value: '50', kind: 'LIMIT' },
    { key: 'ai_calls_monthly', value: '10000', kind: 'LIMIT' },
    { key: 'support_tier', value: 'priority', kind: 'FEATURE' },
    { key: 'api_access', value: 'true', kind: 'FEATURE' },
    { key: 'template_library', value: 'true', kind: 'FEATURE' },
  ] as const;

  for (const e of entitlements) {
    await prisma.entitlement.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: e.key } },
      update: { value: e.value, kind: e.kind as any },
      create: { tenantId: tenant.id, key: e.key, value: e.value, kind: e.kind as any },
    });
  }
  console.log(`✅ Entitlements: ${entitlements.length}`);

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log('  ✅ DEMO SEED COMPLETE');
  console.log('  ├── Login:      admin@demo.local / Demo@123');
  console.log('  ├── API:        http://localhost:3002');
  console.log('  ├── Web:        http://localhost:3000');
  console.log('  ├── Tenant:     demo');
  console.log('  ├── Plan:       Professional (seeded)');
  console.log('  ├── Workflows:  5 sample templates');
  console.log('  ├── Notifications: 5 templates');
  console.log('  ├── Entitlements: 6 rules');
  console.log('  ├── Invoice:    INV-2026-00001 (paid, 499,000₫)');
  console.log('  └── Payment:    VNPay demo transaction (success)');
  console.log('═══════════════════════════════════════════\n');
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
