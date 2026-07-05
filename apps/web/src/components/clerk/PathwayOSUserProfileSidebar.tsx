import { useAuth, useClerk, useUser } from "@clerk/react";
import type { ServerProvider } from "@pathwayos/contracts";
import { useAtomValue } from "@effect/atom-react";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CircleUserRoundIcon,
  CloudOffIcon,
  GaugeIcon,
  LogInIcon,
  LogOutIcon,
  RefreshCwIcon,
  SettingsIcon,
  SmartphoneIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";

import { FREE_PLAN_LABEL, SIGN_IN_ROUTE } from "~/authRoutes";
import { hasClerkPublicConfig } from "~/cloud/publicConfig";
import {
  deriveCodexRateLimitSnapshotFromPayload,
  deriveLatestCodexRateLimitSnapshot,
  deriveLatestContextWindowSnapshot,
  type CodexRateLimitSnapshot,
  formatContextWindowTokens,
  type ContextWindowSnapshot,
} from "~/lib/contextWindow";
import { cn } from "~/lib/utils";
import { applyProviderInstanceSettings, deriveProviderInstanceEntries } from "~/providerInstances";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { usePrimaryEnvironment } from "~/state/environments";
import { primaryServerProvidersAtom, serverEnvironment } from "~/state/server";
import { useThreadActivities } from "~/state/entities";
import { environmentThreads } from "~/state/threads";
import { resolveThreadRouteRef } from "~/threadRoutes";
import { usePrimarySettings } from "~/hooks/useSettings";
import { useAtomCommand } from "~/state/use-atom-command";
import { Collapsible, CollapsiblePanel } from "../ui/collapsible";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuShortcut, MenuTrigger } from "../ui/menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "../ui/sidebar";
import { Skeleton } from "../ui/skeleton";

export interface PathwayOSAccountView {
  readonly email: string;
  readonly initial: string;
  readonly imageUrl: string | null;
  readonly planLabel: string;
}

export interface PathwayOSUsageRemainingView {
  readonly hasEnabledProvider: boolean;
  readonly contextWindow: ContextWindowSnapshot | null;
  readonly rateLimits: CodexRateLimitSnapshot | null;
  readonly isRefreshing: boolean;
}

interface ClerkUserLike {
  readonly firstName?: string | null;
  readonly fullName?: string | null;
  readonly imageUrl?: string | null;
  readonly primaryEmailAddress?: { readonly emailAddress?: string | null } | null;
  readonly emailAddresses?: ReadonlyArray<{ readonly emailAddress?: string | null }> | null;
}

interface ProviderEnabledSettingsSnapshot {
  readonly providers: Readonly<Record<string, { readonly enabled?: boolean } | undefined>>;
  readonly providerInstances?: Readonly<Record<string, { readonly enabled?: boolean } | undefined>>;
}

function hasEnabledProviderSettings(settings: ProviderEnabledSettingsSnapshot): boolean {
  return (
    Object.values(settings.providers).some((provider) => provider?.enabled === true) ||
    Object.values(settings.providerInstances ?? {}).some(
      (provider) => provider !== undefined && provider.enabled !== false,
    )
  );
}

function deriveProviderRateLimitSnapshot(
  serverProviders: ReadonlyArray<ServerProvider>,
): CodexRateLimitSnapshot | null {
  let latest: CodexRateLimitSnapshot | null = null;
  for (const provider of serverProviders) {
    if (provider.driver !== "codex" || !provider.rateLimits) {
      continue;
    }
    const snapshot = deriveCodexRateLimitSnapshotFromPayload(
      provider.rateLimits,
      provider.checkedAt,
    );
    if (!snapshot) {
      continue;
    }
    if (!latest || snapshot.updatedAt > latest.updatedAt) {
      latest = snapshot;
    }
  }
  return latest;
}

