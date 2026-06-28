import os

os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api\src\sandbox')

d = open('sandbox-budget.service.ts', 'rb').read()
lines = d.split(b'\n')
for i, l in enumerate(lines):
    if i >= 574 and i <= 587:
        print(f'Line {i+1}: {l.decode("utf-8", errors="replace")!r}')
