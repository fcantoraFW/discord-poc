export function getAuthErrorMessage(code: string): string {
  switch (code) {
    case "no_org":
      return "Tu cuenta no tiene una organización asignada. Pedí a un admin que te re-invite.";
    case "invite_incomplete":
      return "Tu invitación no está completa. Pedí a un admin que te re-invite.";
    default:
      return code;
  }
}
