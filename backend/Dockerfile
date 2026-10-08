# Build stage
FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /app
COPY pom.xml ./
RUN mvn -B -q -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -B -DskipTests clean package

# Extract stage
FROM eclipse-temurin:17-jre-alpine AS extractor
WORKDIR /builder
COPY --from=builder /app/target/*.jar app.jar
RUN java -Djarmode=tools -jar app.jar extract --layers --launcher

# Runtime stage
FROM eclipse-temurin:17-jre-alpine
RUN addgroup -S app && adduser -S app -G app

ENV SPRING_PROFILES_ACTIVE=prod
ENV PORT=10000
WORKDIR /app

COPY --from=extractor --chown=app:app /builder/app/dependencies/ ./
COPY --from=extractor --chown=app:app /builder/app/spring-boot-loader/ ./
COPY --from=extractor --chown=app:app /builder/app/snapshot-dependencies/ ./
COPY --from=extractor --chown=app:app /builder/app/application/ ./

USER app

EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 --start-period=30s \
  CMD sh -c 'wget -qO- http://localhost:${PORT:-10000}/actuator/health || exit 1'

ENTRYPOINT ["sh","-c","java $JAVA_OPTS org.springframework.boot.loader.launch.JarLauncher --spring.profiles.active=${SPRING_PROFILES_ACTIVE:-prod} --server.port=${PORT:-10000}"]