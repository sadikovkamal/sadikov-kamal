import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. " +
      "Copy .env.example to .env.local and add your Postgres connection string."
  );
}

declare global {
  var _pgClient: ReturnType<typeof postgres> | undefined;
}

// Serverless constraint: each Lambda/Edge invocation must not hold more than
// one connection open — the platform recycles function instances unpredictably
// and a pool > 1 leaks connections on the Neon side. In development we reuse
// the client across HMR reloads via global to avoid exhausting dev-mode
// connections.
const client =
  global._pgClient ??
  postgres(connectionString, {
    max: 1,
    // Surface connection errors immediately instead of silently hanging until
    // the first query times out — the error bubbles to instrumentation and
    // shows clearly in Vercel function logs.
    connect_timeout: 10,
    idle_timeout: 20,
    max_lifetime: 60 * 30, // 30 min — rotate before Neon's idle timeout
    onnotice: () => {}, // suppress NOTICE messages from migrations
  });

if (process.env.NODE_ENV !== "production") global._pgClient = client;

export const db = drizzle(client, { schema });
