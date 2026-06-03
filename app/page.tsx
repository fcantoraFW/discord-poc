import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/profile";

export default async function Home() {
  const profile = await getProfile();
  if (!profile) {
    redirect("/auth/login");
  }
  if (profile.role === "superadmin") {
    redirect("/admin");
  }
  redirect("/chat");
}
