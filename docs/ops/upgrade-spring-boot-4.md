# Upgrade: Spring Boot 3.5.16 -> 4.1.1 (CM-052a)

Dedicated major-upgrade ticket (AGENTS.md section 7, decision D5 in `docs/plan/ORCHESTRATION.md`).
Goal: no behaviour change. Java stays 17 (pom `java.version`, Dockerfile `eclipse-temurin:17`).

## Versions

| Component | Before | After |
|---|---|---|
| Spring Boot | 3.5.16 | 4.1.1 |
| Spring Framework | 6.2.19 | 7.0.9 |
| Spring Security | 6.5.11 | 7.1.1 |
| Spring Data BOM | 2025.0.13 | 2026.0.1 |
| Jackson (used by the app) | 2.21.4 (`com.fasterxml.jackson`) | 3.1.5 (`tools.jackson`) |
| Tomcat | 10.1.55 | 11.0.24 |
| MongoDB driver | 5.5.2 | 5.8.1 |
| Lettuce | 6.6.0 | 7.5.2 |
| springdoc-openapi | 2.8.9 | 3.1.1 |
| Testcontainers | 1.21.4 | 2.0.5 (managed by Boot) |
| JUnit Jupiter | 5.12.2 | 6.0.3 (managed by Boot) |
| jacoco-maven-plugin | 0.8.12 | 0.8.12 (unchanged, works on the new bytecode) |
| Java | 17 | 17 |

## Dependency changes (with reasons)

| Change | Reason |
|---|---|
| `spring-boot-starter-parent` 3.5.16 -> 4.1.1 | The upgrade itself. |
| `spring-boot-starter-web` -> `spring-boot-starter-webmvc` | Renamed in Boot 4; the old name is deprecated. |
| `spring-boot-starter-oauth2-client` -> `spring-boot-starter-security-oauth2-client` | Renamed in Boot 4; the old name is deprecated. |
| `org.springframework.security:spring-security-test` -> `spring-boot-starter-security-test` | Boot 4 moved the MockMvc security test support into its own test module; the starter brings `spring-security-test` with it. |
| added `spring-boot-starter-webmvc-test` (test) | `@WebMvcTest` and `@AutoConfigureMockMvc` moved out of `spring-boot-test-autoconfigure` into this module in Boot 4. |
| added `spring-boot-starter-data-mongodb-test` (test) | `@DataMongoTest` moved into this module in Boot 4. |
| `org.testcontainers:junit-jupiter` -> `testcontainers-junit-jupiter` | Testcontainers 2 renamed every module with a `testcontainers-` prefix; the old coordinates do not exist in 2.x. |
| `org.testcontainers:mongodb` -> `testcontainers-mongodb` | Same Testcontainers 2 rename. |
| `springdoc.version` 2.8.9 -> 3.1.1 | springdoc 2.x supports Boot 3 only; 3.1.x is the line built against Boot 4.1. Its 3.1.1 changes (MCP opt-in, Scalar forwarded headers, cache bound) affect features this project does not use. |

Kept unchanged: `spring-boot-starter-test` (still the base test starter), the data-mongodb, data-redis,
security, websocket, actuator, validation and devtools starters, `spring-boot-testcontainers`, lombok.
The Jackson 2 compatibility module (`spring-boot-jackson2`) is NOT added.

Note: `com.fasterxml.jackson.core:jackson-databind` 2.21.5 is still on the runtime classpath because
`swagger-core-jakarta` (via springdoc) uses it internally. No application or test code imports it any more.

## Code changes by category

**Jackson 3 (`com.fasterxml.jackson.*` -> `tools.jackson.*`)**
- Main: `SecurityConfig`, `GlobalExceptionHandler`, `RateLimitingFilter`, `WsRateLimitInterceptor`,
  `RedisPresencePublisher`, `RedisPresenceSubscriber`. Jackson 3 exceptions are unchecked
  (`JacksonException`), so `catch (IOException | JsonProcessingException)` became `catch (JacksonException)`.
