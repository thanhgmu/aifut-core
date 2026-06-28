import os

os.chdir(r'C:\Users\Admin\.openclaw\workspace\aifut-core\apps\api')

with open('prisma/schema.prisma', 'rb') as f:
    d = f.read()

# Show what we have
idx = d.find(b'model SandboxBudget')
idx2 = d.find(b'model', idx+5)
print('SandboxBudget:', repr(d[idx:idx2]))

# Find SandboxBudgetAlert model
idx3 = d.find(b'model SandboxBudgetAlert')
idx4 = d.find(b'model', idx3+5)
if idx4 < 0:
    idx4 = len(d)
print('SandboxBudgetAlert:', repr(d[idx3:idx4]))
