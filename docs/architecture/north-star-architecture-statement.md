# AIFUT North Star Architecture Statement

## Purpose
This document freezes the long-term architectural target for AIFUT so future modules, integrations, and UX decisions do not drift into app-sprawl, connector-sprawl, or point-solution thinking.

It should be read as a higher-priority design compass than any individual feature request.

## North Star Architecture Statement
AIFUT will be built as an **AI-native business operating system and control plane** that lets a single operator or very small team describe a business goal in natural language, have the platform translate that intent into structured multi-application workflows, coordinate execution across internal and external systems, maintain governed data flow and tenant-aware control, and continuously report and optimize the business toward practical outcomes such as revenue, efficiency, reliability, and scalability.

In its mature form, AIFUT is not merely:
- a chatbot,
- an automation builder,
- a CRM,
- a workflow wrapper around n8n,
- or a UI placed on top of third-party apps.

AIFUT is the **system of orchestration, interpretation, policy, and reporting** that sits above many applications and makes them behave like one coherent operator stack.

## What AIFUT Must Ultimately Enable
A user should be able to:
1. describe a business model, operating loop, or growth objective in natural language;
2. have AIFUT derive the parent workflow and required child workflows;
3. have AIFUT assign each step to the most appropriate internal app, external app, or integration provider;
4. have AIFUT define how data should enter, move, sync, transform, and be governed across those systems;
5. run the whole system with guided setup, approvals where needed, and minimal technical knowledge;
6. receive daily, weekly, monthly, quarterly, and annual operating visibility;
7. continuously optimize the system toward better revenue, lower labor, lower tool sprawl, lower operating cost, and higher reliability.

## Architectural Identity
AIFUT should be treated as:
- **natural-language-driven**: user intent is a first-class input surface;
- **process-native**: parent workflows and child workflows are core objects, not afterthoughts;
- **integration-native**: many-app coordination is expected, not exceptional;
- **tenant-native**: all orchestration, data, policy, and reporting remain tenant/workspace aware;
- **data-governed**: data movement is explicit, mapped, and policy-bounded;
- **operator-efficient**: the system should let one person operate what would normally require a small team;
- **optimization-oriented**: the system exists to improve real business outcomes, not just execute automations.

## Core Design Principles

### 1. AIFUT is the control plane, not the borrowed core
External products such as n8n, Perfex, NexovaFlow modules, affiliate systems, AI generators, or user-owned apps may provide capabilities, but they must not become the canonical architectural center.

AIFUT must remain the owner of:
- orchestration truth,
- policy truth,
- tenant/workspace truth,
- workflow truth,
- reporting truth,
- and optimization truth.

### 2. Natural language must compile into governed structure
Natural-language input should never remain a loose conversational layer.

It must be translated into structured objects such as:
- business goals,
- process graphs,
- workflow definitions,
- app assignments,
- mapping profiles,
- sync policies,
- approval rules,
- and reporting plans.

Natural language is the entry point; governed structure is the runtime truth.

### 3. Parent workflow first, child workflow explicit
AIFUT must model the total business process first, then the sub-processes inside each connected application.

This means the system should always be able to express:
- the overall operating loop,
- each application-specific sub-workflow,
- the handoff points between them,
- and the reporting/optimization loop above them.

### 4. Canonical objects before connector convenience
Before adding or expanding integrations, AIFUT should define canonical business/control objects where needed.

Examples include:
- goals,
- offers,
- campaigns,
- content plans,
- assets,
- publish records,
- performance summaries,
- workflow runs,
- health states,
- and recommendations.

Connectors must adapt to the canonical model, not force the core to mirror every external app's shape.

### 5. Source-of-truth boundaries must be explicit
For every significant object or field, AIFUT should know:
- what system is canonical,
- what systems hold local operational copies,
- what sync direction applies,
- what conflict rule applies,
- and what audit trail exists.

Ambiguous data ownership is architectural debt.

