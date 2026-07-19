import { Nav } from "@/components/nav";
import type { SessionUser } from "@/modules/auth/session";

export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Nav userName={user.name} />
      <main className="flex-1 p-4 pb-20 md:pb-4">{children}</main>
    </div>
  );
}
