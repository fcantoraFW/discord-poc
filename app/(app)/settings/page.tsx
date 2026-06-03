import Link from "next/link";
import { requireProfile } from "@/lib/auth/profile";
import { Button } from "@/components/ui/button";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ discord?: string }>;
}) {
  const profile = await requireProfile();
  const params = await searchParams;
  const discordStatus = params.discord;

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-bold">Settings</h1>

      {discordStatus ? (
        <p className="text-sm rounded-md border p-3">
          Discord: <code>{discordStatus}</code>
        </p>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-semibold">Perfil</h2>
        <p className="text-sm text-muted-foreground">{profile.email}</p>
        <p className="text-sm">
          Rol: <code>{profile.role}</code>
        </p>
      </section>

      <section className="space-y-3 border rounded-lg p-4">
        <h2 className="font-semibold">Discord</h2>
        {profile.discord_user_id ? (
          <p className="text-sm">
            Conectado como{" "}
            <strong>{profile.discord_username ?? profile.discord_user_id}</strong>{" "}
            (<code>{profile.discord_user_id}</code>)
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Conectá tu cuenta para usar el bot en servidores vinculados.
          </p>
        )}
        <Button asChild>
          <Link href="/api/auth/discord/connect">
            {profile.discord_user_id ? "Reconectar Discord" : "Connect Discord"}
          </Link>
        </Button>
      </section>
    </div>
  );
}
