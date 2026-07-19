"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { post } from "@/lib/api-client";

const links = [
  { href: "/pacientes", label: "Pacientes" },
  { href: "/agenda", label: "Agenda" },
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
      <nav className="hidden md:flex md:w-56 md:shrink-0 md:flex-col md:justify-between md:border-r md:border-border md:p-4">
        <div className="flex flex-col gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                pathname.startsWith(link.href)
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <span className="truncate text-sm text-muted-foreground">
            {userName}
          </span>
          <Button
            variant="secondary"
            onClick={handleLogout}
            disabled={isPending}
          >
            Sair
          </Button>
        </div>
      </nav>
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-background md:hidden">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex-1 py-3 text-center text-sm font-medium ${
              pathname.startsWith(link.href)
                ? "text-primary"
                : "text-muted-foreground"
            }`}
          >
            {link.label}
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
