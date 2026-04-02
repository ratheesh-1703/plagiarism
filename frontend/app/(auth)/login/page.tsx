"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { LoginResponse, apiRequest, saveToken } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await apiRequest<LoginResponse>("/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      saveToken(result.access_token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <section className="panel w-full p-8">
        <h1 className="mb-2 text-3xl font-black text-slateNight">Welcome back</h1>
        <p className="mb-6 text-sm text-slate-600">Sign in to analyze semantic plagiarism reports.</p>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
          <button className="btn-primary w-full" type="submit" disabled={loading}>{loading ? "Signing in..." : "Login"}</button>
        </form>
        <p className="mt-6 text-sm">No account? <Link className="font-semibold text-petrol underline" href="/register">Register</Link></p>
      </section>
    </main>
  );
}
