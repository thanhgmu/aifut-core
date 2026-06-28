import os

os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api')

with open('prisma/schema.prisma', 'rb') as f:
    d = f.read()

# Fix 1: Add alertThreshold to SandboxBudget
old_budget = b'model SandboxBudget {\n  id            String   @id @default(uuid())\n  tenantId      String\n  sessionId     String?\n  monthlyLimit  BigInt   @default(10000000)\n  currentSpend  BigInt   @default(0)\n  usedBudget    BigInt   @default(0)\n  totalBudget   BigInt   @default(10000000)\n  currency      String   @default("VND")\n  periodStart   DateTime @default(now())\n  periodEnd     DateTime?\n  isActive      Boolean  @default(true)\n  alertSentAt   DateTime?\n  createdAt     DateTime @default(now())\n  updatedAt     DateTime @updatedAt\n\n  alerts SandboxBudgetAlert[]\n\n  @@unique([tenantId, sessionId])\n  @@index([tenantId, isActive])\n  @@index([tenantId, sessionId])\n}'

new_budget = b'model SandboxBudget {\n  id            String   @id @default(uuid())\n  tenantId      String\n  sessionId     String?\n  monthlyLimit  BigInt   @default(10000000)\n  currentSpend  BigInt   @default(0)\n  usedBudget    BigInt   @default(0)\n  totalBudget   BigInt   @default(10000000)\n  alertThreshold Float   @default(0.8)\n  currency      String   @default("VND")\n  periodStart   DateTime @default(now())\n  periodEnd     DateTime?\n  isActive      Boolean  @default(true)\n  alertSentAt   DateTime?\n  createdAt     DateTime @default(now())\n  updatedAt     DateTime @updatedAt\n\n  alerts SandboxBudgetAlert[]\n\n  @@unique([tenantId, sessionId])\n  @@index([tenantId, isActive])\n  @@index([tenantId, sessionId])\n}'

if old_budget in d:
    d = d.replace(old_budget, new_budget)
    print('Fixed SandboxBudget: added alertThreshold')
else:
    print('SandboxBudget old text NOT FOUND')
    # Show what we have
    idx = d.find(b'model SandboxBudget')
    if idx >= 0:
        end = d.find(b'}', idx)
        end = d.find(b'}', end + 1)
        end = d.find(b'}', end + 1)
        print('Current:', d[idx:end+1].decode('utf-8', errors='replace'))

# Fix 2: dismissedAt DateTime? -> Boolean
d = d.replace(b'  dismissedAt   DateTime?', b'  dismissedAt   Boolean  @default(false)')
print('Fixed dismissedAt type')

# Fix 3: Remove unused fields in SandboxBudgetAlert (keep threshold)
# Add level field if not present
if b'level' not in d:
    d = d.replace(b'  threshold     Float\n', b'  threshold     Float\n  level         String   @default("WARNING")\n')

with open('prisma/schema.prisma', 'wb') as f:
    f.write(d)

print('Schema updated')
