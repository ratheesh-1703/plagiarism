"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { apiRequest } from "@/lib/api";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (cleanName.length < 2) {
      setError("Name must be at least 2 characters");
      return;
    }

    if (password.length < 12) {
      setError("Password must be at least 12 characters");
      return;
    }

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      setError("Password must include uppercase, lowercase, and number");
      return;
    }

    setLoading(true);
    try {
      await apiRequest("/register", {
        method: "POST",
        body: JSON.stringify({ name: cleanName, email: cleanEmail, password }),
      });
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <section className="panel w-full p-8">
        <h1 className="mb-2 text-3xl font-black text-slateNight">Create your account</h1>
        <p className="mb-6 text-sm text-slate-600">Start checking semantic plagiarism with SBERT.</p>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <input className="input" type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} required />
          <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} required />
          <input className="input" type="password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
          <button className="btn-primary w-full" type="submit" disabled={loading}>{loading ? "Creating account..." : "Register"}</button>
        </form>
        <p className="mt-6 text-sm">Already registered? <Link className="font-semibold text-petrol underline" href="/login">Login</Link></p>
      </section>
    </main>
  );
}
