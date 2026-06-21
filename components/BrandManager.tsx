"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

export default function BrandManager() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "authenticated" && session?.user?.whiteLabel?.enabled) {
      const wl = session.user.whiteLabel;

      // 1. Change Browser Tab Title
      if (wl.appName) {
        document.title = wl.appName;
      }

      // 2. Change Favicon
      if (wl.logoUrl) {
        let favicon = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
        if (!favicon) {
          favicon = document.createElement("link");
          favicon.rel = "icon";
          document.head.appendChild(favicon);
        }
        favicon.href = wl.logoUrl;
      }
    } else {
      document.title = "All Chat CRM - WhatsApp Automation";
    }
  }, [session, status]);

  return null;
}
