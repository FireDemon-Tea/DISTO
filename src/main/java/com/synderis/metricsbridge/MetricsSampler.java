package com.synderis.metricsbridge;

import com.sun.management.OperatingSystemMXBean;
import net.minecraft.server.MinecraftServer;

import java.lang.management.ManagementFactory;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;

public class MetricsSampler {
    private static final int WINDOW = 200; // ticks (~10s @20tps)

    private final Deque<Long> tickDurationsNanos = new ArrayDeque<>();
    private long lastTickNanos = System.nanoTime();

    public void onTickEnd(MinecraftServer server) {
        long now = System.nanoTime();
        long dt = Math.max(0, now - lastTickNanos);
        lastTickNanos = now;

        if (tickDurationsNanos.size() >= WINDOW) tickDurationsNanos.removeFirst();
        tickDurationsNanos.addLast(dt);
    }

    public double avgTickMs() {
        if (tickDurationsNanos.isEmpty()) return Double.NaN;
        long sum = 0L;
        for (long v : tickDurationsNanos) sum += v;
        double avgNs = (double) sum / tickDurationsNanos.size();
        return avgNs / 1_000_000.0;
    }

    public double tps() {
        double ms = avgTickMs();
        if (Double.isNaN(ms) || ms <= 0) return Double.NaN;
        double tps = 1000.0 / ms; // ticks per second if 1 tick took ms
        return Math.min(20.0, tps); // cap at 20
    }

    public double cpuProcessLoad() {
        try {
            OperatingSystemMXBean os = (OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
            double p = os.getProcessCpuLoad(); // 0..1 or -1 if unsupported
            if (p < 0) return Double.NaN;
            return p * 100.0;
        } catch (Throwable t) {
            return Double.NaN;
        }
    }

    public MemoryStats memory() {
        Runtime rt = Runtime.getRuntime();
        long used = rt.totalMemory() - rt.freeMemory();
        return new MemoryStats(rt.totalMemory(), used, rt.freeMemory(), rt.maxMemory());
    }

    public record MemoryStats(long total, long used, long free, long max) {}
}