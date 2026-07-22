"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError, post } from "@/lib/api-client";

type SignInResponse = { redirect: boolean; token: string };
type Mode = "signin" | "signup";

export default function LoginPage() {
  return (
    <Suspense fallback={<Card className="w-full max-w-sm" />}>
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
    <Card className="w-full max-w-sm">
      <h1 className="text-lg font-semibold">
        {mode === "signin" ? "Entrar" : "Ativar acesso"}
      </h1>
      {mode === "signup" ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Use o e-mail que a gestora da clínica já cadastrou para você.
        </p>
      ) : null}
      <form
        onSubmit={mode === "signin" ? handleSignIn : handleSignUp}
        className="mt-4 flex flex-col gap-4"
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
      <button
        type="button"
        onClick={toggleMode}
        className="mt-4 text-sm text-muted-foreground hover:text-foreground"
      >
        {mode === "signin"
          ? "Primeiro acesso? Ative sua conta"
          : "Já ativou o acesso? Entrar"}
      </button>
    </Card>
  );
}
