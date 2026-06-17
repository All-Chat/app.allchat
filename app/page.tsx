// app/signin/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  User,
  Lock,
  Loader2,
  AlertCircle,
  Send,
  PhoneCall,
  Mail,
  BellRing,
  Eye,
  EyeOff,
  Sparkles,
  Smile,
  Zap
} from "lucide-react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { signIn } from "next-auth/react";

export default function SignInPage() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        let errorMessage = "Invalid name or password";

        if (result.error === "ACCOUNT_SUSPENDED" || result.status === 403) {
          errorMessage =
            "Your account has been suspended. Contact your administrator.";
        } else if (result.error === "PLAN_EXPIRED") {
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

      window.location.href = "/dashboard";
    } catch (err) {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative h-163 w-full flex items-center justify-center bg-white px-4 py-10 overflow-hidden font-sans">
      
      {/* Soft Glowing Background Orbs (Green & Dark) */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#00CE6D]/15 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] bg-black/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* Dynamic Floating Icons (Mix of Black and #00CE6D) */}
      <style jsx>{`
        @keyframes float-1 { 0%, 100% { transform: translateY(0px) translateX(0px) rotate(0deg); } 50% { transform: translateY(-25px) translateX(10px) rotate(8deg); } }
        @keyframes float-2 { 0%, 100% { transform: translateY(0px) rotate(0deg); } 50% { transform: translateY(20px) rotate(-8deg); } }
        @keyframes float-3 { 0%, 100% { transform: translateY(0px) scale(1); } 50% { transform: translateY(-15px) scale(1.1); } }
        @keyframes float-4 { 0%, 100% { transform: translateY(0px) rotate(5deg); } 50% { transform: translateY(15px) rotate(-5deg); } }
      `}</style>

      {/* Icon 1: Message - Green */}
      <div className="absolute top-[15%] left-[10%] text-[#00CE6D]/20 animate-[float-1_8s_ease-in-out_infinite]">
        <MessageSquare className="w-32 h-32" strokeWidth={1.5} />
      </div>
      {/* Icon 2: Phone - Black */}
      <div className="absolute bottom-[15%] left-[8%] text-black/10 animate-[float-2_7s_ease-in-out_infinite]">
        <PhoneCall className="w-24 h-24" strokeWidth={1.5} />
      </div>
      {/* Icon 3: Send - Green */}
      <div className="absolute top-[20%] right-[12%] text-[#00CE6D]/20 animate-[float-3_9s_ease-in-out_infinite]">
        <Send className="w-28 h-28" strokeWidth={1.5} />
      </div>
      {/* Icon 4: Mail - Black */}
      <div className="absolute bottom-[12%] right-[18%] text-black/10 animate-[float-4_6s_ease-in-out_infinite]">
        <Mail className="w-24 h-24" strokeWidth={1.5} />
      </div>
      {/* Icon 5: BellRing - Green Faint */}
      <div className="absolute top-[50%] left-[45%] text-[#00CE6D]/10 animate-[float-1_10s_ease-in-out_infinite]">
        <BellRing className="w-40 h-40" strokeWidth={1.5} />
      </div>
      {/* Icon 6: Sparkles - Black */}
      <div className="absolute top-[10%] left-[40%] text-black/10 animate-[float-2_5s_ease-in-out_infinite]">
        <Sparkles className="w-16 h-16" strokeWidth={1.5} />
      </div>
      {/* Icon 7: Zap - Green */}
      <div className="absolute bottom-[20%] right-[40%] text-[#00CE6D]/20 animate-[float-3_7s_ease-in-out_infinite]">
        <Zap className="w-20 h-20" strokeWidth={1.5} />
      </div>
      {/* Icon 8: Smile - Black Faint */}
      <div className="absolute top-[40%] right-[8%] text-black/5 animate-[float-4_9s_ease-in-out_infinite]">
        <Smile className="w-24 h-24" strokeWidth={1.5} />
      </div>

      <ToastContainer position="top-right" autoClose={2000} theme="light" />

      {/* Main Login Card - Pure White with Strong Border */}
      <div className="relative z-10 w-full max-w-md bg-white border border-gray-200 shadow-[0_15px_50px_-15px_rgba(0,0,0,0.15)] rounded-3xl p-8 md:p-10">
        
        {/* Header / Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <div className="p-3 bg-[#00CE6D] rounded-2xl shadow-lg shadow-[#00CE6D]/30 transform hover:scale-105 transition-transform">
              <MessageSquare className="w-7 h-7 text-white" strokeWidth={2.5} />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-black tracking-tight">
            Welcome Back
          </h1>
          <p className="text-gray-500 text-sm mt-2 font-medium">
            Sign in to access your All Chat CRM dashboard
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl mb-6 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-800">
                  {error === "Your account has been suspended. Contact your administrator."
                    ? "🔒 Account Suspended"
                    : error === "Your subscription plan has expired. Contact your administrator to renew."
                    ? "⏰ Plan Expired"
                    : "⚠️ Login Failed"}
                </p>
                <p className="text-xs text-red-600 mt-0.5">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-black mb-2 uppercase tracking-wider">
              Name
            </label>
            <div className="flex items-center border-2 border-gray-200 rounded-xl px-4 bg-gray-50 focus-within:bg-white focus-within:ring-4 focus-within:ring-[#00CE6D]/10 focus-within:border-[#00CE6D] transition-all">
              <User className="w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Enter your name"
                className="w-full p-3 text-sm outline-none text-black placeholder:text-gray-400 bg-transparent font-medium"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-black mb-2 uppercase tracking-wider">
              Password
            </label>
            <div className="flex items-center border-2 border-gray-200 rounded-xl px-4 bg-gray-50 focus-within:bg-white focus-within:ring-4 focus-within:ring-[#00CE6D]/10 focus-within:border-[#00CE6D] transition-all">
              <Lock className="w-5 h-5 text-gray-400" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Enter your password"
                className="w-full p-3 text-sm outline-none text-black placeholder:text-gray-400 bg-transparent font-medium"
                required
              />
              {/* Show/Hide Password Button */}
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[#00CE6D] hover:text-[#00b85f] transition-colors focus:outline-none p-1"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <button type="button" className="text-xs text-[#00CE6D] hover:text-[#00b85f] hover:underline transition-colors font-semibold">
              Forgot password?
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#00CE6D] text-white py-3.5 rounded-xl font-bold text-sm hover:bg-[#00b85f] hover:shadow-xl hover:shadow-[#00CE6D]/30 hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Authenticating...
              </>
            ) : (
              "Sign In Securely"
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
