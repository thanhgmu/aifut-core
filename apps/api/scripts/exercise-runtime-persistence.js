require('dotenv/config');

const http = require('http');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const planId = 'plan:acme:ops:live-runtime';

function postJson(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          ...headers,
        },
      },
      (response) => {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode,
            body: data ? JSON.parse(data) : null,
          });
        });
      },
    );

    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg(process.env.DATABASE_URL),
  });

  try {
    const response = await postJson(
      `http://127.0.0.1:4000/orchestration/plans/${encodeURIComponent(planId)}/execution-runtime/activate`,
      {
        objective: 'Activate runtime bridge',
        executionModes: ['human-approved', 'event-driven'],
        runtimeBindings: [
          {
            runtimeKey: 'openclaw',
            systemKey: 'ops-agent',
            deliveryMode: 'human-review',
            approvalRequired: true,
          },
          {
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            deliveryMode: 'webhook',
            approvalRequired: false,
          },
        ],
        childWorkflowContracts: [
          {
            workflowKey: 'review-ops-brief',
            runtimeKey: 'openclaw',
            systemKey: 'ops-agent',
            triggerMode: 'human-review',
            approvalRequired: true,
            approvalCheckpointKey: 'approve-ops',
          },
          {
            workflowKey: 'dispatch-router',
            runtimeKey: 'n8n',
            systemKey: 'lead-router',
            triggerMode: 'webhook',
            approvalRequired: false,
          },
        ],
        approvalContracts: [
          {
            checkpointKey: 'approve-ops',
            approverRole: 'operator',
            channel: 'web-ui',
            required: true,
          },
        ],
        submissionNotes: 'activate runtime bridge',
      },
      {
        'x-tenant-slug': 'acme',
        'x-user-email': 'ops@acme.test',
        'x-workspace-slug': 'ops',
        host: 'acme.test',
      },
    );

    const snapshots = await prisma.orchestrationRuntimeSnapshot.findMany({
      where: { planId },
      orderBy: { createdAt: 'asc' },
      select: {
        snapshotKey: true,
        planId: true,
        snapshotType: true,
        runtimeStatus: true,
        tenantSlug: true,
        workspaceSlug: true,
        recordedBy: true,
        createdAt: true,
      },
    });

    const events = await prisma.orchestrationRuntimeEvent.findMany({
      where: { planId },
      orderBy: { recordedAt: 'asc' },
      select: {
        eventKey: true,
        planId: true,
        eventType: true,
        runtimeStatus: true,
        tenantSlug: true,
        workspaceSlug: true,
        actorKey: true,
        recordedAt: true,
      },
    });

    console.log(
      JSON.stringify(
        {
          response,
          persisted: {
            snapshotCount: snapshots.length,
            eventCount: events.length,
            snapshots,
            events,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
