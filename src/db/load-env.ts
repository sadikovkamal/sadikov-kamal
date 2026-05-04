// Side-effect module: loads .env.local and .env so any importer of `db` from
// `src/db/index.ts` sees DATABASE_URL on process.env. ESM hoists imports, so
// putting `loadEnv()` calls in a sibling import statement guarantees they run
// before `./index.ts` is evaluated.

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });
