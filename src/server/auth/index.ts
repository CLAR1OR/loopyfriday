import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { env } from "@/server/env";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // No public self-service signup. Accounts are created by an admin or via a
    // valid invite (server-side trusted `auth.api.createUser` call).
    disableSignUp: true,
    minPasswordLength: 8,
  },
  // Database-backed sessions (no Redis). Rolling 30-day expiry.
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  plugins: [
    admin({ adminRoles: ["admin"], defaultRole: "member" }),
    // Must be last: lets server actions write the session cookie.
    nextCookies(),
  ],
});

export type Auth = typeof auth;
