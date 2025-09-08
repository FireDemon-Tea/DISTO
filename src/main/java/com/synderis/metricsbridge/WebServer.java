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

        // Auth middleware
        AuthFilter auth = new AuthFilter(token);
        app.before("/api/*", auth);

        app.get("/api/metrics", ctx -> ctx.json(metricsSupplier.get()));
        
        // Test endpoint to verify server is working
        app.get("/api/test", ctx -> {
            Map<String, Object> response = new HashMap<>();
            response.put("status", "ok");
            response.put("timestamp", System.currentTimeMillis());
            response.put("websocket_supported", true);
            ctx.json(response);
        });
        
        // Fallback console endpoint (HTTP polling instead of WebSocket)
        app.get("/api/console/history", ctx -> {
            Map<String, Object> response = new HashMap<>();
            response.put("console_output", new java.util.ArrayList<>(consoleOutput));
            response.put("timestamp", System.currentTimeMillis());
            response.put("total_lines", consoleOutput.size());
            ctx.json(response);
        });
        

        // Console endpoint
        app.post("/api/console", ctx -> {
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