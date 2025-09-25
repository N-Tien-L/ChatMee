import { UserResponse } from "@/lib/type/ResponseType";
import React from "react";
import { Github } from "./ui/icon/OAuthIcons";
import { Check, Mail, Plus, User } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";

export interface UserSearchItemProps {
  user: UserResponse;
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
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium text-sm">
        {initials}
      </div>
    );
  };

  const getProviderIcon = () => {
    switch (user.provider?.toLowerCase()) {
      case "github":
        return <Github className="w-4 h-4 text-gray-500" />;
      case "google":
        return <Mail className="w-4 h-4 text-gray-500" />;
      default:
        return <User className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <Card className="hover:shadow-md transition-all duration-200 border-gray-200">
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="relative">{getAvatar()}</div>

          {/* User Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-medium text-gray-900 truncate">
                {user.name}
              </h4>
              {getProviderIcon()}
            </div>

            <p className="text-sm text-gray-600 truncate mb-1">{user.email}</p>

            {user.provider && (
              <p className="text-xs text-gray-400 capitalize">
                via {user.provider}
              </p>
            )}
          </div>

          {/* Add Button */}
          <Button
            size="sm"
            onClick={onAdd}
            disabled={isAdded}
            className={`h-8 px-3 transition-all duration-200 ${
              isAdded
                ? "bg-green-100 text-green-700 hover:bg-green-100 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white"
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
