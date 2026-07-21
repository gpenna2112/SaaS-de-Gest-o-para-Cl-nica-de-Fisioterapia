import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/modules/auth/session";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const sessionUser = await getSessionUser(requestHeaders);
  if (!sessionUser) {
    const currentPath = requestHeaders.get("x-pathname");
    const loginUrl =
      currentPath && currentPath !== "/"
        ? `/login?from=${encodeURIComponent(currentPath)}`
        : "/login";
    redirect(loginUrl);
  }

  return <AppShell user={sessionUser}>{children}</AppShell>;
}
