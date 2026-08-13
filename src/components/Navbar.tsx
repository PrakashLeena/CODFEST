"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/teams", label: "Teams" },
  { href: "/matches", label: "Matches" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/rules", label: "Rules" },
  { href: "/contact", label: "Contact" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const updateNavbar = () => setScrolled(window.scrollY > 12);
    updateNavbar();
    window.addEventListener("scroll", updateNavbar, { passive: true });
    return () => window.removeEventListener("scroll", updateNavbar);
  }, []);

  const role = session?.user?.role;

  // Filter out links that are gated by a setting flag.
  const visibleLinks = LINKS.filter((l) => {
    return true;
  });

  const roleLinks = [
    ...(role === "admin" ? [
      { href: "/bracket", label: "Bracket" },
      { href: "/admin", label: "Admin" },
    ] : []),
  ];

  return (
    <header
      className={`fixed left-0 top-0 z-50 w-full border-b transition-all duration-300 ${
        scrolled
          ? "border-white/10 bg-night-page/75 shadow-lg backdrop-blur-md"
          : "border-transparent bg-transparent"
      }`}
    >
      <div className="site-gutter mx-auto flex h-16 max-w-7xl items-center justify-between drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
        <Link href="/" className="group flex items-center gap-3">
          <Image
            src="/NavBarLogo.png"
            alt="CODFEST 2026"
            width={628}
            height={225}
            priority
            className="h-auto w-32 transition-opacity group-hover:opacity-80 sm:w-36"
          />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {visibleLinks.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative flex items-center gap-1.5 px-3 py-2 font-mono text-xs uppercase tracking-[0.1em] transition-colors ${
                  active
                    ? "text-ember-500 font-bold"
                    : "text-zinc-300 hover:text-white"
                }`}
              >
                {l.label}
                {(l as any).badge && (
                  <span className="flex items-center gap-1 rounded-full bg-green-900/60 border border-green-500/30 px-1.5 py-0.5 font-mono text-[8px] font-bold text-green-400">
                    <span className="h-1 w-1 rounded-full bg-green-400 animate-pulse" />
                    {(l as any).badge}
                  </span>
                )}
                {active && (
                  <motion.div
                    layoutId="nav-underline"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-ember-500 shadow-glowSm"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
          {roleLinks.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative px-3 py-2 font-mono text-xs uppercase tracking-[0.1em] transition-colors ${
                  active
                    ? "text-ember-400 font-bold"
                    : "text-ember-400/80 hover:text-ember-400"
                }`}
              >
                {l.label}
                {active && (
                  <motion.div
                    layoutId="nav-underline"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-ember-400 shadow-glowSm"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
          {role === "admin" ? (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => signOut({ callbackUrl: "/" })}
              className="btn-ghost ml-3 !px-4 !py-1.5 !text-[11px]"
            >
              Logout
            </motion.button>
          ) : (
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                href="/register"
                className="btn-primary ml-3 !px-4 !py-1.5 !text-[11px]"
              >
                Register Team
              </Link>
            </motion.div>
          )}
        </nav>

        <button
          className="p-2 text-zinc-300 lg:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="site-gutter overflow-hidden border-t border-night-700 bg-night-900 py-3 lg:hidden"
          >
            {[...visibleLinks, ...roleLinks].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-2.5 font-mono text-xs uppercase tracking-[0.1em] text-zinc-300 hover:bg-night-800 hover:text-ember-400"
              >
                {l.label}
              </Link>
            ))}
            {role === "admin" ? (
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="mt-2 block w-full px-3 py-2.5 text-left font-mono text-xs uppercase tracking-[0.1em] text-zinc-500 hover:text-zinc-300"
              >
                Logout
              </button>
            ) : (
              <Link
                href="/register"
                onClick={() => setOpen(false)}
                className="mt-2 block px-3 py-2.5 font-mono text-xs uppercase tracking-[0.1em] text-ember-400 hover:text-ember-300"
              >
                Register Team
              </Link>
            )}
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
