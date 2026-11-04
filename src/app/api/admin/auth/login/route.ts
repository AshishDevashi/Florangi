import { NextResponse } from "next/server";
import { AuthInputError, loginAdmin } from "@/server/auth/service";
import { checkRateLimit, isSameOriginMutation } from "@/server/auth/request-security";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const limit = checkRateLimit(request, "admin-login", 6, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  try {
    const result = await loginAdmin(await request.json());
    if (!result.ok) return NextResponse.json({ error: "Invalid admin username or password." }, { status: 401 });
    return NextResponse.json({ user: result.user });
  } catch (error) {
    if (error instanceof AuthInputError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Enter a valid admin username and password." }, { status: 400 });
    }
    return NextResponse.json({ error: "Admin sign in could not be completed." }, { status: 500 });
  }
}