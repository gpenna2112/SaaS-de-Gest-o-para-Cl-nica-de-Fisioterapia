"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError, post } from "@/lib/api-client";

type SignInResponse = { redirect: boolean; token: string };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        await post<SignInResponse>("/api/auth/sign-in/email", {
          email,
          password,
        });
        router.push("/");
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

  return (
    <Card className="w-full max-w-sm">
      <h1 className="text-lg font-semibold">Entrar</h1>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
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
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </Card>
  );
}
