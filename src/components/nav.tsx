"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { post } from "@/lib/api-client";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/agenda", label: "Agenda" },
  { href: "/pacientes", label: "Pacientes" },
  { href: "/equipe", label: "Equipe" },
  { href: "/salas", label: "Salas" },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/configuracoes", label: "Configurações" },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1">
      {links.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors duration-150 ${
              active ? "bg-teal-50 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserBlock({
  userName,
  isPending,
  onLogout,
}: {
  userName: string;
  isPending: boolean;
  onLogout: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/50 px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-800">
        {initials(userName)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{userName}</span>
      {/* Só "Sair" é clicável — nome/avatar são só exibição, para não disparar logout sem querer. */}
      <button
        type="button"
        onClick={onLogout}
        disabled={isPending}
        className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Saindo…" : "Sair"}
      </button>
    </div>
  );
}

export function Nav({ userName }: { userName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [drawerOpen, setDrawerOpen] = useState(false);

  function handleLogout() {
    startTransition(async () => {
      await post("/api/auth/sign-out", {});
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <>
      {/* Sidebar desktop — fixa, sempre visível (mesmo breakpoint md usado no resto do app) */}
      <aside className="sticky top-0 hidden h-screen w-58 shrink-0 flex-col gap-6 border-r border-border bg-background p-4 md:flex">
        <Image src="/espaco-fisio-logo-cropped.png" alt="Espaço Fisio" width={226} height={53} className="ml-1 h-8 w-auto" priority />
        <NavLinks pathname={pathname} />
        <UserBlock userName={userName} isPending={isPending} onLogout={handleLogout} />
      </aside>

      {/* Barra mobile — logo + botão de menu, abre o drawer */}
      <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3 md:hidden">
        <Image src="/espaco-fisio-logo-cropped.png" alt="Espaço Fisio" width={179} height={42} className="h-8 w-auto" priority />
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground hover:bg-muted"
        >
          <MenuIcon />
        </button>
      </div>

      {/* Drawer mobile — mesmo padrão de backdrop+painel de session-panel.tsx, abrindo pela esquerda */}
      {drawerOpen ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-foreground/30 md:hidden"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 flex w-full max-w-[260px] flex-col gap-6 bg-background p-4 shadow-xl md:hidden">
            <div className="flex items-center justify-between">
              <Image src="/espaco-fisio-logo-cropped.png" alt="Espaço Fisio" width={179} height={42} className="h-7 w-auto" priority />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Fechar menu"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-xl leading-none text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                ×
              </button>
            </div>
            <NavLinks pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
            <UserBlock userName={userName} isPending={isPending} onLogout={handleLogout} />
          </div>
        </>
      ) : null}
    </>
  );
}
