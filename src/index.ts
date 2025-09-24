import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/environment';
import { errorHandler } from './middleware/errorHandler';
import { reactNativeCompatibility } from './middleware/reactNativeCompatibility';
import { sanitizeInput } from './middleware/validation';
import { generalRateLimit } from './middleware/rateLimiting';
import { performanceMonitor } from './utils/performanceMonitor';
import { createPerformanceIndexes } from './database/queryOptimizer';

const app = express();

// Security middleware with React Native compatibility
app.use(helmet({
    crossOriginEmbedderPolicy: false, // Disable for React Native compatibility
    contentSecurityPolicy: false, // Disable CSP for mobile apps
}));

// CORS configuration for React Native compatibility
app.use(cors({
    origin: true, // Allow all origins for React Native compatibility
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'User-Agent',
        'DNT',
        'Cache-Control',
        'X-Mx-ReqToken',
        'Keep-Alive',
        'X-Requested-With',
        'If-Modified-Since'
    ],
    exposedHeaders: ['Authorization', 'Content-Length', 'X-Kuma-Revision']
}));

// Rate limiting with enhanced security
app.use('/api/', generalRateLimit);

// Body parsing middleware with React Native compatibility
app.use(express.json({
    limit: '10mb',
    type: ['application/json', 'text/plain'] // Accept text/plain for React Native
}));
app.use(express.urlencoded({ extended: true }));

// Input sanitization middleware
app.use(sanitizeInput);

// React Native compatibility middleware
app.use(reactNativeCompatibility);

// React Native specific headers middleware
app.use((req, res, next) => {
    // Set headers for React Native compatibility
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
    }

    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    const isReactNative = (req as any).isReactNative;

    if (isReactNative) {
        res.json({
            success: true,
            data: {
                status: 'OK',
                server: 'Offline Attendance Sync API',
                version: '1.0.0',
                timestamp: new Date().toISOString()
            },
            message: 'Server is running and React Native compatible'
        });
    } else {
        res.json({
            status: 'OK',
            timestamp: new Date().toISOString()
        });
    }
});

// API routes
import routes from './routes';
app.use('/api', routes);

// Error handling middleware
app.use(errorHandler);

const PORT = config.port || 3000;

// Create HTTP server
const server = createServer(app);


// Start server
server.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${config.nodeEnv}`);
    // WebSocket removed; using ML HTTP API instead

    // Initialize performance optimizations
    try {
        console.log('Initializing performance optimizations...');
        await createPerformanceIndexes();
        performanceMonitor.startMonitoring(60000); // Monitor every minute
        console.log('Performance optimizations initialized');
    } catch (error) {
        console.error('Failed to initialize performance optimizations:', error);
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    // WebSocket removed
    performanceMonitor.stopMonitoring();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    // WebSocket removed
    performanceMonitor.stopMonitoring();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

export default app;