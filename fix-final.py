import os

os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api\src\sandbox')

d = open('sandbox-budget.service.ts', 'rb').read()

# Fix truncated level line
d = d.replace(b'level: alert.\n      dismissedAt:', b'level: (alert as any).level,\n      dismissedAt:')

# Also fix totalBudget in MemoryBudget if still missing
if b'totalBudget: bigint' not in d:
    # Check where MemoryBudget is
    idx = d.find(b'MemoryBudget {')
    if idx >= 0:
        end = d.find(b'}', idx)
        mem_block = d[idx:end]
        print('MemoryBudget block:')
        print(mem_block.decode('utf-8', errors='replace'))
        # Add totalBudget
        d = d.replace(b'export interface MemoryBudget {', b'export interface MemoryBudget {\n  totalBudget: bigint;')

# Fix addAlert level issue
idx = d.find(b'this.store.addAlert({')
if idx >= 0:
    end = d.find(b'});', idx)
    block = d[idx:end+3]
    if b'level' not in block:
        print('addAlert missing level, fixing')
        d = d.replace(b'addAlert({\n        id,\n        budgetId:', b'addAlert({\n        id,\n        level: "WARNING",\n        budgetId:')

# Fix licensing - Property 'tenantId' does not exist on type 'GenerateLicenseInput'
# This is in licensing.service.ts
os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api\src\licensing')
d2 = open('licensing.service.ts', 'rb').read()
# Find GenerateLicenseInput interface
idx = d2.find(b'interface GenerateLicenseInput')
if idx >= 0:
    end = d2.find(b'}', idx)
    interface_block = d2[idx:end]
    print('GenerateLicenseInput:')
    print(interface_block.decode('utf-8', errors='replace'))
    if b'tenantId' not in interface_block:
        # Add tenantId to the interface
        d2 = d2.replace(b'export interface GenerateLicenseInput {', b'export interface GenerateLicenseInput {\n  tenantId: string;')
        open('licensing.service.ts', 'wb').write(d2)
        print('Added tenantId to GenerateLicenseInput')

# Write changes
os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api\src\sandbox')
open('sandbox-budget.service.ts', 'wb').write(d)
print('Fixed sandbox-budget')