### 6. Integration is adapter-driven and replaceable
Every external capability should be connected through stable adapter boundaries.

This applies to:
- workflow engines,
- CRMs,
- affiliate systems,
- content-generation systems,
- messaging tools,
- analytics tools,
- and custom tenant apps.

The platform must be able to swap, extend, or coexist with providers without rewriting kernel truth.

### 7. Non-technical operation is a hard requirement
If only engineers can wire or maintain the system, the architecture has failed part of its mission.

Important capabilities must eventually support:
- guided wizard flows,
- template-first setup,
- AI-assisted setup,
- human-readable diagnostics,
- simple review/approval steps,
- and plain-language reporting.

### 8. One-person leverage is a primary optimization target
Architecture decisions should favor enabling a single operator to run a disproportionately large business system.

This means optimizing for:
- reduced manual coordination,
- reduced context switching,
- reduced integration friction,
- reduced repetitive data entry,
- faster feedback loops,
- and better decision support.

### 9. Reporting is part of the operating system, not a side feature
AIFUT should not merely execute workflows. It must explain what happened, why it happened, and what to do next.

Daily/weekly/monthly/yearly reporting and optimization outputs are core architectural responsibilities.

### 10. Optimization must target business outcomes, not only automation throughput
The system should optimize across multiple axes at once, including:
- revenue,
- margin,
- time efficiency,
- tool efficiency,
- reliability,
- data quality,
- operator effort,
- and scalability.

A fast workflow that makes poor business decisions is not a success.

### 11. Human approval should exist where risk is real
AIFUT should automate aggressively, but it must preserve approval checkpoints for actions that are:
- public-facing,
- financially material,
- compliance-sensitive,
- destructive,
- or hard to reverse.

The target is not blind autonomy; it is governed operator leverage.

### 12. Observability and remediation must be first-class
Every important workflow or integration should eventually provide:
- health state,
- verification history,
- failure summaries,
- remediation suggestions,
- degraded-state visibility,
- and operator-facing diagnostics.

A system that automates but cannot explain failure will not scale safely.

### 13. Multi-topology and data sovereignty remain architectural constraints
AIFUT must preserve its ability to operate across:
- platform-managed resources,
- tenant-provided resources,
- shared topologies,
- split topologies,
- dedicated/user-hosted topologies,
- cloud and local-connected systems.

Convenience shortcuts must not destroy this flexibility.

### 14. Modules should compose into a business OS, not become isolated products
Every new module should answer:
- what role it plays in the larger business operating model,
- what parent workflows it supports,
- what canonical objects it creates or consumes,
- what other modules it coordinates with,
- and what reports or optimizations it enables.

If a module cannot connect back to the operating-system model, it is drifting.

## Architecture Guardrails
When evaluating a feature, integration, or shortcut, reject or redesign it if it would:
- make a third-party app the hidden core of the platform;
- leave data ownership or sync direction ambiguous;
- bypass tenant/workspace/policy boundaries;
- create app-specific logic that should live in canonical AIFUT contracts;
- add automation without reporting or diagnostics;
- add natural-language convenience without structured runtime representation;
- or increase operator burden faster than it increases leverage.

## Preferred Build Pattern
The preferred pattern is:
1. define intent model;
2. define process model;
3. define canonical object model;
4. define app capability contracts;
5. define mapping and sync rules;
6. define execution and approval behavior;
7. define monitoring and reporting outputs;
8. then implement adapters, surfaces, and automation.

## Final Test for Future Decisions
A future module or integration is aligned only if it moves AIFUT closer to this outcome:

> One person can describe a business objective in natural language, have AIFUT assemble and run a governed multi-application operating system around it, and continuously understand and optimize the resulting business with minimal manual coordination.

## Related decision set
For the more operationalized rule set that constrains implementation detail, see `docs/architecture/decisions/0006-architecture-decision-set-v1.md`.
