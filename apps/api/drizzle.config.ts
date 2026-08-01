import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './migrations',
  // Migration sinh ra được commit và chạy tuần tự; guard (trigger, role, grant)
  // nằm ở migration viết tay đi kèm.
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://sora:sora@localhost:5432/sora',
  },
})
