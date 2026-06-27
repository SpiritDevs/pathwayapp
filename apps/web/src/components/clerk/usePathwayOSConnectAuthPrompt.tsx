import { useClerk } from "@clerk/react";

export function usePathwayOSConnectAuthPrompt() {
  const clerk = useClerk();
  const openAuthPrompt = () => {
    clerk.openWaitlist();
  };
  return { authPrompt: null, openAuthPrompt };
}
