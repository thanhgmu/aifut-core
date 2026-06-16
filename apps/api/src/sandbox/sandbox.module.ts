import { Module } from '@nestjs/common';
import { SandboxController } from './sandbox.controller';
import { SandboxService } from './sandbox.service';

/**
 * Developer Sandbox Module
 *
 * Provides an isolated environment for connector testing and development.
 * All sandbox state is in-memory and ephemeral — no database dependency.
 */
@Module({
  controllers: [SandboxController],
  providers: [SandboxService],
  exports: [SandboxService],
})
export class SandboxModule {}
