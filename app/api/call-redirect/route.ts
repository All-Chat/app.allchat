// app/api/call-redirect/route.ts
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get("phone");
  
  if (phone) {
    // Return a 302 redirect to the tel: protocol
    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: `tel:${phone}`,
      },
    });
  }
  
  return new NextResponse("Phone number required", { status: 400 });
}
