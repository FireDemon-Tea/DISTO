package com.synderis.metricsbridge;

import io.javalin.http.Context;
import io.javalin.http.Handler;
import net.minecraft.server.MinecraftServer;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

public class PlayerAuthFilter implements Handler {
    private final String fallbackToken;
    private final Supplier<MinecraftServer> serverSupplier;
    private final UserDatabase userDatabase;
    private final Map<String, SessionInfo> activeSessions = new ConcurrentHashMap<>();
    private final long sessionTimeoutMs = 24 * 60 * 60 * 1000; // 24 hours

    public PlayerAuthFilter(String fallbackToken, Supplier<MinecraftServer> serverSupplier, UserDatabase userDatabase) {
        this.fallbackToken = fallbackToken;
        this.serverSupplier = serverSupplier;
        this.userDatabase = userDatabase;
    }

    @Override
    public void handle(Context ctx) throws Exception {
        // Check for session token first
        String sessionToken = ctx.header("X-Session-Token");
        if (sessionToken != null && activeSessions.containsKey(sessionToken)) {
            SessionInfo session = activeSessions.get(sessionToken);
            if (System.currentTimeMillis() - session.lastAccess < sessionTimeoutMs) {
                session.lastAccess = System.currentTimeMillis();
                ctx.attribute("session", session);
                return; // Authorized via session
            } else {
                activeSessions.remove(sessionToken); // Expired session
            }
        }

        // Check fallback token for backward compatibility
        String auth = ctx.header("Authorization");
        if (auth != null && auth.equals("Bearer " + fallbackToken)) {
            return; // Authorized via fallback token
        }
        
        String queryToken = ctx.queryParam("token");
        if (queryToken != null && queryToken.equals(fallbackToken)) {
            return; // Authorized via query parameter
        }
        
        // Not authorized
        ctx.status(401).json("Unauthorized");
    }

    public String createSession(String username, String password) {
        // Authenticate user with password
        if (!userDatabase.authenticateUser(username, password)) {
            return null;
        }

        // Get user info from database
        UserDatabase.User user = userDatabase.getUser(username);
        if (user == null) return null;

        // Create session
        String sessionToken = generateSessionToken();
        SessionInfo session = new SessionInfo(username, username, user.isAdmin);
        activeSessions.put(sessionToken, session);
        
        return sessionToken;
    }

    public void invalidateSession(String sessionToken) {
        activeSessions.remove(sessionToken);
    }

    public boolean isOp(String sessionToken) {
        SessionInfo session = activeSessions.get(sessionToken);
        return session != null && session.isOp;
    }

    public SessionInfo getSession(String sessionToken) {
        return activeSessions.get(sessionToken);
    }

    private String generateSessionToken() {
        return java.util.UUID.randomUUID().toString().replace("-", "");
    }

    public static class SessionInfo {
        public final String username;
        public final String displayName;
        public final boolean isOp;
        public long lastAccess;

        public SessionInfo(String username, String displayName, boolean isOp) {
            this.username = username;
            this.displayName = displayName;
            this.isOp = isOp;
            this.lastAccess = System.currentTimeMillis();
        }
    }
}
