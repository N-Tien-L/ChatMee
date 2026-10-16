"use client";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/common/AppHeader";
import { AuthGate } from "@/components/common/AuthGate";
import { ConnectionBanner } from "@/components/realtime/ConnectionBanner";
import { StompProvider, useConnectionStatus } from "@/lib/realtime/StompProvider";
import { useAuthStore } from "@/lib/stores/authStore";
import React from "react";

function ConnectionStatusBanner() {
  const status = useConnectionStatus();
  return <ConnectionBanner status={status} />;
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      <AppHeader user={user} onSignOut={logout} status={<ConnectionStatusBanner />} />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      <StompProvider>
        <SidebarProvider>
          <DashboardShell>{children}</DashboardShell>
        </SidebarProvider>
      </StompProvider>
    </AuthGate>
  );
}
