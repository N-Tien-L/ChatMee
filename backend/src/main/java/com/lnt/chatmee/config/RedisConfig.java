package com.lnt.chatmee.config;

import static com.lnt.chatmee.service.RedisPresencePublisher.PRESENCE_CHANNEL;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.listener.adapter.MessageListenerAdapter;

import com.lnt.chatmee.service.RedisPresenceSubscriber;

@Configuration
public class RedisConfig {

    @Bean
    public RedisMessageListenerContainer container(RedisConnectionFactory connectionFactory, MessageListenerAdapter listenerAdapter) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.addMessageListener(listenerAdapter, new ChannelTopic(PRESENCE_CHANNEL));
        return container;
    }

    @Bean
    public MessageListenerAdapter listenerAdapter(RedisPresenceSubscriber subscriber) {
        return new MessageListenerAdapter(subscriber);
    }
}
