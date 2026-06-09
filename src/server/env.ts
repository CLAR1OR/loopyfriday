/**
 * Centralised, validated environment access. Importing this on the server
 * guarantees the required variables are present and fails fast otherwise.
 */
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(16, "BETTER_AUTH_SECRET must be set"),
  BETTER_AUTH_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  DATA_DIR: z.string().min(1).default("./data/files"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Max size for a single recording upload (bytes). Default 2 GiB.
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024 * 1024),
  // Storage backend. "s3" is a stub for now (see storage/s3.ts).
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
});

type Env = z.infer<typeof schema>;

/**
 * During `next build` the route modules are imported to collect page data, but
 * no real secrets are present (the build container has no `.env`). Set
 * SKIP_ENV_VALIDATION=1 in that context to load safe placeholders instead of
 * crashing; real values are still required at runtime, where the flag is unset.
 */
function loadEnv(): Env {
  if (process.env.SKIP_ENV_VALIDATION) {
    return schema.parse({
      DATABASE_URL: "postgres://build:build@localhost:5432/build",
      BETTER_AUTH_SECRET: "build-time-placeholder-secret-unused",
      BETTER_AUTH_URL: "http://localhost:3000",
      DATA_DIR: process.env.DATA_DIR,
      NODE_ENV: process.env.NODE_ENV,
    });
  }

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "Invalid environment configuration:",
      parsed.error.flatten().fieldErrors,
    );
    throw new Error("Invalid environment configuration");
  }
  return parsed.data;
}

export const env = loadEnv();

export const appUrl = env.NEXT_PUBLIC_APP_URL ?? env.BETTER_AUTH_URL;
