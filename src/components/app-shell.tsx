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
      <main className="min-w-0 flex-1 bg-[#fbfbfb] p-4 md:px-8 md:py-7">{children}</main>
    </div>
  );
}
