import { Module } from '@nestjs/common';
import { EntitlementsController } from './entitlements.controller';

@Module({
  controllers: [EntitlementsController],
})
export class EntitlementsModule {}
