import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import type { Profile } from "@/lib/types/database";

export function AppNav({ profile }: { profile: Profile }) {
  return (
    <header className="border-b px-4 py-3 flex items-center justify-between gap-4">
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/" className="font-semibold">
          Flywheel PoC
        </Link>
        {profile.role === "superadmin" ? (
          <Link href="/admin" className="text-muted-foreground hover:text-foreground">
            Admin
          </Link>
        ) : null}
        {profile.role === "admin" ? (
          <Link href="/manage" className="text-muted-foreground hover:text-foreground">
            Gestionar
          </Link>
        ) : null}
        <Link href="/chat" className="text-muted-foreground hover:text-foreground">
          Chat
        </Link>
        <Link href="/settings" className="text-muted-foreground hover:text-foreground">
          Settings
        </Link>
      </nav>
      <LogoutButton />
    </header>
  );
}
