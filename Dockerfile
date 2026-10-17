FROM eclipse-temurin:21-jdk

WORKDIR /app
COPY server/WatermelonServer.java /app/server/WatermelonServer.java
COPY watermelon.html watermelon.css watermelon.js /app/web/
RUN javac --add-modules jdk.httpserver -d /app/classes /app/server/WatermelonServer.java

ENV PORT=10000
EXPOSE 10000
CMD ["java", "--add-modules", "jdk.httpserver", "-Dwatermelon.webRoot=/app/web", "-cp", "/app/classes", "server.WatermelonServer"]
