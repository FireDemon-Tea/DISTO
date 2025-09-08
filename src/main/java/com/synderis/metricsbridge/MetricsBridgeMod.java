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
            int port = ((Number) cfg.getOrDefault("httpPort", 8765)).intValue();
            String token = (String) cfg.getOrDefault("sharedSecret", "change-me");
            webServer = new WebServer(port, token, () -> JsonUtil.metricsJson(server, sampler));
            webServer.start();
            System.out.println("[MetricsBridge] HTTP server started on :" + port);
        });


        ServerLifecycleEvents.SERVER_STOPPED.register(s -> {
            if (webServer != null) webServer.stop();
        });
    }


    private void ensureConfig() {
        try {
            Path cfgDir = Paths.get("config");
            if (!Files.exists(cfgDir)) Files.createDirectories(cfgDir);
            Path target = cfgDir.resolve("metricsbridge.json");
            if (!Files.exists(target)) {
                try (InputStream in = getClass().getClassLoader().getResourceAsStream("metricsbridge-default.json")) {
                    Files.copy(in, target);
                }
            }
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }
}