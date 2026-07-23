import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ComingSoon } from "@/components/coming-soon";
import { getSessionUser } from "@/modules/auth/session";

export default async function RelatoriosPage() {
  const sessionUser = await getSessionUser(await headers());
  if (!sessionUser) {
    redirect("/login");
  }

  return <ComingSoon label="Relatórios" />;
}
