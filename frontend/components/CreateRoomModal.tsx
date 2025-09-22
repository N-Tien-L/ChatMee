"use client";

import { useChatRoomsStore } from "@/lib/stores";
import { CreateChatRoomRequest, RoomType } from "@/lib/type/ChatTypes";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useState } from "react";
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

interface CreateRoomModalProps {
  isOpen: boolean; // ← Fixed: was "isClose"
  onClose: () => void;
}

export const CreateRoomModal = ({ isOpen, onClose }: CreateRoomModalProps) => {
  const [roomName, setRoomName] = useState("");
  const [description, setDescription] = useState("");
  const [roomType, setRoomType] = useState<RoomType>(RoomType.PUBLIC);
  const createRoom = useChatRoomsStore((state) => state.createRoom);

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      alert("Room name is required.");
      return;
    }

    const request: CreateChatRoomRequest = {
      roomName,
      description,
      roomType,
    };

    const success = await createRoom(request);
    if (success) {
      setRoomName("");
      setDescription("");
      setRoomType(RoomType.PUBLIC);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create a New Chat Room</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Room Name */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="room-name" className="text-right">
              Name
            </Label>
            <Input
              id="room-name"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="col-span-3"
              placeholder="e.g., Project Phoenix"
            />
          </div>

          {/* Description */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="description" className="text-right">
              Description
            </Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="col-span-3"
              placeholder="(Optional) What is this room about?"
            />
          </div>

          {/* Room Type */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="room-type" className="text-right">
              Type
            </Label>
            <Select
              value={roomType}
              onValueChange={(value) => setRoomType(value as RoomType)}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select a room type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={RoomType.PUBLIC}>Public</SelectItem>
                <SelectItem value={RoomType.PRIVATE}>Private</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" onClick={handleCreateRoom}>
            Create Room
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
