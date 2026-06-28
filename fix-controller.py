import subprocess, os, sys

# Get raw git content
result = subprocess.run(
    ['git', 'show', '27331c5:apps/api/src/sandbox/sandbox.controller.ts'],
    capture_output=True
)
data = result.stdout
nl_count = data.count(b'\n')
print(f'Newlines from git: {nl_count}')

# Write raw bytes preserving line endings
out_path = r'apps/api/src/sandbox/sandbox.controller.ts'
with open(out_path, 'wb') as f:
    f.write(data)

# Verify
with open(out_path, 'rb') as f:
    data2 = f.read()
    print(f'Written: {len(data2)} bytes, newlines: {data2.count(b"\n")}')

# Also verify it has export class
if b'export class SandboxController' in data2:
    print('OK: export class SandboxController found')
else:
    print('ERROR: export class SandboxController NOT found')
    sys.exit(1)
