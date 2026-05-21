require('dotenv/config');

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set before running runtime-history checks.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL),
});

const requiredSchema = {
  OrchestrationRuntimeSnapshot: [
    'id',
    'snapshotKey',
    'planId',
    'snapshotType',
    'runtimeStatus',
    'tenantSlug',
    'workspaceSlug',
    'recordedBy',
    'contractSummary',
    'summary',
    'mutationRecords',
    'eventRecords',
    'createdAt',
  ],
  OrchestrationRuntimeEvent: [
    'id',
    'eventKey',
    'planId',
    'eventType',
    'runtimeStatus',
    'tenantSlug',
    'workspaceSlug',
    'actorKey',
    'relatedKeys',
    'metadata',
    'recordedAt',
    'createdAt',
  ],
};

async function loadTables() {
  return prisma.$queryRawUnsafe(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('OrchestrationRuntimeSnapshot', 'OrchestrationRuntimeEvent')
    ORDER BY table_name;
  `);
}

async function loadColumns() {
  return prisma.$queryRawUnsafe(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('OrchestrationRuntimeSnapshot', 'OrchestrationRuntimeEvent')
    ORDER BY table_name, ordinal_position;
  `);
}

function groupColumns(rows) {
  return rows.reduce((acc, row) => {
    const tableName = row.table_name;
    const columnName = row.column_name;
    acc[tableName] ??= [];
    acc[tableName].push(columnName);
    return acc;
  }, {});
}

function buildValidationResult(tables, columnsByTable) {
  const discoveredTables = tables.map((row) => row.table_name);
  const missingTables = Object.keys(requiredSchema).filter(
    (table) => !discoveredTables.includes(table),
  );

  const columnReport = Object.entries(requiredSchema).map(
    ([tableName, requiredColumns]) => {
      const discoveredColumns = columnsByTable[tableName] ?? [];
      return {
        tableName,
        discoveredColumns,
        missingColumns: requiredColumns.filter(
          (column) => !discoveredColumns.includes(column),
        ),
      };
    },
  );

  return {
    ok:
      missingTables.length === 0 &&
      columnReport.every((entry) => entry.missingColumns.length === 0),
    discoveredTables,
    missingTables,
    columnReport,
  };
}

async function main() {
  const tables = await loadTables();
  const columns = await loadColumns();
  const result = buildValidationResult(tables, groupColumns(columns));

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
