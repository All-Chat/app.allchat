/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  MessageSquare,
  LayoutDashboard,
  Users,
  Megaphone,
  Settings,
  LogOut,
  Rocket,
  FileText,
  LineChart,
  Send,
  Menu,
  X,
  Shield,
} from "lucide-react";
import { useSession, signOut } from "next-auth/react"; // Added useSession

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession(); // Get current user session
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false); // Controls mobile drawer

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // Close mobile sidebar automatically when navigating
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // ==========================================
  // 🔴 ADMIN CHECK LOGIC
  // ==========================================
  // Security Note: NextAuth sessions never expose the user's plain-text password 
  // to the frontend for security reasons. Therefore, we check their identifier (email/name).
  // If the user logged in with the username/email "TRL", we grant admin access here.
  const isTRLAdmin = session?.user?.email === "TRL" || session?.user?.name === "TRL";

  const baseMenu = [
    { name: "Overview", icon: LayoutDashboard, href: "/dashboard" },
    { name: "Templates", icon: FileText, href: "/dashboard/templates" },
    { name: "Send Test Message", icon: Send, href: "/send-message" },
    { name: "Create Campaign", icon: Rocket, href: "/campaigns/create" },
    { name: "Campaign Lists", icon: Megaphone, href: "/campaigns/list" },
    { name: "Reports & Analytics", icon: LineChart, href: "/campaigns/reports" },
    { name: "Chats", icon: MessageSquare, href: "/chat" },
    { name: "Workflows", icon: Users, href: "/workflows" },
    { name: "Settings", icon: Settings, href: "/settings" },
  ];

  // Add Admin Panel only if the logged-in user is TRL
  if (isTRLAdmin) {
    baseMenu.push({ 
      name: "Admin Panel", 
      icon: Shield, 
      href: "/admin/billing" 
    });
  }

  const handleLogout = async () => {
    setIsOpen(false);
    await signOut({ redirect: false });
    router.push("/");
  };

  if (!mounted) return null;

  return (
    <>
      {/* ==============================================
          1. MOBILE SUB-NAVBAR (Below Main Navbar)
          Only visible on small screens
          ============================================== */}
      <div className="md:hidden sticky top-[70px] z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <span className="font-bold text-lg text-gray-900">Dashboard</span>
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Open Menu"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* ==============================================
          2. MOBILE BACKDROP OVERLAY
          Clicking outside closes the sidebar
          ============================================== */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* ==============================================
          3. SIDEBAR DRAWER
          - Slides in/out on mobile
          - Fixed below navbar on Desktop (top-[64px])
          ============================================== */}
      <aside
        className={`
          fixed left-0 bottom-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col
          transform transition-transform duration-300 ease-in-out
          
          /* Mobile: Starts from very top, slides in/out */
          top-0 ${isOpen ? "translate-x-0" : "-translate-x-full"}
          
          /* Desktop: Always visible, starts below main top navbar (assuming 64px height) */
          md:translate-x-0 md:top-[81px] md:h-[calc(100vh-64px)]
        `}
      >
        {/* Logo & Mobile Close Button */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-tr from-green-500 to-emerald-400 rounded-xl">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">All Chat CRM</span>
          </Link>
          
          {/* Close button only visible inside mobile drawer */}
          <button
            onClick={() => setIsOpen(false)}
            className="md:hidden p-1 text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Close Menu"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {baseMenu.map((item, i) => {
            const isActive = pathname === item.href;
            
            // Add a visual separator above the Admin button
            const isAdminItem = item.icon === Shield;
            
            return (
              <div key={i}>
                {isAdminItem && (
                  <div className="my-3 border-t border-gray-100" />
                )}
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? isAdminItem 
                        ? "bg-amber-50 text-amber-700 font-semibold" // Active Admin style
                        : "bg-green-50 text-green-700 font-semibold" // Active Normal style
                      : isAdminItem
                        ? "text-amber-600 hover:bg-amber-50"         // Inactive Admin style
                        : "text-gray-600 hover:bg-gray-100"         // Inactive Normal style
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${
                    isActive 
                      ? isAdminItem ? "text-amber-500" : "text-green-600" 
                      : isAdminItem ? "text-amber-400" : "text-gray-400"
                    }`} 
                  />
                  {item.name}
                </Link>
              </div>
            );
          })}
        </nav>

      </aside>
    </>
  );
}