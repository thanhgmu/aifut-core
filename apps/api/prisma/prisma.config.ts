import { PrismaClient } from '@prisma/client';

export default {
  /** Connection url used for prisma migrate CLI operations. */
  url: process.env.DATABASE_URL || 'postgresql://postgres:123456@localhost:5432/aifut?schema=public',
};
