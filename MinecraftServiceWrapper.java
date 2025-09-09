import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.jar.JarFile;
import java.util.zip.ZipEntry;

/**
 * Windows Service Wrapper for Minecraft Server with MetricsBridge Mod Detection
 * 
 * This wrapper detects if the MetricsBridge mod is installed and:
 * - If mod is present: Runs as Windows service
 * - If mod is not present: Runs in terminal mode
 */
public class MinecraftServiceWrapper {
    
    private static final String MOD_ID = "metricsbridge";
    private static final String MOD_FILE_PATTERN = "fabric-metrics-bridge";
    private static final String MODS_DIR = "mods";
    private static final String CONFIG_DIR = "config";
    private static final String CONFIG_FILE = "metricsbridge.json";
    
    private static Process serverProcess;
    private static boolean isServiceMode = false;
    private static boolean shouldStop = false;
    
    public static void main(String[] args) {
        System.out.println("Minecraft Service Wrapper v1.0");
        System.out.println("Checking for MetricsBridge mod...");
        
        // Check if MetricsBridge mod is installed
        boolean modInstalled = isMetricsBridgeInstalled();
        
        if (modInstalled) {
            System.out.println("MetricsBridge mod detected - Starting as Windows service");
            isServiceMode = true;
            startAsService();
        } else {
            System.out.println("MetricsBridge mod not found - Starting in terminal mode");
            isServiceMode = false;
            startInTerminal();
        }
    }
    
    /**
     * Check if MetricsBridge mod is installed by looking for the mod JAR file
     */
    private static boolean isMetricsBridgeInstalled() {
        try {
            Path modsPath = Paths.get(MODS_DIR);
            if (!Files.exists(modsPath)) {
                return false;
            }
            
            // Look for MetricsBridge mod JAR file
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(modsPath, "*.jar")) {
                for (Path jarFile : stream) {
                    String fileName = jarFile.getFileName().toString().toLowerCase();
                    if (fileName.contains(MOD_FILE_PATTERN.toLowerCase())) {
                        System.out.println("Found MetricsBridge mod: " + jarFile.getFileName());
                        return true;
                    }
                }
            }
            
            // Also check if config file exists (indicates mod was previously installed)
            Path configPath = Paths.get(CONFIG_DIR, CONFIG_FILE);
            if (Files.exists(configPath)) {
                System.out.println("Found MetricsBridge config file - assuming mod is installed");
                return true;
            }
            
        } catch (Exception e) {
            System.err.println("Error checking for MetricsBridge mod: " + e.getMessage());
        }
        
