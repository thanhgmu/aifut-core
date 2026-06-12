import process from "node:process";

const webBase = (process.argv[2] || "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const apiBase = (
  process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:3002"
).replace(/\/$/, "");

async function readResponse(base, path) {
  const response = await fetch(`${base}${path}`, {
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }

  return response;
}

async function readJson(path) {
  return (await readResponse(apiBase, path)).json();
}

async function readHtml(path) {
  return (await readResponse(webBase, path)).text();
}

function requireText(html, path, text) {
  if (!html.includes(text)) {
    throw new Error(`${path} did not render ${JSON.stringify(text)}`);
  }
}

function readMetric(html, title) {
  const titleMarker = `>${title}</div>`;
  const markerIndex = html.indexOf(titleMarker);

  if (markerIndex === -1) {
    throw new Error(`Metric ${JSON.stringify(title)} was not rendered`);
  }

  const valueHtml = html.slice(markerIndex + titleMarker.length);
  const valueMatch = valueHtml.match(/^<div[^>]*>([^<]+)<\/div>/);

  if (!valueMatch) {
    throw new Error(`Metric ${JSON.stringify(title)} has no rendered value`);
  }

  return valueMatch[1];
}

async function main() {
  const [interfacesResponse, contractsResponse, templatesResponse] =
    await Promise.all([
      readJson("/connectors/adapter-interfaces"),
      readJson("/connectors/adapter-contracts"),
      readJson("/connectors/templates"),
    ]);
  const interfaces = interfacesResponse?.adapterInterfaces?.adapterInterfaces;
  const contractNext = contractsResponse?.adapterContracts?.next;
  const templates = templatesResponse?.templates?.templates;

  if (!Array.isArray(interfaces) || interfaces.length === 0) {
    throw new Error("Connector API returned no adapter interfaces");
  }

  if (!Array.isArray(contractNext) || contractNext.length === 0) {
    throw new Error("Connector API returned no adapter contract roadmap items");
  }

  if (!Array.isArray(templates) || templates.length === 0) {
    throw new Error("Connector API returned no templates");
  }

  const pageExpectations = [
    ["/", "AIFUT"],
    ["/dashboard", "Backup Center"],
    ["/foundation", "AIFUT Foundation"],
    ["/login", "AIFUT Login"],
    ["/register", "AIFUT Register"],
    ["/session", "Current Session"],
  ];
  const pageChecks = await Promise.all(
    pageExpectations.map(async ([path, expectedText]) => {
      const html = await readHtml(path);
      requireText(html, path, expectedText);
      return { path, expectedText };
    }),
  );
  const demoHtml = await readHtml("/foundation/demo-live");
  requireText(demoHtml, "/foundation/demo-live", interfaces[0].key);
  requireText(demoHtml, "/foundation/demo-live", contractNext[0]);

  const interfaceMetric = readMetric(demoHtml, "Adapter interfaces");
  const templateMetric = readMetric(demoHtml, "Templates");

  if (interfaceMetric !== String(interfaces.length)) {
    throw new Error(
      `Adapter interface metric ${interfaceMetric} did not match API count ${interfaces.length}`,
    );
  }

  if (templateMetric !== String(templates.length)) {
    throw new Error(
      `Template metric ${templateMetric} did not match API count ${templates.length}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        webBase,
        apiBase,
        pageChecks,
        liveDemo: {
          firstInterfaceKey: interfaces[0].key,
          firstContractRoadmapItem: contractNext[0],
          interfaceCount: interfaces.length,
          templateCount: templates.length,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        webBase,
        apiBase,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
