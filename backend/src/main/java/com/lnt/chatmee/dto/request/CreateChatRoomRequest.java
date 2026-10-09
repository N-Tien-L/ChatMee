package com.lnt.chatmee.dto.request;

import org.hibernate.validator.group.GroupSequenceProvider;

import com.lnt.chatmee.dto.validation.CreateChatRoomGroupSequenceProvider;
import com.lnt.chatmee.dto.validation.RoomName;
import com.lnt.chatmee.model.ChatRoom.RoomSettings;
import com.lnt.chatmee.model.ChatRoom.RoomType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;

import lombok.Data;

@Data
@GroupSequenceProvider(CreateChatRoomGroupSequenceProvider.class)
public class CreateChatRoomRequest {

    /** Checks that only apply to DIRECT_MESSAGE rooms. */
    public interface DirectMessageChecks {}

    /** Checks that only apply to PUBLIC and PRIVATE rooms. */
    public interface GroupRoomChecks {}

    @NotNull(message = "Room type is required")
    private RoomType roomType;

    // for direct chat
    @NotBlank(groups = DirectMessageChecks.class, message = "Participant ID is required for direct messages")
    @Size(max = 255, message = "Participant ID must not exceed 255 characters")
    @Pattern(regexp = "^[a-zA-Z0-9._-]*$", message = "Participant ID must be a valid identifier")
    private String participantId;

    // for private/public chat
    @NotBlank(groups = GroupRoomChecks.class, message = "Room name is required for this room type")
    @RoomName
    private String roomName;
    
    @Size(max = 500, message = "Description must not exceed 500 characters")
    private String description;
    
    @Min(value = 2, message = "Maximum users must be at least 2")
    @Max(value = 1000, message = "Maximum users cannot exceed 1000")
    private Integer maxUsers;
    
    private RoomSettings settings;
}
