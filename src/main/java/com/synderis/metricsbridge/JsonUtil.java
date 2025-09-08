package com.synderis.metricsbridge;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

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
}