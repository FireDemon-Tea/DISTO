package com.synderis.metricsbridge;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.javalin.Javalin;
// import io.javalin.websocket.WsConnectContext; // Temporarily disabled
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.command.ServerCommandSource;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Supplier;

public class WebServer {
    private final int port;
    private final String token;
    private final Supplier<Map<String, Object>> metricsSupplier;
    private final Supplier<MinecraftServer> serverSupplier;
    private Javalin app;
    private final ObjectMapper objectMapper = new ObjectMapper();
    // private final CopyOnWriteArrayList<WsConnectContext> clients = new CopyOnWriteArrayList<>(); // Temporarily disabled
    private final CopyOnWriteArrayList<String> consoleOutput = new CopyOnWriteArrayList<>();
    private final int maxConsoleLines = 1000;
    private PlayerAuthFilter playerAuth;
    private UserDatabase userDatabase;

    public WebServer(int port, String token, Supplier<Map<String, Object>> metricsSupplier, Supplier<MinecraftServer> serverSupplier) {
        this.port = port; this.token = token; this.metricsSupplier = metricsSupplier; this.serverSupplier = serverSupplier;
    }

    public void start() {
        app = Javalin.create(cfg -> {
            cfg.router.apiBuilder(() -> {});
            // cfg.bundledPlugins.enableDevLogging(); // Disabled to reduce log spam
            cfg.http.defaultContentType = "application/json";
            // Remove deprecated configuration options
            cfg.staticFiles.add(staticFiles -> {
                staticFiles.hostedPath = "/";
                staticFiles.directory = "web"; // optional if you later add a static dashboard
                staticFiles.precompress = false;
            });
        }).start(port);

        // Initialize user database
        userDatabase = new UserDatabase("config/users.json");
        
        // BlueMap detection endpoint (no auth required for detection)
        app.get("/api/bluemap/detect", ctx -> {
            Map<String, Object> bluemapInfo = JsonUtil.detectBlueMapConfig();
            ctx.json(bluemapInfo);
        });
        
        // Auth middleware
        playerAuth = new PlayerAuthFilter(token, serverSupplier, userDatabase);
        app.before("/api/*", playerAuth);

        // Metrics endpoint (Authenticated users only)
        app.get("/api/metrics", ctx -> {
            String sessionToken = ctx.header("X-Session-Token");
            if (sessionToken == null || playerAuth.getSession(sessionToken) == null) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("error", "Authentication required");
                ctx.status(401).json(response);
                return;
            }
            ctx.json(metricsSupplier.get());
        });
        
        // Test endpoint to verify server is working
        app.get("/api/test", ctx -> {
            Map<String, Object> response = new HashMap<>();
            response.put("status", "ok");
            response.put("timestamp", System.currentTimeMillis());
            response.put("websocket_supported", true);
            ctx.json(response);
        });
        

