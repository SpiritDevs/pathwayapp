import { useCallback, type ComponentType } from "react";
import {
  ArchiveIcon,
  BotIcon,
  CircleUserRoundIcon,
  GitBranchIcon,
  KeyboardIcon,
  Link2Icon,
  MailIcon,
  Settings2Icon,
  UsersIcon,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../ui/sidebar";

export type SettingsSectionPath =
  | "/settings/profile"
  | "/settings/account"
  | "/settings/general"
  | "/settings/keybindings"
  | "/settings/email"
  | "/settings/providers"
  | "/settings/source-control"
  | "/settings/connections"
  | "/settings/archived";

export const SETTINGS_NAV_ITEMS: ReadonlyArray<{
  label: string;
  to: SettingsSectionPath;
  icon: ComponentType<{ className?: string }>;
}> = [
  { label: "Profile", to: "/settings/profile", icon: CircleUserRoundIcon },
  { label: "Account & Teams", to: "/settings/account", icon: UsersIcon },
  { label: "General", to: "/settings/general", icon: Settings2Icon },
  { label: "Keybindings", to: "/settings/keybindings", icon: KeyboardIcon },
  { label: "Email", to: "/settings/email", icon: MailIcon },
  { label: "Providers", to: "/settings/providers", icon: BotIcon },
  { label: "Source Control", to: "/settings/source-control", icon: GitBranchIcon },
  { label: "Connections", to: "/settings/connections", icon: Link2Icon },
  { label: "Archive", to: "/settings/archived", icon: ArchiveIcon },
];

export function SettingsSidebarNav({ pathname }: { pathname: string }) {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const handleSectionClick = useCallback(
    (to: SettingsSectionPath) => {
      if (isMobile) {
        setOpenMobile(false);
      }
      void navigate({ to, replace: true });
    },
    [isMobile, navigate, setOpenMobile],
  );
  return (
    <SidebarContent className="mt-[38px] overflow-x-hidden">
      <SidebarGroup className="px-2 py-3">
        <SidebarMenu>
          {SETTINGS_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.to;
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  size="sm"
                  isActive={isActive}
                  className={
                    isActive
                      ? "gap-2.5 bg-accent px-2.5 py-2 text-left text-[13px] font-medium text-accent-foreground hover:bg-accent hover:text-accent-foreground"
                      : "gap-2.5 px-2.5 py-2 text-left text-[13px] text-muted-foreground/70 hover:bg-accent hover:text-accent-foreground"
                  }
                  onClick={() => handleSectionClick(item.to)}
                >
                  <Icon
                    className={
                      isActive
                        ? "size-4 shrink-0 text-foreground"
                        : "size-4 shrink-0 text-muted-foreground/60"
                    }
                  />
                  <span className="truncate">{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
  );
}
