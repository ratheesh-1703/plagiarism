"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PropsWithChildren } from "react";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/sources", label: "Sources" },
  { href: "/research-studio", label: "Research Studio" },
];

export default function Shell({ children }: PropsWithChildren) {
  const pathname = usePathname();

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-8 md:px-8">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slateNight">Semantic Plagiarism Radar</h1>
          <p className="text-sm text-slate-700">Transformer-based plagiarism detection platform</p>
        </div>
        <nav className="flex gap-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                pathname.startsWith(link.href)
                  ? "bg-petrol text-white"
                  : "bg-white/70 text-slateNight hover:bg-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