        // Teleport endpoint (Admin only)
        app.post("/api/teleport", ctx -> {
            String sessionToken = ctx.header("X-Session-Token");
            if (sessionToken == null || !playerAuth.isOp(sessionToken)) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("error", "Admin privileges required");
                ctx.status(403).json(response);
                return;
            }
            
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> request = objectMapper.readValue(ctx.body(), Map.class);
                String playerName = (String) request.get("player");
                Double x = ((Number) request.get("x")).doubleValue();
                Double y = ((Number) request.get("y")).doubleValue();
                Double z = ((Number) request.get("z")).doubleValue();
                String world = (String) request.get("world");
                
                if (playerName == null || playerName.trim().isEmpty()) {
                    Map<String, Object> response = new HashMap<>();
                    response.put("success", false);
                    response.put("error", "No player name provided");
                    ctx.json(response);
                    return;
                }

                if (x == null || y == null || z == null) {
                    Map<String, Object> response = new HashMap<>();
                    response.put("success", false);
                    response.put("error", "Invalid coordinates provided");
                    ctx.json(response);
                    return;
                }

                MinecraftServer server = serverSupplier.get();
                if (server == null) {
                    Map<String, Object> response = new HashMap<>();
                    response.put("success", false);
                    response.put("error", "Server not available");
                    ctx.json(response);
                    return;
                }

                // Find the player
                var player = server.getPlayerManager().getPlayer(playerName);
                if (player == null) {
                    Map<String, Object> response = new HashMap<>();
                    response.put("success", false);
                    response.put("error", "Player not found: " + playerName);
                    ctx.json(response);
                    return;
                }

                // Find the target world by checking all available worlds
                net.minecraft.server.world.ServerWorld targetWorld = null;
                for (net.minecraft.server.world.ServerWorld serverWorld : server.getWorlds()) {
                    if (serverWorld.getRegistryKey().getValue().toString().equals(world)) {
                        targetWorld = serverWorld;
                        break;
                    }
                }
                
                if (targetWorld == null) {
                    Map<String, Object> response = new HashMap<>();
                    response.put("success", false);
                    response.put("error", "World not found: " + world);
                    ctx.json(response);
                    return;
                }

                // Execute teleport command
                String teleportCommand = String.format("tp %s %f %f %f", playerName, x, y, z);
                ServerCommandSource source = server.getCommandSource();
                int result = server.getCommandManager().getDispatcher().execute(teleportCommand, source.withSilent());
                
                Map<String, Object> response = new HashMap<>();
                response.put("success", result > 0);
                response.put("output", result > 0 ? 
                    String.format("Teleported %s to %.2f, %.2f, %.2f in %s", playerName, x, y, z, world) : 
                    "Teleport command failed");
                response.put("result", result);
                ctx.json(response);
                
            } catch (Exception e) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("error", "Error executing teleport: " + e.getMessage());
                ctx.json(response);
            }
        });

        // Login endpoint (no auth required)
        app.post("/api/login", ctx -> {
            try {
                @SuppressWarnings("unchecked")
                Map<String, String> request = objectMapper.readValue(ctx.body(), Map.class);
                String username = request.get("username");
                String password = request.get("password");
                
                if (username == null || username.trim().isEmpty()) {
                    Map<String, Object> response = new HashMap<>();
                    response.put("success", false);
                    response.put("error", "Username is required");
                    ctx.json(response);
                    return;
                }
                
                if (password == null || password.trim().isEmpty()) {
                    Map<String, Object> response = new HashMap<>();
                    response.put("success", false);
                    response.put("error", "Password is required");
                    ctx.json(response);
                    return;
                }

                String sessionToken = playerAuth.createSession(username, password);
                if (sessionToken == null) {
                    Map<String, Object> response = new HashMap<>();
                    response.put("success", false);
                    response.put("error", "Invalid username or password");
                    ctx.json(response);
                    return;
                }

                PlayerAuthFilter.SessionInfo session = playerAuth.getSession(sessionToken);
                Map<String, Object> response = new HashMap<>();
                response.put("success", true);
                response.put("sessionToken", sessionToken);
                response.put("username", session.username);
                response.put("displayName", session.displayName);
                response.put("isAdmin", session.isOp);
                ctx.json(response);
                
            } catch (Exception e) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("error", "Login error: " + e.getMessage());
                ctx.json(response);
            }
        });

        // Logout endpoint
        app.post("/api/logout", ctx -> {
            try {
                String sessionToken = ctx.header("X-Session-Token");
                if (sessionToken != null) {
                    playerAuth.invalidateSession(sessionToken);
                }
                
                Map<String, Object> response = new HashMap<>();
                response.put("success", true);
                response.put("message", "Logged out successfully");
                ctx.json(response);
                
            } catch (Exception e) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("error", "Logout error: " + e.getMessage());
                ctx.json(response);
            }
        });

        // Session info endpoint
        app.get("/api/session", ctx -> {
            try {
                String sessionToken = ctx.header("X-Session-Token");
                if (sessionToken == null || playerAuth.getSession(sessionToken) == null) {
                    Map<String, Object> response = new HashMap<>();
                    response.put("authenticated", false);
                    ctx.json(response);
                    return;
                }

                PlayerAuthFilter.SessionInfo session = playerAuth.getSession(sessionToken);
                Map<String, Object> response = new HashMap<>();
                response.put("authenticated", true);
                response.put("username", session.username);
                response.put("displayName", session.displayName);
                response.put("isAdmin", session.isOp);
                ctx.json(response);
                
            } catch (Exception e) {
                Map<String, Object> response = new HashMap<>();
                response.put("authenticated", false);
                response.put("error", "Session error: " + e.getMessage());
                ctx.json(response);
            }
        });


        // Console endpoints (Admin only)
        app.get("/api/console/history", ctx -> {
            String sessionToken = ctx.header("X-Session-Token");
            if (sessionToken == null || !playerAuth.isOp(sessionToken)) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("error", "OP privileges required for console access");
                ctx.status(403).json(response);
                return;
            }

            Map<String, Object> response = new HashMap<>();
            response.put("console_output", new java.util.ArrayList<>(consoleOutput));
            response.put("timestamp", System.currentTimeMillis());
            response.put("total_lines", consoleOutput.size());
            ctx.json(response);
        });

        app.post("/api/console", ctx -> {
            String sessionToken = ctx.header("X-Session-Token");
            if (sessionToken == null || !playerAuth.isOp(sessionToken)) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("error", "OP privileges required for console access");
                ctx.status(403).json(response);
                return;
            }

            try {
                @SuppressWarnings("unchecked")
                Map<String, String> request = objectMapper.readValue(ctx.body(), Map.class);
                String command = request.get("command");
                
                if (command == null || command.trim().isEmpty()) {
                    Map<String, Object> response = new HashMap<>();
                    response.put("success", false);
                    response.put("error", "No command provided");
                    ctx.json(response);
                    return;
                }

                MinecraftServer server = serverSupplier.get();
                if (server == null) {
                    Map<String, Object> response = new HashMap<>();
                    response.put("success", false);
                    response.put("error", "Server not available");
                    ctx.json(response);
                    return;
                }

                // Execute command
                ServerCommandSource source = server.getCommandSource();
                int result = server.getCommandManager().getDispatcher().execute(command, source.withSilent());
                
                Map<String, Object> response = new HashMap<>();
                response.put("success", result > 0);
                response.put("output", result > 0 ? "Command executed successfully" : "Command failed or returned 0");
                response.put("result", result);
                ctx.json(response);
                
            } catch (Exception e) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("error", "Error executing command: " + e.getMessage());
                ctx.json(response);
            }
        });

        // Change password endpoint
        app.post("/api/change-password", ctx -> {
            try {
                String sessionToken = ctx.header("X-Session-Token");
                if (sessionToken == null || playerAuth.getSession(sessionToken) == null) {
                    Map<String, Object> response = new HashMap<>();
                    response.put("success", false);
                    response.put("error", "Authentication required");
                    ctx.status(401).json(response);
                    return;
                }

                @SuppressWarnings("unchecked")
                Map<String, String> request = objectMapper.readValue(ctx.body(), Map.class);
                String oldPassword = request.get("oldPassword");
                String newPassword = request.get("newPassword");
                String confirmPassword = request.get("confirmPassword");
                
                PlayerAuthFilter.SessionInfo session = playerAuth.getSession(sessionToken);
                
                if (oldPassword == null || newPassword == null || confirmPassword == null) {
                    Map<String, Object> response = new HashMap<>();
                    response.put("success", false);
                    response.put("error", "All password fields are required");
                    ctx.json(response);
                    return;
                }
                
                if (!newPassword.equals(confirmPassword)) {
                    Map<String, Object> response = new HashMap<>();
                    response.put("success", false);
                    response.put("error", "New passwords do not match");
                    ctx.json(response);
                    return;
                }
                
                if (newPassword.length() < 6) {
                    Map<String, Object> response = new HashMap<>();
                    response.put("success", false);
                    response.put("error", "New password must be at least 6 characters long");
                    ctx.json(response);
                    return;
                }

                boolean success = userDatabase.updatePassword(session.username, oldPassword, newPassword);
                Map<String, Object> response = new HashMap<>();
                if (success) {
                    response.put("success", true);
                    response.put("message", "Password changed successfully");
                } else {
                    response.put("success", false);
                    response.put("error", "Invalid old password");
                }
                ctx.json(response);
                
            } catch (Exception e) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("error", "Password change error: " + e.getMessage());
                ctx.json(response);
            }
        });

        // Admin user management endpoints
        app.get("/api/admin/users", ctx -> {
            String sessionToken = ctx.header("X-Session-Token");
            if (sessionToken == null || !playerAuth.isOp(sessionToken)) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("error", "Admin privileges required");
                ctx.status(403).json(response);
                return;
            }

            Map<String, UserDatabase.UserInfo> users = userDatabase.listUsers();
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("users", users);
            ctx.json(response);
        });

        app.post("/api/admin/users", ctx -> {
            String sessionToken = ctx.header("X-Session-Token");
            if (sessionToken == null || !playerAuth.isOp(sessionToken)) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("error", "Admin privileges required");
                ctx.status(403).json(response);
                return;
            }

            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> request = objectMapper.readValue(ctx.body(), Map.class);
                String username = (String) request.get("username");
                String password = (String) request.get("password");
                boolean isAdmin = false;
                Object isAdminObj = request.get("isAdmin");
                if (isAdminObj instanceof Boolean) {
                    isAdmin = (Boolean) isAdminObj;
                } else if (isAdminObj instanceof String) {
                    isAdmin = Boolean.parseBoolean((String) isAdminObj);
                }
                
                if (username == null || username.trim().isEmpty()) {
                    Map<String, Object> response = new HashMap<>();
                    response.put("success", false);
                    response.put("error", "Username is required");
                    ctx.json(response);
                    return;
                }
                
                if (password == null || password.trim().isEmpty()) {
                    Map<String, Object> response = new HashMap<>();
                    response.put("success", false);
                    response.put("error", "Password is required");
                    ctx.json(response);
                    return;
                }

                boolean success = userDatabase.createUser(username, password, isAdmin);
                Map<String, Object> response = new HashMap<>();
                if (success) {
                    response.put("success", true);
                    response.put("message", "User created successfully");
                } else {
                    response.put("success", false);
                    response.put("error", "Username already exists");
                }
                ctx.json(response);
                
            } catch (Exception e) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("error", "User creation error: " + e.getMessage());
                ctx.json(response);
            }
        });

        app.delete("/api/admin/users/{username}", ctx -> {
            String sessionToken = ctx.header("X-Session-Token");
            if (sessionToken == null || !playerAuth.isOp(sessionToken)) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("error", "Admin privileges required");
                ctx.status(403).json(response);
                return;
            }

            String username = ctx.pathParam("username");
            PlayerAuthFilter.SessionInfo session = playerAuth.getSession(sessionToken);
            
            // Prevent admin from deleting themselves
            if (username.trim().toLowerCase().equals(session.username.trim().toLowerCase())) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("error", "Cannot delete your own account");
                ctx.json(response);
                return;
            }
            
            // Prevent deleting the original admin account
            if (userDatabase.isOriginalAdmin(username)) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("error", "Cannot delete the original admin account");
                ctx.json(response);
                return;
            }

            boolean success = userDatabase.deleteUser(username);
            Map<String, Object> response = new HashMap<>();
            if (success) {
                response.put("success", true);
                response.put("message", "User deleted successfully");
            } else {
                response.put("success", false);
                response.put("error", "User not found");
            }
            ctx.json(response);
        });

        // Toggle admin status endpoint
        app.put("/api/admin/users/{username}/admin", ctx -> {
            String sessionToken = ctx.header("X-Session-Token");
            if (sessionToken == null || !playerAuth.isOp(sessionToken)) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("error", "Admin privileges required");
                ctx.status(403).json(response);
                return;
            }

            String username = ctx.pathParam("username");
            PlayerAuthFilter.SessionInfo session = playerAuth.getSession(sessionToken);
            
            // Prevent admin from changing their own admin status
            if (username.trim().toLowerCase().equals(session.username.trim().toLowerCase())) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("error", "Cannot change your own admin status");
                ctx.json(response);
                return;
            }

            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> request = objectMapper.readValue(ctx.body(), Map.class);
                Object isAdminObj = request.get("isAdmin");
                boolean isAdmin = false;
                if (isAdminObj instanceof Boolean) {
                    isAdmin = (Boolean) isAdminObj;
                } else if (isAdminObj instanceof String) {
                    isAdmin = Boolean.parseBoolean((String) isAdminObj);
                }

                // Security check: Prevent removing admin privileges from the original admin
                if (!isAdmin && userDatabase.isOriginalAdmin(username)) {
                    Map<String, Object> response = new HashMap<>();
                    response.put("success", false);
                    response.put("error", "Cannot remove admin privileges from the original admin account");
                    ctx.json(response);
                    return;
                }

                // Security check: Prevent removing admin privileges if it would leave no admins
                if (!isAdmin) {
                    Map<String, UserDatabase.UserInfo> allUsers = userDatabase.listUsers();
                    long adminCount = allUsers.values().stream()
                        .filter(user -> user.isAdmin)
                        .count();
                    
                    // If this user is currently an admin and removing their admin status would leave no admins
                    UserDatabase.UserInfo targetUser = allUsers.get(username.toLowerCase());
                    if (targetUser != null && targetUser.isAdmin && adminCount <= 1) {
                        Map<String, Object> response = new HashMap<>();
                        response.put("success", false);
                        response.put("error", "Cannot remove admin privileges: at least one admin must remain");
                        ctx.json(response);
                        return;
                    }
                }

                boolean success = userDatabase.updateUserAdminStatus(username, isAdmin);
                Map<String, Object> response = new HashMap<>();
                if (success) {
                    response.put("success", true);
                    response.put("message", "Admin status updated successfully");
                } else {
                    response.put("success", false);
                    response.put("error", "User not found");
                }
                ctx.json(response);
                
            } catch (Exception e) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("error", "Admin status update error: " + e.getMessage());
                ctx.json(response);
            }
        });

        // WebSocket functionality temporarily disabled due to dependency conflicts
        // Using HTTP polling instead for console output
        System.out.println("[MetricsBridge] WebSocket functionality disabled - using HTTP polling for console output");

        // Start console output capture
        startConsoleCapture();
        
        // Add a test message to verify console capture is working
        addConsoleLine("MetricsBridge WebServer started - Console capture active");
        System.out.println("[MetricsBridge] WebSocket endpoints registered:");
        System.out.println("[MetricsBridge]   - /ws (authenticated console stream)");
        System.out.println("[MetricsBridge]   - /ws-test (test endpoint)");
        System.out.println("[MetricsBridge] Test endpoint available at /api/test");
    }

    public void stop() {
        if (app != null) app.stop();
    }

    private void startConsoleCapture() {
        // Create a custom output stream that captures console output
        System.setOut(new java.io.PrintStream(new java.io.OutputStream() {
            private final java.io.PrintStream originalOut = System.out;
            private final StringBuilder lineBuffer = new StringBuilder();
            
            @Override
            public void write(int b) throws java.io.IOException {
                originalOut.write(b);
                
                if (b == '\n') {
                    String line = lineBuffer.toString().trim();
                    if (!line.isEmpty()) {
                        addConsoleLine(line);
                    }
                    lineBuffer.setLength(0);
                } else if (b != '\r') {
                    lineBuffer.append((char) b);
                }
            }
        }, true));
        
        System.setErr(new java.io.PrintStream(new java.io.OutputStream() {
            private final java.io.PrintStream originalErr = System.err;
            private final StringBuilder lineBuffer = new StringBuilder();
            
            @Override
            public void write(int b) throws java.io.IOException {
                originalErr.write(b);
                
                if (b == '\n') {
                    String line = lineBuffer.toString().trim();
                    if (!line.isEmpty()) {
                        addConsoleLine("[ERROR] " + line);
                    }
                    lineBuffer.setLength(0);
                } else if (b != '\r') {
                    lineBuffer.append((char) b);
                }
            }
        }, true));
        
        // Also try to capture Minecraft server logs through log file monitoring
        try {
            setupLogFileMonitoring();
        } catch (Exception e) {
            System.out.println("[MetricsBridge] Failed to setup log file monitoring: " + e.getMessage());
        }
    }
    
    private void setupLogFileMonitoring() {
        try {
            // Try to find and monitor the server's log file
            java.nio.file.Path logsDir = java.nio.file.Paths.get("logs");
            if (java.nio.file.Files.exists(logsDir)) {
                // Look for the latest log file
                java.nio.file.Path latestLog = findLatestLogFile(logsDir);
                if (latestLog != null) {
                    System.out.println("[MetricsBridge] Monitoring log file: " + latestLog);
                    startLogFileWatcher(latestLog);
                } else {
                    System.out.println("[MetricsBridge] No log files found in logs directory");
                }
            } else {
                System.out.println("[MetricsBridge] Logs directory not found");
            }
        } catch (Exception e) {
            System.out.println("[MetricsBridge] Log file monitoring setup failed: " + e.getMessage());
        }
    }
    
    private java.nio.file.Path findLatestLogFile(java.nio.file.Path logsDir) {
        try {
            return java.nio.file.Files.list(logsDir)
                .filter(path -> path.toString().endsWith(".log"))
                .max((p1, p2) -> {
                    try {
                        return java.nio.file.Files.getLastModifiedTime(p1)
                            .compareTo(java.nio.file.Files.getLastModifiedTime(p2));
                    } catch (Exception e) {
                        return 0;
                    }
                })
                .orElse(null);
        } catch (Exception e) {
            return null;
        }
    }
    
    private void startLogFileWatcher(java.nio.file.Path logFile) {
        // Start a background thread to monitor the log file
        Thread logWatcher = new Thread(() -> {
            try {
                long lastPosition = java.nio.file.Files.size(logFile);
                
                while (true) {
                    Thread.sleep(1000); // Check every second
                    
                    if (java.nio.file.Files.exists(logFile)) {
                        long currentSize = java.nio.file.Files.size(logFile);
                        
                        if (currentSize > lastPosition) {
                            // Read new content
                            try (java.io.RandomAccessFile raf = new java.io.RandomAccessFile(logFile.toFile(), "r")) {
                                raf.seek(lastPosition);
                                String line;
                                while ((line = raf.readLine()) != null) {
                                    if (!line.trim().isEmpty() && !line.contains("MetricsBridge")) {
                                        addConsoleLine(line);
                                    }
                                }
                                lastPosition = raf.getFilePointer();
                            }
                        }
                    }
                }
            } catch (Exception e) {
                System.out.println("[MetricsBridge] Log file watcher error: " + e.getMessage());
            }
        });
        
        logWatcher.setDaemon(true);
        logWatcher.setName("LogFileWatcher");
        logWatcher.start();
    }

    private void addConsoleLine(String line) {
        // Don't add our own debug messages to avoid recursion
        if (line.contains("[MetricsBridge]")) {
            return;
        }
        
        // Add timestamp
        String timestampedLine = "[" + java.time.LocalTime.now().toString() + "] " + line;
        
        // Add to console output buffer
        consoleOutput.add(timestampedLine);
        
        // Limit buffer size
        while (consoleOutput.size() > maxConsoleLines) {
            consoleOutput.remove(0);
        }
        
        // WebSocket broadcasting temporarily disabled
        // broadcastConsoleLine(timestampedLine);
    }

    // WebSocket broadcasting temporarily disabled
    // private void broadcastConsoleLine(String line) {
    //     // WebSocket functionality disabled
    // }
}