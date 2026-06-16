/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Home,
  LogIn,
  UserPlus,
  LogOut,
  LayoutDashboard,
} from "lucide-react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useSession, signOut } from "next-auth/react";

export default function Navbar() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isLoggedIn = status === "authenticated";

  const handleLogout = async () => {
    await signOut({ redirect: false });
    toast.success("Logged out successfully");
    router.push("/");
  };

  const handleToast = (type: string) => {
    if (type === "login") {
      toast.info("Redirecting to Login...");
    } else {
      toast.info("Redirecting to Sign Up...");
    }
  };

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/80 backdrop-blur-lg">
        <div className="w-full px-4 sm:px-6 py-2.5 flex items-center justify-between">
          
          {/* LEFT - LOGO IMAGE (Decreased Size) */}
          <Link href={isLoggedIn ? "/dashboard" : "/"} className="flex items-center group">
            <img 
              src="/logo.svg" 
              alt="All Chat Logo" 
              className="h-14 w-auto object-contain transition-transform group-hover:scale-110 lg:ml-8" 
            />
          </Link>

          {/* CENTER - DESKTOP LINKS (Hidden on mobile) */}
          <div className="hidden md:flex items-center gap-8">
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                className="relative flex items-center gap-2 text-sm font-medium text-gray-900 transition-colors group"
              >
                <LayoutDashboard className="w-4 h-4 text-green-500" />
                <span>Dashboard</span>
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-green-500 transition-all group-hover:w-full"></span>
              </Link>
            ) : (
              <>
                <Link
                  href="/"
                  className="relative flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors group"
                >
                  <Home className="w-4 h-4 text-green-500" />
                  <span>Home</span>
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-green-500 transition-all group-hover:w-full"></span>
                </Link>
                <Link
                  href="/#features"
                  className="relative text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors group"
                >
                  <span>Features</span>
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-green-500 transition-all group-hover:w-full"></span>
                </Link>
              </>
            )}
          </div>

          {/* RIGHT - BUTTONS (Visible on all screens, no hamburger) */}
          <div className="flex items-center gap-2 sm:gap-3">
            {isLoggedIn ? (
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition"
              >
                <LogOut className="w-4 h-4" />
                {/* Hide text on very small phones to save space */}
                <span className="hidden sm:inline">Logout</span> 
              </button>
            ) : (
              <>
                <Link
                  href="/signin"
                  onClick={() => handleToast("login")}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold border border-gray-300 text-gray-800 hover:bg-gray-100 transition"
                >
                  <LogIn className="w-4 h-4" />
                  <span className="hidden sm:inline">Sign In</span>
                </Link>

                <Link
                  href="/signup"
                  onClick={() => handleToast("signup")}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-green-500 to-emerald-600 shadow-md shadow-green-500/30 hover:shadow-green-500/50 transition-all hover:scale-105"
                >
                  <UserPlus className="w-4 h-4" />
                  <span className="hidden sm:inline">Sign Up</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <ToastContainer position="top-right" autoClose={2000} theme="light" />
    </>
  );
}