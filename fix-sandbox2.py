import os

os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api\src\sandbox')

d = open('sandbox-budget.service.ts', 'rb').read()

# Check MemoryBudget interface for totalBudget
idx = d.find(b'MemoryBudget {')
end = d.find(b'}', idx)
mem_block = d[idx:end+1].decode('utf-8', errors='replace')
print('MemoryBudget:', mem_block)

if b'totalBudget' not in mem_block:
    # Add it right after monthlyLimit
    d = d.replace(b'monthlyLimit: bigint;', b'monthlyLimit: bigint;\n  totalBudget: bigint;')
    print('Added totalBudget to MemoryBudget')

# Check addAlert call
idx = d.find(b'this.store.addAlert({')
if idx >= 0:
    end = d.find(b'});', idx)
    block = d[idx:end+3]
    if b'level' not in block:
        print('addAlert block missing level')
        print(block[:200])
        # Add level line after id,
        d = d.replace(b'addAlert({\n        id,\n        budgetId:', b'addAlert({\n        id,\n        level: "WARNING",\n        budgetId:')

# Verify fix
idx = d.find(b'this.store.addAlert({')
if idx >= 0:
    end = d.find(b'});', idx)
    block = d[idx:end+3]
    print('addAlert after fix:', block[:200])

open('sandbox-budget.service.ts', 'wb').write(d)
print('Done')
