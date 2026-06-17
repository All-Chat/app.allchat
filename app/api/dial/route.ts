import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const num = searchParams.get("num");
  
  if (num) {
    // Redirects the browser to the phone's native dialer
    return NextResponse.redirect(`tel:${num}`);
  }
  
  return NextResponse.json({ error: "No number provided" }, { status: 400 });
}