- Annotations (`@JsonIgnore`, `@JsonInclude`, `@JsonFormat`, `@JsonProperty`) stay in
  `com.fasterxml.jackson.annotation`, as in Jackson 3.
- Tests: `ObjectMapper().findAndRegisterModules()` -> `JsonMapper.builder()...build()` or a plain
  `ObjectMapper` (java.time support is built into Jackson 3); `SerializationFeature.WRITE_DATES_AS_TIMESTAMPS`
  -> `DateTimeFeature.WRITE_DATES_AS_TIMESTAMPS`; `JsonNode.fieldNames()` -> `propertyNames()`;
  `JsonProcessingException`/`JsonParseException` -> `JacksonException`/`StreamReadException`;
  the deprecated `JsonNode.asText()`/`isTextual()` -> `asString()`/`isString()` (same results; `asText()` is
  only a deprecated alias in Jackson 3), also in `WsRateLimitInterceptor`;
  STOMP test clients use `JacksonJsonMessageConverter` instead of the deprecated `MappingJackson2MessageConverter`.

**Spring Security 7**
- `AntPathRequestMatcher` was removed. `SecurityConfig` uses `PathPatternRequestMatcher.pathPattern("/api/**")`
  for the JSON entry point and access-denied handler. Rules are unchanged: same permitAll paths, CSRF with
  `SpaCsrfTokenRequestHandler`, CORS, OAuth2 login, logout.

- Login redirect: Spring Security 7's `LoginUrlAuthenticationEntryPoint` favours relative URIs, which would send
  `Location: /login` instead of the absolute URL sent before. `SecurityConfig` builds the browser entry point with
  `setFavorRelativeUris(false)` under the same `AnyRequestMatcher` registration, so an unauthenticated browser request
  still gets the absolute login URL (e.g. `http://localhost/login` in MockMvc). API requests still get 401
  ProblemDetail with no `Location`.

**Spring Framework 7 / messaging**
- `SimpMessagingTemplate.convertAndSend(String, Map)` became ambiguous with the new
  `convertAndSend(Object payload, Map headers)` overload. Calls with a `Map` payload cast it to `Object`,
  which keeps the old destination+payload call (`RedisPresenceSubscriber` and tests).

**Configuration properties**

Only property keys changed. The environment variables the files read stay the same, so Render needs no
change. Checked against the Boot 4.1.1 configuration metadata (`spring-configuration-metadata.json` in
`spring-boot-mongodb`, `spring-boot-data-mongodb`, `spring-boot-data-redis`) and the Boot 4.0 migration guide:

| File | Boot 3 key | Boot 4 key | Value / env var (unchanged) |
|---|---|---|---|
| `application-prod.properties` | `spring.data.mongodb.uri` | `spring.mongodb.uri` | `${MONGO_URI_PROD}` |
| `application-dev.properties` | `spring.data.mongodb.uri` | `spring.mongodb.uri` | `${MONGO_URI_DEV}` |
| `application-local.properties` | `spring.data.mongodb.uri` | `spring.mongodb.uri` | `mongodb://localhost:27017/chatmee` |
| `application.properties`, `-local`, test | `spring.data.mongodb.auto-index-creation` | unchanged (still a Spring Data key in Boot 4) | `true` |
| `application-prod.properties` | `spring.data.redis.url` | unchanged | `${REDIS_URL}` |
| `application.properties`, `-local` | `spring.data.redis.host` / `.port` | unchanged | `localhost` / `6379` |

