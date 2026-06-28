import re

import os
os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api')
with open('prisma/schema.prisma', 'rb') as f:
    content = f.read()

start = content.find(b'model LicenseKey {')
# Find the closing brace by counting
i = start
brace_count = 0
in_brace = False
for i in range(start, len(content)):
    if content[i:i+1] == b'{':
        brace_count += 1
        in_brace = True
    elif content[i:i+1] == b'}':
        brace_count -= 1
        if in_brace and brace_count == 0:
            end = i + 1
            break

new_model = b'\nmodel LicenseKey {\n'
new_model += b'  id            String   @id @default(cuid())\n'
new_model += b'  tenantId      String\n'
new_model += b'  key           String   @unique\n'
new_model += b'  tier          String   @default("PRO")\n'
new_model += b'  status        String   @default("ACTIVE")\n'
new_model += b'  maxUsers      Int      @default(5)\n'
new_model += b'  maxWorkflows  Int      @default(20)\n'
new_model += b'  features      Json\n'
new_model += b'  issuedTo      String?\n'
new_model += b'  issuedEmail   String?\n'
new_model += b'  issuedAt      DateTime @default(now())\n'
new_model += b'  activatedAt   DateTime?\n'
new_model += b'  expiresAt     DateTime?\n'
new_model += b'  metadata      Json?\n'
new_model += b'  createdAt     DateTime @default(now())\n'
new_model += b'  updatedAt     DateTime @updatedAt\n'
new_model += b'\n'
new_model += b'  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)\n'
new_model += b'  @@index([tenantId, status])\n'
new_model += b'  @@index([key])\n'
new_model += b'}\n\n'

content = content[:start] + new_model + content[end:]
with open('prisma/schema.prisma', 'wb') as f:
    f.write(content)

print(f'Fixed LicenseKey model at bytes {start}-{end}')
print(f'File is now {len(content)} bytes')
