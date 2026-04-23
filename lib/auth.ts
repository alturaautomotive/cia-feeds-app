import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

if (process.env.NODE_ENV === "production") {
  if (!process.env.NEXTAUTH_SECRET) {
    console.error(
      "[auth] NEXTAUTH_SECRET is not set. Sessions will fail. " +
        "Set it in your Vercel Environment Variables."
    );
  }
  if (!process.env.NEXTAUTH_URL) {
    console.error(
      "[auth] NEXTAUTH_URL is not set in production. " +
        "Set it to your deployed domain (e.g. https://yourapp.vercel.app) " +
        "in Vercel Environment Variables."
    );
  } else if (process.env.NEXTAUTH_URL.includes("localhost")) {
    console.error(
      "[auth] NEXTAUTH_URL is set to a localhost address in production. " +
        "This will cause session cookies to use the wrong domain, " +
        "resulting in redirect loops after login. " +
        "Update it in Vercel Environment Variables to your deployed domain."
    );
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const dealer = await prisma.dealer.findUnique({
          where: { email: credentials.email },
          include: { subAccounts: { orderBy: { createdAt: "asc" }, take: 1 } },
        });

        if (!dealer) {
          return null;
        }

        const passwordMatch = await bcrypt.compare(
          credentials.password,
          dealer.passwordHash
        );

        if (!passwordMatch) {
          return null;
        }

        if (!dealer.active) {
          return null;
        }

        // Check if this user is a team member for this dealer
        const teamUser = await prisma.teamUser.findFirst({
          where: {
            email: credentials.email.toLowerCase(),
            dealerId: dealer.id,
            acceptedAt: { not: null },
          },
          select: { id: true, role: true, subAccountId: true },
        });

        return {
          id: dealer.id,
          name: dealer.name,
          email: dealer.email,
          slug: dealer.slug,
          vertical: dealer.vertical,
          subAccountId: dealer.defaultSubAccountId ?? dealer.subAccounts[0]?.id ?? null,
          teamUser: teamUser
            ? { id: teamUser.id, role: teamUser.role as "admin" | "editor", subAccountId: teamUser.subAccountId ?? undefined }
            : undefined,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.slug = (user as { slug: string; vertical: string; subAccountId: string | null }).slug;
        token.vertical = (user as { slug: string; vertical: string; subAccountId: string | null }).vertical;
        token.subAccountId = (user as { subAccountId: string | null }).subAccountId ?? null;
        token.teamUser = (user as { teamUser?: { id: string; role: "admin" | "editor"; subAccountId?: string } }).teamUser;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.slug = token.slug as string;
        session.user.vertical = token.vertical as string;
        session.user.subAccountId = (token.subAccountId as string) ?? null;
        session.user.teamUser = token.teamUser;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
