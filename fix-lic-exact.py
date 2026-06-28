import os

os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api\src\licensing')

d = open('licensing.controller.ts', 'rb').read()

# Exact match from the file
old_func = b'async generateKey(\n    @Body()\n    body: {\n      tier: string;\n      maxUsers?: number;\n      maxWorkflows?: number;\n      features?: string[];\n      issuedTo?: string;\n      issuedEmail?: string;\n      validityDays?: number;\n    },\n  ) {\n    this.requireValue(body.tier, \'tier\');\n    const tier = body.tier.toUpperCase() as LicenseTier;\n    if (!Object.values(LicenseTier).includes(tier)) {\n      throw new BadRequestException(\n        `tier ph\xe1\xba\xa3i l\xc3\xa0: ${Object.values(LicenseTier).join(\', \')}`,\n      );\n    }\n\n    return this.licensing.generateKey({\n      tier,\n      maxUsers: body.maxUsers,\n      maxWorkflows: body.maxWorkflows,\n      features: body.features,\n      issuedTo: body.issuedTo,\n      issuedEmail: body.issuedEmail,\n      validityDays: body.validityDays,\n    });\n  }'

new_func = b'async generateKey(\n    @Body()\n    body: {\n      tier: string;\n      maxUsers?: number;\n      maxWorkflows?: number;\n      features?: string[];\n      issuedTo?: string;\n      issuedEmail?: string;\n      validityDays?: number;\n    },\n    @Headers("x-tenant-id") tenantId?: string,\n  ) {\n    this.requireValue(body.tier, \'tier\');\n    const tier = body.tier.toUpperCase() as string;\n    if (![\'FREE\',\'PRO\',\'BUSINESS\',\'ENTERPRISE\'].includes(tier)) {\n      throw new BadRequestException(\n        \'tier must be FREE, PRO, BUSINESS or ENTERPRISE\',\n      );\n    }\n\n    return this.licensing.generateKey({\n      tier: body.tier,\n      tenantId: tenantId!,\n      maxUsers: body.maxUsers,\n      maxWorkflows: body.maxWorkflows,\n      features: body.features,\n      issuedTo: body.issuedTo,\n      issuedEmail: body.issuedEmail,\n      validityDays: body.validityDays,\n    });\n  }'

if old_func in d:
    d = d.replace(old_func, new_func)
    print('Replaced generateKey function')
else:
    print('ERROR: old_func not found in file')
    # Find position of key markers
    idx = d.find(b'async generateKey')
    print(f'Found at byte {idx}')
    # Check if it's the same length
    end = d.find(b'}', idx)
    end = d.find(b'}', end + 1)
    actual = d[idx:end+1]
    print(f'Old len={len(old_func)}, Actual len={len(actual)}')
    # Find first difference
    for i in range(min(len(old_func), len(actual))):
        if old_func[i] != actual[i]:
            print(f'Diff at byte {i}:')
            print(f'  Old: {old_func[max(0,i-10):i+10]}')
            print(f'  Act: {actual[max(0,i-10):i+10]}')
            break

# Also add Headers to import
import_line_start = d.find(b'import {')
import_line_end = d.find(b'}', import_line_start)
imports = d[import_line_start:import_line_end+1]
if b'Headers' not in imports:
    d = d[:import_line_start] + b'import { Headers,' + d[import_line_start+8:]
    print('Added Headers to import')

open('licensing.controller.ts', 'wb').write(d)
print('Written')
