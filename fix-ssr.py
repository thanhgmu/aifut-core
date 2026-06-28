import glob

for f in glob.glob(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\web\app\**\earnings\page.tsx', recursive=True):
    print('Fixing:', f)
    with open(f, 'rb') as fh:
        d = fh.read()
    # Add dynamic = force-dynamic after use client
    marker = b'"use client";'
    idx = d.find(marker)
    if idx >= 0:
        rest = d[idx + len(marker):]
        if b'dynamic' not in rest[:100]:
            d = d[:idx + len(marker)] + b'\nexport const dynamic = "force-dynamic";' + d[idx + len(marker):]
    with open(f, 'wb') as fh:
        fh.write(d)
    print('Fixed')
