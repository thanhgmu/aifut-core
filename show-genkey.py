import os, subprocess
os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api\src\licensing')
d = open('licensing.controller.ts', 'rb').read()

# Show generateKey
idx = d.find(b'async generateKey')
end = d.find(b'}', idx)
end = d.find(b'}', end + 1)
print(d[idx:end+1].decode('utf-8', errors='replace'))
