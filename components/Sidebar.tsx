/* eslint-disable react-hooks/immutability */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessagesSquare,
  LayoutDashboard,
  Users,
  Megaphone,
  Settings,
  Rocket,
  FileText,
  LineChart,
  Send,
  Menu,
  Tag,
  UserX,
  ClipboardList,
  X,
  FilePlus,
  Shield,
  ChevronDown,
  Bot,
} from "lucide-react";
import { useSession } from "next-auth/react";

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false); // Controls mobile drawer
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({}); // Controls dropdown states
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // Load saved dropdown states from local storage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sidebarOpenCategories");
      if (saved) {
        setOpenCategories(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load sidebar state", e);
    }
  }, []);

  // Close mobile sidebar automatically when navigating
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Ensure the active category stays open even on refresh
  useEffect(() => {
    categories.forEach((cat) => {
      const isActive = cat.items.some((item) => pathname === item.href);
      if (isActive) {
        setOpenCategories((prev) => {
          if (prev[cat.title]) return prev;
          return { ...prev, [cat.title]: true };
        });
      }
    });
  }, [pathname]);

  const toggleCategory = (title: string) => {
    setOpenCategories((prev) => {
      const newState = { ...prev, [title]: !prev[title] };
      localStorage.setItem("sidebarOpenCategories", JSON.stringify(newState));
      return newState;
    });
  };

  // ==========================================
  // 🔴 ADMIN CHECK LOGIC
  // ==========================================
  const isTRLAdmin = session?.user?.email === "TRL" || session?.user?.name === "TRL";

  // Data Structure for Links
  const topLinks = [
    { name: "Overview", icon: LayoutDashboard, href: "/dashboard" },
  ];

  const categories = [
    {
      title: "Messaging",
      icon: MessagesSquare,
      items: [
        { name: "Chats", icon: MessagesSquare, href: "/chat" },
        { name: "Templates", icon: FileText, href: "/dashboard/templates" },
        { name: "Send Test Message", icon: Send, href: "/send-message" },
      ],
    },
    {
      title: "Campaigns",
      icon: Megaphone,
      items: [
        { name: "Create Campaign", icon: Rocket, href: "/campaigns/create" },
        { name: "Campaign Lists", icon: Megaphone, href: "/campaigns/list" },
        { name: "Reports & Analytics", icon: LineChart, href: "/campaigns/reports" },
      ],
    },
    {
      title: "Automation",
      icon: Bot,
      items: [
        { name: "Workflows", icon: Users, href: "/workflows" },
        { name: "Tags", icon: Tag, href: "/tags" },
      ],
    },
    {
      title: "Contacts",
      icon: Users,
      items: [
        { name: "Opted-Out Numbers", icon: UserX, href: "/opt-numbers" },
        { name: "Create Form", icon: FilePlus, href: "/forms" },
        { name: "Form Responses", icon: ClipboardList, href: "/forms/responses" },
      ],
    },
  ];

  const bottomLinks = [
    { name: "Settings", icon: Settings, href: "/settings" },
  ];

  if (!mounted) return null;

  // Helper function to render standard links
  const renderLink = (item: { name: any; icon: any; href: any; }) => {
    const isActive = pathname === item.href;
    return (
      <Link
        href={item.href}
        className={`flex items-center gap-3 py-2.5 rounded-lg transition-all duration-200 whitespace-nowrap ${
          isActive
            ? "bg-green-50 text-green-700 font-semibold shadow-sm"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        }`}
      >
        <item.icon
          className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${
            isActive ? "text-green-600" : "text-gray-400"
          }`}
        />
        {item.name}
      </Link>
    );
  };

  return (
    <>
      {/* ==============================================
          1. MOBILE SUB-NAVBAR (Below Main Navbar)
          ============================================== */}
      <div className="md:hidden sticky top-[70px] z-40 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
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
          ============================================== */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* ==============================================
          3. SIDEBAR DRAWER
          ============================================== */}
      <aside
        className={`
          fixed left-0 bottom-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col
          transform transition-transform duration-300 ease-in-out
          
          top-0 ${isOpen ? "translate-x-0" : "-translate-x-full"}
          
          md:translate-x-0 md:top-[81px] md:h-[calc(100vh-64px)]
        `}
      >
        {/* Logo & Mobile Close Button */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-tr from-green-500 to-emerald-400 rounded-xl shadow-md">
              <MessagesSquare className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900 tracking-tight">All Chat CRM</span>
          </Link>
          
          <button
            onClick={() => setIsOpen(false)}
            className="md:hidden p-1 text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Close Menu"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          
          {/* Top Single Links (Overview) */}
          <div className="space-y-1 mb-2">
            {topLinks.map((item, i) => (
              <div key={i}>{renderLink(item)}</div>
            ))}
          </div>

          {/* Categorized Dropdowns */}
          {categories.map((cat) => {
            const isCatOpen = openCategories[cat.title];
            const isCatActive = cat.items.some((item) => pathname === item.href);

            return (
              <div key={cat.title} className="mt-3">
                <button
                  onClick={() => toggleCategory(cat.title)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg transition-colors group ${
                    isCatActive ? "bg-gray-50" : "hover:bg-gray-50"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <cat.icon 
                      className={`w-5 h-5 flex-shrink-0 transition-colors ${
                        isCatActive ? "text-green-600" : "text-gray-400 group-hover:text-gray-600"
                      }`} 
                    />
                    <span className={`text-base font-semibold tracking-wide ${
                      isCatActive ? "text-gray-900" : "text-gray-700"
                    }`}>
                      {cat.title}
                    </span>
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-300 text-gray-400 ${
                      isCatOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* Animated Dropdown Container */}
                <div
                  className={`grid transition-all duration-300 ease-in-out ${
                    isCatOpen ? "grid-rows-[1fr] opacity-100 mt-1" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="space-y-1 pl-3 border-l border-gray-100 ml-4 mt-1">
                      {cat.items.map((item, i) => (
                        <div key={i}>{renderLink(item)}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Bottom Single Links (Settings) */}
          <div className="space-y-1 mt-4 pt-4 border-t border-gray-100">
            {bottomLinks.map((item, i) => (
              <div key={i}>{renderLink(item)}</div>
            ))}
          </div>
        </nav>

        {/* Admin Panel Footer */}
        {isTRLAdmin && (
          <div className="p-4 border-t border-gray-200">
            <Link
              href="/admin/billing"
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors whitespace-nowrap shadow-sm border ${
                pathname === "/admin/billing"
                  ? "bg-amber-50 text-amber-700 font-semibold border-amber-100"
                  : "bg-white text-amber-600 hover:bg-amber-50 border-gray-100"
              }`}
            >
              <Shield
                className={`w-5 h-5 flex-shrink-0 ${
                  pathname === "/admin/billing" ? "text-amber-500" : "text-amber-400"
                }`}
              />
              <span className="text-base font-semibold">Admin Panel</span>
            </Link>
          </div>
        )}

      </aside>
    </>
  );
}
