package server;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;

public final class WatermelonServer {
    private static final int MAX_PLAYERS = 4;
    private static final long ROOM_LIFETIME_MILLIS = 6L * 60 * 60 * 1000;
    private static final String CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final Path WEB_ROOT = Path.of(
            System.getProperty("watermelon.webRoot", "/app/web")).toAbsolutePath().normalize();
    private static final ConcurrentHashMap<String, Room> ROOMS = new ConcurrentHashMap<>();

    private WatermelonServer() { }

    public static void main(String[] args) throws IOException {
        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "10000"));
        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);
        server.createContext("/", WatermelonServer::handle);
        server.setExecutor(Executors.newFixedThreadPool(Math.max(4, Runtime.getRuntime().availableProcessors())));
        server.start();
        System.out.println("Watermelon server listening on port " + port);
    }

    private static void handle(HttpExchange exchange) throws IOException {
        try {
            pruneRooms();
            String path = exchange.getRequestURI().getPath();
            if (path.equals("/api/health")) {
                sendJson(exchange, 200, "{\"status\":\"ok\"}");
            } else if (path.equals("/api/rooms") && exchange.getRequestMethod().equals("POST")) {
                createRoom(exchange);
            } else if (path.startsWith("/api/rooms/")) {
                routeRoomRequest(exchange, path.substring("/api/rooms/".length()));
            } else {
                serveStatic(exchange, path);
            }
        } catch (ApiException error) {
            sendError(exchange, error.status, error.getMessage());
        } catch (IllegalArgumentException error) {
            sendError(exchange, 400, "Invalid request.");
        } catch (Exception error) {
            error.printStackTrace(System.err);
            sendError(exchange, 500, "The server could not complete that request.");
        } finally {
            exchange.close();
        }
    }

    private static void createRoom(HttpExchange exchange) throws IOException {
        Map<String, String> query = query(exchange);
        Player host = new Player(UUID.randomUUID().toString(), cleanName(query.get("name")));
        Room room;
        String code;
        do {
            code = newRoomCode();
            room = new Room(code, host);
        } while (ROOMS.putIfAbsent(code, room) != null);
        sendJson(exchange, 201, "{\"code\":" + quote(code) + ",\"token\":" + quote(host.token)
                + ",\"playerId\":" + quote(host.token) + ",\"host\":true}");
    }

    private static void routeRoomRequest(HttpExchange exchange, String suffix) throws IOException {
        String[] parts = suffix.split("/");
        if (parts.length < 1 || !parts[0].matches("[A-Z0-9]{6}")) {
            throw new ApiException(404, "Room not found.");
        }

        Room room = ROOMS.get(parts[0]);
        if (room == null) throw new ApiException(404, "Room not found or expired.");

        if (parts.length == 2 && parts[1].equals("join") && exchange.getRequestMethod().equals("POST")) {
            joinRoom(exchange, room);
            return;
        }

        Map<String, String> query = query(exchange);
        String token = query.get("token");
        Player player = room.playerByToken(token);
        if (player == null) throw new ApiException(403, "This room session is invalid. Rejoin with the room code.");

        if (parts.length == 1 && exchange.getRequestMethod().equals("GET")) {
            sendJson(exchange, 200, room.toJson(player));
        } else if (parts.length == 2 && parts[1].equals("start") && exchange.getRequestMethod().equals("POST")) {
            room.start(player);
            sendJson(exchange, 200, room.toJson(player));
        } else if (parts.length == 2 && parts[1].equals("score") && exchange.getRequestMethod().equals("POST")) {
            room.updateScore(player, parseScore(query.get("score")), Boolean.parseBoolean(query.get("done")));
            sendJson(exchange, 200, "{\"status\":\"ok\"}");
        } else if (parts.length == 2 && parts[1].equals("reset") && exchange.getRequestMethod().equals("POST")) {
            room.reset(player);
            sendJson(exchange, 200, room.toJson(player));
        } else if (parts.length == 2 && parts[1].equals("leave") && exchange.getRequestMethod().equals("POST")) {
            room.leave(player);
            sendJson(exchange, 200, "{\"status\":\"ok\"}");
        } else {
            throw new ApiException(404, "Unknown room request.");
        }
    }

    private static void joinRoom(HttpExchange exchange, Room room) throws IOException {
        String name = cleanName(query(exchange).get("name"));
        Player player = room.join(name);
        sendJson(exchange, 201, "{\"code\":" + quote(room.code) + ",\"token\":" + quote(player.token)
                + ",\"playerId\":" + quote(player.token) + ",\"host\":" + player.host + "}");
    }

    private static void serveStatic(HttpExchange exchange, String requestPath) throws IOException {
        if (!exchange.getRequestMethod().equals("GET") && !exchange.getRequestMethod().equals("HEAD")) {
            sendError(exchange, 405, "Method not allowed.");
            return;
        }
        String fileName = switch (requestPath) {
            case "/", "/watermelon", "/watermelon.html" -> "watermelon.html";
            case "/watermelon.css" -> "watermelon.css";
            case "/watermelon.js" -> "watermelon.js";
            default -> null;
        };
        if (fileName == null) {
            sendError(exchange, 404, "Page not found.");
            return;
        }
        Path file = WEB_ROOT.resolve(fileName).normalize();
        if (!file.startsWith(WEB_ROOT) || !Files.isRegularFile(file)) {
            sendError(exchange, 404, "Game files are missing.");
            return;
        }
        byte[] data = Files.readAllBytes(file);
        exchange.getResponseHeaders().set("Content-Type", contentType(fileName));
        exchange.getResponseHeaders().set("Cache-Control", "no-cache");
        exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        if (exchange.getRequestMethod().equals("HEAD")) {
            exchange.getResponseHeaders().set("Content-Length", String.valueOf(data.length));
            exchange.sendResponseHeaders(200, -1);
        } else {
            exchange.sendResponseHeaders(200, data.length);
            exchange.getResponseBody().write(data);
        }
    }

    private static String contentType(String fileName) {
        if (fileName.endsWith(".html")) return "text/html; charset=utf-8";
        if (fileName.endsWith(".css")) return "text/css; charset=utf-8";
        if (fileName.endsWith(".js")) return "text/javascript; charset=utf-8";
        return "application/octet-stream";
    }

    private static Map<String, String> query(HttpExchange exchange) {
        Map<String, String> values = new HashMap<>();
        String raw = exchange.getRequestURI().getRawQuery();
        if (raw == null || raw.isEmpty()) return values;
        for (String pair : raw.split("&")) {
            int separator = pair.indexOf('=');
            String key = separator < 0 ? pair : pair.substring(0, separator);
            String value = separator < 0 ? "" : pair.substring(separator + 1);
            values.put(URLDecoder.decode(key, StandardCharsets.UTF_8),
                    URLDecoder.decode(value, StandardCharsets.UTF_8));
        }
        return values;
    }

    private static String cleanName(String name) {
        String cleaned = name == null ? "" : name.strip().replaceAll("\\s+", " ");
        if (cleaned.length() > 18) cleaned = cleaned.substring(0, 18);
        return cleaned.isEmpty() ? "Player" : cleaned;
    }

    private static int parseScore(String value) {
        try {
            int score = Integer.parseInt(value);
            if (score < 0 || score > 100_000_000) throw new NumberFormatException();
            return score;
        } catch (NumberFormatException error) {
            throw new ApiException(400, "Invalid score.");
        }
    }

    private static String newRoomCode() {
        StringBuilder code = new StringBuilder(6);
        for (int i = 0; i < 6; i++) {
            code.append(CODE_CHARS.charAt((int) (Math.random() * CODE_CHARS.length())));
        }
        return code.toString();
    }

    private static void pruneRooms() {
        long now = System.currentTimeMillis();
        ROOMS.entrySet().removeIf(entry -> now - entry.getValue().lastActivity > ROOM_LIFETIME_MILLIS);
    }

    private static String quote(String value) {
        StringBuilder result = new StringBuilder("\"");
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"' -> result.append("\\\"");
                case '\\' -> result.append("\\\\");
                case '\b' -> result.append("\\b");
                case '\f' -> result.append("\\f");
                case '\n' -> result.append("\\n");
                case '\r' -> result.append("\\r");
                case '\t' -> result.append("\\t");
                default -> {
                    if (c < 0x20) result.append(String.format("\\u%04x", (int) c));
                    else result.append(c);
                }
            }
        }
        return result.append('"').toString();
    }

    private static void sendError(HttpExchange exchange, int status, String message) throws IOException {
        sendJson(exchange, status, "{\"error\":" + quote(message) + "}");
    }

    private static void sendJson(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
    }

    private static final class Player {
        private final String token;
        private final String name;
        private boolean host;
        private int score;
        private boolean done;

        private Player(String token, String name) {
            this.token = token;
            this.name = name;
        }
    }

    private static final class Room {
        private final String code;
        private final List<Player> players = new ArrayList<>();
        private int round;
        private boolean started;
        private volatile long lastActivity = System.currentTimeMillis();

        private Room(String code, Player host) {
            this.code = code;
            host.host = true;
            players.add(host);
        }

        private synchronized Player playerByToken(String token) {
            touch();
            return players.stream().filter(player -> player.token.equals(token)).findFirst().orElse(null);
        }

        private synchronized Player join(String name) {
            touch();
            if (started) throw new ApiException(409, "This competition has already started.");
            if (players.size() >= MAX_PLAYERS) throw new ApiException(409, "This room is full.");
            Player player = new Player(UUID.randomUUID().toString(), name);
            players.add(player);
            return player;
        }

        private synchronized void start(Player player) {
            requireHost(player);
            if (players.size() < 2) throw new ApiException(409, "At least two players are needed to start.");
            if (started) throw new ApiException(409, "The competition has already started.");
            started = true;
            round = 1;
            clearScores();
            touch();
        }

        private synchronized void updateScore(Player player, int score, boolean done) {
            if (!started) throw new ApiException(409, "The competition has not started.");
            if (!player.done || done) {
                player.score = Math.max(player.score, score);
                player.done = player.done || done;
            }
            touch();
        }

        private synchronized void reset(Player player) {
            requireHost(player);
            if (!started || players.stream().anyMatch(p -> !p.done)) {
                throw new ApiException(409, "Wait until every player has finished before starting another round.");
            }
            clearScores();
            round++;
            touch();
        }

        private synchronized void leave(Player player) {
            players.remove(player);
            if (player.host && !players.isEmpty()) players.get(0).host = true;
            if (players.isEmpty()) ROOMS.remove(code, this);
            touch();
        }

        private synchronized String toJson(Player requester) {
            touch();
            StringBuilder json = new StringBuilder();
            json.append("{\"code\":").append(quote(code))
                    .append(",\"started\":").append(started)
                    .append(",\"round\":").append(round)
                    .append(",\"isHost\":").append(requester.host)
                    .append(",\"players\":[");
            for (int i = 0; i < players.size(); i++) {
                if (i > 0) json.append(',');
                Player player = players.get(i);
                json.append("{\"id\":").append(quote(player.token))
                        .append(",\"name\":").append(quote(player.name))
                        .append(",\"host\":").append(player.host)
                        .append(",\"score\":").append(player.score)
                        .append(",\"done\":").append(player.done).append('}');
            }
            return json.append("]}").toString();
        }

        private void clearScores() {
            for (Player player : players) {
                player.score = 0;
                player.done = false;
            }
        }

        private void requireHost(Player player) {
            if (!player.host) throw new ApiException(403, "Only the room host can do that.");
        }

        private void touch() {
            lastActivity = Instant.now().toEpochMilli();
        }
    }

    private static final class ApiException extends RuntimeException {
        private final int status;

        private ApiException(int status, String message) {
            super(message);
            this.status = status;
        }
    }
}
