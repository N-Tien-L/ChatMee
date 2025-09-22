"use client";

import { useAuthStore } from "@/lib/stores/authStore";
import { useChatRoomsStore } from "@/lib/stores/chatRoomsStore";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import React from "react";
import ChatRoomsList from "@/components/ChatRoomsList";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { CreateRoomModal } from "@/components/CreateRoomModal";

const Dashboard = () => {
  const { user, isAuthenticated, loading } = useAuthStore(
    useShallow((state) => ({
      user: state.user,
      isAuthenticated: state.isAuthenticated,
      loading: state.loading,
    }))
  );
  const checkAuthStatus = useAuthStore((state) => state.checkAuthStatus);
  const fetchRooms = useChatRoomsStore((state) => state.fetchRooms);
  const router = useRouter();
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  const [isCreateRoomModalOpen, setIsCreateRoomModalOpen] = useState(false);

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
    <div className="min-h-screen w-full bg-gray-50 flex">
      {/* Sidebar */}
      <ChatRoomsList />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white shadow-sm border-b h-16 flex items-center px-6">
          <h1 className="text-xl font-semibold text-gray-900">ChatMee</h1>
          <div className="ml-auto flex items-center space-x-4">
            <Button onClick={() => setIsCreateRoomModalOpen(true)}>
              Create Room
            </Button>
            <span className="text-gray-700">Welcome, {user?.name}</span>
            <img
              src={user?.avatarUrl || "/default-avatar.png"}
              alt="Profile"
              className="w-8 h-8 rounded-full"
            />
          </div>
        </header>

        {/* Main Chat Area */}
        <main className="flex-1 flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <div className="text-6xl mb-4">💬</div>
            <h2 className="text-2xl font-semibold text-gray-700 mb-2">
              Select a chat room
            </h2>
            <p className="text-gray-500">
              Choose a chat room from the sidebar to start messaging
            </p>
          </div>
        </main>
      </div>
      <CreateRoomModal
        isOpen={isCreateRoomModalOpen}
        onClose={() => setIsCreateRoomModalOpen(false)}
      />
    </div>
  );
};

export default Dashboard;
