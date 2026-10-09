"use client";

import { SidebarProvider } from "@/components/ui/sidebar";
import { ConnectionBanner } from "@/components/realtime/ConnectionBanner";
import { StompProvider, useConnectionStatus } from "@/lib/realtime/StompProvider";
import React from "react";

function ConnectionStatusBanner() {
  const status = useConnectionStatus();
  return <ConnectionBanner status={status} />;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StompProvider>
      <SidebarProvider>{children}</SidebarProvider>
      <ConnectionStatusBanner />
    </StompProvider>
  );
}
