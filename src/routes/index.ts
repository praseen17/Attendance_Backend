import { Router } from 'express';
import authRoutes from './auth';
import studentRoutes from './students';
import sectionRoutes from './sections';
import attendanceRoutes from './attendance';
import websocketRoutes from './websocket';
import performanceRoutes from './performance';

const router = Router();

// Health check route
router.get('/health', (req, res) => {
    const isReactNative = (req as any).isReactNative;

    if (isReactNative) {
        res.json({
            success: true,
            data: {
                status: 'OK',
                service: 'Offline Attendance Sync API',
                version: '1.0.0',
                timestamp: new Date().toISOString()
            },
            message: 'API service is running and React Native compatible'
        });
    } else {
        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            service: 'Offline Attendance Sync API'
        });
    }
});

// Authentication routes
router.use('/auth', authRoutes);

// Student management routes
router.use('/students', studentRoutes);

// Section management routes  
router.use('/sections', sectionRoutes);

// Attendance sync routes
router.use('/attendance', attendanceRoutes);

// WebSocket management routes
router.use('/websocket', websocketRoutes);

// Performance monitoring routes
router.use('/performance', performanceRoutes);

export default router;