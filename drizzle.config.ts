import { config as loadEnv } from "dotenv";
import type { Config } from "drizzle-kit";

// drizzle-kit doesn't auto-load Next.js's .env.local, so we do it ourselves.
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Check .env.local at the project root.");
}

export default {
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
} satisfies Config;