In 4.1.1 the old `spring.data.mongodb.uri` is deprecated with level `error` and is no longer bound: with the
old key the app silently falls back to `mongodb://localhost/test`. `PersistencePropertyBindingTest` loads the
real property files for the prod and dev profiles, with sentinel `MONGO_URI_PROD` / `MONGO_URI_DEV` /
`REDIS_URL` values. It asserts the Mongo connection string, `MongoMappingContext.isAutoIndexCreation()` and
the Redis host/port. It was checked to fail with the old Mongo key and with a wrong auto-index key. The ITs
cannot catch this because `@ServiceConnection` replaces the connection details. The local profile is not
loaded in that test because it imports an optional `.env` file.
- `management.endpoint.health.probes.enabled=false` added: Boot 4 turns the liveness/readiness groups on by
  default, which would add `/actuator/health/liveness` and `/readiness`. This keeps the Boot 3 actuator surface.

**Test package moves (Boot 4 modularisation)**
- `@WebMvcTest`, `@AutoConfigureMockMvc` -> `org.springframework.boot.webmvc.test.autoconfigure`
- `@DataMongoTest` -> `org.springframework.boot.data.mongodb.test.autoconfigure`
- Auto-configurations imported by sliced tests: `JacksonAutoConfiguration` (`boot.jackson.autoconfigure`),
  `WebMvcAutoConfiguration`/`DispatcherServletAutoConfiguration` (`boot.webmvc.autoconfigure`),
  `HealthEndpointAutoConfiguration` (`boot.health.autoconfigure.actuate.endpoint`, plus
  `HealthContributorRegistryAutoConfiguration`, which now owns the registry bean), the servlet part of the old
  `SecurityAutoConfiguration` is `ServletWebSecurityAutoConfiguration`, and `ServletWebServerFactoryAutoConfiguration`
  plus `WebSocketServletAutoConfiguration` are replaced by `TomcatServletWebServerAutoConfiguration` (it also
  carries the Tomcat WebSocket setup).
- `MongoDBContainer` -> `org.testcontainers.mongodb.MongoDBContainer`.

## Compatibility settings (keep Boot 3 behaviour)

| Setting | Where | Why |
|---|---|---|
| `setFavorRelativeUris(false)` on the browser `LoginUrlAuthenticationEntryPoint` | `SecurityConfig` | Security 7 default is a relative `Location: /login`; Boot 3 sent the absolute URL. |
| `spring.jackson.deserialization.fail-on-null-for-primitives=false` | `application.properties` | Jackson 3 enables it; Jackson 2 bound JSON `null` to `false`/`0`. Affects `RoomSettings` flags (create/update room) and STOMP `TypingMessage.typing` / `PresenceMessage.online`. Also restores `""` -> `false` for those flags. |
| `spring.jackson.deserialization.fail-on-trailing-tokens=false` | `application.properties` | Jackson 3 enables it; Jackson 2 ignored content after the first JSON value (`{...} x` was accepted). |
| `spring.jackson.mapper.sort-properties-alphabetically=false` | `application.properties` | Jackson 3 enables it; it reordered ProblemDetail keys (`detail, instance, status, title, type`). Boot 3 order is `type, title, status, detail, instance, code, errors`. |
| `management.endpoint.health.probes.enabled=false` | `application.properties` | Boot 4 adds liveness/readiness health groups by default. |

