import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { isEmailAllowed } from "@/lib/env";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    Nodemailer({
      // Fall back to a noop placeholder so Next.js page-data collection at
      // build time doesn't fail when env isn't set yet.
      server: process.env.EMAIL_SERVER || "smtp://localhost:25",
      from: process.env.EMAIL_FROM || "no-reply@localhost",
      maxAge: 60 * 60, // 1h magic-link validity
      ...(process.env.NODE_ENV !== "production"
        ? {
            sendVerificationRequest: async ({ identifier, url }) => {
              console.log(
                `\n\n=== MAGIC LINK (dev) ===\nto: ${identifier}\n${url}\n========================\n\n`,
              );
            },
          }
        : {}),
    }),
  ],
  pages: { signIn: "/signin", verifyRequest: "/signin/verify" },
  callbacks: {
    async signIn({ user }) {
      return isEmailAllowed(user?.email);
    },
    async session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});
