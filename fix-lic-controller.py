import os

os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api\src\licensing')

d = open('licensing.controller.ts', 'rb').read()

# Fix 1: Ensure Headers is imported
import_section = d.find(b'from')
if import_section >= 0:
    first_import = d.find(b'import', 0, import_section + 10)
    if first_import >= 0:
        import_line_end = d.find(b'\n', first_import)
        line = d[first_import:import_line_end]
        if b'Headers' not in line:
            # Add Headers to the import line
            # Find where to insert: after the opening brace
            brace = line.find(b'{')
            if brace >= 0:
                new_line = line[:brace+1] + b' Headers,' + line[brace+1:]
                d = d[:first_import] + new_line + d[import_line_end:]
                print('Added Headers to import')

# Fix 2: Add tenantId parameter to generateKey
old_sig = b'async generateKey(\n    @Body()\n    body:'
new_sig = b'async generateKey(\n    @Headers("x-tenant-id") tenantId?: string,\n    @Body()\n    body:'
d = d.replace(old_sig, new_sig)
print('Added tenantId param to generateKey')

# Fix 3: Also remove the weird LicenseTier reference
# Replace Object.values(String).includes(tier) with proper check
d = d.replace(b'Object.values(String).includes(tier)', b"['FREE','PRO','BUSINESS','ENTERPRISE'].includes(tier)")
d = d.replace(b"`tier ph\\u1ea3i l\\u00e0: ${Object.values(String).join(', ')}`", b"'tier must be FREE, PRO, BUSINESS, ENTERPRISE'")

open('licensing.controller.ts', 'wb').write(d)
print('Fixed licensing.controller.ts')
