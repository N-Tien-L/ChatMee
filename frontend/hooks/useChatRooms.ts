import { chatRoomApi } from "@/lib/api/chatRoomApi";
import { userApi } from "@/lib/api/userApi";
import { CreateChatRoomRequest, RoomType } from "@/lib/type/ChatTypes";
import { ChatRoomResponse, UserResponse } from "@/lib/type/ResponseType";
import { useCallback, useState, useEffect } from "react";
import { useAuth } from "./useAuth";
import toast from "react-hot-toast";
import Fuse from "fuse.js";

export const useChatRooms = () => {
  const { user: currentUser } = useAuth();
  const [chatRooms, setChatRooms] = useState<ChatRoomResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filteredRooms, setFilteredRooms] = useState<ChatRoomResponse[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [roomTypeFilter, setRoomTypeFilter] = useState<RoomType | "ALL">("ALL");
  const [usersCache, setUsersCache] = useState<Map<string, UserResponse>>(
    new Map()
  );

  // Helper function to get display name for direct message rooms
  const getDirectMessageDisplayName = useCallback(
    async (room: ChatRoomResponse): Promise<string> => {
      if (
        room.roomType !== RoomType.DIRECT_MESSAGE ||
        !room.participants ||
        !currentUser
      ) {
        return room.roomName || "Unknown Room";
      }

      // Find the other participant (not the current user)
      const otherParticipantId = room.participants.find(
        (id) => id !== currentUser.id
      );
      if (!otherParticipantId) {
        return "Direct Message";
      }

      // Check cache first
      if (usersCache.has(otherParticipantId)) {
        return usersCache.get(otherParticipantId)!.name;
      }

      try {
        // Fetch user info if not in cache
        const response = await userApi.getUserById(otherParticipantId);
        if (response.success) {
          // Update cache
          setUsersCache((prev) =>
            new Map(prev).set(otherParticipantId, response.data)
          );
          return response.data.name;
        }
      } catch (error) {
        console.error("Error fetching user info:", error);
      }

      return "Direct Message";
    },
    [currentUser, usersCache]
  );

  // Process rooms to add display names
  const processRoomsWithDisplayNames = useCallback(
    async (rooms: ChatRoomResponse[]): Promise<ChatRoomResponse[]> => {
      const processedRooms = await Promise.all(
        rooms.map(async (room) => {
          if (room.roomType === RoomType.DIRECT_MESSAGE) {
            const displayName = await getDirectMessageDisplayName(room);
            return { ...room, displayName };
          }
          return { ...room, displayName: room.roomName };
        })
      );
      return processedRooms;
    },
    [getDirectMessageDisplayName]
  );

  // fetch chat rooms
  const fetchChatRooms = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await chatRoomApi.getChatRooms();

      if (response.success) {
        const processedRooms = await processRoomsWithDisplayNames(
          response.data
        );
        setChatRooms(processedRooms);
      } else {
        throw new Error(response.message || "Failed to fetch chat rooms");
      }
    } catch (err) {
      console.error("Error fetching chat rooms: ", err);
      toast.error("Failed to load chat rooms");
      setError(
        err instanceof Error ? err.message : "Failed to load chat rooms"
      );
    } finally {
      setLoading(false);
    }
  }, [processRoomsWithDisplayNames]);

  // create new chat room
  const createChatRoom = useCallback(async (request: CreateChatRoomRequest) => {
    try {
      const response = await chatRoomApi.createChatRoom(request);
      if (response.success) {
        setChatRooms((prev) => [...prev, response.data]);
        toast.success("Chat room created successfully!");
        return response.data;
      } else {
        throw new Error(response.message || "Failed to create chat room");
      }
    } catch (err) {
      console.error("Error creating chat room: ", err);
      toast.error("Failed to create chat room");
      setError(
        err instanceof Error ? err.message : "Failed to create chat room"
      );
      throw err;
    }
  }, []);

  // delete a chat room
  const deleteChatRoom = useCallback(async (roomId: string) => {
    try {
      const response = await chatRoomApi.deleteChatRoom(roomId);
      if (response.success) {
        setChatRooms((prev) => prev.filter((room) => room.id !== roomId));
        toast.success("Chat room deleted successfully!");
        return true;
      } else {
        throw new Error(response.message || "Failed to delete chat room");
      }
    } catch (err) {
      console.error("Error deleting chat room: ", err);
      toast.error("Failed to delete chat room");
      setError(
        err instanceof Error ? err.message : "Failed to delete chat room"
      );
      return false;
    }
  }, []);

  // join a chat room
  const joinChatRoom = useCallback(
    async (roomId: string) => {
      try {
        const response = await chatRoomApi.joinChatRoom(roomId);
        if (response.success) {
          await fetchChatRooms(); // Refresh to get updated room list
          toast.success("Successfully joined the chat room!");
          return true;
        } else {
          toast.error(response.message || "Failed to join chat room");
          return false;
        }
      } catch (err) {
        console.error("Error joining chat room: ", err);
        toast.error("Failed to join chat room");
        setError(
          err instanceof Error ? err.message : "Failed to join chat room"
        );
        return false;
      }
    },
    [fetchChatRooms]
  );

  // Filter and search logic
  useEffect(() => {
    let filtered = chatRooms;

    // Filter by room type
    if (roomTypeFilter !== "ALL") {
      filtered = filtered.filter((room) => room.roomType === roomTypeFilter);
    }

    // Filter by search query using fuse.js for fuzzy search
    if (searchQuery.trim()) {
      const fuse = new Fuse(filtered, {
        keys: ["roomName", "displayName"],
        threshold: 0.3,
      });
      filtered = fuse.search(searchQuery).map((result) => result.item);
    }

    setFilteredRooms(filtered);
  }, [chatRooms, roomTypeFilter, searchQuery]);

  // Auto-fetch on mount
  useEffect(() => {
    fetchChatRooms();
  }, [fetchChatRooms]);

  return {
    // State
    chatRooms,
    filteredRooms,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    roomTypeFilter,
    setRoomTypeFilter,

    // Actions
    fetchChatRooms,
    createChatRoom,
    deleteChatRoom,
    joinChatRoom,
  };
};
