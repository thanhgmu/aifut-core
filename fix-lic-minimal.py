import os

os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api\src\licensing')

d = open('licensing.controller.ts', 'rb').read()

# Fix 1: Add Headers to import
import_line = d.find(b"'@nestjs/common';")
if import_line:
    # Find the opening {
    brace = d.rfind(b'{', 0, import_line)
    after_brace = d.find(b'}', brace)
    current_imports = d[brace+1:after_brace]
    if b'Headers' not in current_imports:
        d = d[:brace+1] + b' Headers,' + d[brace+1:]

# Fix 2: Add tenantId param, fix LicenseTier reference
old_sig = b'async generateKey(\n    @Body()\n    body: {\n      tier: string;\n      maxUsers?: number;\n      maxWorkflows?: number;\n      features?: string[];\n      issuedTo?: string;\n      issuedEmail?: string;\n      validityDays?: number;\n    },\n  ) {\n    this.requireValue(body.tier, \x27tier\x27);\n    const tier = body.tier.toUpperCase() as LicenseTier;\n    if (!Object.values(LicenseTier).includes(tier)) {\n      throw new BadRequestException(\n        `tier ph?i l?: ${Object.values(LicenseTier).join(\x27, \x27)}`,\n      );\n    }\n\n    return this.licensing.generateKey({'

new_sig = b'async generateKey(\n    @Body()\n    body: {\n      tier: string;\n      maxUsers?: number;\n      maxWorkflows?: number;\n      features?: string[];\n      issuedTo?: string;\n      issuedEmail?: string;\n      validityDays?: number;\n    },\n    @Headers(\x22x-tenant-id\x22) tenantId?: string,\n  ) {\n    this.requireValue(body.tier, \x27tier\x27);\n    const tier = body.tier.toUpperCase() as string;\n    if (![\x27FREE\x27,\x27PRO\x27,\x27BUSINESS\x27,\x27ENTERPRISE\x27].includes(tier)) {\n      throw new BadRequestException(\n        \x27tier must be FREE, PRO, BUSINESS or ENTERPRISE\x27,\n      );\n    }\n\n    return this.licensing.generateKey({\n      tenantId: tenantId!,'

if old_sig in d:
    d = d.replace(old_sig, new_sig)
    print('Fixed generateKey with Headers, string types, and tenantId')
else:
    print('Pattern not found! Showing actual bytes around the match...')
    idx = d.find(b'async generateKey')
    end = d.find(b'}', idx)
    end2 = d.find(b'}', end + 1)
    end3 = d.find(b'\n\n', end2)
    actual = d[idx:end3+2]
    # Find first diff
    min_len = min(len(old_sig), len(actual))
    for i in range(min_len):
        if old_sig[i] != actual[i]:
            print(f'Diff at byte {i}:')
            print(f'  Expected: {old_sig[max(0,i-5):i+15]}')
            print(f'  Actual:   {actual[max(0,i-5):i+15]}')
            break

open('licensing.controller.ts', 'wb').write(d)
print('Done')
