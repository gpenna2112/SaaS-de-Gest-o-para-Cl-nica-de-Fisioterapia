"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { post } from "@/lib/api-client";

const links = [
  { href: "/dashboard", label: "Dashboard", shortLabel: "Dashboard" },
  { href: "/agenda", label: "Agenda", shortLabel: "Agenda" },
  { href: "/pacientes", label: "Pacientes", shortLabel: "Pacientes" },
  { href: "/equipe", label: "Equipe", shortLabel: "Equipe" },
  { href: "/salas", label: "Salas", shortLabel: "Salas" },
];

export function Nav({ userName }: { userName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      await post("/api/auth/sign-out", {});
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <>
      <nav className="hidden items-center justify-between gap-6 border-b border-border bg-background px-7 py-3 md:flex">
        <div className="flex items-center gap-7">
          <Image src="/espaco-fisio-logo.png" alt="Espaço Fisio" width={140} height={53} className="h-10 w-auto" priority />
          <div className="flex gap-1 rounded-[10px] bg-muted p-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname.startsWith(link.href) ? "page" : undefined}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${
                  pathname.startsWith(link.href)
                    ? "bg-teal-50 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="truncate text-sm text-muted-foreground">{userName}</span>
          <Button variant="secondary" onClick={handleLogout} disabled={isPending}>
            Sair
          </Button>
        </div>
      </nav>

      <nav className="flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3 md:hidden">
        <Image src="/espaco-fisio-logo.png" alt="Espaço Fisio" width={112} height={42} className="h-8 w-auto" priority />
        <span className="truncate text-xs text-muted-foreground">{userName}</span>
      </nav>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-background md:hidden">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={pathname.startsWith(link.href) ? "page" : undefined}
            className={`flex-1 py-3 text-center text-sm font-medium ${
              pathname.startsWith(link.href) ? "text-primary" : "text-muted-foreground"
            }`}
          >
            {link.shortLabel}
          </Link>
        ))}
        <button
          type="button"
          onClick={handleLogout}
          disabled={isPending}
          className="flex-1 py-3 text-center text-sm font-medium text-muted-foreground"
        >
          Sair
        </button>
      </nav>
    </>
  );
}
