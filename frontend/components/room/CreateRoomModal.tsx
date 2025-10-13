"use client";

import { useChatRoomsStore } from "@/lib/stores";
import { useAuthStore } from "@/lib/stores";
import { RoomType } from "@/lib/type/CoreModelsAndEnum";
import { UserResponse } from "@/lib/type/ResponseType";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "../ui/checkbox";
import { CreateChatRoomRequest } from "@/lib/type/RequestType";
import UserSearchList from "../user/UserSearchList";
import { X } from "lucide-react";

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateRoomModal = ({ isOpen, onClose }: CreateRoomModalProps) => {
  const [roomName, setRoomName] = useState("");
  const [description, setDescription] = useState("");
  const [roomType, setRoomType] = useState<RoomType>(RoomType.PUBLIC);
  const createRoom = useChatRoomsStore((state) => state.createRoom);
  const [maxUser, setMaxUser] = useState(2);
  const [displayMaxUser, setDisplayMaxUser] = useState("2");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [allowFileSharing, setAllowFileSharing] = useState(false);
  const [allowGuestUsers, setAllowGuestUsers] = useState(false);
  const [moderationRequired, setModerationRequired] = useState(false);

  // Direct Message specific state
  const [selectedUser, setSelectedUser] = useState<UserResponse | null>(null);
  const { user: currentUser } = useAuthStore();

  // Sync displayMaxUser with maxUser when maxUser changes from buttons
  useEffect(() => {
    setDisplayMaxUser(maxUser.toString());
  }, [maxUser]);

  // Reset selected user when room type changes
  useEffect(() => {
    if (roomType !== RoomType.DIRECT_MESSAGE) {
      setSelectedUser(null);
    }
  }, [roomType]);

  const increaseMaxUser = () => {
    const newValue = Math.min(1000, maxUser + 1); // Cap at 1000
    setMaxUser(newValue);
  };

  const decreaseMaxUser = () => {
    const newValue = Math.max(2, maxUser - 1); // Minimum of 2
    setMaxUser(newValue);
  };

  const handleUserAdd = (user: UserResponse) => {
    setSelectedUser(user);
  };

  const handleRemoveSelectedUser = () => {
    setSelectedUser(null);
  };

  const handleCreateRoom = async () => {
    const request: CreateChatRoomRequest = {
      roomName:
        roomType === RoomType.DIRECT_MESSAGE
          ? `${currentUser?.name} & ${selectedUser?.name}`
          : roomName,
      description,
      roomType: roomType,
      maxUsers: roomType === RoomType.DIRECT_MESSAGE ? 2 : maxUser,
      settings: {
        welcomeMessage,
        allowFileSharing,
        allowGuestUsers,
        moderationRequired,
      },
      // Add participant for Direct Message
      ...(roomType === RoomType.DIRECT_MESSAGE &&
        selectedUser && {
          participantId: selectedUser.id,
        }),
    };

    const success = await createRoom(request);
    if (success) {
      // Reset form
      setRoomName("");
      setDescription("");
      setRoomType(RoomType.PUBLIC);
      setSelectedUser(null);
      setAllowFileSharing(false);
      setAllowGuestUsers(false);
      setModerationRequired(false);
      setWelcomeMessage("");
      onClose();
    }
  };

  // Check if form is valid
  const isFormValid = () => {
    if (roomType === RoomType.DIRECT_MESSAGE) {
      return selectedUser !== null;
    }
    return roomName.trim().length >= 3;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-2xl font-semibold text-center">
            {roomType === RoomType.DIRECT_MESSAGE
              ? "Start a Direct Conversation"
              : "Create a New Chat Room"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 py-4">
          {/* Left Column - Form */}
          <div className="space-y-6">
            {/* Room Type Selection */}
            <div className="space-y-3">
              <Label htmlFor="room-type" className="text-sm font-medium">
                Room Type
              </Label>
              <Select
                value={roomType}
                onValueChange={(value) => setRoomType(value as RoomType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a room type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={RoomType.PUBLIC}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      Public Room
                    </div>
                  </SelectItem>
                  <SelectItem value={RoomType.PRIVATE}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                      Private Room
                    </div>
                  </SelectItem>
                  <SelectItem value={RoomType.DIRECT_MESSAGE}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                      Direct Message
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Form Fields - Only for non-DM rooms */}
            {roomType !== RoomType.DIRECT_MESSAGE ? (
              <div className="space-y-5">
                {/* Room Name */}
                <div className="space-y-2">
                  <Label htmlFor="room-name" className="text-sm font-medium">
                    Room Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="room-name"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    className="w-full"
                    placeholder="e.g., Project Phoenix, Marketing Team"
                    maxLength={50}
                  />
                  <p className="text-xs text-gray-500">
                    3-50 characters. This will be displayed in room listings and
                    invitations.
                  </p>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-sm font-medium">
                    Description
                  </Label>
                  <Input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full"
                    placeholder="Brief description of this room's purpose"
                    maxLength={200}
                  />
                  <p className="text-xs text-gray-500">
                    Optional. Up to 200 characters. Help others understand what
                    this room is for.
                  </p>
                </div>

                {/* Max Users */}
                <div className="space-y-2">
                  <Label htmlFor="maxUser" className="text-sm font-medium">
                    Maximum Users
                  </Label>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={decreaseMaxUser}
                      className="h-9 w-9 p-0"
                      disabled={maxUser <= 2}
                    >
                      -
                    </Button>
                    <Input
                      id="maxUser"
                      type="number"
                      value={displayMaxUser}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDisplayMaxUser(val);
                        if (val === "") return;
                        const num = parseInt(val, 10);
                        if (!isNaN(num) && num >= 2 && num <= 1000) {
                          setMaxUser(num);
                        }
                      }}
                      onBlur={() => {
                        if (
                          displayMaxUser === "" ||
                          isNaN(parseInt(displayMaxUser, 10))
                        ) {
                          setDisplayMaxUser("2");
                          setMaxUser(2);
                        } else {
                          const num = parseInt(displayMaxUser, 10);
                          const clampedNum = Math.max(2, Math.min(1000, num));
                          setDisplayMaxUser(clampedNum.toString());
                          setMaxUser(clampedNum);
                        }
                      }}
                      min={2}
                      max={1000}
                      className="w-20 text-center"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={increaseMaxUser}
                      className="h-9 w-9 p-0"
                      disabled={maxUser >= 1000}
                    >
                      +
                    </Button>
                    <span className="text-sm text-gray-500 ml-2">users</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Set the maximum number of users allowed in this room
                    (2-1000).
                  </p>
                </div>

                {/* Welcome Message */}
                <div className="space-y-2">
                  <Label
                    htmlFor="welcome-message"
                    className="text-sm font-medium"
                  >
                    Welcome Message
                  </Label>
                  <Input
                    id="welcome-message"
                    value={welcomeMessage}
                    onChange={(e) => setWelcomeMessage(e.target.value)}
                    className="w-full"
                    placeholder="Say hello to other participants!"
                  />
                </div>

                {/* Settings */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Room Settings</Label>
                  <div className="space-y-4 bg-gray-50 rounded-lg p-4">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id="allowFileSharing"
                          checked={allowFileSharing}
                          onCheckedChange={(checked) =>
                            setAllowFileSharing(!!checked)
                          }
                        />
                        <Label
                          htmlFor="allowFileSharing"
                          className="text-sm text-gray-700 cursor-pointer font-medium"
                        >
                          Allow file sharing
                        </Label>
                      </div>
                      <p className="text-xs text-gray-500 ml-7">
                        Members can upload and share files, images, and
                        documents
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id="allowGuestUsers"
                          checked={allowGuestUsers}
                          onCheckedChange={(checked) =>
                            setAllowGuestUsers(!!checked)
                          }
                        />
                        <Label
                          htmlFor="allowGuestUsers"
                          className="text-sm text-gray-700 cursor-pointer font-medium"
                        >
                          Allow guest users
                        </Label>
                      </div>
                      <p className="text-xs text-gray-500 ml-7">
                        {roomType === RoomType.PUBLIC
                          ? "Anyone can join without registration (recommended for public rooms)"
                          : "Unregistered users can join via invitation link"}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id="moderationRequired"
                          checked={moderationRequired}
                          onCheckedChange={(checked) =>
                            setModerationRequired(!!checked)
                          }
                        />
                        <Label
                          htmlFor="moderationRequired"
                          className="text-sm text-gray-700 cursor-pointer font-medium"
                        >
                          Moderation required
                        </Label>
                      </div>
                      <p className="text-xs text-gray-500 ml-7">
                        Messages from new members require approval before being
                        visible
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Selected User Display */}
                {selectedUser && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Selected User</Label>
                    <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      {selectedUser.avatarUrl ? (
                        <img
                          src={selectedUser.avatarUrl}
                          alt={`${selectedUser.name}'s avatar`}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-medium">
                          {selectedUser.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)}
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-medium text-sm">
                          {selectedUser.name}
                        </p>
                        <p className="text-xs text-gray-600">
                          {selectedUser.email}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleRemoveSelectedUser}
                        className="h-6 w-6 p-0 text-gray-500 hover:text-red-500"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* User Search */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {selectedUser
                      ? "Change Partner"
                      : "Choose Your Chat Partner"}
                  </Label>
                  <UserSearchList
                    onUserAdd={handleUserAdd}
                    excludeUserIds={currentUser?.id ? [currentUser.id] : []}
                    placeHolder="Search for someone to chat with..."
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Room Type Info & Tips */}
          <div className="space-y-4">
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-900">
                {roomType === RoomType.DIRECT_MESSAGE
                  ? "Direct Message Guide"
                  : "Room Type Guide"}
              </h3>

              {/* Room Type Descriptions */}
              {roomType === RoomType.PUBLIC && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                    <span className="text-sm font-medium text-green-900">
                      Public Room
                    </span>
                  </div>
                  <p className="text-sm text-green-700 mb-3">
                    • Anyone can discover and join this room
                    <br />
                    • Visible in public room listings
                    <br />
                    • No invitation required
                    <br />• Best for open discussions and communities
                  </p>
                  <div className="bg-green-100 rounded-lg p-3">
                    <p className="text-xs text-green-800">
                      💡 <strong>Public Room Tip:</strong> Moderation is
                      recommended for large public rooms. Guest access makes it
                      easier for new users to join your community.
                    </p>
                  </div>
                </div>
              )}

              {roomType === RoomType.PRIVATE && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
                    <span className="text-sm font-medium text-orange-900">
                      Private Room
                    </span>
                  </div>
                  <p className="text-sm text-orange-700 mb-3">
                    • Invitation-only access
                    <br />
                    • Not visible in public listings
                    <br />
                    • Members must be invited by room admin
                    <br />• Best for team discussions and private groups
                  </p>
                  <div className="bg-orange-100 rounded-lg p-3">
                    <p className="text-xs text-orange-800">
                      💡 <strong>Private Room Tip:</strong> Consider enabling
                      moderation for better control over discussions. File
                      sharing can be disabled if you prefer external file
                      management.
                    </p>
                  </div>
                </div>
              )}

              {roomType === RoomType.DIRECT_MESSAGE && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                    <span className="text-sm font-medium text-blue-900">
                      Direct Message
                    </span>
                  </div>
                  <p className="text-sm text-blue-700 mb-3">
                    • One-on-one private conversations
                    <br />
                    • Direct and immediate communication
                    <br />
                    • Only visible to participants
                    <br />• Perfect for private discussions
                  </p>
                  <div className="bg-blue-100 rounded-lg p-3">
                    <p className="text-xs text-blue-800">
                      💡 <strong>Direct Message Tip:</strong> Choose your chat
                      partner carefully. Once created, you can start chatting
                      immediately with full privacy.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* General Tips */}
            {roomType !== RoomType.DIRECT_MESSAGE && (
              <div className="space-y-3">
                <h4 className="text-md font-medium text-gray-900">
                  General Guidelines
                </h4>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="space-y-3 text-xs text-gray-600">
                    <div>
                      <strong>Room Name:</strong> Choose descriptive names that
                      clearly indicate the room's purpose.
                    </div>
                    <div>
                      <strong>Max Users:</strong> Consider your community size.
                      Start small and increase as needed.
                    </div>
                    <div>
                      <strong>File Sharing:</strong> Enable for collaborative
                      work, disable for focused discussions.
                    </div>
                    <div>
                      <strong>Guest Access:</strong> Great for public engagement
                      but consider moderation needs.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-3 pt-4">
          <DialogClose asChild>
            <Button type="button" variant="outline" className="flex-1">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="submit"
            onClick={handleCreateRoom}
            disabled={!isFormValid()}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
          >
            {roomType === RoomType.DIRECT_MESSAGE
              ? "Start Chat"
              : "Create Room"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
