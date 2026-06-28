import os

os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api\src\licensing')

d = open('licensing.controller.ts', 'rb').read()

# Fix 1: Duplicate Headers - find the import line and clean it up
idx = d.find(b"import { Headers,\n")
if idx >= 0:
    end = d.find(b'\n', idx)
    line = d[idx:end]
    # Remove duplicate Headers
    parts = line.split(b' Headers,')
    if len(parts) > 2:
        # Multiple occurrences - keep only the first, remove rest
        fixed = parts[0] + b' Headers,'
        for p in parts[1:]:
            if p.strip():
                fixed += p
        d = d[:idx] + fixed + d[end:]
        print('Fixed duplicate Headers')

# Fix 2: Required param after optional - make tenantId non-optional by giving it a default
# Or just reorder the params. The issue: @Headers is optional, @Body is required.
# Change: make @Headers the last param OR give body a default
d = d.replace(
    b'    @Headers("x-tenant-id") tenantId?: string,\n    @Body()\n    body:',
    b'    @Body()\n    body: GenerateLicenseBody,\n    @Headers("x-tenant-id") tenantId?: string,'
)
# But wait, we also need a type for body. Let me use inline type
# Actually let me just add a default empty object for body
d = d.replace(
    b'    @Body()\n    body: GenerateLicenseBody,\n    @Headers("x-tenant-id") tenantId?: string,\n  ) {',
    b'    @Body() body: { tier: string; maxUsers?: number; maxWorkflows?: number; features?: string[]; issuedTo?: string; issuedEmail?: string; validityDays?: number; },\n    @Headers("x-tenant-id") tenantId?: string,\n  ) {'
)
print('Fixed param ordering')

# Fix 3: Missing tier in generateKey call - the call was:
# generateKey({ tenantId: tenantId!, maxUsers: ..., ... }) 
# but missing: tier: body.tier,
# Actually looking at the error, the call should have tier but my previous fix replaced `tier,` with `tenantId: tenantId!,\n      tier,`.
# Let me check the actual call
idx = d.find(b'return this.licensing.generateKey({')
end = d.find(b'});', idx)
block = d[idx:end+3]
lines = block.split(b'\n')
for l in lines:
    if b'tier' in l:
        print('Tier line:', l)
# The issue is the call might still be: 
# generateKey({ tenantId: tenantId!, maxUsers: ..., ... })
# without tier. Let me add tier back.
if b'      tier,' not in block:
    d = d.replace(
        b'return this.licensing.generateKey({\n      tenantId: tenantId!,\n      maxUsers:',
        b'return this.licensing.generateKey({\n      tenantId: tenantId!,\n      tier: body.tier,\n      maxUsers:'
    )
    print('Added tier to generateKey call')

open('licensing.controller.ts', 'wb').write(d)
print('Fixed licensing.controller.ts')
