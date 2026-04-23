import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      slug: string;
      vertical: string;
      subAccountId: string | null;
      teamUser?: {
        id: string;
        role: "admin" | "editor";
        subAccountId?: string;
      };
    };
  }

  interface User {
    id: string;
    slug: string;
    vertical: string;
    subAccountId: string | null;
    teamUser?: {
      id: string;
      role: "admin" | "editor";
      subAccountId?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    slug: string;
    vertical: string;
    subAccountId: string | null;
    teamUser?: {
      id: string;
      role: "admin" | "editor";
      subAccountId?: string;
    };
  }
}
