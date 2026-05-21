ALTER TABLE "OrchestrationRuntimeSnapshot"
ADD COLUMN "recordedAt" TIMESTAMP(3);

UPDATE "OrchestrationRuntimeSnapshot"
SET "recordedAt" = "createdAt"
WHERE "recordedAt" IS NULL;

ALTER TABLE "OrchestrationRuntimeSnapshot"
ALTER COLUMN "recordedAt" SET NOT NULL;

CREATE INDEX "OrchestrationRuntimeSnapshot_recordedAt_idx"
ON "OrchestrationRuntimeSnapshot"("recordedAt");
