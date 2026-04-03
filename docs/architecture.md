# AIFUT Core Architecture

## Direction
Model C SaaS/operator stack.

## Phase 1 Goal
Build a deployable platform foundation with:
- web operator shell
- API foundation
- tenant-ready architecture
- storage abstraction direction
- event/logging foundation
- deployable monorepo structure

## Core Principles
- multi-tenant first
- modular packages
- app/runtime isolation
- storage abstraction
- API-first
- AI-integration ready
- deploy-first, then expand

## Initial Monorepo Shape
- apps/web -> operator/admin shell
- apps/docs -> internal docs
- apps/api -> backend API (next step)
- packages/ui -> shared UI
- packages/config -> shared config/contracts later
- infra/docker -> docker and deployment assets

## Next Build Targets
1. add apps/api
2. add env templates
3. define tenant model
4. define modules/contracts
5. prepare VPS deployment
