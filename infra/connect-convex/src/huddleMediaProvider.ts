export interface HuddleParticipantToken {
  readonly provider: "cloudflare-realtimekit";
  readonly meetingId: string;
  readonly participantId: string;
  readonly token: string;
}

export interface HuddleMediaProvider {
  readonly createMeeting: (input: {
    readonly title: string;
  }) => Promise<{ readonly meetingId: string }>;
  readonly addParticipant: (input: {
    readonly meetingId: string;
    readonly userId: string;
    readonly displayName: string;
    readonly presetName: string;
  }) => Promise<HuddleParticipantToken>;
  readonly refreshParticipant: (input: {
    readonly meetingId: string;
    readonly participantId: string;
  }) => Promise<HuddleParticipantToken>;
}

export interface CloudflareRealtimeKitConfig {
  readonly accountId: string;
  readonly appId: string;
  readonly apiToken: string;
}

export function cloudflareRealtimeKitBaseUrl(config: CloudflareRealtimeKitConfig): string {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/realtime/kit/${encodeURIComponent(config.appId)}`;
}
