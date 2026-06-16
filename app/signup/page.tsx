"use client";

import { useState } from "react";
import { Mail, Lock, User, MessageSquare, Loader2 } from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Link from "next/link";
import { signIn } from "next-auth/react"; // ADDED: To automatically log in after signup

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false); // ADDED: Loading state

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (!name || !email || !password) {
      toast.error("Please fill all fields");
      return;
    }

    setLoading(true);

    try {
      // 1. Create the account in the database
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Something went wrong");
        setLoading(false);
        return;
      }

      toast.success("Account created! Logging you in...");

      // 2. Automatically log them in using NextAuth
      const loginResult = await signIn("credentials", {
        name: name,
        password: password,
        redirect: false,
      });

      if (loginResult?.error) {
        // If auto-login fails, send them to the login page manually
        toast.error("Account created, please log in manually.");
        setTimeout(() => window.location.href = "/signin", 1500);
      } else {
        // 3. If auto-login works, redirect to dashboard
        setTimeout(() => window.location.href = "/dashboard", 1000);
      }

    } catch (err) {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-gray-50 px-4 py-12">
      
      <div className="w-full max-w-md bg-white border border-gray-200 shadow-xl rounded-2xl p-8">

        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <div className="p-3 bg-gradient-to-tr from-green-500 to-emerald-400 rounded-xl shadow-md">
              <MessageSquare className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Create Account</h1>
          <p className="text-gray-500 text-sm mt-1">
            Start your WhatsApp automation journey
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSignup} className="space-y-5">
          
          {/* Name Input */}
          <div>
            <label className="text-sm font-medium text-gray-700">Full Name</label>
            <div className="flex items-center border border-gray-300 rounded-lg mt-1 px-3 bg-white focus-within:ring-2 focus-within:ring-green-500 transition">
              <User className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                className="w-full p-3 outline-none text-gray-900 placeholder:text-gray-400"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Email Input */}
          <div>
            <label className="text-sm font-medium text-gray-700">Email</label>
            <div className="flex items-center border border-gray-300 rounded-lg mt-1 px-3 bg-white focus-within:ring-2 focus-within:ring-green-500 transition">
              <Mail className="w-4 h-4 text-gray-400" />
              <input
                type="email"
                className="w-full p-3 outline-none text-gray-900 placeholder:text-gray-400"
                placeholder="john@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <label className="text-sm font-medium text-gray-700">Password</label>
            <div className="flex items-center border border-gray-300 rounded-lg mt-1 px-3 bg-white focus-within:ring-2 focus-within:ring-green-500 transition">
              <Lock className="w-4 h-4 text-gray-400" />
              <input
                type="password"
                className="w-full p-3 outline-none text-gray-900 placeholder:text-gray-400"
                placeholder="Create a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Creating Account...
              </>
            ) : (
              "Create Account"
            )}
          </button>

        </form>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 mt-8">
          Already have an account?{" "}
          <Link href="/signin" className="text-green-600 font-semibold hover:underline">
            Sign In
          </Link>
        </p>

      </div>

      <ToastContainer position="top-right" autoClose={2000} theme="light" />
    </div>
  );
}