package com.lnt.chatmee.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.config.EnableMongoAuditing;

/** Fills @CreatedDate / @LastModifiedDate fields (ChatRoom.createdAt, Participant.joinedAt/updatedAt). */
@Configuration
@EnableMongoAuditing
public class MongoConfig {
}
