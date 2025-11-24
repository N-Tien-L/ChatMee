"use client";

import { useAuthStore } from "@/lib/stores/authStore";
import { useChatRoomsStore } from "@/lib/stores/chatRoomsStore";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";
import ChatRoomsList from "@/components/room/ChatRoomsList";
import ChatInterface from "@/components/chat/ChatInterface";
import { useShallow } from "zustand/react/shallow";
import { CreateRoomModal } from "@/components/room/CreateRoomModal";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { LogOut } from "lucide-react";

const DashboardContent = () => {
  const { user, isAuthenticated, loading, logout } = useAuthStore(
    useShallow((state) => ({
      user: state.user,
      isAuthenticated: state.isAuthenticated,
      loading: state.loading,
      logout: state.logout,
    }))
  );
  const { isCreateRoomModalOpen } = useChatRoomsStore(
    useShallow((state) => ({
      isCreateRoomModalOpen: state.isCreateRoomModalOpen,
    }))
  );
  const checkAuthStatus = useAuthStore((state) => state.checkAuthStatus);
  const fetchRooms = useChatRoomsStore((state) => state.fetchRooms);
  const closeCreateRoomModal = useChatRoomsStore(
    (state) => state.closeCreateRoomModal
  );
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = searchParams.get("roomId");
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  useWebSocket();

  useEffect(() => {
    const fetchAuthStatus = async () => {
      await checkAuthStatus();
      setHasCheckedAuth(true); // Mark that we've checked
    };
    fetchAuthStatus();
  }, [checkAuthStatus]);

  useEffect(() => {
    // Only redirect AFTER we've checked auth status
    if (hasCheckedAuth && !loading && !isAuthenticated) {
      router.push("/login");
    }
  }, [hasCheckedAuth, isAuthenticated, loading, router]);

  useEffect(() => {
    // Fetch chat rooms when user is authenticated
    if (hasCheckedAuth && isAuthenticated && !loading) {
      fetchRooms();
    }
  }, [hasCheckedAuth, isAuthenticated, loading, fetchRooms]);

  // Show loading while checking auth OR while loading
  if (!hasCheckedAuth || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-2xl text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-2xl text-gray-600 mb-4">Access Denied</div>
          <div className="text-gray-500 mb-6">
            You must be logged in to access the dashboard.
          </div>
          <a
            href="/login"
            className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh w-full bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white shadow-sm border-b h-16 flex items-center px-6 flex-shrink-0 z-10">
        <h1 className="text-xl font-semibold text-gray-900">ChatMee</h1>
        <div className="ml-auto flex items-center space-x-4">
          <span className="text-gray-700 hidden sm:inline">
            Welcome, {user?.name}
          </span>
          <img
            src={user?.avatarUrl || "/default-avatar.png"}
            alt="Profile"
            className="w-8 h-8 rounded-full"
          />
          <button
            onClick={() => logout()}
            className="p-2 hover:bg-gray-100 rounded-full text-gray-600 hover:text-red-600 transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* page.tsx */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full flex flex-row">
          {/* Sidebar - Hidden on mobile */}
          <aside
            className={`fixed md:static inset-y-0 left-0 z-30 top-16 md:top-0
    bg-white border-r transform md:translate-x-0 transition-transform duration-300
    w-full sm:w-80 md:w-80 lg:w-96
    ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
          >
            <ChatRoomsList onCloseSidebar={() => setIsSidebarOpen(false)} />
          </aside>

          {/* Backdrop overlay for mobile */}
          {isSidebarOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-20 md:hidden top-16"
              onClick={() => setIsSidebarOpen(false)}
              aria-hidden="true"
            />
          )}

          {/* Main content */}
          <main className="flex-1 bg-gray-100 w-full overflow-hidden min-w-0 flex flex-col">
            {roomId ? (
              <ChatInterface
                roomId={roomId}
                onToggleSidebar={() => setIsSidebarOpen(true)}
              />
            ) : (
              <>
                {/* Mobile header toggle - only show when no room selected */}
                <div className="md:hidden flex items-center justify-between px-4 py-2 bg-white border-b flex-shrink-0">
                  <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="text-gray-700 p-2 hover:bg-gray-100 rounded-md"
                    aria-label="Open sidebar"
                  >
                    ☰
                  </button>
                  <h1 className="font-semibold text-gray-800">ChatMee</h1>
                  <div className="w-10" /> {/* Spacer for centering */}
                </div>

                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center px-4">
                    <div className="text-6xl mb-4">💬</div>
                    <h2 className="text-2xl font-semibold text-gray-700 mb-2">
                      Select a chat room
                    </h2>
                    <p className="text-gray-500">
                      Choose a chat room from the sidebar to start messaging
                    </p>
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      </div>

      {/* Modal remains at the top level */}
      <CreateRoomModal
        isOpen={isCreateRoomModalOpen}
        onClose={() => closeCreateRoomModal()}
      />
    </div>
  );
};

const Dashboard = () => {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-2xl text-gray-600">Loading...</div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
};

export default Dashboard;
