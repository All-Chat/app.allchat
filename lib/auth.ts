/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import User from "@/models/User";
import { connectDB } from "@/lib/mongodb";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        name: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.name || !credentials?.password) {
          throw new Error("CredentialsSignin"); 
        }

        await connectDB();
        const user = await User.findOne({ name: credentials.name });
        if (!user) throw new Error("CredentialsSignin");

        if (user.password !== credentials.password) throw new Error("CredentialsSignin"); 

        if ((user as any).accountStatus === "suspended") throw new Error("ACCOUNT_SUSPENDED");

        if (user.planExpiry) {
          const expiry = new Date(user.planExpiry);
          if (!isNaN(expiry.getTime()) && expiry < new Date()) throw new Error("PLAN_EXPIRED");
        }

        // Fetch Parent Tenant Name if Sub-User
        let parentTenantName = null;
        if (user.parentTenantId) {
          const parent = await User.findOne({ tenantId: user.parentTenantId }).select("name").lean();
          if (parent) parentTenantName = parent.name;
        }

        return {
          id: user._id.toString(),
          name: user.name,
          isTenant: user.isTenant,
          tenantId: user.tenantId,
          parentTenantId: user.parentTenantId,
          parentTenantName: parentTenantName, // Added to session
        } as any;
      },
    }),
    {
      id: "admin-impersonate",
      name: "Admin Impersonate",
      type: "credentials",
      credentials: {},
      async authorize() { return null; },
    },
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        (token as any).isTenant = (user as any).isTenant;
        (token as any).tenantId = (user as any).tenantId;
        (token as any).parentTenantId = (user as any).parentTenantId;
        (token as any).parentTenantName = (user as any).parentTenantName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).isTenant = (token as any).isTenant;
        (session.user as any).tenantId = (token as any).tenantId;
        (session.user as any).parentTenantId = (token as any).parentTenantId;
        (session.user as any).parentTenantName = (token as any).parentTenantName;
      }
      return session;
    },
  },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
};
