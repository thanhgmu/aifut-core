import os

os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api\src\licensing')

d = open('licensing.controller.ts', 'rb').read()

idx = d.find(b'async generateKey')
end = d.find(b'}', idx)
end = d.find(b'}', end + 1)
end3 = d.find(b'@Post', end + 1)
if end3 < 0:
    end3 = end + 1

# Get the exact function as bytes and print as repr
func_bytes = d[idx:end3-1]
# Save to temp file for inspection
with open('c:/temp/genkey.bin', 'wb') as f:
    f.write(func_bytes)
print('Wrote', len(func_bytes), 'bytes to c:/temp/genkey.bin')
