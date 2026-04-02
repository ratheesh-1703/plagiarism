import { NextRequest, NextResponse } from "next/server";

import { getStore } from "../_store";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const rawEmail = String(body?.email ?? "");
  const rawPassword = String(body?.password ?? "");

  const email = rawEmail.trim().toLowerCase();
  const password = rawPassword;

  if (!email || !password) {
    return NextResponse.json({ detail: "Email and password are required" }, { status: 422 });
  }

  const store = getStore();
  const user = store.users.find(
    (u) => u.email.trim().toLowerCase() === email && u.password === password,
  );
  if (!user) {
    return NextResponse.json({ detail: "Invalid email or password" }, { status: 401 });
  }

  return NextResponse.json({
    access_token: `dev-token-${user.id}`,
    token_type: "bearer",
  });
}
