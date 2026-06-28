import os

os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api')

with open('prisma/schema.prisma', 'rb') as f:
    d = f.read()

# Replace SandboxBudgetAlert
old_alert = b'model SandboxBudgetAlert {\n  id         String   @id @default(uuid())\n  budgetId   String\n  tenantId   String\n  threshold  Float    // 0.0-1.0, e.g. 0.8 = 80%\n  triggeredAt DateTime @default(now())\n  dismissedAt DateTime?\n  message    String?\n  metadata   Json?\n  createdAt  DateTime @default(now())\n\n  @@index([budgetId])\n  @@index([tenantId, triggeredAt])\n}\r\n'

new_alert = b'model SandboxBudgetAlert {\n  id            String   @id @default(uuid())\n  budgetId      String\n  tenantId      String\n  threshold     Float    // 0.0-1.0\n  level         String   @default(' + b'"WARNING"' + b')\n  isAcknowledged Boolean @default(false)\n  message       String?\n  notifiedAt    DateTime?\n  dismissedAt   Boolean  @default(false)\n  createdAt     DateTime @default(now())\n\n  budget SandboxBudget @relation(fields: [budgetId], references: [id], onDelete: Cascade)\n\n  @@index([budgetId])\n  @@index([tenantId, createdAt])\n}\r\n'

print('old len:', len(old_alert))
print('new len:', len(new_alert))

if old_alert in d:
    d = d.replace(old_alert, new_alert)
    print('Replaced SandboxBudgetAlert')
else:
    # Try without \r\n
    old2 = old_alert.rstrip(b'\r\n')
    new2 = new_alert.rstrip(b'\r\n')
    if old2 in d:
        d = d.replace(old2, new2)
        print('Replaced (no trailing CRLF)')
    else:
        print('Not found in file!')
        idx = d.find(b'model SandboxBudgetAlert')
        if idx >= 0:
            end = d.find(b'}', idx)
            end2 = d.find(b'}', end + 1)
            end3 = len(d) if end2 < 0 else end2 + 1
            actual = d[idx:end3]
            print('Actual:', repr(actual[:200]))

with open('prisma/schema.prisma', 'wb') as f:
    f.write(d)
print('Written successfully')
