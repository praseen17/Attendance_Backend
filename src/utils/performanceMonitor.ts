import { getPoolStats } from '../database/connection';
import { getQueryPerformanceStats } from '../database/queryOptimizer';
// import { WebSocketService } from '../services/websocketService'; // Commented out as service doesn't exist

/**
 * Performance monitoring utilities for the backend system
 */

export interface SystemPerformanceMetrics {
    timestamp: Date;
    database: {
        connectionPool: {
            totalConnections: number;
            idleConnections: number;
            waitingConnections: number;
        };
        queryPerformance: {
            totalQueries: number;
            averageExecutionTime: number;
            slowQueriesCount: number;
        };
    };
    websocket: {
        connectedClients: number;
        compression: {
            totalMessages: number;
            compressedMessages: number;
            compressionRate: number;
            averageCompressionRatio: number;
            totalBytesSaved: number;
        };
    };
    memory: {
        used: number;
        total: number;
        percentage: number;
    };
    uptime: number;
}

export class PerformanceMonitor {
    private static instance: PerformanceMonitor;
    private metricsHistory: SystemPerformanceMetrics[] = [];
    private readonly MAX_HISTORY_SIZE = 1000;
    private monitoringInterval: NodeJS.Timeout | null = null;

    private constructor() { }

    public static getInstance(): PerformanceMonitor {
        if (!PerformanceMonitor.instance) {
            PerformanceMonitor.instance = new PerformanceMonitor();
        }
        return PerformanceMonitor.instance;
    }

    /**
     * Start performance monitoring
     */
    public startMonitoring(intervalMs: number = 60000): void {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }

        this.monitoringInterval = setInterval(() => {
            this.collectMetrics();
        }, intervalMs);

        console.log(`Performance monitoring started with ${intervalMs}ms interval`);
    }

    /**
     * Stop performance monitoring
     */
    public stopMonitoring(): void {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        console.log('Performance monitoring stopped');
    }

    /**
     * Collect current system performance metrics
     */
    public collectMetrics(): SystemPerformanceMetrics {
        const metrics: SystemPerformanceMetrics = {
            timestamp: new Date(),
            database: this.getDatabaseMetrics(),
            websocket: this.getWebSocketMetrics(),
            memory: this.getMemoryMetrics(),
            uptime: process.uptime()
        };

        // Add to history
        this.metricsHistory.push(metrics);

        // Limit history size
        if (this.metricsHistory.length > this.MAX_HISTORY_SIZE) {
            this.metricsHistory.shift();
        }

        return metrics;
    }

    /**
     * Get database performance metrics
     */
    private getDatabaseMetrics() {
        const poolStats = getPoolStats();
        const queryStats = getQueryPerformanceStats();

        return {
            connectionPool: {
                totalConnections: poolStats.totalCount,
                idleConnections: poolStats.idleCount,
                waitingConnections: poolStats.waitingCount
            },
            queryPerformance: {
                totalQueries: queryStats.totalQueries,
                averageExecutionTime: queryStats.averageExecutionTime,
                slowQueriesCount: queryStats.slowQueries.length
            }
        };
    }

    /**
     * Get WebSocket performance metrics
     * Commented out as WebSocketService doesn't exist
     */
    private getWebSocketMetrics() {
        // const wsService = WebSocketService.getInstance();
        // const compressionMetrics = wsService.getCompressionMetrics();

        return {
            connectedClients: 0, // wsService.getConnectedClientsCount(),
            compression: {
                totalMessages: 0,
                compressedMessages: 0,
                compressionRate: 0,
                averageCompressionRatio: 1.0,
                totalBytesSaved: 0
            }
        };
    }

    /**
     * Get memory usage metrics
     */
    private getMemoryMetrics() {
        const memUsage = process.memoryUsage();
        const totalMemory = memUsage.heapTotal + memUsage.external;
        const usedMemory = memUsage.heapUsed;

        return {
            used: usedMemory,
            total: totalMemory,
            percentage: (usedMemory / totalMemory) * 100
        };
    }

    /**
     * Get performance metrics history
     */
    public getMetricsHistory(limit?: number): SystemPerformanceMetrics[] {
        if (limit) {
            return this.metricsHistory.slice(-limit);
        }
        return [...this.metricsHistory];
    }

    /**
     * Get current performance summary
     */
    public getPerformanceSummary(): {
        current: SystemPerformanceMetrics;
        averages: {
            queryExecutionTime: number;
            memoryUsage: number;
            compressionRatio: number;
        };
        alerts: string[];
    } {
        const current = this.collectMetrics();
        const alerts: string[] = [];

        // Calculate averages from recent history
        const recentMetrics = this.metricsHistory.slice(-10);
        const averages = {
            queryExecutionTime: 0,
            memoryUsage: 0,
            compressionRatio: 0
        };

        if (recentMetrics.length > 0) {
            averages.queryExecutionTime = recentMetrics.reduce((sum, m) =>
                sum + m.database.queryPerformance.averageExecutionTime, 0) / recentMetrics.length;

            averages.memoryUsage = recentMetrics.reduce((sum, m) =>
                sum + m.memory.percentage, 0) / recentMetrics.length;

            averages.compressionRatio = recentMetrics.reduce((sum, m) =>
                sum + m.websocket.compression.averageCompressionRatio, 0) / recentMetrics.length;
        }

        // Generate performance alerts
        if (current.memory.percentage > 80) {
            alerts.push('High memory usage detected');
        }

        if (current.database.queryPerformance.averageExecutionTime > 1000) {
            alerts.push('Slow database queries detected');
        }

        if (current.database.connectionPool.waitingConnections > 5) {
            alerts.push('Database connection pool under pressure');
        }

        if (current.websocket.compression.compressionRate < 50 && current.websocket.compression.totalMessages > 100) {
            alerts.push('Low WebSocket compression rate');
        }

        return {
            current,
            averages,
            alerts
        };
    }

    /**
     * Export metrics to JSON for analysis
     */
    public exportMetrics(): string {
        return JSON.stringify({
            exportTime: new Date().toISOString(),
            metricsCount: this.metricsHistory.length,
            metrics: this.metricsHistory
        }, null, 2);
    }

    /**
     * Clear metrics history
     */
    public clearHistory(): void {
        this.metricsHistory = [];
        console.log('Performance metrics history cleared');
    }
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();