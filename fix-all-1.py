import os

# ── Fix 1: analytics-bi — BigInt math via Number() ──
os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api\src\analytics-bi')
data = open('analytics-bi.service.ts', 'rb').read()

# Convert BigInt math to Number-based
data = data.replace(
    b'existing.totalAiCost = existing.totalAiCost + s.totalAiCost',
    b'existing.totalAiCost = BigInt(Number(existing.totalAiCost) + Number(s.totalAiCost))'
)
data = data.replace(
    b'existing.totalRevenue = existing.totalRevenue + s.totalRevenue',
    b'existing.totalRevenue = BigInt(Number(existing.totalRevenue) + Number(s.totalRevenue))'
)
data = data.replace(
    b'existing.revenue = existing.revenue + s.totalRevenue',
    b'existing.revenue = BigInt(Number(existing.revenue) + Number(s.totalRevenue))'
)
data = data.replace(
    b'existing.aiCost = existing.aiCost + s.totalAiCost',
    b'existing.aiCost = BigInt(Number(existing.aiCost) + Number(s.totalAiCost))'
)
data = data.replace(
    b'data.totalAiCost / BigInt(data.count)',
    b'BigInt(Math.round(Number(data.totalAiCost) / data.count))'
)
data = data.replace(
    b'data.totalRevenue / BigInt(data.count)',
    b'BigInt(Math.round(Number(data.totalRevenue) / data.count))'
)
open('analytics-bi.service.ts', 'wb').write(data)
print('Fixed analytics-bi')

# ── Fix 2: licensing.controller ──
os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api\src\licensing')
data = open('licensing.controller.ts', 'rb').read()
data = data.replace(b"Object.values(['FREE','PRO','BUSINESS','ENTERPRISE'])", b"['FREE','PRO','BUSINESS','ENTERPRISE']")
data = data.replace(b'LicenseTier', b'String')  # residual
# Hmm, LicenseTier still referenced in template literal. Let's fix directly.
data = data.replace(b"`tier ph\\u1ea3i l\\u00e0: ${['FREE','PRO','BUSINESS','ENTERPRISE'].join(', ')}`", b"'tier must be FREE, PRO, BUSINESS, or ENTERPRISE'")
open('licensing.controller.ts', 'wb').write(data)
print('Fixed licensing.controller')

# Actually the exact bytes are tricky. Let me read and print the context
data = open('licensing.controller.ts', 'rb').read()
idx = data.find(b'LicenseTier')
if idx >= 0:
    print(f'Remaining LicenseTier at byte {idx}: {data[idx:idx+50]}')
    # If it's in a string/comparison, replace it
    data = data.replace(b'LicenseTier', b'String')
    data = data.replace(b'Object.values(String).includes', b"['FREE','PRO','BUSINESS','ENTERPRISE'].includes")
    data = data.replace(b"`tier ph\\u1ea3i l\\u00e0: ${Object.values(String).join(', ')}`", b"'tier must be FREE, PRO, BUSINESS, ENTERPRISE'")
    open('licensing.controller.ts', 'wb').write(data)
    print('Fixed remaining LicenseTier')

# ── Fix 3: licensing.service — tenant connect ──
data = open('licensing.service.ts', 'rb').read()
# The create data needs tenant connect
old = b'data: {\n        tenantId: input.tenantId,\n        key: input.key,\n        tier:'
new = b'data: {\n        key: input.key,\n        tier:'
data = data.replace(old, new)

# Add tenant connect after "features: input.features ?? Prisma.JsonNull,"
features_line = b'features: input.features ?? Prisma.JsonNull,'
tenant_connect = b'features: input.features ?? Prisma.JsonNull,\n        tenant: { connect: { id: input.tenantId } },'
if features_line in data:
    data = data.replace(features_line, tenant_connect)
    print('Added tenant.connect to create')
else:
    print('features_line not found!')

open('licensing.service.ts', 'wb').write(data)
print('Fixed licensing.service')

print('\nAll fixes done')
