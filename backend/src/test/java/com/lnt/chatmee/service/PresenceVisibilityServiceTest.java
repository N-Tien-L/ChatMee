package com.lnt.chatmee.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.lnt.chatmee.model.ChatRoom;
import com.lnt.chatmee.model.Participant;
import com.lnt.chatmee.model.RoomState;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.ParticipantRepository;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class PresenceVisibilityServiceTest {
    private final ParticipantRepository participants = mock(ParticipantRepository.class);
    private final ChatRoomRepository rooms = mock(ChatRoomRepository.class);
    private final PresenceService registry = mock(PresenceService.class);
    private final PresenceVisibilityService visibility = new PresenceVisibilityService(participants, rooms, registry);
    private Participant member(String room, String user) { return Participant.builder().chatRoomId(room).userId(user).build(); }
    private ChatRoom room(String id, boolean active, RoomState state) {
        return ChatRoom.builder().id(id).type(ChatRoom.RoomType.PUBLIC).isActive(active).state(state).build();
    }
    @Test void onlineFor_unrelatedUsers_returnsOnlyOnlineSelf() {
        when(participants.findByUserId("viewer")).thenReturn(List.of());
        when(registry.getOnlineUsers()).thenReturn(Set.of("viewer", "stranger"));
        assertThat(visibility.onlineFor("viewer")).containsExactly("viewer");
        assertThat(visibility.canSee("viewer", "stranger")).isFalse();
        verifyNoInteractions(rooms);
    }
    @Test void onlineFor_sharedActiveRoom_excludesDeletedRequestedAndUnrelated() {
        when(participants.findByUserId("viewer")).thenReturn(List.of(member("active", "viewer"), member("deleted", "viewer"), member("requested", "viewer")));
        when(rooms.findAllById(any())).thenReturn(List.of(room("active", true, RoomState.ACTIVE), room("deleted", false, RoomState.ACTIVE), room("requested", true, RoomState.REQUESTED)));
        when(participants.findByChatRoomIdIn(Set.of("active"))).thenReturn(List.of(member("active", "viewer"), member("active", "related")));
        when(registry.getOnlineUsers()).thenReturn(Set.of("viewer", "related", "deleted-only", "requested-only", "stranger"));
        assertThat(visibility.onlineFor("viewer")).containsExactlyInAnyOrder("viewer", "related");
        assertThat(visibility.canSee("viewer", "related")).isTrue();
        assertThat(visibility.canSee("viewer", "requested-only")).isFalse();
    }
    @Test void canSee_hiddenActiveDm_keepsExistingMembership() {
        Participant hidden = member("dm", "viewer");
        hidden.setHiddenAt(Instant.now());
        when(participants.findByUserId("viewer")).thenReturn(List.of(hidden));
        ChatRoom dm = room("dm", true, RoomState.ACTIVE);
        dm.setType(ChatRoom.RoomType.DIRECT_MESSAGE);
        when(rooms.findAllById(any())).thenReturn(List.of(dm));
        when(participants.findByChatRoomIdIn(Set.of("dm"))).thenReturn(List.of(hidden, member("dm", "other")));
        assertThat(visibility.canSee("viewer", "other")).isTrue();
    }
    @Test void canSee_membershipRemoved_rechecksWithoutStaleCache() {
        when(participants.findByUserId("viewer")).thenReturn(List.of(member("shared", "viewer"))).thenReturn(List.of());
        when(rooms.findAllById(any())).thenReturn(List.of(room("shared", true, RoomState.ACTIVE)));
        when(participants.findByChatRoomIdIn(Set.of("shared"))).thenReturn(List.of(member("shared", "other")));
        assertThat(visibility.canSee("viewer", "other")).isTrue();
        assertThat(visibility.canSee("viewer", "other")).isFalse();
    }
    @Test void canSee_oneOfSeveralSharedRoomsRemains_retainsVisibility() {
        when(participants.findByUserId("viewer")).thenReturn(List.of(member("remaining", "viewer")));
        when(rooms.findAllById(any())).thenReturn(List.of(room("remaining", true, RoomState.ACTIVE)));
        when(participants.findByChatRoomIdIn(Set.of("remaining"))).thenReturn(List.of(member("remaining", "other")));
        assertThat(visibility.canSee("viewer", "other")).isTrue();
    }
    @Test void canSee_nullIdentityOrSelf_neverBroadensAudience() {
        assertThat(visibility.canSee(null, "other")).isFalse();
        assertThat(visibility.canSee("viewer", null)).isFalse();
        assertThat(visibility.canSee("viewer", "viewer")).isTrue();
        verifyNoInteractions(participants, rooms, registry);
    }
}
