"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, post } from "@/lib/api-client";

type SignInResponse = { redirect: boolean; token: string };
type Mode = "signin" | "signup";

/**
 * Painel de marca (só ≥920px, replicando o breakpoint do mockup) + card
 * branco centralizado. `Suspense` acima de `LoginForm` (que usa
 * `useSearchParams`) também renderiza esta casca, para não trocar de
 * layout entre o fallback e o formulário carregado.
 */
function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen overflow-hidden bg-gradient-to-br from-teal-800 via-teal-900 to-teal-950">
      <div className="pointer-events-none absolute -top-44 -right-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(143,214,203,0.16)_0%,rgba(143,214,203,0)_70%)]" />
      <div className="relative hidden flex-[1.15] flex-col justify-between p-14 min-[920px]:flex">
        <div className="inline-flex w-fit items-center justify-center rounded-2xl bg-background px-6 py-4 shadow-xl">
          <Image src="/espaco-fisio-logo.png" alt="Espaço Fisio" width={140} height={53} className="h-9 w-auto" priority />
        </div>
        <div className="max-w-md">
          <p className="mb-3 font-mono text-xs font-bold tracking-[0.14em] text-teal-300 uppercase">Gestão de clínica</p>
          <h2 className="mb-4 text-3xl leading-tight font-bold tracking-tight text-white">
            Agenda, pacientes e equipe em um só lugar.
          </h2>
          <p className="text-[15px] leading-relaxed text-teal-100/80">
            Organize salas, confirme sessões e acompanhe cada paciente com clareza — do agendamento à evolução do
            tratamento.
          </p>
        </div>
        <p className="font-mono text-xs tracking-wide text-teal-400/70">agenda · pacientes · equipe · salas</p>
      </div>

      <div className="relative flex flex-1 min-w-0 items-center justify-center p-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-6">
          <div className="inline-flex items-center justify-center rounded-2xl bg-background px-6 py-4 shadow-xl min-[920px]:hidden">
            <Image src="/espaco-fisio-logo.png" alt="Espaço Fisio" width={112} height={42} className="h-8 w-auto" priority />
          </div>

          <div className="w-full rounded-3xl bg-background p-8 shadow-2xl">{children}</div>

          <p className="font-mono text-xs tracking-wide text-teal-300 min-[920px]:hidden">
            agenda · pacientes · equipe
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <LoginShell>
          <div className="h-40" />
        </LoginShell>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

/** Separado do default export: `useSearchParams` exige um limite de Suspense acima. */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const destination = from && from.startsWith("/") ? from : "/";
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        await post<SignInResponse>("/api/auth/sign-in/email", {
          email,
          password,
        });
        router.push(destination);
        router.refresh();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setError("E-mail ou senha inválidos.");
        } else {
          setError("Não foi possível entrar. Tente novamente.");
        }
      }
    });
  }

  function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        await post("/api/auth/sign-up/email", { email, password, name });
        router.push(destination);
        router.refresh();
      } catch {
        // O Better Auth substitui a causa real (hook de vínculo com
        // `professionals`, ADR-0017) por uma mensagem genérica antes de
        // responder — não dá pra distinguir "e-mail sem profissional
        // correspondente" de outras falhas a partir daqui.
        setError(
          "Não foi possível ativar o acesso. Confirme com a gestora da clínica se este e-mail já está cadastrado como profissional, ou tente entrar se já tiver ativado antes.",
        );
      }
    });
  }

  function toggleMode() {
    setError(null);
    setMode((current) => (current === "signin" ? "signup" : "signin"));
  }

  return (
    <LoginShell>
      <h1 className="text-xl font-extrabold tracking-tight">
        {mode === "signin" ? "Entrar" : "Ativar acesso"}
      </h1>
      {mode === "signup" ? (
        <p className="mt-1.5 text-sm text-muted-foreground">
          Use o e-mail que a gestora da clínica já cadastrou para você.
        </p>
      ) : (
        <p className="mt-1.5 text-sm text-muted-foreground">Bem-vindo de volta. Acesse sua conta para continuar.</p>
      )}
      <form
        onSubmit={mode === "signin" ? handleSignIn : handleSignUp}
        className="mt-5 flex flex-col gap-4"
      >
        {mode === "signup" ? (
          <Input
            id="name"
            label="Nome"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        ) : null}
        <Input
          id="email"
          label="E-mail"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          id="password"
          label="Senha"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error ? (
          <p role="alert" aria-live="polite" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={isPending}>
          {isPending
            ? "Enviando..."
            : mode === "signin"
              ? "Entrar"
              : "Ativar acesso"}
        </Button>
      </form>

      <div className="mt-6 mb-1 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">ou</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <button
        type="button"
        onClick={toggleMode}
        className="mt-3.5 w-full text-center text-sm text-muted-foreground hover:text-foreground"
      >
        {mode === "signin"
          ? "Primeiro acesso? Ative sua conta"
          : "Já ativou o acesso? Entrar"}
      </button>
    </LoginShell>
  );
}
