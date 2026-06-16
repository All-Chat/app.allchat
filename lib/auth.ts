/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import User from "@/models/User";
import { connectDB } from "@/lib/mongodb"; // Make sure this is imported!

export const authOptions: NextAuthOptions = {
  providers: [
    // --- Standard Credentials Provider ---
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

        await connectDB(); // <--- THIS IS CRITICAL! It must be here.
        
        const user = await User.findOne({ name: credentials.name });
        if (!user) {
          throw new Error("CredentialsSignin"); // Generic error to prevent user enumeration
        }

        // Plain text comparison
        if (user.password !== credentials.password) {
          throw new Error("CredentialsSignin"); 
        }

        // --- Account Status Checks ---
        // User model uses `accountStatus` with values like "active" | "expired" | "suspended"
        if ((user as any).accountStatus === "suspended" || (user as any).accountStatus === "SUSPENDED") {
          throw new Error("ACCOUNT_SUSPENDED");
        }

        // Assuming your User model has a `planExpiry` date (or nullable)
        // Treat any past date as expired. Handle null/undefined as not expired.
        if (user.planExpiry) {
          const expiry = new Date(user.planExpiry);
          if (!isNaN(expiry.getTime()) && expiry < new Date()) {
            throw new Error("PLAN_EXPIRED");
          }
        }

        return {
          id: user._id.toString(),
          name: user.name,
        };
      },
    }),

    // --- Admin Impersonate Provider ---
    {
      id: "admin-impersonate",
      name: "Admin Impersonate",
      type: "credentials",
      credentials: {},
      async authorize(credentials) {
        // This is handled by the API route redirect
        // The session is created server-side
        return null;
      },
    },
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET,
};