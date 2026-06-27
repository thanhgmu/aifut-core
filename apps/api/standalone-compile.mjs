/**
 * Standalone AWL Compile Server
 * Phục vụ endpoint POST /workflows/awl/compile mà không cần PostgreSQL.
 * Chạy song song với Next.js để demo pipeline Frontend -> Backend.
 *
 * Usage: node standalone-compile.mjs
 * Port: 3002 (mặc định) — khớp với NEXT_PUBLIC_API_BASE trong .env
 */

import http from 'node:http';

const PORT = parseInt(process.env.PORT || '3002', 10);

/* ─── AWL Brace Syntax Parser ─────────────────────────── */
function compileAwl(code) {
  const trimmed = code.trim();
  if (!trimmed) {
    return { success: false, error: 'AWL source is empty', line: 1 };
  }

  // Balance check
  const braceOpen = (code.match(/{/g) || []).length;
  const braceClose = (code.match(/}/g) || []).length;
  if (braceOpen !== braceClose) {
    let depth = 0;
    for (let i = 0; i < code.length; i++) {
      if (code[i] === '{') depth++;
      if (code[i] === '}') depth--;
      if (depth < 0) {
        return { success: false, error: `Syntax Error: Unbalanced '}'`, line: code.substring(0, i).split('\n').length };
      }
    }
    return { success: false, error: `Syntax Error: Missing '}'`, line: code.split('\n').length };
  }

  // Workflow name
  const wfMatch = trimmed.match(/^workflow\s+"([^"]+)"\s*\{?\s*$/m);
  if (!wfMatch) {
    return { success: false, error: 'Syntax Error: Missing workflow "Name"', line: 1 };
  }
  const workflowName = wfMatch[1];

  const lines = code.split('\n');
  const isBrace = code.includes(';');
  const triggerIconMap = { schedule: 'clock', webhook: 'webhook', event: 'zap', manual: 'play', on_payment_success: 'zap', on_order_created: 'zap', on_lead: 'zap', on_booking: 'zap' };
  const triggerLabelMap = { schedule: 'Schedule / Cron', webhook: 'Webhook', event: 'Event', manual: 'Manual Trigger', on_payment_success: 'Payment Success', on_order_created: 'Order Created', on_lead: 'New Lead', on_booking: 'New Booking' };
  const stepIconMap = { action: 'terminal', execute: 'terminal', send: 'send', condition: 'git-branch', wait: 'clock', transform: 'shuffle', loop: 'loop', subflow: 'git-branch', log: 'file-text', output: 'share' };
  const stepLabelMap = { action: 'Action', execute: 'Execute Action', send: 'Send Message', condition: 'Condition', wait: 'Wait / Delay', transform: 'Transform', loop: 'Loop', subflow: 'Sub-Workflow', log: 'Log', output: 'Output' };

  let triggerKind = 'manual';
  let triggerValue = '';
  const steps = [];

  if (isBrace) {
    let stepIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const stmt = raw.replace(/\/\/.*$/, '').trim();
      if (!stmt || stmt === '{' || stmt === '}') continue;
      const clean = stmt.replace(/;\s*$/, '').trim();

      const trigMatch = clean.match(/^trigger\s*:\s*(.+)$/);
      if (trigMatch) {
        const val = trigMatch[1].trim();
        triggerKind = val.split(/[\s"'`]/)[0] || 'manual';
        triggerValue = val;
        continue;
      }

      const typeMatch = clean.match(/^(execute|send|condition|wait|transform|loop|subflow|log|output)\s*:\s*(.+)$/);
      if (typeMatch) {
        stepIdx++;
        const stepType = typeMatch[1];
        const stepVal = typeMatch[2].trim();
        const mappedType = (stepType === 'execute' || stepType === 'log') ? 'action' : stepType;
        steps.push({
          id: `${mappedType}-${stepIdx}`, name: stepVal.length > 40 ? stepVal.slice(0, 40) + '...' : stepVal,
          type: mappedType, icon: stepIconMap[stepType] ?? stepIconMap[mappedType] ?? 'terminal',
          label: stepLabelMap[stepType] ?? stepLabelMap[mappedType] ?? 'Step',
          value: `${stepLabelMap[stepType] ?? stepLabelMap[mappedType] ?? 'Step'}: ${stepVal}`,
        });
        continue;
      }

      if (!stmt.startsWith('/') && !stmt.startsWith('workflow') && stmt !== '}' && stmt !== '{') {
        return { success: false, error: `Syntax Error: Unrecognized statement "${stmt}"`, line: i + 1 };
      }
    }
  } else {
    // YAML style
    const yamlTrigger = trimmed.match(/^\s*trigger\s*:\s*(\w+)\s*$/m);
    if (yamlTrigger) { triggerKind = yamlTrigger[1]; triggerValue = triggerKind; }

    const stepBlocks = trimmed.split(/\n(?=\s*-\s+id:)/g).slice(1);
    for (const block of stepBlocks) {
      const idMatch = block.match(/^\s*-\s+id:\s+(\S+)/);
      if (!idMatch) continue;
      const id = idMatch[1];
      const nameMatch = block.match(/^\s*name:\s+(.+)$/m);
      const name = nameMatch ? nameMatch[1].trim() : id;
      const typeMatch = block.match(/^\s*type:\s+(\w+)/m);
      const type = typeMatch ? typeMatch[1].trim() : 'action';
      const dependsMatch = block.match(/^\s*depends_on:\s*\[(.*?)\]/m);
      const depends_on = dependsMatch ? dependsMatch[1].split(',').map(s => s.trim().replace(/['"]/g, '')) : undefined;
      steps.push({
        id, name, type, icon: stepIconMap[type] ?? 'terminal',
        label: stepLabelMap[type] ?? 'Step',
        value: `${name} (${stepLabelMap[type] ?? type})`, depends_on,
      });
    }
  }

  if (steps.length === 0) {
    return {
      success: false,
      error: 'Syntax Error: No steps defined' + (isBrace ? '. Use execute:/send:/condition: inside the workflow block.' : '. Each step must start with "- id:"'),
      line: 3,
    };
  }

  return {
    success: true,
    ast: {
      workflow: { name: workflowName },
      trigger: {
        kind: triggerKind,
        icon: triggerIconMap[triggerKind] ?? 'play',
        label: triggerLabelMap[triggerKind] ?? 'Trigger',
        value: triggerValue || `${triggerKind.charAt(0).toUpperCase() + triggerKind.slice(1)} Trigger`,
      },
      steps,
      raw: code,
    },
  };
}

/* ─── HTTP Server ──────────────────────────────────────── */
const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-tenant-slug');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/workflows/awl/compile') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { code } = JSON.parse(body);
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Missing "code" field', line: 1 }));
          return;
        }
        const result = compileAwl(code);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: `Invalid JSON: ${e.message}`, line: 1 }));
      }
    });
    return;
  }

  // Health check for proxy diagnostics
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'awl-compile-standalone', version: '0.1' }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`[standalone-compile] AWL Compile API running on http://localhost:${PORT}`);
  console.log(`[standalone-compile] POST /workflows/awl/compile - Compile AWL source to AST`);
  console.log(`[standalone-compile] GET  / - Health check`);
});
