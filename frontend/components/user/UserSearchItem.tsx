import { UserSummaryResponse } from "@/lib/types";
import React from "react";
import { Check, Plus } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";

export interface UserSearchItemProps {
  user: UserSummaryResponse;
  onAdd: () => void;
  isAdded: boolean;
}

const UserSearchItem = ({ user, onAdd, isAdded }: UserSearchItemProps) => {
  const getAvatar = () => {
    if (user.avatarUrl) {
      return (
        <img
          src={user.avatarUrl}
          alt={`${user.name}'s avatar`}
          className="w-10 h-10 rounded-full object-cover"
          onError={(e) => {
            // Fallback to initials if image fails to load
            const target = e.target as HTMLImageElement;
            target.style.display = "none";
            target.nextElementSibling?.classList.remove("hidden");
          }}
        />
      );
    }

    const initials = user.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    return (
      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium text-sm">
        {initials}
      </div>
    );
  };

  return (
    <Card className="hover:shadow-md transition-all duration-200 border-border">
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="relative">{getAvatar()}</div>

          {/* User Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-medium text-foreground truncate">
                {user.name}
              </h4>
            </div>
          </div>

          {/* Add Button */}
          <Button
            size="sm"
            onClick={onAdd}
            disabled={isAdded}
            className={`h-8 px-3 transition-all duration-200 ${
              isAdded
                ? "bg-accent text-success hover:bg-accent cursor-not-allowed"
                : "bg-primary hover:bg-primary/90 text-primary-foreground"
            }`}
          >
            {isAdded ? (
              <>
                <Check className="w-3 h-3 mr-1" />
                Added
              </>
            ) : (
              <>
                <Plus className="w-3 h-3 mr-1" />
                Add
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default UserSearchItem;
