import os

os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api')

with open('prisma/schema.prisma', 'rb') as f:
    d = f.read()

# Replace SandboxBudget
old_budget = b'model SandboxBudget {\n  id            String   @id @default(uuid())\n  tenantId      String\n  sessionId     String?\n  totalBudget   BigInt   @default(10000000) // 10M VND default\n  usedBudget    BigInt   @default(0)\n  currency      String   @default("VND")\n  periodStart   DateTime @default(now())\n  periodEnd     DateTime?\n  isActive      Boolean  @default(true)\n  alertSentAt   DateTime?\n  createdAt     DateTime @default(now())\n  updatedAt     DateTime @updatedAt\n\n  @@unique([tenantId, sessionId])\n  @@index([tenantId, isActive])\n  @@index([tenantId, sessionId])\n}\n\n'

new_budget = b'model SandboxBudget {\n  id            String   @id @default(uuid())\n  tenantId      String\n  sessionId     String?\n  monthlyLimit  BigInt   @default(10000000)\n  currentSpend  BigInt   @default(0)\n  usedBudget    BigInt   @default(0)\n  totalBudget   BigInt   @default(10000000)\n  alertThreshold Float   @default(0.8)\n  currency      String   @default("VND")\n  periodStart   DateTime @default(now())\n  periodEnd     DateTime?\n  isActive      Boolean  @default(true)\n  alertSentAt   DateTime?\n  createdAt     DateTime @default(now())\n  updatedAt     DateTime @updatedAt\n\n  alerts SandboxBudgetAlert[]\n\n  @@unique([tenantId, sessionId])\n  @@index([tenantId, isActive])\n  @@index([tenantId, sessionId])\n}\n\n'

if old_budget in d:
    d = d.replace(old_budget, new_budget)
    print('Replaced SandboxBudget')
else:
    print('ERROR: SandboxBudget text mismatch!')
    # Find and show the actual content
    idx = d.find(b'model SandboxBudget')
    idx2 = d.find(b'model', idx + 5)
    actual = d[idx:idx2]
    print(f'Expected len={len(old_budget)}, actual len={len(actual)}')
    # Find first byte difference
    for i in range(min(len(old_budget), len(actual))):
        if old_budget[i] != actual[i]:
            print(f'Diff at byte {i}: expected={chr(old_budget[i])!r} actual={chr(actual[i])!r}')
            print(f'Context expected: {old_budget[max(0,i-10):i+10]}')
            print(f'Context actual:   {actual[max(0,i-10):i+10]}')
            break

# Replace SandboxBudgetAlert
old_alert = b'model SandboxBudgetAlert {\n  id         String   @id @default(uuid())\n  budgetId   String\n  tenantId   String\n  threshold  Float    // 0.0-1.0, e.g. 0.8 = 80%\n  triggeredAt DateTime @default(now())\n  dismissedAt DateTime?\n  message    String?\n  metadata   Json?\n  createdAt  DateTime @default(now())\n\n  @@index([budgetId])\n  @@index([tenantId, triggeredAt])\n}\n\n'

new_alert = b'model SandboxBudgetAlert {\n  id            String   @id @default(uuid())\n  budgetId      String\n  tenantId      String\n  threshold     Float    // 0.0-1.0\n  level         String   @default("WARNING")\n  isAcknowledged Boolean @default(false)\n  message       String?\n  notifiedAt    DateTime?\n  dismissedAt   Boolean  @default(false)\n  createdAt     DateTime @default(now())\n\n  budget SandboxBudget @relation(fields: [budgetId], references: [id], onDelete: Cascade)\n\n  @@index([budgetId])\n  @@index([tenantId, createdAt])\n}\n\n'

if old_alert in d:
    d = d.replace(old_alert, new_alert)
    print('Replaced SandboxBudgetAlert')
else:
    print('ERROR: SandboxBudgetAlert text mismatch!')
    idx = d.find(b'model SandboxBudgetAlert')
    idx2 = d.find(b'model', idx + 5)
    if idx2 < 0:
        idx2 = len(d)
    actual = d[idx:idx2]
    print(f'Expected len={len(old_alert)}, actual len={len(actual)}')
    for i in range(min(len(old_alert), len(actual))):
        if old_alert[i] != actual[i]:
            print(f'Diff at byte {i}: expected={chr(old_alert[i])!r} actual={chr(actual[i])!r}')
            break

with open('prisma/schema.prisma', 'wb') as f:
    f.write(d)

print('Done')
