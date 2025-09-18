import { chatRoomApi } from "@/lib/api/chatRoomApi";
import { CreateChatRoomRequest, RoomType } from "@/lib/type/ChatTypes";
import { ChatRoomResponse } from "@/lib/type/ResponseType"
import { useCallback, useState, useEffect } from "react"
import toast from "react-hot-toast";

export const useChatRooms = () => {
  const [chatRooms, setChatRooms] = useState<ChatRoomResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filteredRooms, setFilteredRooms] = useState<ChatRoomResponse[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [roomTypeFilter, setRoomTypeFilter] = useState<RoomType | "ALL">("ALL");

  // fetch chat rooms
  const fetchChatRooms = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await chatRoomApi.getChatRooms();

      if (response.success) {
        setChatRooms(response.data);
      } else {
        throw new Error(response.message || "Failed to fetch chat rooms")
      }
    } catch (err) {
      console.error("Error fetching chat rooms: ", err);
      toast.error("Failed to load chat rooms");
      setError(err instanceof Error ? err.message : "Failed to load chat rooms");
    } finally {
      setLoading(false)
    }
  }, [])

  // create new chat room
  const createChatRoom = useCallback(async (request: CreateChatRoomRequest) => {
    try {
      const response = await chatRoomApi.createChatRoom(request);
      if (response.success) {
        setChatRooms(prev => [...prev, response.data]);
        toast.success("Chat room created successfully!")
        return response.data
      } else {
        throw new Error(response.message || "Failed to create chat room")
      }
    } catch (err) {
      console.error("Error creating chat room: ", err);
      toast.error("Failed to create chat room");
      setError(err instanceof Error ? err.message : "Failed to create chat room");
      throw err; // Re-throw so caller knows it failed
    }
  }, [])

  // delete a chat room
  const deleteChatRoom = useCallback(async (roomId: string) => {
    try {
      const response = await chatRoomApi.deleteChatRoom(roomId);
      if (response.success) {
        setChatRooms(prev => prev.filter(room => room.id !== roomId));
        toast.success("Chat room deleted successfully!")
        return true;
      } else {
        throw new Error(response.message || "Failed to delete chat room")
      }
    } catch (err) {
      console.error("Error deleting chat room: ", err);
      toast.error("Failed to delete chat room");
      setError(err instanceof Error ? err.message : "Failed to delete chat room");
      return false;
    }
  }, [])

  // join a chat room
  const joinChatRoom = useCallback(async (roomId: string) => {
    try {
      const response = await chatRoomApi.joinChatRoom(roomId);
      if (response.success) {
        await fetchChatRooms(); // Refresh to get updated room list
        toast.success("Successfully joined the chat room!")
        return true;
      } else {
        toast.error(response.message || "Failed to join chat room")
        return false;
      }
    } catch (err) {
      console.error("Error joining chat room: ", err);
      toast.error("Failed to join chat room");
      setError(err instanceof Error ? err.message : "Failed to join chat room");
      return false;
    }
  }, [fetchChatRooms])

  // Filter and search logic
  useEffect(() => {
    let filtered = chatRooms;

    // Filter by room type
    if (roomTypeFilter !== 'ALL') {
      filtered = filtered.filter(room => room.roomType === roomTypeFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(room =>
        room.roomName.toLowerCase().includes(query) ||
        (room.description && room.description.toLowerCase().includes(query))
      );
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
}