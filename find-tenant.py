import os

os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api\src\licensing')
d = open('licensing.service.ts', 'rb').read()

# Find the create data block
idx = d.find(b'data: {')
while idx >= 0:
    chunk = d[idx:idx+400]
    if b'key:' in chunk:
        print('Found create data block:')
        print(chunk.decode('utf-8', errors='replace')[:400])
        break
    idx = d.find(b'data: {', idx + 1)

# Find nearest Prisma.JsonNull
idx2 = d.find(b'Prisma.JsonNull')
if idx2 >= 0:
    print('\nPrisma.JsonNull at byte', idx2)
    print(d[idx2-100:idx2+30].decode('utf-8', errors='replace'))
