package com.lnt.chatmee.service;

import com.lnt.chatmee.model.Participant;
import com.lnt.chatmee.model.RoomState;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.ParticipantRepository;
import java.util.HashSet;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/** Presence audiences come from current active memberships, never the public user directory. */
@Service
@RequiredArgsConstructor
public class PresenceVisibilityService {
    private final ParticipantRepository participants;
    private final ChatRoomRepository rooms;
    private final PresenceService presence;

    public Set<String> onlineFor(String viewer) {
        Set<String> allowed = relatedUsers(viewer);
        allowed.retainAll(presence.getOnlineUsers());
        return Set.copyOf(allowed);
    }

    public boolean canSee(String viewer, String subject) {
        return viewer != null && subject != null && (viewer.equals(subject) || relatedUsers(viewer).contains(subject));
    }

    private Set<String> relatedUsers(String viewer) {
        Set<String> related = new HashSet<>();
        if (viewer == null) return related;
        related.add(viewer);
        Set<String> joined = participants.findByUserId(viewer).stream().map(Participant::getChatRoomId).collect(Collectors.toSet());
        if (joined.isEmpty()) return related;
        Set<String> active = new HashSet<>();
        rooms.findAllById(joined).forEach(room -> {
            if (room.isActive() && room.getState() == RoomState.ACTIVE) active.add(room.getId());
        });
        if (!active.isEmpty()) participants.findByChatRoomIdIn(active).forEach(member -> related.add(member.getUserId()));
        return related;
    }
}
