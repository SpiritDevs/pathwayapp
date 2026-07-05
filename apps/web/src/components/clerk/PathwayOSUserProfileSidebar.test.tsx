import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { FREE_PLAN_LABEL } from "~/authRoutes";
import { SidebarProvider } from "../ui/sidebar";
import {
  PathwayOSCloudUnavailableSidebarAccount,
  PathwayOSSignedInSidebarAccount,
  PathwayOSSignedOutSidebarAccount,
  resolvePathwayOSAccountView,
} from "./PathwayOSUserProfileSidebar";

function renderSidebarAccount(node: ReactNode) {
  return renderToStaticMarkup(<SidebarProvider>{node}</SidebarProvider>);
}

describe("PathwayOS sidebar account", () => {
  it("uses the primary Clerk email and temporary Free plan label", () => {
    expect(
      resolvePathwayOSAccountView({
        firstName: "Corey",
        imageUrl: "https://example.com/avatar.png",
        primaryEmailAddress: { emailAddress: "corey@example.com" },
      }),
    ).toEqual({
      email: "corey@example.com",
      imageUrl: "https://example.com/avatar.png",
      initial: "C",
      planLabel: FREE_PLAN_LABEL,
    });
  });

  it("renders a signed-out sign-in action with settings still reachable", () => {
    const html = renderSidebarAccount(
      <PathwayOSSignedOutSidebarAccount onOpenSettings={vi.fn()} onSignIn={vi.fn()} />,
    );

    expect(html).toContain("Sign in");
    expect(html).toContain("Open settings");
  });

  it("keeps a no-Clerk settings affordance when cloud config is unavailable", () => {
    const html = renderSidebarAccount(
      <PathwayOSCloudUnavailableSidebarAccount onOpenSettings={vi.fn()} />,
    );

    expect(html).toContain("Account unavailable");
    expect(html).toContain('data-slot="sidebar-menu-button"');
    expect(html).toContain("Open settings");
  });

  it("renders signed-in account identity and the temporary Free plan label", () => {
    const html = renderSidebarAccount(
      <PathwayOSSignedInSidebarAccount
        account={{
          email: "corey@example.com",
          imageUrl: "https://example.com/avatar.png",
          initial: "C",
          planLabel: FREE_PLAN_LABEL,
        }}
        onOpenAccountProfile={vi.fn()}
        onOpenProfile={vi.fn()}
        onOpenSettings={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );

    expect(html).toContain("corey@example.com");
    expect(html).toContain(FREE_PLAN_LABEL);
    expect(html).toContain('src="https://example.com/avatar.png"');
    expect(html).toContain("cursor-pointer");
    expect(html).toContain("hover:bg-accent");
    expect(html).toContain("Open account menu for corey@example.com");
    expect(html).toContain("Open account profile");
  });

  it("renders the signed-in account as a compact rail trigger", () => {
    const html = renderSidebarAccount(
      <PathwayOSSignedInSidebarAccount
        account={{
          email: "corey@example.com",
          imageUrl: null,
          initial: "C",
          planLabel: FREE_PLAN_LABEL,
        }}
        onOpenAccountProfile={vi.fn()}
        onOpenProfile={vi.fn()}
        onOpenSettings={vi.fn()}
        onSignOut={vi.fn()}
        variant="rail"
      />,
    );

    expect(html).toContain("Open account menu for corey@example.com");
    expect(html).toContain("size-11");
  });
});
