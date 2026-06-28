import os, sys
os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api\src\licensing')
d = open('licensing.controller.ts', 'rb').read()
idx = d.find(b'async generateKey')
end = d.find(b'}', idx)
end = d.find(b'}', end + 1)
# Print as raw bytes, filtering newlines
block = d[idx:end+1]
for line in block.split(b'\n'):
    # Only print lines without Vietnamese chars
    try:
        decoded = line.decode('ascii')
        print(decoded)
    except:
        decoded = line.decode('utf-8', errors='replace')
        # Replace non-ASCII chars
        safe = ''.join(c if ord(c) < 128 else '?' for c in decoded)
        print(safe)
