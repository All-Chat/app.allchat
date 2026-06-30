import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const number = searchParams.get("number");

  if (number) {
    // Redirects the mobile browser to the phone's dialer
    return NextResponse.redirect(`tel:${number}`, { status: 302 });
  }

  return NextResponse.json({ error: "Number missing" }, { status: 400 });
}