export function resolvePathwayOSAccountView(user: ClerkUserLike | null | undefined) {
  const email =
    user?.primaryEmailAddress?.emailAddress?.trim() ||
    user?.emailAddresses?.find((entry) => entry.emailAddress?.trim())?.emailAddress?.trim() ||
    "pathwayOS account";
  const firstTextValue = user?.firstName?.trim() || user?.fullName?.trim() || email;
  const initial = firstTextValue.slice(0, 1).toLocaleUpperCase() || "P";

  return {
    email,
    initial,
    imageUrl: user?.imageUrl?.trim() || null,
    planLabel: FREE_PLAN_LABEL,
  } satisfies PathwayOSAccountView;
}

export function PathwayOSCloudUnavailableSidebarAccount({
  onOpenSettings,
}: {
  readonly onOpenSettings: () => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1">
      <SidebarMenu className="min-w-0">
        <SidebarMenuItem>
          <SidebarMenuButton
            aria-disabled="true"
            disabled
            size="sm"
            className="gap-2 px-2 py-1.5 text-muted-foreground/70 transition-colors"
          >
            <CloudOffIcon className="size-3.5" />
            <span className="min-w-0 flex-1 truncate text-xs">Account unavailable</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <SidebarMenu className="min-w-0">
        <SidebarMenuItem>
          <SidebarMenuButton
            aria-label="Open settings"
            size="sm"
            className="px-2 py-1.5 text-muted-foreground/70 transition-colors hover:bg-sidebar-accent/70 hover:text-foreground"
            onClick={onOpenSettings}
          >
            <SettingsIcon className="size-3.5" />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </div>
  );
}

