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
      // userType: discriminator for the identity provider that minted this
      // session. Used by getEffectiveDealerContext() to refuse non-Dealer
      // identities even if they somehow obtained a signed JWT.
      userType: "dealer" | "teamuser";
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
    userType: "dealer" | "teamuser";
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
    userType: "dealer" | "teamuser";
    teamUser?: {
      id: string;
      role: "admin" | "editor";
      subAccountId?: string;
    };
  }
}
