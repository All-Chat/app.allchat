"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function FacebookCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    console.log("Facebook Callback");
    console.log("Code:", code);
    console.log("State:", state);

    router.replace("/tenant/settings/whatsapp");
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p>Connecting WhatsApp Account...</p>
    </div>
  );
}
