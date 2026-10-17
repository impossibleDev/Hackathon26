# Watermelon Multiplayer

The browser game is a separate-board score competition for 2–4 players. Each player gets their own game board; the room host starts the round, and scores update live. The host can start another round after everyone finishes.

## Play locally

The HTML page calls the multiplayer server, so opening it directly as a file will not start a competition. Run the server locally for testing or deploy it for cross-device play.

## Deploy for online play

The included `Dockerfile` runs the Java room server and serves the game from the same HTTPS site. `render.yaml` provides a Render Blueprint configuration.

1. Push this project to a GitHub repository.
2. In Render, create a new **Blueprint** and select that repository.
3. Deploy the `watermelon-fruit-merge` web service from `render.yaml`.
4. Open the service's HTTPS URL and share it with the other players.
5. One player creates a competition and shares the six-character room code; the others join using the same URL and code.

The first request to a free hosted service may take a little time to wake it up. Rooms and scores are held in server memory and expire after six hours without activity; restarting the service clears rooms.

The source server can also be run directly with Java 21 or newer:

```powershell
javac --add-modules jdk.httpserver -d out server\WatermelonServer.java
java --add-modules jdk.httpserver -Dwatermelon.webRoot=. -cp out server.WatermelonServer
```

Then open `http://localhost:10000`. To let other devices on your local network connect, use the host computer's LAN address instead of `localhost`.
