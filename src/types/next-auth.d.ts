import { NextAuthResult } from "next-auth";

declare module "next-auth" {
  interface User {
    workspaceId?: string;
  }
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      workspaceId?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    workspaceId?: string;
  }
}

export type AuthSession = NextAuthResult extends { auth: infer A } ? A : never;
