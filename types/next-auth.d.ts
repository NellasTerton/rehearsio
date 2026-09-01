import type { DefaultSession } from "next-auth";

// Auth.js's default Session doesn't carry the user id; the session callback
// in lib/auth.ts puts it there, so widen the type to match reality.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
