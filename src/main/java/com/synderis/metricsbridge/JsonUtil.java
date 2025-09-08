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

        // Players and latency
        if (server != null && server.getPlayerManager() != null) {
            List<ServerPlayerEntity> players = server.getPlayerManager().getPlayerList();
            root.put("player_count", players.size());
            double avg = players.stream().mapToInt(p -> p.networkHandler.getLatency()).average().orElse(Double.NaN);
            root.put("network_latency_ms", Double.isNaN(avg) ? "Data unavailable" : Math.round(avg));
        } else {
            root.put("player_count", "Data unavailable");
            root.put("network_latency_ms", "Data unavailable");
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