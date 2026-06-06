# API Docs

This folder captures operator-facing API examples and client rendering notes for AIFUT surfaces that need careful integration boundaries.

## Orchestration

- [Natural-language business blueprint preview](natural-language-business-blueprint-preview.md): example request and response rendering guide for `POST /orchestration/business-systems/draft-preview`.

The blueprint and runtime-binding setup-preview endpoints are preview-only. Clients may let operators edit candidate runtime-binding values and refresh the setup review, but must render `reviewSummary`, activation blockers, and any `setupKey` consistency rejection before treating a candidate as reviewable. Preview requests do not activate workflows, persist candidate bindings, or dispatch connectors or other external actions.

## Integrations

`POST /integrations/ai-draft` returns `setupExecutionArtifact` for natural-language integration requests. Clients should use its `consumerContract` as a render/hand-off projection for operator UI and orchestration setup-preview flows. The projection is preview-only: it points orchestration consumers to the existing runtime-binding setup queue as the source of any `setupKey`, and it does not allow activation, persistence, connector dispatch, or external actions.
