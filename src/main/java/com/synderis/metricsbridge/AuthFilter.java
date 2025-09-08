package com.synderis.metricsbridge;

import io.javalin.http.Context;
import io.javalin.http.Handler;

public class AuthFilter implements Handler {
    private final String token;

    public AuthFilter(String token) { this.token = token; }

    @Override
    public void handle(Context ctx) throws Exception {
        // Check Authorization header first
        String auth = ctx.header("Authorization");
        if (auth != null && auth.equals("Bearer " + token)) {
            return; // Authorized via header
        }
        
        // Check query parameter as fallback
        String queryToken = ctx.queryParam("token");
        if (queryToken != null && queryToken.equals(token)) {
            return; // Authorized via query parameter
        }
        
        // Not authorized
        ctx.status(401).json("Unauthorized");
    }
}