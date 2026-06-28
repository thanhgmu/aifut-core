import os

# Fix 1: Add tenantId back to GenerateLicenseInput
os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api\src\licensing')
d = open('licensing.service.ts', 'rb').read()
d = d.replace(b'interface GenerateLicenseInput {', b'interface GenerateLicenseInput {\n  tenantId: string;')
open('licensing.service.ts', 'wb').write(d)
print('Fixed GenerateLicenseInput')

# Fix 2: MemoryBudget create object - add monthlyLimit and alertThreshold
os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api\src\sandbox')
d = open('sandbox-budget.service.ts', 'rb').read()
# Find the MemoryBudget create
old_create = b'const budget: MemoryBudget = {\n        id,\n        tenantId,\n        sessionId: input.sessionId,\n        totalBudget: BigInt(monthlyLimit),\n        currentSpend: BigInt(0),\n        isActive: true,\n        createdAt: new Date(),\n        updatedAt: new Date(),\n      };'
new_create = b'const budget: MemoryBudget = {\n        id,\n        tenantId,\n        sessionId: input.sessionId,\n        monthlyLimit: BigInt(monthlyLimit),\n        totalBudget: BigInt(monthlyLimit),\n        currentSpend: BigInt(0),\n        alertThreshold: 0.8,\n        isActive: true,\n        createdAt: new Date(),\n        updatedAt: new Date(),\n      };'
if old_create in d:
    d = d.replace(old_create, new_create)
    print('Fixed MemoryBudget create')
else:
    # Try finding partial match
    idx = d.find(b'const budget: MemoryBudget = {')
    if idx >= 0:
        end = d.find(b'};', idx)
        print('Current create block:', d[idx:end+2][:300])

# Fix 3: addAlert level - ensure it's in the right format
idx = d.find(b'this.store.addAlert({')
if idx >= 0:
    end = d.find(b'});', idx)
    block = d[idx:end+3]
    if b'level' not in block:
        print('addAlert block missing level, trying fix')
        d = d.replace(b'addAlert({\n        id,\n        budgetId', b'addAlert({\n        id,\n        level: \x22WARNING\x22,\n        budgetId')
    else:
        print('addAlert already has level')
        print(block[:200])

open('sandbox-budget.service.ts', 'wb').write(d)
print('Done')
