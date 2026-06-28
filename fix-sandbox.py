import os

os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api\src\sandbox')

d = open('sandbox-budget.service.ts', 'rb').read()

# 1. Add totalBudget to MemoryBudget
if b'totalBudget: bigint;' not in d:
    d = d.replace(b'export interface MemoryBudget {',
                  b'export interface MemoryBudget {\n  totalBudget: bigint;')

# 2. addAlert() - missing level
old_alert = b'        id,\n        budgetId:'
new_alert = b'        id,\n        level: "WARNING",\n        budgetId:'
if old_alert in d:
    d = d.replace(old_alert, new_alert)
    print('Added level to addAlert')

# 3. Line 582 - fix dismissedAt type
old_dismiss = b'dismissedAt: alert.dismissedAt ?? false'
new_dismiss = b'dismissedAt: (alert as any).dismissedAt ?? false'
if old_dismiss in d:
    d = d.replace(old_dismiss, new_dismiss)
    print('Fixed dismissedAt type')
else:
    # Try without the space
    old2 = b'dismissedAt:alert.dismissedAt??false'
    if old2 in d:
        d = d.replace(old2, new_dismiss)
        print('Fixed dismissedAt (compact)')
    else:
        # Check what's actually there
        idx = d.find(b'dismissedAt')
        if idx >= 0:
            print('Found dismissedAt at', idx, ':', d[idx:idx+60])

open('sandbox-budget.service.ts', 'wb').write(d)
print('Done')
