export type InvitationDeliveryStatus = "sent" | "not_configured" | "failed";

export interface InvitationDeliveryConfig {
  readonly apiKey: string;
  readonly fromEmail: string;
}

export function invitationDeliveryConfig(
  environment: Readonly<Record<string, string | undefined>>,
): InvitationDeliveryConfig | null {
  const apiKey = environment.RESEND_API_KEY?.trim();
  const fromEmail = environment.PATHWAYOS_INVITE_FROM_EMAIL?.trim();
  return apiKey && fromEmail ? { apiKey, fromEmail } : null;
}

export async function deliverInvitation(
  config: InvitationDeliveryConfig | null,
  input: { readonly invitedEmail: string; readonly inviteUrl: string },
  fetchImplementation: typeof fetch = fetch,
): Promise<InvitationDeliveryStatus> {
  if (config === null) return "not_configured";
  try {
    const response = await fetchImplementation("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: config.fromEmail,
        to: [input.invitedEmail],
        subject: "You have been invited to a PathwayOS workspace",
        text: `Open this link to accept your PathwayOS workspace invitation: ${input.inviteUrl}`,
      }),
    });
    return response.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
