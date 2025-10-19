import React, { useEffect, useState } from "react";
import { ChatRoomResponse, UserResponse } from "@/lib/type/ResponseType";
import { RoomType } from "@/lib/type/CoreModelsAndEnum";
import {
  UpdateChatRoomRequest,
  JoinChatRoomRequest,
} from "@/lib/type/RequestType";
import { useIsMobile } from "@/hooks/use-mobile";
import { chatRoomApi } from "@/lib/api/chatRoomApi";
import { userApi } from "@/lib/api/userApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, UserPlus, Save, AlertTriangle } from "lucide-react";

interface RoomSettingsDialogProps {
  roomId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (room: ChatRoomResponse) => void;
}

// Simple toast helper
const showToast = (message: string, type: "success" | "error" = "success") => {
  if (type === "error") {
    alert(`Error: ${message}`);
  } else {
    alert(message);
  }
};

export const RoomSettingsDialog: React.FC<RoomSettingsDialogProps> = ({
  roomId,
  isOpen,
  onClose,
  onSaved,
}) => {
  const isMobile = useIsMobile();
  const [room, setRoom] = useState<ChatRoomResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [participants, setParticipants] = useState<UserResponse[]>([]);
  const [allUsers, setAllUsers] = useState<UserResponse[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    roomName: "",
    description: "",
    maxUsers: 0,
  });
  const [isDirty, setIsDirty] = useState(false);

  // Add participant state
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState("MEMBER");

  useEffect(() => {
    if (isOpen && roomId) {
      loadRoomData();
      loadAllUsers();
    }
  }, [isOpen, roomId]);

  const loadRoomData = async () => {
    setIsLoading(true);
    try {
      const response = await chatRoomApi.getChatRoomById(roomId);
      if (response.success && response.data) {
        setRoom(response.data);
        setFormData({
          roomName: response.data.roomName,
          description: response.data.description || "",
          maxUsers: response.data.maxUsers || 0,
        });

        // Load participant details
        if (
          response.data.participants &&
          response.data.participants.length > 0
        ) {
          await loadParticipants(response.data.participants);
        }
      }
    } catch (error) {
      console.error("Error loading room data:", error);
      showToast("Failed to load room data", "error");
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const loadParticipants = async (participantIds: string[]) => {
    try {
      const participantPromises = participantIds.map((id) =>
        userApi.getUserById(id).catch(() => null)
      );
      const results = await Promise.all(participantPromises);
      const validParticipants = results
        .filter((r) => r?.success && r.data)
        .map((r) => r!.data);
      setParticipants(validParticipants);
    } catch (error) {
      console.error("Error loading participants:", error);
    }
  };

  const loadAllUsers = async () => {
    try {
      const response = await userApi.getAllUsers();
      if (response.success && response.data) {
        setAllUsers(response.data);
      }
    } catch (error) {
      console.error("Error loading users:", error);
    }
  };

  const handleInputChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!room || !isDirty) return;

    setIsSaving(true);
    try {
      const request: UpdateChatRoomRequest = {
        roomName: formData.roomName,
        description: formData.description,
        maxUsers: formData.maxUsers > 0 ? formData.maxUsers : undefined,
      };

      const response = await chatRoomApi.updateChatRoom(room.id, request);
      if (response.success && response.data) {
        showToast("Room updated successfully");
        setIsDirty(false);
        if (onSaved) {
          onSaved(response.data);
        }
        await loadRoomData(); // Reload to get fresh data
      }
    } catch (error) {
      console.error("Error updating room:", error);
      showToast("Failed to update room", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddParticipant = async () => {
    if (!selectedUserId || !room) return;

    setIsSaving(true);
    try {
      const request: JoinChatRoomRequest = {
        userId: selectedUserId,
        role: selectedRole,
      };

      const response = await chatRoomApi.addParticipant(room.id, request);
      if (response.success) {
        showToast("Participant added successfully");
        setSelectedUserId("");
        setSelectedRole("MEMBER");
        await loadRoomData(); // Reload to update participant list
      }
    } catch (error) {
      console.error("Error adding participant:", error);
      showToast("Failed to add participant", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!room) return;

    const roomName = room.displayName || room.roomName || "this room";
    const confirmText = window.prompt(
      `This action cannot be undone. Type "${roomName}" to confirm deletion:`
    );

    if (confirmText !== roomName) {
      showToast("Room name didn't match. Deletion cancelled.", "error");
      return;
    }

    setIsSaving(true);
    try {
      const response = await chatRoomApi.deleteChatRoom(room.id);
      if (response.success) {
        showToast("Room deleted successfully");
        onClose();
      }
    } catch (error) {
      console.error("Error deleting room:", error);
      showToast("Failed to delete room", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const availableUsers = allUsers.filter(
    (user) => !room?.participants?.includes(user.id)
  );

  const content = (
    <div className="space-y-4">
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : room ? (
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="roomName">Room Name</Label>
              <Input
                id="roomName"
                value={formData.roomName}
                onChange={(e) => handleInputChange("roomName", e.target.value)}
                placeholder="Enter room name"
                disabled={room.roomType === RoomType.DIRECT_MESSAGE}
              />
              {room.roomType === RoomType.DIRECT_MESSAGE && (
                <p className="text-xs text-gray-500">
                  Direct message room names cannot be changed
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  handleInputChange("description", e.target.value)
                }
                placeholder="Enter room description"
                className="w-full min-h-[80px] px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="roomType">Room Type</Label>
              <div className="px-3 py-2 text-sm border border-gray-300 rounded-md bg-gray-50">
                {room.roomType === RoomType.PUBLIC && "Public"}
                {room.roomType === RoomType.PRIVATE && "Private"}
                {room.roomType === RoomType.DIRECT_MESSAGE && "Direct Message"}
              </div>
              <p className="text-xs text-gray-500">
                Room type cannot be changed after creation
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxUsers">Max Users (0 = unlimited)</Label>
              <Input
                id="maxUsers"
                type="number"
                min="0"
                value={formData.maxUsers}
                onChange={(e) =>
                  handleInputChange("maxUsers", parseInt(e.target.value) || 0)
                }
                placeholder="0"
                disabled={room.roomType === RoomType.DIRECT_MESSAGE}
              />
              {room.roomType === RoomType.DIRECT_MESSAGE ? (
                <p className="text-xs text-gray-500">
                  Direct message rooms have a fixed number of participants
                </p>
              ) : (
                formData.maxUsers > 0 &&
                room.participants &&
                formData.maxUsers < room.participants.length && (
                  <p className="text-xs text-orange-600">
                    Warning: Max users is less than current participant count (
                    {room.participants.length})
                  </p>
                )
              )}
            </div>

            <Button
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              className="w-full"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          </TabsContent>

          {/* Members Tab */}
          <TabsContent value="members" className="space-y-4">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">
                Current Members ({participants.length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                {participants.length > 0 ? (
                  participants.map((participant) => (
                    <div
                      key={participant.id}
                      className="flex items-center gap-3 p-2 rounded hover:bg-gray-50"
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-semibold">
                        {(participant.name || "U").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {participant.name || "Unknown User"}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {participant.email || "No email"}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No participants
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t">
              <h4 className="text-sm font-semibold">Add Participant</h4>
              <div className="space-y-2">
                <Label htmlFor="userSelect">Select User</Label>
                <Select
                  value={selectedUserId}
                  onValueChange={setSelectedUserId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a user" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableUsers.length > 0 ? (
                      availableUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name} ({user.email})
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>
                        No users available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="roleSelect">Role</Label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MEMBER">Member</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleAddParticipant}
                disabled={!selectedUserId || isSaving}
                className="w-full"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Add Participant
              </Button>
            </div>

            <p className="text-xs text-gray-500">
              Note: Removing and role management features coming soon
            </p>
          </TabsContent>

          {/* Advanced Tab */}
          <TabsContent value="advanced" className="space-y-4">
            <div className="space-y-4">
              <div className="border border-red-200 rounded-lg p-4 bg-red-50">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-red-900 mb-2">
                      Danger Zone
                    </h4>
                    <p className="text-sm text-red-800 mb-4">
                      Deleting this room is permanent and cannot be undone. All
                      messages and data will be lost.
                    </p>
                    <Button
                      onClick={handleDelete}
                      disabled={isSaving}
                      variant="destructive"
                      className="w-full"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Room
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        <div className="text-center text-gray-500">Room not found</div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Room Settings</SheetTitle>
          </SheetHeader>
          <div className="mt-4">{content}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Room Settings</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
};
