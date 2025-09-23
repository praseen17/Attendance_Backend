import { Router } from 'express';
import { performanceMonitor } from '../utils/performanceMonitor';
import { createPerformanceIndexes, analyzeTableStatistics } from '../database/queryOptimizer';
import { authenticateToken } from '../middleware/auth';

const router = Router();

/**
 * Performance monitoring and optimization endpoints
 */

// Get current performance metrics
router.get('/metrics', authenticateToken, (req, res) => {
    try {
        const summary = performanceMonitor.getPerformanceSummary();
        res.json({
            success: true,
            data: summary
        });
    } catch (error) {
        console.error('Failed to get performance metrics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve performance metrics'
        });
    }
});

// Get performance metrics history
router.get('/metrics/history', authenticateToken, (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
        const history = performanceMonitor.getMetricsHistory(limit);

        res.json({
            success: true,
            data: {
                count: history.length,
                metrics: history
            }
        });
    } catch (error) {
        console.error('Failed to get performance history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve performance history'
        });
    }
});

// Export performance metrics
router.get('/metrics/export', authenticateToken, (req, res) => {
    try {
        const exportData = performanceMonitor.exportMetrics();

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="performance-metrics-${Date.now()}.json"`);
        res.send(exportData);
    } catch (error) {
        console.error('Failed to export performance metrics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export performance metrics'
        });
    }
});

// Optimize database performance
router.post('/optimize/database', authenticateToken, async (req, res) => {
    try {
        console.log('Starting database optimization...');

        // Create performance indexes
        await createPerformanceIndexes();

        // Analyze table statistics
        await analyzeTableStatistics();

        res.json({
            success: true,
            message: 'Database optimization completed successfully'
        });
    } catch (error) {
        console.error('Database optimization failed:', error);
        res.status(500).json({
            success: false,
            error: 'Database optimization failed'
        });
    }
});

// Clear performance metrics history
router.delete('/metrics/history', authenticateToken, (req, res) => {
    try {
        performanceMonitor.clearHistory();

        res.json({
            success: true,
            message: 'Performance metrics history cleared'
        });
    } catch (error) {
        console.error('Failed to clear performance history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to clear performance history'
        });
    }
});

// Start performance monitoring
router.post('/monitoring/start', authenticateToken, (req, res) => {
    try {
        const interval = req.body.interval || 60000; // Default 1 minute
        performanceMonitor.startMonitoring(interval);

        res.json({
            success: true,
            message: `Performance monitoring started with ${interval}ms interval`
        });
    } catch (error) {
        console.error('Failed to start performance monitoring:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start performance monitoring'
        });
    }
});

// Stop performance monitoring
router.post('/monitoring/stop', authenticateToken, (req, res) => {
    try {
        performanceMonitor.stopMonitoring();

        res.json({
            success: true,
            message: 'Performance monitoring stopped'
        });
    } catch (error) {
        console.error('Failed to stop performance monitoring:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to stop performance monitoring'
        });
    }
});

export default router;