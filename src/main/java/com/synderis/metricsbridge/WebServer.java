package com.synderis.metricsbridge;

import io.javalin.Javalin;
// import io.javalin.websocket.WsConnectContext;
import net.minecraft.server.MinecraftServer;

import java.util.Map;
import java.util.Timer;
import java.util.TimerTask;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Supplier;

public class WebServer {
    private final int port;
    private final String token;
    private final Supplier<Map<String, Object>> metricsSupplier;
    private Javalin app;
    // private final CopyOnWriteArrayList<WsConnectContext> clients = new CopyOnWriteArrayList<>();

    public WebServer(int port, String token, Supplier<Map<String, Object>> metricsSupplier) {
        this.port = port; this.token = token; this.metricsSupplier = metricsSupplier;
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

        // Temporarily disabled websockets to fix dependency issues
        // app.ws("/ws", ws -> {
        //     ws.onConnect(ctx -> {
        //         String qs = ctx.queryParam("token");
        //         if (!token.equals(qs)) { ctx.session.close(1008, "Invalid token"); return; }
        //         clients.add(ctx);
        //     });
        //     ws.onClose(ctx -> clients.remove(ctx));
        // });

        // broadcast loop (1Hz) - disabled with websockets
        // Timer t = new Timer(true);
        // t.scheduleAtFixedRate(new TimerTask() {
        //     @Override public void run() {
        //         var payload = JsonUtil.toJson(metricsSupplier.get());
        //         for (var c : clients) {
        //             try { c.send(payload); } catch (Throwable ignored) {}
        //         }
        //     }
        // }, 1000, 1000);
    }

    public void stop() {
        if (app != null) app.stop();
    }
}