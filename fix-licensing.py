import os

os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api\src\licensing')

# licensing.controller.ts
data = open('licensing.controller.ts', 'rb').read()
data = data.replace(b'import { LicenseTier } from', b'// LicenseTier defined locally')
data = data.replace(b'as LicenseTier', b'as string')
data = data.replace(b'LicenseTier.', b'')
data = data.replace(
    b"Object.values(['FREE','PRO','BUSINESS','ENTERPRISE'])",
    b"['FREE','PRO','BUSINESS','ENTERPRISE']"
)
open('licensing.controller.ts', 'wb').write(data)
print('Fixed licensing.controller.ts')

# licensing.service.ts
data = open('licensing.service.ts', 'rb').read()
# Fix import
data = data.replace(b'Prisma }', b'Prisma }')
data = data.replace(b'import { Prisma } from', b'// types removed\nimport { Prisma } from')
data = data.replace(b'LicenseStatus, LicenseTier, Prisma', b'Prisma')

# Replace type literal mentions
data = data.replace(b'tier: LicenseTier', b'tier: string')
data = data.replace(b'status: LicenseStatus', b'status: string')
data = data.replace(b'Record<LicenseTier', b"Record<string")
data = data.replace(b'LicenseTier.PRO', b'"PRO"')
data = data.replace(b'LicenseTier.BUSINESS', b'"BUSINESS"')
data = data.replace(b'LicenseTier.ENTERPRISE', b'"ENTERPRISE"')
data = data.replace(b'LicenseTier.FREE', b'"FREE"')
data = data.replace(b'LicenseStatus.ACTIVE', b'"ACTIVE"')
data = data.replace(b'LicenseStatus.EXPIRED', b'"EXPIRED"')
data = data.replace(b'LicenseStatus.REVOKED', b'"REVOKED"')
data = data.replace(b'LicenseStatus.PENDING', b'"PENDING"')

# Fix create data - add tenant connect
# Find the create data block and add tenantId
old_create = b'data: {\n        key: input.key,\n        tier:'
new_create = b'data: {\n        tenantId: input.tenantId,\n        key: input.key,\n        tier:'
data = data.replace(old_create, new_create)

# The update needs to use proper types
# Fix validateLicense - expiresAt/features checking on license object
# These are prisma types so we need to cast
data = data.replace(b'license.expiresAt', b'(license as any).expiresAt')
data = data.replace(b'license.features', b'(license as any).features')

open('licensing.service.ts', 'wb').write(data)
print('Fixed licensing.service.ts')
