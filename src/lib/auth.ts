import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { db } from "@/lib/supabase";
import { isOtpTestMode, TEST_OTP } from "@/lib/email";
import type { Role } from "@/lib/types";

/**
 * Returns the whitelist of Gmail addresses that are allowed to sign in
 * as admins via Google OAuth. Defined in the env as a comma-separated list:
 *   ADMIN_GOOGLE_EMAILS=alice@gmail.com,bob@gmail.com
 */
function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_GOOGLE_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** True only when real (non-placeholder) Google OAuth credentials are set. */
function googleConfigured(): boolean {
  const id = process.env.GOOGLE_CLIENT_ID ?? "";
  const secret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  return (
    id.length > 0 &&
    secret.length > 0 &&
    !id.startsWith("YOUR_") &&
    !secret.startsWith("YOUR_")
  );
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    // ── Google OAuth (admin sign-in) — only when credentials are configured ──
    ...(googleConfigured()
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),

    // ── Email / OTP credentials ───────────────────────────────────────
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        otp: { label: "OTP", type: "text" },
        firebase_token: { label: "Firebase ID Token", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email && !credentials?.firebase_token) return null;

        // ── Firebase Google sign-in path ──────────────────────────────
        // The login page signs in with Firebase, gets an ID token, and
        // passes it here. We verify it with the Firebase REST API
        // (no firebase-admin SDK required) and check the email whitelist.
        if (credentials?.firebase_token) {
          const apiKey = process.env.FIREBASE_API_KEY;
          if (!apiKey) return null;

          try {
            const verifyRes = await fetch(
              `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idToken: credentials.firebase_token }),
              }
            );
            if (!verifyRes.ok) return null;
            const verifyData = await verifyRes.json();
            const firebaseUser = verifyData.users?.[0];
            if (!firebaseUser?.email) return null;

            const email = firebaseUser.email.toLowerCase().trim();
            const adminEmails = getAdminEmails();
            if (!adminEmails.includes(email)) return null;

            return {
              id: firebaseUser.localId,
              name: firebaseUser.displayName ?? email,
              email,
              role: "admin" as Role,
            };
          } catch {
            return null;
          }
        }

        // ── Standard credentials path (OTP / password) ───────────────
        if (!credentials?.email) return null;
        const email = credentials.email.toLowerCase().trim();

        // Captains / operators: OTP sign-in (no password account setup).
        if (credentials.otp) {
          const otp = credentials.otp.trim();
          const { data: user } = await db()
            .from("users")
            .select("id, name, email, role, email_verified, email_verify_token, email_verify_expires")
            .eq("email", email)
            .maybeSingle();
          if (!user) return null;

          const testBypass = isOtpTestMode() && otp === TEST_OTP;
          if (!testBypass) {
            if (user.email_verify_expires && new Date(user.email_verify_expires).getTime() < Date.now()) {
              throw new Error("OTP_EXPIRED");
            }
            if (!user.email_verify_token || user.email_verify_token !== otp) {
              throw new Error("INVALID_OTP");
            }
          }

          if (!user.email_verified || user.email_verify_token) {
            await db()
              .from("users")
              .update({
                email_verified: true,
                email_verify_token: null,
                email_verify_expires: null,
              })
              .eq("id", user.id);
          }

          return { id: user.id, name: user.name, email: user.email, role: user.role };
        }

        // Password login — admin only (captains use OTP).
        if (!credentials.password) return null;
        const { data: user } = await db()
          .from("users")
          .select("id, name, email, password_hash, role, email_verified")
          .eq("email", email)
          .maybeSingle();
        if (!user) return null;
        if (user.role !== "admin") {
          throw new Error("USE_OTP");
        }
        const ok = await bcrypt.compare(credentials.password, user.password_hash);
        if (!ok) return null;
        if (!user.email_verified) {
          throw new Error("EMAIL_NOT_VERIFIED");
        }
        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    /**
     * signIn callback — gate Google logins to the ADMIN_GOOGLE_EMAILS
     * whitelist defined in the environment file.
     * Add emails to that variable (comma-separated) to grant admin access.
     */
    async signIn({ user, account }) {
      // Credentials provider: always allowed (authorize() handles validation).
      if (account?.provider === "credentials") return true;

      // Google provider: email must appear in the ADMIN_GOOGLE_EMAILS whitelist.
      if (account?.provider === "google" && user.email) {
        const adminEmails = getAdminEmails();
        const email = user.email.toLowerCase().trim();
        if (!adminEmails.includes(email)) {
          // Redirect to error page — not in the whitelist.
          return "/login?error=google_not_admin";
        }
      }

      return true;
    },

    async jwt({ token, user, account }) {
      if (user) {
        // Credentials provider sets id/role directly on the user object.
        if (account?.provider === "credentials") {
          token.id = (user as any).id;
          token.role = (user as any).role;
        }
        // Google provider: signIn() already checked the whitelist, so anyone
        // who reaches here is an admin. Use the Google sub as the token id.
        if (account?.provider === "google") {
          token.id = user.id; // Google sub (unique per Google account)
          token.role = "admin" as Role;
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
};

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

/** Returns the session user or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return session.user as unknown as SessionUser;
}

/**
 * Guard for mutating routes. Returns the user if they hold one of the
 * allowed roles; otherwise null (caller responds 401/403).
 */
export async function requireRole(...roles: Role[]): Promise<SessionUser | null> {
  const user = await currentUser();
  if (!user || !roles.includes(user.role)) return null;
  return user;
}
