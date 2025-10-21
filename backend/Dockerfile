# Build stage
FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /app
COPY pom.xml ./
RUN mvn -B -q -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -B -DskipTests clean package

# Runtime stage
FROM eclipse-temurin:17-jre-alpine
ENV SPRING_PROFILES_ACTIVE=prod
ENV PORT=10000
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar

EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://localhost:10000/ || exit 1

ENTRYPOINT ["sh","-c","java $JAVA_OPTS -jar app.jar --spring.profiles.active=${SPRING_PROFILES_ACTIVE:-prod} --server.port=${PORT:-10000}"]