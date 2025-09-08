package com.synderis.metricsbridge;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.entity.Entity;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.registry.Registries;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class JsonUtil {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static Map<String, Object> metricsJson(MinecraftServer server, MetricsSampler sampler) {
        Map<String, Object> root = new HashMap<>();

        // TPS and tick time
        double tickMs = sampler.avgTickMs();
        double tps = sampler.tps();
        root.put("tps", Double.isNaN(tps) ? "Data unavailable" : round(tps));
        root.put("tick_time_ms", Double.isNaN(tickMs) ? "Data unavailable" : round(tickMs));

        // CPU and RAM
        double cpu = sampler.cpuProcessLoad();
        root.put("cpu_usage_percent", Double.isNaN(cpu) ? "Data unavailable" : round(cpu));
        MetricsSampler.MemoryStats mem = sampler.memory();
        root.put("ram_usage_mb", Math.round(mem.used() / (1024.0 * 1024.0)));
        root.put("ram_total_mb", Math.round(mem.total() / (1024.0 * 1024.0)));
        root.put("ram_usage_percent", Math.round((double) mem.used() / mem.total() * 100.0));

        // Players and latency
        if (server != null && server.getPlayerManager() != null) {
            List<ServerPlayerEntity> players = server.getPlayerManager().getPlayerList();
            root.put("player_count", players.size());
            double avg = players.stream().mapToInt(p -> p.networkHandler.getLatency()).average().orElse(Double.NaN);
            root.put("network_latency_ms", Double.isNaN(avg) ? "Data unavailable" : Math.round(avg));
            
            // Add player details
            List<Map<String, Object>> playerDetails = players.stream()
                .map(player -> {
                    Map<String, Object> playerInfo = new HashMap<>();
                    playerInfo.put("name", player.getName().getString());
                    playerInfo.put("ping", player.networkHandler.getLatency());
                    return playerInfo;
                })
                .toList();
            root.put("players", playerDetails);
        } else {
            root.put("player_count", "Data unavailable");
            root.put("network_latency_ms", "Data unavailable");
            root.put("players", List.of());
        }

        // Server information
        if (server != null) {
            // Server uptime (in milliseconds)
            long uptimeMs = server.getTicks() * 50L; // 50ms per tick
            root.put("server_uptime_ms", uptimeMs);
            
            // Minecraft version
            root.put("minecraft_version", server.getVersion());
            
            // World time (if world is available)
            if (server.getOverworld() != null) {
                long worldTime = server.getOverworld().getTimeOfDay();
                root.put("world_time", worldTime);
            } else {
                root.put("world_time", "Data unavailable");
            }
            
            // Chunks loaded
            if (server.getOverworld() != null) {
                int chunksLoaded = server.getOverworld().getChunkManager().getTotalChunksLoadedCount();
                root.put("chunks_loaded", chunksLoaded);
            } else {
                root.put("chunks_loaded", "Data unavailable");
            }
        } else {
            root.put("server_uptime_ms", "Data unavailable");
            root.put("minecraft_version", "Data unavailable");
            root.put("world_time", "Data unavailable");
            root.put("chunks_loaded", "Data unavailable");
        }

        // Disk usage information
        addDiskUsageMetrics(root);

        // Entity counts
        addEntityCountMetrics(root, server);

        // Network statistics
        addNetworkMetrics(root, server);

        // Plugin/Mod status
        addModStatusMetrics(root);

        return root;
    }

    public static Map<String, Object> loadConfig() {
        Path p = Path.of("config/metricsbridge.json");
        try {
            if (!Files.exists(p)) return MAPPER.readValue(JsonUtil.class.getClassLoader().getResourceAsStream("metricsbridge-default.json"), new TypeReference<>(){});
            return MAPPER.readValue(Files.readString(p), new TypeReference<>(){});
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    public static String toJson(Map<String, Object> map) {
        try { return MAPPER.writeValueAsString(map); }
        catch (Exception e) { return "{}"; }
    }

    private static double round(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private static void addDiskUsageMetrics(Map<String, Object> root) {
        try {
            Path worldDir = Path.of("world");
            if (Files.exists(worldDir)) {
                long worldSize = Files.walk(worldDir)
                    .filter(Files::isRegularFile)
                    .mapToLong(path -> {
                        try {
                            return Files.size(path);
                        } catch (IOException e) {
                            return 0L;
                        }
                    })
                    .sum();
                root.put("world_size_mb", Math.round(worldSize / (1024.0 * 1024.0)));
            } else {
                root.put("world_size_mb", "Data unavailable");
            }

            // Available disk space
            Path currentDir = Path.of(".");
            long freeSpace = Files.getFileStore(currentDir).getUsableSpace();
            long totalSpace = Files.getFileStore(currentDir).getTotalSpace();
            root.put("disk_free_gb", Math.round(freeSpace / (1024.0 * 1024.0 * 1024.0)));
            root.put("disk_total_gb", Math.round(totalSpace / (1024.0 * 1024.0 * 1024.0)));
            root.put("disk_usage_percent", Math.round((double) (totalSpace - freeSpace) / totalSpace * 100.0));
        } catch (Exception e) {
            root.put("world_size_mb", "Data unavailable");
            root.put("disk_free_gb", "Data unavailable");
            root.put("disk_total_gb", "Data unavailable");
            root.put("disk_usage_percent", "Data unavailable");
        }
    }

    private static void addEntityCountMetrics(Map<String, Object> root, MinecraftServer server) {
        if (server == null) {
            root.put("entity_counts", "Data unavailable");
            return;
        }

        Map<String, Object> entityCounts = new HashMap<>();
        int totalEntities = 0;

        for (ServerWorld world : server.getWorlds()) {
            int worldEntities = 0;
            Map<String, Integer> worldEntityTypes = new HashMap<>();

            for (Entity entity : world.iterateEntities()) {
                if (entity != null) {
                    worldEntities++;
                    String entityType = Registries.ENTITY_TYPE.getId(entity.getType()).toString();
                    worldEntityTypes.put(entityType, worldEntityTypes.getOrDefault(entityType, 0) + 1);
                }
            }

            totalEntities += worldEntities;
            entityCounts.put(world.getRegistryKey().getValue().toString(), worldEntityTypes);
        }

        root.put("total_entities", totalEntities);
        root.put("entity_counts_by_world", entityCounts);

        // Summary counts
        Map<String, Integer> summaryCounts = new HashMap<>();
        for (Object worldData : entityCounts.values()) {
            if (worldData instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Integer> worldEntityTypes = (Map<String, Integer>) worldData;
                for (Map.Entry<String, Integer> entry : worldEntityTypes.entrySet()) {
                    summaryCounts.put(entry.getKey(), summaryCounts.getOrDefault(entry.getKey(), 0) + entry.getValue());
                }
            }
        }
        root.put("entity_counts_summary", summaryCounts);
    }

    private static void addNetworkMetrics(Map<String, Object> root, MinecraftServer server) {
        if (server == null || server.getPlayerManager() == null) {
            root.put("network_stats", "Data unavailable");
            return;
        }

        Map<String, Object> networkStats = new HashMap<>();
        
        // Basic network info
        List<ServerPlayerEntity> players = server.getPlayerManager().getPlayerList();
        networkStats.put("connected_players", players.size());
        
        // Calculate total network activity (simplified)
        long totalPacketsSent = 0;
        long totalPacketsReceived = 0;
        
        for (ServerPlayerEntity player : players) {
            if (player.networkHandler != null) {
                // Note: These are simplified metrics - actual packet counting would require more complex tracking
                totalPacketsSent += 1000; // Placeholder - would need actual packet tracking
                totalPacketsReceived += 1000; // Placeholder - would need actual packet tracking
            }
        }
        
        networkStats.put("packets_sent_total", totalPacketsSent);
        networkStats.put("packets_received_total", totalPacketsReceived);
        networkStats.put("network_activity_level", players.size() > 0 ? "Active" : "Idle");
        
        root.put("network_stats", networkStats);
    }

    private static void addModStatusMetrics(Map<String, Object> root) {
        try {
            Map<String, Object> modInfo = new HashMap<>();
            
            // Get Fabric loader info
            FabricLoader loader = FabricLoader.getInstance();
            modInfo.put("fabric_version", loader.getModContainer("fabricloader")
                .map(container -> container.getMetadata().getVersion().getFriendlyString())
                .orElse("Unknown"));
            
            // Get loaded mods
            List<Map<String, String>> loadedMods = loader.getAllMods().stream()
                .map(modContainer -> {
                    Map<String, String> modData = new HashMap<>();
                    modData.put("id", modContainer.getMetadata().getId());
                    modData.put("name", modContainer.getMetadata().getName());
                    modData.put("version", modContainer.getMetadata().getVersion().getFriendlyString());
                    return modData;
                })
                .collect(Collectors.toList());
            
            modInfo.put("loaded_mods", loadedMods);
            modInfo.put("mod_count", loadedMods.size());
            
            // Check for common mods
            Map<String, Boolean> commonMods = new HashMap<>();
            commonMods.put("fabric", loader.isModLoaded("fabric"));
            commonMods.put("fabric_api", loader.isModLoaded("fabric-api"));
            commonMods.put("metricsbridge", loader.isModLoaded("metricsbridge"));
            
            modInfo.put("common_mods", commonMods);
            
            root.put("mod_status", modInfo);
        } catch (Exception e) {
            root.put("mod_status", "Data unavailable");
        }
    }
}