import { useAtomValue } from "@effect/atom-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import {
  isChatSurfacePathname,
  isEmailSurfacePathname,
  shouldShowSecondarySidebar,
} from "../appNavRoutes";
import { isElectron } from "../env";
import { resolveShortcutCommand, shortcutLabelForCommand } from "../keybindings";
import { isMacPlatform } from "../lib/utils";
import { primaryServerKeybindingsAtom } from "../state/server";
import ThreadSidebar from "./Sidebar";
import { Sidebar, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar } from "./ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const THREAD_SIDEBAR_WIDTH_STORAGE_KEY = "chat_thread_sidebar_width";
const THREAD_SIDEBAR_MIN_WIDTH = 20 * 16;
const THREAD_MAIN_CONTENT_MIN_WIDTH = 40 * 16;
const MACOS_TRAFFIC_LIGHTS_LEFT_INSET = "90px";
const THREAD_SIDEBAR_DEFAULT_WIDTH = "20.5rem";
const THREAD_SIDEBAR_APP_NAV_RAIL_WIDTH = "62px";
const SIDEBAR_CONTROL_DEFAULT_LEFT = "calc(var(--app-nav-rail-width) + 0.25rem)";
const SIDEBAR_CONTROL_MACOS_WINDOWED_LEFT =
  "max(calc(var(--app-nav-rail-width) + 0.25rem), var(--workspace-titlebar-content-left))";

function SidebarControl() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const { toggleSidebar } = useSidebar();
  const shortcutLabel = shortcutLabelForCommand(keybindings, "sidebar.toggle");
  const showSecondarySidebar = shouldShowSecondarySidebar(pathname);

  useEffect(() => {
    if (!showSecondarySidebar) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (resolveShortcutCommand(event, keybindings) !== "sidebar.toggle") return;

      event.preventDefault();
      event.stopPropagation();
      toggleSidebar();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [keybindings, showSecondarySidebar, toggleSidebar]);

  if (!showSecondarySidebar) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed left-[var(--workspace-sidebar-control-left)] top-[var(--workspace-controls-top)] z-50 flex h-[var(--workspace-topbar-height)] items-center transition-[left] duration-200 ease-linear"
      data-sidebar-control=""
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarTrigger className="pointer-events-auto" aria-label="Toggle main sidebar" />
          }
        />
        <TooltipPopup side="bottom">
          Toggle main sidebar{shortcutLabel ? ` (${shortcutLabel})` : ""}
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}

export function AppSidebarLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const showChatSidebar = isChatSurfacePathname(pathname);
  const showEmailSidebar = isEmailSurfacePathname(pathname);
  const showResizableSecondarySidebar = showChatSidebar || showEmailSidebar;
  const hasMacosElectronWindowControls = isElectron && isMacPlatform(navigator.platform);
  const [macosWindowControlsVisible, setMacosWindowControlsVisible] = useState(
    hasMacosElectronWindowControls,
  );
  const sidebarWidth = shouldShowSecondarySidebar(pathname)
    ? THREAD_SIDEBAR_DEFAULT_WIDTH
    : THREAD_SIDEBAR_APP_NAV_RAIL_WIDTH;
  const macosWindowControlsStyle = hasMacosElectronWindowControls
    ? ({
        "--workspace-controls-left": MACOS_TRAFFIC_LIGHTS_LEFT_INSET,
        "--workspace-sidebar-control-left": macosWindowControlsVisible
          ? SIDEBAR_CONTROL_MACOS_WINDOWED_LEFT
          : SIDEBAR_CONTROL_DEFAULT_LEFT,
        "--sidebar-width": sidebarWidth,
        "--app-nav-rail-width": THREAD_SIDEBAR_APP_NAV_RAIL_WIDTH,
      } as CSSProperties)
    : ({
        "--workspace-sidebar-control-left": SIDEBAR_CONTROL_DEFAULT_LEFT,
        "--sidebar-width": sidebarWidth,
        "--app-nav-rail-width": THREAD_SIDEBAR_APP_NAV_RAIL_WIDTH,
      } as CSSProperties);

  useEffect(() => {
    if (!hasMacosElectronWindowControls) {
      setMacosWindowControlsVisible(false);
      return;
    }

    setMacosWindowControlsVisible(true);
    return window.desktopBridge?.onNativeWindowControlsVisibilityChange?.((visible) => {
      setMacosWindowControlsVisible(visible);
    });
  }, [hasMacosElectronWindowControls]);

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action === "open-settings") {
        void navigate({ to: "/settings" });
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigate]);

  useEffect(() => {
    if (showResizableSecondarySidebar || typeof document === "undefined") {
      return;
    }
    document
      .querySelector<HTMLElement>("[data-slot='sidebar-wrapper']")
      ?.style.setProperty("--sidebar-width", sidebarWidth);
  }, [showResizableSecondarySidebar, sidebarWidth]);

  return (
    <SidebarProvider className="h-dvh! min-h-0!" defaultOpen style={macosWindowControlsStyle}>
      <Sidebar
        side="left"
        collapsible="icon"
        className="border-r border-border bg-card text-foreground"
        resizable={
          showResizableSecondarySidebar
            ? {
                minWidth: THREAD_SIDEBAR_MIN_WIDTH,
                shouldAcceptWidth: ({ nextWidth, wrapper }) =>
                  wrapper.clientWidth - nextWidth >= THREAD_MAIN_CONTENT_MIN_WIDTH,
                storageKey: THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
              }
            : false
        }
      >
        <ThreadSidebar />
        <SidebarRail />
      </Sidebar>
      {children}
      <SidebarControl />
    </SidebarProvider>
  );
}
