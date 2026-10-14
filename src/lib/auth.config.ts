import type { NextAuthConfig } from "next-auth";

const publicPrefixes = ["/login", "/signup", "/api/auth", "/api/voice"];

export const authConfig = {
  pages: { signIn: "/login" },
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const loggedIn = !!auth?.user;
      const path = nextUrl.pathname;
      if (path === "/" || publicPrefixes.some((p) => path.startsWith(p))) return true;
      if (path.startsWith("/api/")) return true;
      return loggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.workspaceId = (user as { workspaceId?: string }).workspaceId;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.workspaceId = token.workspaceId as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
