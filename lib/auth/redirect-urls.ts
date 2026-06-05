import { getAppUrl } from "@/lib/discord/oauth";

export function authConfirmUrl(next: string) {
  return `${getAppUrl()}/auth/confirm?next=${encodeURIComponent(next)}`;
}

export const INVITE_CONFIRM_URL = authConfirmUrl("/auth/accept-invite");
export const RESET_CONFIRM_URL = authConfirmUrl("/auth/update-password");
