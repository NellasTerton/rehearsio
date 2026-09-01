import { DrizzleAdapter } from "@auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { db } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";

// Two ways in: Google, and email + password for people who don't want to
// use Google. Passwords are bcrypt-hashed (cost 12) and the failure path is
// deliberately uniform — a wrong password and an unknown email return the
// same null, so this endpoint can't be used to discover who has an account.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // Auth.js picks up AUTH_SECRET on its own; naming it explicitly here also
  // accepts the BETTER_AUTH_SECRET spelling used in this project's .env.local.
  secret: process.env.AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET,
  providers: [
    Google,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const email = typeof creds?.email === "string" ? creds.email.trim().toLowerCase() : "";
        const password = typeof creds?.password === "string" ? creds.password : "";
        if (!email || !password) return null;

        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        // Compare against a dummy hash when the user (or their password) does
        // not exist, so the response time doesn't reveal which case it was.
        const hash = user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu";
        const ok = await bcrypt.compare(password, hash);
        if (!ok || !user?.passwordHash) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  // JWT rather than database sessions: Auth.js's Credentials provider does
  // not create adapter session rows, so database strategy would break
  // password sign-in. The adapter is still used for user/account storage.
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    // Expose the user id on the session so route handlers can look the user
    // up. Deliberately NOT putting subscription status here: a token is
    // issued once and would go stale the moment a subscription is cancelled
    // or expires. Entitlement is read fresh from the database at use.
    session({ session, token }) {
      if (session.user && typeof token.uid === "string") session.user.id = token.uid;
      return session;
    },
  },
});
