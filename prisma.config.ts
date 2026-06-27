import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "apps/api/prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
  // ── Quan trọng: dùng dotenv-env để load DATABASE_URL từ .env ─────
  // nếu không set biến môi trường, fallback về file:./dev.db (SQLite local)
});
