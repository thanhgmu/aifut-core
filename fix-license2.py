import os

os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api\src\licensing')

d = open('licensing.service.ts', 'rb').read()

# Remove the tenant connect line we added (it was wrong)
d = d.replace(b'tenant: { connect: { id: input.tenantId } },\n        ', b'')

# Remove tenantId from GenerateLicenseInput (was incorrectly added)
d = d.replace(b'interface GenerateLicenseInput {\n  tenantId: string;\n', b'interface GenerateLicenseInput {\n')

# Now find the licenseKey.create call
idx = d.find(b'licenseKey.create')
if idx >= 0:
    print('Create at byte', idx)
    # Check what's before - is it this.prisma? or (this.prisma as any)?
    before = d[idx-30:idx]
    print('Before:', before)
    # If it's this.prisma.licenseKey.create, we need to cast
    if b'this.prisma' in before:
        # Add as any cast
        d = d.replace(b'this.prisma.licenseKey.create', b'(this.prisma.licenseKey as any).create')
        print('Added as any cast')

open('licensing.service.ts', 'wb').write(d)

# Also fix licensing.controller - the tier variable
d2 = open('licensing.controller.ts', 'rb').read()
# Check what's there now with tenantId
idx = d2.find(b'tenantId: tenantId!')
if idx >= 0:
    print('Found tenantId ref in controller, checking context:', d2[idx-20:idx+30])
    # The controller might not have tenantId defined. Let's check
    # Find the start of the function
    func_start = d2.rfind(b'async generateKey', 0, idx)
    func_start = d2.rfind(b'@', 0, func_start)
    sig = d2[func_start:idx+30]
    print('Function context:', sig)

open('licensing.controller.ts', 'wb').write(d2)
print('Done')
