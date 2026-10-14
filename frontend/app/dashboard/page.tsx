"use client";

import { useAuthStore } from "@/lib/stores/authStore";
import { useChatRoomsStore } from "@/lib/stores/chatRoomsStore";
import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";
import ChatRoomsList from "@/components/room/ChatRoomsList";
import ChatInterface from "@/components/chat/ChatInterface";
import { CreateRoomModal } from "@/components/room/CreateRoomModal";
import { NewMessageDialog } from "@/components/room/NewMessageDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { ArrowLeft, MessageSquare } from "lucide-react";

const DashboardContent = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isCreateRoomModalOpen = useChatRoomsStore(
    (state) => state.isCreateRoomModalOpen
  );
  const createMode = useChatRoomsStore((state) => state.createRoomModalMode);
  const fetchRooms = useChatRoomsStore((state) => state.fetchRooms);
  const closeCreateRoomModal = useChatRoomsStore(
    (state) => state.closeCreateRoomModal
  );
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = searchParams.get("roomId");

  useEffect(() => {
    // The dashboard layout gate guarantees a verified session before this page renders.
    if (isAuthenticated) {
      fetchRooms();
    }
  }, [isAuthenticated, fetchRooms]);

  // Below md only one pane shows: the room list is home, a selected room is a full screen with Back.
  return (
    <div className="h-full flex flex-row overflow-hidden bg-background">
      <aside
        aria-label="Chat rooms"
        className={`${roomId ? "hidden" : "block"} md:block w-full md:w-80 flex-shrink-0 border-r bg-sidebar`}
      >
        <ChatRoomsList />
      </aside>

      <main
        className={`${roomId ? "flex" : "hidden"} md:flex flex-1 min-w-0 flex-col overflow-hidden bg-background`}
      >
        {roomId ? (
          <>
            <div className="md:hidden flex flex-shrink-0 items-center border-b bg-card px-2 py-1">
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="flex items-center gap-1 rounded-md p-2 text-sm text-foreground hover:bg-accent"
                aria-label="Back to chat rooms"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </button>
            </div>
            <ChatInterface key={roomId} roomId={roomId} />
          </>
        ) : (
          <EmptyState
            className="flex-1"
            icon={<MessageSquare className="h-12 w-12" />}
            title="Pick up where you left off"
            description="Choose a chat on the left, or start a new message."
          />
        )}
      </main>

      <CreateRoomModal
        isOpen={isCreateRoomModalOpen && createMode === "room"}
        onClose={() => closeCreateRoomModal()}
      />
      <NewMessageDialog
        isOpen={isCreateRoomModalOpen && createMode === "direct"}
        onClose={() => closeCreateRoomModal()}
      />
    </div>
  );
};

const Dashboard = () => {
  return (
    <Suspense
      fallback={
        <div role="status" className="flex h-full items-center justify-center text-muted-foreground">
          Loading...
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
};

export default Dashboard;