        return false;
    }
    
    /**
     * Start the server as a Windows service
     */
    private static void startAsService() {
        System.out.println("Starting Minecraft server as Windows service...");
        
        // Set up shutdown hook for graceful service shutdown
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("Service shutdown requested");
            shouldStop = true;
            if (serverProcess != null && serverProcess.isAlive()) {
                System.out.println("Stopping Minecraft server...");
                serverProcess.destroy();
                try {
                    serverProcess.waitFor(30, java.util.concurrent.TimeUnit.SECONDS);
                    if (serverProcess.isAlive()) {
                        System.out.println("Force killing server process...");
                        serverProcess.destroyForcibly();
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        }));
        
        // Start the server process
        startServerProcess();
        
        // Keep the service running
        while (!shouldStop && serverProcess != null && serverProcess.isAlive()) {
            try {
                Thread.sleep(1000);
                
                // Check if server process died unexpectedly
                if (!serverProcess.isAlive()) {
                    System.out.println("Server process died unexpectedly, restarting...");
                    Thread.sleep(5000); // Wait 5 seconds before restart
                    startServerProcess();
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        
        System.out.println("Service stopped");
    }
    
    /**
     * Start the server in terminal mode
     */
    private static void startInTerminal() {
        System.out.println("Starting Minecraft server in terminal mode...");
        System.out.println("Press Ctrl+C to stop the server");
        
        // Set up shutdown hook for graceful terminal shutdown
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("\nShutdown requested");
            shouldStop = true;
            if (serverProcess != null && serverProcess.isAlive()) {
                System.out.println("Stopping Minecraft server...");
                serverProcess.destroy();
                try {
                    serverProcess.waitFor(30, java.util.concurrent.TimeUnit.SECONDS);
                    if (serverProcess.isAlive()) {
                        System.out.println("Force killing server process...");
                        serverProcess.destroyForcibly();
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        }));
        
        // Start the server process
        startServerProcess();
        
        // Keep the terminal running and forward output
        if (serverProcess != null) {
            // Forward server output to console
            Thread outputThread = new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(serverProcess.getInputStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null && !shouldStop) {
                        System.out.println(line);
                    }
                } catch (IOException e) {
                    if (!shouldStop) {
                        System.err.println("Error reading server output: " + e.getMessage());
                    }
                }
            });
            outputThread.setDaemon(true);
            outputThread.start();
            
            // Forward server error output to console
            Thread errorThread = new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(serverProcess.getErrorStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null && !shouldStop) {
                        System.err.println(line);
                    }
                } catch (IOException e) {
                    if (!shouldStop) {
                        System.err.println("Error reading server error output: " + e.getMessage());
                    }
                }
            });
            errorThread.setDaemon(true);
            errorThread.start();
            
            // Wait for server process to finish
            try {
                int exitCode = serverProcess.waitFor();
                System.out.println("Server process exited with code: " + exitCode);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                System.out.println("Interrupted while waiting for server process");
            }
        }
    }
    
    /**
     * Start the actual Minecraft server process
     */
    private static void startServerProcess() {
        try {
            // Build the command to start the server
            List<String> command = new ArrayList<>();
            command.add("java");
            
            // Add JVM arguments
            command.add("-Xmx2G");
            command.add("-Xms1G");
            command.add("-XX:+UseG1GC");
            command.add("-XX:+ParallelRefProcEnabled");
            command.add("-XX:MaxGCPauseMillis=200");
            command.add("-XX:+UnlockExperimentalVMOptions");
            command.add("-XX:+DisableExplicitGC");
            command.add("-XX:+AlwaysPreTouch");
            command.add("-XX:G1NewSizePercent=30");
            command.add("-XX:G1MaxNewSizePercent=40");
            command.add("-XX:G1HeapRegionSize=8M");
            command.add("-XX:G1ReservePercent=20");
            command.add("-XX:G1HeapWastePercent=5");
            command.add("-XX:G1MixedGCCountTarget=4");
            command.add("-XX:InitiatingHeapOccupancyPercent=15");
            command.add("-XX:G1MixedGCLiveThresholdPercent=90");
            command.add("-XX:G1RSetUpdatingPauseTimePercent=5");
            command.add("-XX:SurvivorRatio=32");
            command.add("-XX:+PerfDisableSharedMem");
            command.add("-XX:MaxTenuringThreshold=1");
            command.add("-Dusing.aikars.flags=https://mcflags.emc.gs");
            command.add("-Daikars.new.flags=true");
            
            // Add server JAR
            command.add("-jar");
            command.add("server.jar");
            command.add("nogui");
            
            // Start the process
            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(new File("."));
            pb.redirectErrorStream(false);
            
            System.out.println("Starting server with command: " + String.join(" ", command));
            serverProcess = pb.start();
            
            if (isServiceMode) {
                System.out.println("Minecraft server started as service (PID: " + serverProcess.pid() + ")");
                System.out.println("MetricsBridge web interface available at: http://localhost:8765");
            } else {
                System.out.println("Minecraft server started in terminal mode (PID: " + serverProcess.pid() + ")");
            }
            
        } catch (Exception e) {
            System.err.println("Failed to start Minecraft server: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }
    
    /**
     * Get the current working directory
     */
    private static String getCurrentDirectory() {
        try {
            return new File(".").getCanonicalPath();
        } catch (IOException e) {
            return System.getProperty("user.dir");
        }
    }
}