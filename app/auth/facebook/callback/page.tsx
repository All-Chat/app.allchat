"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function FacebookCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    window.location.href = "/tenant/settings/whatsapp";
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p>Redirecting...</p>
    </div>
  );
}
