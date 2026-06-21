/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
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

  const wl = (session?.user as any)?.whiteLabel;
  const isWhiteLabel = wl?.enabled;
  const navbarLogo = isWhiteLabel && wl?.logoUrl ? wl.logoUrl : "/logo.svg";
  const navbarAppName = isWhiteLabel && wl?.appName ? `${wl.appName} CRM` : "All Chat CRM";

  // ✅ CUSTOM DOMAIN REDIRECT LOGIC
  useEffect(() => {
    if (isLoggedIn && isWhiteLabel && wl?.brandUrl) {
      if (typeof window !== "undefined") {
        const currentHostname = window.location.hostname;
        const targetHostname = wl.brandUrl.replace(/https?:\/\//, "").replace(/\/$/, "");
        
        // If the user is NOT on their custom domain, redirect them to it.
        // Example: They login on allchat.in, but their domain is therealleads.in
        if (currentHostname !== targetHostname && currentHostname !== "localhost" && !currentHostname.includes("vercel.app")) {
          const protocol = window.location.protocol;
          const port = window.location.port ? `:${window.location.port}` : "";
          // Redirect to: https://therealleads.in/dashboard
          
          // Uncomment this line in production:
          // window.location.href = `${protocol}//${targetHostname}${port}/dashboard`;
          
          // For local testing, log it:
          console.log(`Custom Domain Redirect would trigger to: ${protocol}//${targetHostname}${port}/dashboard`);
        }
      }
    }
  }, [isLoggedIn, isWhiteLabel, wl, router]);

  const handleLogout = async () => {
    await signOut({ redirect: false });
    toast.success("Logged out successfully");
    router.push("/");
  };

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/80 backdrop-blur-lg">
        <div className="w-full px-4 sm:px-6 py-2.5 flex items-center justify-between">
          
          {/* LEFT - LOGO IMAGE */}
          <Link href={isLoggedIn ? "/dashboard" : "/"} className="flex items-center group">
            <img 
              src={navbarLogo} 
              alt={navbarAppName} 
              className="h-14 w-auto object-contain transition-transform group-hover:scale-110 lg:ml-8" 
            />
          </Link>

          {/* RIGHT - BUTTONS */}
          <div className="flex items-center gap-2 sm:gap-3">
            {isLoggedIn ? (
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span> 
              </button>
            ) : (
              <>
                {/* Add login/signup buttons here if needed */}
              </>
            )}
          </div>
        </div>
      </nav>

      <ToastContainer position="top-right" autoClose={2000} theme="light" />
    </>
  );
}
