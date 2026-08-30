# =============================================================================
# DevShop Backend - Multi-stage Docker build
#   Build stage : maven:3.9-eclipse-temurin-21  (Java 21, Maven 3.9)
#   Run stage   : eclipse-temurin:21-jre         (lightweight JRE)
# =============================================================================

# ---- Stage 1: Build ----
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace

# Cache Maven dependencies by copying the POM first.
COPY pom.xml .
RUN mvn -B dependency:go-offline

# Copy source and build the jar.
COPY src ./src
RUN mvn -B -DskipTests package

# ---- Stage 2: Runtime ----
FROM eclipse-temurin:21-jre

# Install wget (used by the container healthcheck) and create a non-root user.
RUN apt-get update \
    && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system appuser && useradd --system --gid appuser appuser

WORKDIR /app

# Copy only the executable jar from the build stage.
COPY --from=build /workspace/target/*.jar app.jar

# Run as non-root.
USER appuser

EXPOSE 8080

# Preserve existing project timezone behaviour.
ENV TZ=Asia/Kolkata

# All configuration comes from environment variables.
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
