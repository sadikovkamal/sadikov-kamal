import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL!;

declare global {
  // eslint-disable-next-line no-var
  var _pgClient: ReturnType<typeof postgres> | undefined;
}

const client = global._pgClient ?? postgres(connectionString, { max: 10 });
if (process.env.NODE_ENV !== "production") global._pgClient = client;

export const db = drizzle(client);
