# API Docs

This folder captures operator-facing API examples and client rendering notes for AIFUT surfaces that need careful integration boundaries.

## Orchestration

- [Natural-language business blueprint preview](natural-language-business-blueprint-preview.md): example request and response rendering guide for `POST /orchestration/business-systems/draft-preview`.

The blueprint preview endpoint is preview-only. Clients should render `reviewSummary` and activation blockers before any lifecycle graph or setup actions, and they must not treat the draft as runnable until runtime bindings, approval channels, source-of-truth assignments, and synchronization policies are configured.
