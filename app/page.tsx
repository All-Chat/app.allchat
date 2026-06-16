// app//page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare, User, Lock, Loader2, AlertCircle } from "lucide-react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { signIn } from "next-auth/react";

export default function SignInPage() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        name,
        password,
        redirect: false,
      });

      if (result?.error) {
        // Map the error from next-auth to a readable message
        let errorMessage = "Invalid name or password";

        if (
          result.error === "ACCOUNT_SUSPENDED" ||
          result.status === 403
        ) {
          errorMessage =
            "Your account has been suspended. Contact your administrator.";
        } else if (
          result.error === "PLAN_EXPIRED"
        ) {
          errorMessage =
            "Your subscription plan has expired. Contact your administrator to renew.";
        } else if (result.error === "CredentialsSignin") {
          errorMessage = "Invalid name or password";
        } else {
          errorMessage = result.error;
        }

        setError(errorMessage);
        setLoading(false);
        return;
      }

      // Success — redirect to dashboard
      window.location.href = "/dashboard";
    } catch (err) {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <ToastContainer position="top-right" autoClose={2000} theme="light" />

      <div className="w-full max-w-md bg-white border border-gray-200 shadow-xl rounded-2xl p-8">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-xl shadow-md">
              <MessageSquare className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Welcome Back</h1>
          <p className="text-gray-500 text-sm mt-1">
            Sign in to your All Chat CRM dashboard
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl mb-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-800">
                  {error ===
                  "Your account has been suspended. Contact your administrator."
                    ? "🔒 Account Suspended"
                    : error ===
                      "Your subscription plan has expired. Contact your administrator to renew."
                      ? "⏰ Plan Expired"
                      : "Login Failed"}
                </p>
                <p className="text-xs text-red-600 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <div className="flex items-center border border-gray-300 rounded-xl px-3 bg-white focus-within:ring-2 focus-within:ring-emerald-500/50 focus-within:border-emerald-400 transition-all">
              <User className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Enter your name"
                className="w-full p-3 outline-none text-gray-900 placeholder:text-gray-400 bg-transparent"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="flex items-center border border-gray-300 rounded-xl px-3 bg-white focus-within:ring-2 focus-within:ring-emerald-500/50 focus-within:border-emerald-400 transition-all">
              <Lock className="w-4 h-4 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Enter your password"
                className="w-full p-3 outline-none text-gray-900 placeholder:text-gray-400 bg-transparent"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-3.5 rounded-xl font-bold hover:shadow-lg hover:shadow-emerald-500/30 transition-all duration-300 hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Logging in...
              </>
            ) : (
              "Login"
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 mt-8">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-emerald-600 font-semibold hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
