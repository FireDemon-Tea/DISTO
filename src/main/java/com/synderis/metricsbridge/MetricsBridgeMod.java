package com.synderis.metricsbridge;


import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.server.MinecraftServer;


import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;


public class MetricsBridgeMod implements ModInitializer {
    public static final String MODID = "metricsbridge";
    private static MinecraftServer server;
    private static MetricsSampler sampler;
    private static WebServer webServer;


    @Override
    public void onInitialize() {
        ServerLifecycleEvents.SERVER_STARTING.register(s -> {
            server = s;
            ensureConfig();
            sampler = new MetricsSampler();
            ServerTickEvents.END_SERVER_TICK.register(sv -> sampler.onTickEnd(sv));
        });


        ServerLifecycleEvents.SERVER_STARTED.register(s -> {
            Map<String, Object> cfg = JsonUtil.loadConfig();
            int httpPort = ((Number) cfg.getOrDefault("httpPort", 8765)).intValue();
            int httpsPort = ((Number) cfg.getOrDefault("httpsPort", 8766)).intValue();
            boolean enableHttps = (Boolean) cfg.getOrDefault("enableHttps", false);
            String sslKeyPath = (String) cfg.getOrDefault("sslKeyPath", "config/ssl/private.key");
            String sslCertPath = (String) cfg.getOrDefault("sslCertPath", "config/ssl/certificate.crt");
            webServer = new WebServer(httpPort, httpsPort, enableHttps, sslKeyPath, sslCertPath, () -> JsonUtil.metricsJson(server, sampler), () -> server);
            webServer.start();
        });


        ServerLifecycleEvents.SERVER_STOPPED.register(s -> {
            if (webServer != null) webServer.stop();
        });
    }


    private void ensureConfig() {
        try {
            Path cfgDir = Paths.get("config");
            if (!Files.exists(cfgDir)) Files.createDirectories(cfgDir);
            Path target = cfgDir.resolve("disto.json");
            
            if (!Files.exists(target)) {
                // Create new config from template
                try (InputStream in = getClass().getClassLoader().getResourceAsStream("disto-default.json")) {
                    Files.copy(in, target);
                }
                System.out.println("[MetricsBridge] Created new configuration file: " + target);
            } else {
                // Check if existing config needs migration
                migrateConfigIfNeeded(target);
            }
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }
    
    private void migrateConfigIfNeeded(Path configPath) {
        try {
            // Read existing config
            String configContent = Files.readString(configPath);
            Map<String, Object> config = JsonUtil.parseJson(configContent);
            
            // Get current version (default to 1 for old configs without version)
            int currentVersion = ((Number) config.getOrDefault("configVersion", 1)).intValue();
            int targetVersion = 3; // Current version
            
            if (currentVersion < targetVersion) {
                System.out.println("[MetricsBridge] Migrating configuration from version " + currentVersion + " to " + targetVersion);
                
                // Perform migration
                config = migrateConfig(config, currentVersion, targetVersion);
                
                // Write updated config
                String updatedConfig = JsonUtil.toJson(config);
                Files.writeString(configPath, updatedConfig);
                
                System.out.println("[MetricsBridge] Configuration migration completed successfully");
            }
        } catch (Exception e) {
            System.err.println("[MetricsBridge] Failed to migrate configuration: " + e.getMessage());
            e.printStackTrace();
        }
    }
    
    private Map<String, Object> migrateConfig(Map<String, Object> config, int fromVersion, int toVersion) {
        Map<String, Object> migratedConfig = new HashMap<>(config);
        
        // Migration from version 1 to 2: Add HTTPS support options
        if (fromVersion < 2 && toVersion >= 2) {
            System.out.println("[MetricsBridge] Adding HTTPS configuration options...");
            
            // Add new HTTPS options with defaults
            migratedConfig.put("configVersion", 2);
            migratedConfig.put("httpsPort", 8766);
            migratedConfig.put("enableHttps", false);
            migratedConfig.put("sslKeyPath", "config/ssl/private.key");
            migratedConfig.put("sslCertPath", "config/ssl/certificate.crt");
            
            System.out.println("[MetricsBridge] Added HTTPS configuration options:");
            System.out.println("[MetricsBridge]   - httpsPort: 8766");
            System.out.println("[MetricsBridge]   - enableHttps: false");
            System.out.println("[MetricsBridge]   - sslKeyPath: config/ssl/private.key");
            System.out.println("[MetricsBridge]   - sslCertPath: config/ssl/certificate.crt");
        }
        
        // Migration from version 2 to 3: Remove sharedSecret (replaced by user authentication)
        if (fromVersion < 3 && toVersion >= 3) {
            System.out.println("[MetricsBridge] Removing sharedSecret (replaced by user authentication)...");
            
            // Update version
            migratedConfig.put("configVersion", 3);
            
            // Remove sharedSecret if it exists
            if (migratedConfig.containsKey("sharedSecret")) {
                migratedConfig.remove("sharedSecret");
                System.out.println("[MetricsBridge] Removed sharedSecret - now using user-based authentication");
            }
        }
        
        return migratedConfig;
    }
}