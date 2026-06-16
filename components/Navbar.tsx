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
    router.push("/app");
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
               
              </>
            )}
          </div>
        </div>
      </nav>

      <ToastContainer position="top-right" autoClose={2000} theme="light" />
    </>
  );
}
