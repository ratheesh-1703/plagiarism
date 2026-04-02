import { NextRequest, NextResponse } from "next/server";

import { getStore, persistStore } from "../_store";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const rawName = String(body?.name ?? "");
  const rawEmail = String(body?.email ?? "");
  const rawPassword = String(body?.password ?? "");

  const name = rawName.trim();
  const email = rawEmail.trim().toLowerCase();
  const password = rawPassword;

  if (!name || !email || !password) {
    return NextResponse.json({ detail: "Missing required fields" }, { status: 422 });
  }

  const store = getStore();
  const exists = store.users.some((u) => u.email.trim().toLowerCase() === email);
  if (exists) {
    return NextResponse.json({ detail: "Email is already registered" }, { status: 409 });
  }

  const user = {
    id: store.nextUserId++,
    name,
    email,
    password,
    created_at: new Date().toISOString(),
  };
  store.users.push(user);
  persistStore();

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    created_at: user.created_at,
  });
}
