/**
 * Standalone migration runner. Invoked on container boot (entrypoint) and via
 * `npm run db:migrate`. Uses a dedicated single connection so it can run before
 * the app opens its pool.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required to run migrations");
}

async function main() {
  const sql = postgres(url!, { max: 1 });
  try {
    await migrate(drizzle(sql), {
      migrationsFolder: "./src/server/db/migrations",
    });
    console.log("Migrations applied.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