export function PathwayOSSignedOutSidebarAccount({
  onOpenSettings,
  onSignIn,
  variant = "sidebar",
}: {
  readonly onOpenSettings: () => void;
  readonly onSignIn: () => void;
  readonly variant?: "sidebar" | "rail";
}) {
  if (variant === "rail") {
    return (
      <button
        aria-label="Sign in to pathwayOS"
        className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-muted-foreground/70 outline-none ring-ring transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:ring-2"
        type="button"
        onClick={onSignIn}
      >
        <LogInIcon className="size-4" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1">
      <SidebarMenu className="min-w-0">
        <SidebarMenuItem>
          <SidebarMenuButton
            size="sm"
            className="gap-2 px-2 py-1.5 text-muted-foreground/70 transition-colors hover:bg-sidebar-accent/70 hover:text-foreground"
            onClick={onSignIn}
          >
            <LogInIcon className="size-3.5" />
            <span className="min-w-0 flex-1 truncate text-xs">Sign in</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <SidebarMenu className="min-w-0">
        <SidebarMenuItem>
          <SidebarMenuButton
            aria-label="Open settings"
            size="sm"
            className="px-2 py-1.5 text-muted-foreground/70 transition-colors hover:bg-sidebar-accent/70 hover:text-foreground"
            onClick={onOpenSettings}
          >
            <SettingsIcon className="size-3.5" />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </div>
  );
}

export function PathwayOSSignedInSidebarAccount({
  account,
  onOpenAccountProfile,
  onOpenProviders,
  onOpenProfile,
  onOpenSettings,
  onRefreshUsage,
  onSignOut,
  profileControl,
  variant = "sidebar",
  usageRemaining,
}: {
  readonly account: PathwayOSAccountView;
  readonly onOpenAccountProfile: () => void;
  readonly onOpenProviders?: () => void;
  readonly onOpenProfile: () => void;
  readonly onOpenSettings: () => void;
  readonly onRefreshUsage?: () => void;
  readonly onSignOut: () => void;
  readonly profileControl?: ReactNode;
  readonly variant?: "sidebar" | "rail";
  readonly usageRemaining?: PathwayOSUsageRemainingView;
}) {
  const [isUsageExpanded, setIsUsageExpanded] = useState(false);
  const hasEnabledProvider = usageRemaining?.hasEnabledProvider ?? true;
  const contextWindow = usageRemaining?.contextWindow ?? null;
  const rateLimits = usageRemaining?.rateLimits ?? null;
  const isRefreshingUsage = usageRemaining?.isRefreshing ?? false;
  const remainingPercentage =
    contextWindow?.remainingPercentage !== null && contextWindow?.remainingPercentage !== undefined
      ? `${Math.round(contextWindow.remainingPercentage)}%`
      : null;
  const usedPercentage =
    contextWindow?.usedPercentage !== null && contextWindow?.usedPercentage !== undefined
      ? `${Math.round(contextWindow.usedPercentage)}%`
      : null;
  const usageButtonLabel = hasEnabledProvider ? "Usage remaining" : "Enable provider to view usage";
  const isRailVariant = variant === "rail";
  const menuTrigger = isRailVariant ? (
    <button
      aria-label={`Open account menu for ${account.email}`}
      className="group/account flex size-11 cursor-pointer items-center justify-center rounded-lg outline-none ring-ring transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 data-popup-open:bg-accent"
      type="button"
    />
  ) : (
    <button
      aria-label={`Open account menu for ${account.email}`}
      className="group/account grid min-w-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-lg px-2 py-2 text-left outline-none ring-ring transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 data-popup-open:bg-accent"
      type="button"
    />
  );

  return (
    <div
      className={
        isRailVariant
          ? "flex w-full justify-center"
          : "grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-1"
      }
    >
      <Menu>
        <MenuTrigger render={menuTrigger}>
          {isRailVariant ? (
            <PathwayOSAccountAvatar
              account={account}
              avatarClassName="size-8"
              profileControl={profileControl}
            />
          ) : (
            <>
              <PathwayOSAccountAvatar account={account} profileControl={profileControl} />
              <div className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-foreground">
                  {account.email}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {account.planLabel}
                </span>
              </div>
            </>
          )}
        </MenuTrigger>
        <MenuPopup align="start" side="top" sideOffset={8} className="w-64">
          {isRailVariant ? (
            <div className="flex items-center gap-2 p-1">
              <button
                aria-label={`Open account profile for ${account.email}`}
                className="grid min-w-0 flex-1 cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-lg px-2 py-2 text-left outline-none ring-ring transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2"
                type="button"
                onClick={onOpenProfile}
              >
                <PathwayOSAccountAvatar account={account} profileControl={profileControl} />
                <div className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-foreground">
                    {account.email}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {account.planLabel}
                  </span>
                </div>
              </button>
              <button
                aria-label="Open account profile"
                className="flex h-12 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground/65 outline-none ring-ring transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:ring-2"
                type="button"
                onClick={onOpenAccountProfile}
              >
                <SmartphoneIcon className="size-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="px-2 py-1.5">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <PathwayOSAccountAvatar account={account} avatarClassName="size-5 text-[11px]" />
                <span className="min-w-0 truncate">{account.email}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-muted-foreground text-sm">
                <SettingsIcon className="size-4 shrink-0 opacity-80" aria-hidden="true" />
                <span>{account.planLabel} account</span>
              </div>
            </div>
          )}
          <MenuSeparator />
          <MenuItem className="cursor-pointer" onClick={onOpenProfile}>
            <CircleUserRoundIcon />
            Profile
          </MenuItem>
          <MenuItem className="cursor-pointer" onClick={onOpenSettings}>
            <SettingsIcon />
            Settings
            <MenuShortcut>⌘,</MenuShortcut>
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            closeOnClick={!hasEnabledProvider}
            className="cursor-pointer justify-between"
            onClick={(event) => {
              if (!hasEnabledProvider) {
                onOpenProviders?.();
                return;
              }
              event.preventDefault();
              if (!isUsageExpanded && !rateLimits && !contextWindow) {
                onRefreshUsage?.();
              }
              setIsUsageExpanded((expanded) => !expanded);
            }}
          >
            <GaugeIcon />
            <span className="min-w-0 flex-1">{usageButtonLabel}</span>
            {hasEnabledProvider ? (
              <ChevronDownIcon
                className={cn(
                  "ms-auto transition-transform",
                  isUsageExpanded ? "rotate-0" : "-rotate-90",
                )}
              />
            ) : (
              <ChevronRightIcon className="ms-auto" />
            )}
          </MenuItem>
          <Collapsible open={isUsageExpanded}>
            <CollapsiblePanel className="transition-[height,opacity] duration-200 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-open:opacity-100 motion-reduce:transition-none">
              {rateLimits ? (
                <div className="grid gap-2 px-2 pt-1 pb-2 text-sm">
                  {rateLimits.primary ? (
                    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 pl-6">
                      <span className="font-medium text-foreground">
                        {rateLimits.primary.label}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {Math.round(rateLimits.primary.remainingPercent)}%
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {rateLimits.primary.resetLabel ?? "-"}
                      </span>
                    </div>
                  ) : null}
                  {rateLimits.secondary ? (
                    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 pl-6">
                      <span className="font-medium text-foreground">
                        {rateLimits.secondary.label}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {Math.round(rateLimits.secondary.remainingPercent)}%
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {rateLimits.secondary.resetLabel ?? "-"}
                      </span>
                    </div>
                  ) : null}
                  {rateLimits.individualLimit ? (
                    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 pl-6">
                      <span className="font-medium text-foreground">Spend limit</span>
                      <span className="text-muted-foreground tabular-nums">
                        {Math.round(rateLimits.individualLimit.remainingPercent)}%
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {rateLimits.individualLimit.resetLabel ?? "-"}
                      </span>
                    </div>
                  ) : null}
                  <button
                    className="grid cursor-pointer grid-cols-[1fr_auto] items-center rounded-sm py-1 pr-1 pl-6 text-left text-foreground outline-none ring-ring transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 disabled:cursor-wait disabled:text-muted-foreground"
                    type="button"
                    disabled={isRefreshingUsage}
                    onClick={onRefreshUsage}
                  >
                    <span>{isRefreshingUsage ? "Refreshing usage" : "Refresh usage"}</span>
                    <RefreshCwIcon
                      className={cn(
                        "size-4 text-muted-foreground",
                        isRefreshingUsage && "animate-spin",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                </div>
              ) : contextWindow ? (
                <div className="grid gap-2 px-2 pt-1 pb-2 text-sm">
                  <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 pl-6">
                    <span className="font-medium text-foreground">Context left</span>
                    <span className="text-muted-foreground tabular-nums">
                      {remainingPercentage ?? "-"}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatContextWindowTokens(contextWindow.remainingTokens)}
                    </span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 pl-6">
                    <span className="font-medium text-foreground">Context used</span>
                    <span className="text-muted-foreground tabular-nums">
                      {usedPercentage ?? "-"}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatContextWindowTokens(contextWindow.usedTokens)}
                      {contextWindow.maxTokens != null
                        ? `/${formatContextWindowTokens(contextWindow.maxTokens)}`
                        : ""}
                    </span>
                  </div>
                  {contextWindow.totalProcessedTokens != null ? (
                    <div className="grid grid-cols-[1fr_auto] items-center gap-3 pl-6">
                      <span className="font-medium text-foreground">Total processed</span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatContextWindowTokens(contextWindow.totalProcessedTokens)}
                      </span>
                    </div>
                  ) : null}
                  <button
                    className="grid cursor-pointer grid-cols-[1fr_auto] items-center rounded-sm py-1 pr-1 pl-6 text-left text-foreground outline-none ring-ring transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2"
                    type="button"
                    onClick={onOpenProviders}
                  >
                    <span>Provider settings</span>
                    <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className="grid gap-2 px-2 pt-1 pb-2 text-sm">
                  <button
                    className="grid cursor-pointer grid-cols-[1fr_auto] items-center rounded-sm py-1 pr-1 pl-6 text-left text-foreground outline-none ring-ring transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 disabled:cursor-wait disabled:text-muted-foreground"
                    type="button"
                    disabled={isRefreshingUsage}
                    onClick={onRefreshUsage}
                  >
                    <span>{isRefreshingUsage ? "Refreshing usage" : "Refresh usage"}</span>
                    <RefreshCwIcon
                      className={cn(
                        "size-4 text-muted-foreground",
                        isRefreshingUsage && "animate-spin",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    className="grid cursor-pointer grid-cols-[1fr_auto] items-center rounded-sm py-1 pr-1 pl-6 text-left text-foreground outline-none ring-ring transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2"
                    type="button"
                    onClick={onOpenProviders}
                  >
                    <span>Provider settings</span>
                    <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                  </button>
                </div>
              )}
            </CollapsiblePanel>
          </Collapsible>
          <MenuItem className="cursor-pointer" onClick={onSignOut}>
            <LogOutIcon />
            Log out
          </MenuItem>
        </MenuPopup>
      </Menu>
      {!isRailVariant ? (
        <button
          aria-label="Open account profile"
          className="flex w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground/65 outline-none ring-ring transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:ring-2"
          type="button"
          onClick={onOpenAccountProfile}
        >
          <SmartphoneIcon className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function PathwayOSAccountAvatar({
  account,
  avatarClassName,
  profileControl,
}: {
  readonly account: PathwayOSAccountView;
  readonly avatarClassName?: string;
  readonly profileControl?: ReactNode;
}) {
  if (profileControl !== undefined) {
    return (
      <div className={cn("flex size-9 items-center justify-center", avatarClassName)}>
        {profileControl}
      </div>
    );
  }

  if (account.imageUrl) {
    return (
      <img
        alt=""
        className={cn("size-9 rounded-full object-cover", avatarClassName)}
        src={account.imageUrl}
      />
    );
  }

  return (
    <span
      className={cn(
        "flex size-9 items-center justify-center rounded-full bg-primary/12 font-semibold text-primary text-sm",
        avatarClassName,
      )}
      aria-hidden="true"
    >
      {account.initial}
    </span>
  );
}

export function PathwayOSSidebarAccountSkeleton() {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-2">
      <Skeleton className="size-8 rounded-full" />
      <div className="space-y-1.5">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-12" />
      </div>
      <Skeleton className="size-4 rounded" />
    </div>
  );
}

export function PathwayOSMainSidebarAccount({
  variant = "sidebar",
}: {
  readonly variant?: "sidebar" | "rail";
}) {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const closeMobileSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);
  const openSettings = useCallback(() => {
    closeMobileSidebar();
    void navigate({ to: "/settings/general" });
  }, [closeMobileSidebar, navigate]);
  const openProviders = useCallback(() => {
    closeMobileSidebar();
    void navigate({ to: "/settings/providers" });
  }, [closeMobileSidebar, navigate]);
  const signIn = useCallback(() => {
    closeMobileSidebar();
    void navigate({ to: SIGN_IN_ROUTE });
  }, [closeMobileSidebar, navigate]);

  if (!hasClerkPublicConfig()) {
    if (variant === "rail") {
      return (
        <button
          aria-label="Open settings"
          className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-muted-foreground/70 outline-none ring-ring transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:ring-2"
          type="button"
          onClick={openSettings}
        >
          <SettingsIcon className="size-4" aria-hidden="true" />
        </button>
      );
    }

    return <PathwayOSCloudUnavailableSidebarAccount onOpenSettings={openSettings} />;
  }

  return (
    <ConfiguredPathwayOSMainSidebarAccount
      onOpenProviders={openProviders}
      onOpenSettings={openSettings}
      onSignIn={signIn}
      variant={variant}
    />
  );
}

function ConfiguredPathwayOSMainSidebarAccount({
  onOpenProviders,
  onOpenSettings,
  onSignIn,
  variant,
}: {
  readonly onOpenProviders: () => void;
  readonly onOpenSettings: () => void;
  readonly onSignIn: () => void;
  readonly variant: "sidebar" | "rail";
}) {
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { user } = useUser();
  const clerk = useClerk();
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const primaryEnvironment = usePrimaryEnvironment();
  const settings = usePrimarySettings();
  const serverProviders = useAtomValue(primaryServerProvidersAtom);
  const refreshServerProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const routeThreadRef = useParams({
    strict: false,
    select: (params) => resolveThreadRouteRef(params),
  });
  const activeThreadActivities = useThreadActivities(routeThreadRef);
  const [isRefreshingUsage, setIsRefreshingUsage] = useState(false);
  const usageRemaining = useMemo<PathwayOSUsageRemainingView>(() => {
    const configuredProviders = applyProviderInstanceSettings(
      deriveProviderInstanceEntries(serverProviders),
      settings,
    );
    const activityRateLimits = deriveLatestCodexRateLimitSnapshot(activeThreadActivities);
    const providerRateLimits = deriveProviderRateLimitSnapshot(serverProviders);
    return {
      hasEnabledProvider:
        configuredProviders.length > 0
          ? configuredProviders.some((provider) => provider.enabled)
          : hasEnabledProviderSettings(settings),
      contextWindow: deriveLatestContextWindowSnapshot(activeThreadActivities),
      rateLimits: activityRateLimits ?? providerRateLimits,
      isRefreshing: isRefreshingUsage,
    };
  }, [activeThreadActivities, isRefreshingUsage, serverProviders, settings]);
  const refreshUsage = useCallback(() => {
    if (isRefreshingUsage) return;
    setIsRefreshingUsage(true);
    if (routeThreadRef) {
      appAtomRegistry.refresh(
        environmentThreads.stateAtom(routeThreadRef.environmentId, routeThreadRef.threadId),
      );
    }

    const refreshProviders =
      primaryEnvironment === null
        ? Promise.resolve()
        : refreshServerProviders({
            environmentId: primaryEnvironment.environmentId,
            input: {},
          }).then(() => undefined);

    void refreshProviders.finally(() => {
      setTimeout(() => setIsRefreshingUsage(false), 250);
    });
  }, [isRefreshingUsage, primaryEnvironment, refreshServerProviders, routeThreadRef]);
  const openProfile = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/settings/profile" });
  }, [isMobile, navigate, setOpenMobile]);
  const signOut = useCallback(() => {
    void clerk.signOut();
  }, [clerk]);

  if (!isLoaded) {
    if (variant === "rail") {
      return <Skeleton className="size-8 rounded-full" />;
    }

    return <PathwayOSSidebarAccountSkeleton />;
  }

  if (!isSignedIn || !user) {
    return (
      <PathwayOSSignedOutSidebarAccount
        onOpenSettings={onOpenSettings}
        onSignIn={onSignIn}
        variant={variant}
      />
    );
  }

  return (
    <PathwayOSSignedInSidebarAccount
      account={resolvePathwayOSAccountView(user)}
      onOpenAccountProfile={openProfile}
      onOpenProviders={onOpenProviders}
      onOpenProfile={openProfile}
      onOpenSettings={onOpenSettings}
      onRefreshUsage={refreshUsage}
      onSignOut={signOut}
      usageRemaining={usageRemaining}
      variant={variant}
    />
  );
}

export function PathwayOSConnectSidebarSignIn() {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const signIn = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: SIGN_IN_ROUTE });
  }, [isMobile, navigate, setOpenMobile]);

  if (!hasClerkPublicConfig()) return null;

  return <ConfiguredPathwayOSConnectSidebarSignIn onSignIn={signIn} />;
}

function ConfiguredPathwayOSConnectSidebarSignIn({ onSignIn }: { readonly onSignIn: () => void }) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded || isSignedIn) return null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="sm"
          className="gap-2 px-2 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={onSignIn}
        >
          <LogInIcon className="size-4" />
          <span>Sign in to pathwayOS</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function PathwayOSConnectSidebarAvatar() {
  if (!hasClerkPublicConfig()) return null;

  return <ConfiguredPathwayOSConnectSidebarAvatar />;
}

function ConfiguredPathwayOSConnectSidebarAvatar() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const navigate = useNavigate();

  const openProfile = useCallback(() => {
    void navigate({ to: "/settings/profile" });
  }, [navigate]);

  if (!isLoaded || !isSignedIn || !user) return null;

  return (
    <button
      aria-label="Open profile settings"
      className="flex size-9 cursor-pointer items-center justify-center rounded-lg outline-none ring-ring transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2"
      type="button"
      onClick={openProfile}
    >
      <PathwayOSAccountAvatar
        account={resolvePathwayOSAccountView(user)}
        avatarClassName="size-7"
      />
    </button>
  );
}