The Jackson settings apply to the one Boot `JsonMapper`, which backs the HTTP converters, the STOMP message
converter (Boot's `WebSocketMessagingAutoConfiguration`; the app does not override converters) and the
security ProblemDetail writer.

### How the Jackson defaults were compared

Every `DeserializationFeature`, `SerializationFeature`, `MapperFeature` and stream read/write feature of the Boot 4
`JsonMapper` was compared with a Boot 3-equivalent Jackson 2 mapper (`Jackson2ObjectMapperBuilder` with
`WRITE_DATES_AS_TIMESTAMPS` and `WRITE_DURATIONS_AS_TIMESTAMPS` off, as Boot 3 configured it). Then both mappers
serialized every response DTO (ApiResponse envelopes, ChatMessageResponse with nanosecond Instants and an emoji,
ChatRoomResponse with settings and LocalDateTime, PagedResponse, PublicRoomSummary, Auth/User/WsToken responses,
StompError, presence/typing messages, presence maps with nulls, ProblemDetail, doubles/NaN). They also read 49
request inputs (null/string/number/empty coercions for primitives, enums and Integer, unknown/duplicate
properties, trailing tokens, comments, single quotes, leading zeros, control characters, Instant/LocalDateTime
forms, big numbers). With the three Jackson settings above there were 0 differences, byte for byte. Unchanged
between Boot 3 and Boot 4: `FAIL_ON_UNKNOWN_PROPERTIES` off, `WRITE_DATES_AS_TIMESTAMPS` off,
`DEFAULT_VIEW_INCLUSION` off, ISO-8601 Instants with `Z`, nulls written.

Jackson 3 default changes kept (no effect on this app's DTOs):
- `READ_ENUMS_USING_TO_STRING` / `WRITE_ENUMS_USING_TO_STRING` on: no app enum (`RoomType`, `MessageType`, `Role`,
  `ErrorCode`) overrides `toString()`, so the text is the same as `name()`.
- `FIX_FIELD_NAME_UPPER_CASE_PREFIX` on: no DTO property has the `xYyy` shape it renames.
- `ALLOW_FINAL_FIELDS_AS_MUTATORS` off / `USE_GETTERS_AS_SETTERS` off: request DTOs are Lombok `@Data` classes with
  setters (no final fields, no getter-only collections), and responses are records or beans that are only written.
- `FAIL_ON_EMPTY_BEANS` off: no empty bean is serialized; it would only turn an error into `{}`.
- `COMBINE_UNICODE_SURROGATES_IN_UTF8` on: emoji output was byte-identical in the comparison.
- `USE_FAST_DOUBLE_PARSER` / `USE_FAST_BIG_NUMBER_PARSER` on: same values, faster parsing.
- `ALLOW_VOID_VALUED_PROPERTIES`, `FAIL_ON_ORDER_MAP_BY_INCOMPARABLE_KEY`: features not used here.

Regression tests: `ChatRoomControllerWebMvcTest.createRoom_nullSettingFlags_bindsFalse`,
`updateRoom_nullSettingFlags_bindsFalse`, `createRoom_trailingContentAfterJson_isAccepted`;
`JacksonCompatibilityTest` (STOMP null flags, trailing content, ProblemDetail order with the real Boot mapper);
`SecurityProblemDetailIT.login_anonymousBrowserRequest_keepsRedirect` (absolute `Location`) and
`api_anonymousRequest_keepsProblemPropertyOrder`. All of them failed before the fixes.

## Remaining deprecation warnings

Left on purpose (no behaviour change in this ticket; see follow-ups):
- `RedisTemplate.expire(K, long, TimeUnit)` (Spring Data Redis 4): `RateLimitingService` and its test.
  Replacement: `expire(K, Duration)`.
- `DefaultGroupSequenceProvider.getValidationGroups(T)` (Hibernate Validator 9, marked for removal):
  `CreateChatRoomGroupSequenceProvider`. Replacement: `getValidationGroups(Class<?>, T)`.

## What the owner must do on Render

- Nothing for environment variables: the Mongo URI is still read from `MONGO_URI_PROD`
  (`spring.mongodb.uri=${MONGO_URI_PROD}`), and Redis still from `REDIS_URL`.
- Only if someone set `SPRING_DATA_MONGODB_URI` directly on Render as an override (the repo does not use
  it): rename it to `SPRING_MONGODB_URI`, because Boot 4 ignores the old name.
- The Docker image keeps Java 17 and the same layered-jar entrypoint; no Render setting changes.
- After deploy, check `/actuator/health` returns `{"status":"UP"}` and that login, room list and live chat work.

## Rollback

Revert the merge commit of `build/CM-052a-spring-boot-4` on `develop` (`git revert -m 1 <merge-sha>`) and
redeploy. No data migration was made, so the Boot 3 build reads the same MongoDB and Redis data.
