package com.lnt.chatmee.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import com.lnt.chatmee.exception.RateLimitExceededException;
import com.lnt.chatmee.model.Report;
import com.lnt.chatmee.model.ReportReason;
import com.lnt.chatmee.model.ReportTargetType;
import com.lnt.chatmee.model.User;
import com.lnt.chatmee.repository.ChatRoomRepository;
import com.lnt.chatmee.repository.MessageRepository;
import com.lnt.chatmee.repository.ReportRepository;
import com.lnt.chatmee.repository.UserRepository;

/**
 * SPEC-009 AC-009-20 / AC-009-29 (CM-067): the report limit of 10 per day comes from the real application.properties
 * (Boot config data), and ReportService rejects the 11th report of a day with that bound value. Redis and the
 * repositories are mocked; the Redis counter is simulated per key.
 */
class ReportDailyLimitBindingTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withBean(StringRedisTemplate.class, ReportDailyLimitBindingTest::countingRedis)
            .withBean(ReportRepository.class, () -> mock(ReportRepository.class))
            .withBean(UserRepository.class, ReportDailyLimitBindingTest::users)
            .withBean(MessageRepository.class, () -> mock(MessageRepository.class))
            .withBean(ChatRoomRepository.class, () -> mock(ChatRoomRepository.class))
            .withBean(ParticipantService.class, () -> mock(ParticipantService.class))
            .withUserConfiguration(RateLimitingService.class, ReportService.class);

    @Test
    void createReport_defaultConfig_allowsTenPerDayAndRejectsTheEleventh() {
        runner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getEnvironment().getProperty("chatmee.rate-limit.daily.report")).isEqualTo("10");
            ReportService reports = context.getBean(ReportService.class);

            for (int i = 1; i <= 10; i++) {
                assertThatCode(() -> report(reports)).doesNotThrowAnyException();
            }
            assertThatThrownBy(() -> report(reports)).isInstanceOf(RateLimitExceededException.class);

            verify(context.getBean(ReportRepository.class), times(10)).save(any(Report.class));
        });
    }

    @Test
    void createReport_overriddenLimit_bindsConfiguredValue() {
        runner.withPropertyValues("chatmee.rate-limit.daily.report=3").run(context -> {
            assertThat(context).hasNotFailed();
            ReportService reports = context.getBean(ReportService.class);

            for (int i = 1; i <= 3; i++) {
                assertThatCode(() -> report(reports)).doesNotThrowAnyException();
            }
            assertThatThrownBy(() -> report(reports)).isInstanceOf(RateLimitExceededException.class);
            verify(context.getBean(ReportRepository.class), times(3)).save(any(Report.class));
        });
    }

    private static void report(ReportService reports) {
        reports.createReport("reporter", ReportTargetType.USER, "target", ReportReason.SPAM, null);
    }

    @SuppressWarnings("unchecked")
    private static StringRedisTemplate countingRedis() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ValueOperations<String, String> values = mock(ValueOperations.class);
        AtomicLong counter = new AtomicLong();
        when(redis.opsForValue()).thenReturn(values);
        when(values.increment(anyString())).thenAnswer(call -> counter.incrementAndGet());
        return redis;
    }

    private static UserRepository users() {
        UserRepository users = mock(UserRepository.class);
        when(users.findById("reporter")).thenReturn(Optional.of(User.builder().id("reporter").build()));
        when(users.existsById("target")).thenReturn(true);
        return users;
    }
}
