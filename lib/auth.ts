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

        return {
          id: dealer.id,
          name: dealer.name,
          email: dealer.email,
          slug: dealer.slug,
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
        token.slug = (user as { slug: string }).slug;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.slug = token.slug as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
