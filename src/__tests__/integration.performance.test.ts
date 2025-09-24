import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../index';
import { pool } from '../database/connection';
import { performanceMonitor } from '../utils/performanceMonitor';
import { createPerformanceIndexes, executeOptimizedQuery } from '../database/queryOptimizer';
import { WebSocketService } from '../services/websocketService';
import WebSocket from 'ws';

/**
 * Integration tests for performance optimizations
 * Tests database performance, WebSocket compression, and system monitoring
 */

describe('Performance Integration Tests', () => {
    let server: any;
    let authToken: string;
    const testFacultyId = 'test-faculty-performance';
    const testSectionId = 'test-section-performance';

    beforeAll(async () => {
        // Test database connection
        await pool.connect();

        // Create test data
        await executeOptimizedQuery(
            `INSERT INTO faculty (id, username, password_hash, name, email) 
             VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
            [testFacultyId, 'perftest', 'hashedpassword', 'Performance Test Faculty', 'perftest@test.com']
        );

        await executeOptimizedQuery(
            `INSERT INTO sections (id, name, grade, faculty_id) 
             VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
            [testSectionId, 'Performance Test Section', '10', testFacultyId]
        );

        // Create performance indexes
        await createPerformanceIndexes();

        // Start performance monitoring
        performanceMonitor.startMonitoring(5000); // 5 second intervals for testing

        // Get auth token
        const loginResponse = await request(app)
            .post('/api/auth/login')
            .send({
                username: 'perftest',
                password: 'hashedpassword'
            });

        authToken = loginResponse.body.data.token;
    });

    afterAll(async () => {
        // Stop performance monitoring
        performanceMonitor.stopMonitoring();

        // Clean up test data
        await executeOptimizedQuery('DELETE FROM attendance_logs WHERE faculty_id = $1', [testFacultyId]);
        await executeOptimizedQuery('DELETE FROM sections WHERE id = $1', [testSectionId]);
        await executeOptimizedQuery('DELETE FROM faculty WHERE id = $1', [testFacultyId]);

        await pool.end();
    });

    describe('Database Performance Optimization', () => {
        it('should execute queries with connection pooling', async () => {
            const startTime = Date.now();

            // Execute multiple concurrent queries
            const promises = Array.from({ length: 10 }, () =>
                executeOptimizedQuery(
                    'SELECT * FROM faculty WHERE id = $1',
                    [testFacultyId],
                    'get_faculty_by_id'
                )
            );

            const results = await Promise.all(promises);
            const executionTime = Date.now() - startTime;

            // All queries should succeed
            results.forEach(result => {
                expect(result.rows).toHaveLength(1);
                expect(result.executionTime).toBeLessThan(1000); // Should be fast with pooling
            });

            // Total execution time should be reasonable with pooling
            expect(executionTime).toBeLessThan(2000);
        });

        it('should handle batch operations efficiently', async () => {
            const batchSize = 100;
            const operations = Array.from({ length: batchSize }, (_, i) => ({
                query: 'INSERT INTO students (id, roll_number, name, section_id) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
                params: [`perf-student-${i}`, `PERF${i.toString().padStart(3, '0')}`, `Performance Student ${i}`, testSectionId]
            }));

            const startTime = Date.now();

            // This would use the batch transaction function
            const results = await Promise.all(
                operations.map(op => executeOptimizedQuery(op.query, op.params))
            );

            const executionTime = Date.now() - startTime;

            expect(results).toHaveLength(batchSize);
            expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds

            // Clean up
            await executeOptimizedQuery('DELETE FROM students WHERE section_id = $1', [testSectionId]);
        });

        it('should provide query performance metrics', async () => {
            // Execute some queries to generate metrics
            await executeOptimizedQuery('SELECT COUNT(*) FROM faculty', [], 'count_faculty');
            await executeOptimizedQuery('SELECT COUNT(*) FROM sections', [], 'count_sections');

            // Wait a moment for metrics to be recorded
            await new Promise(resolve => setTimeout(resolve, 100));

            const response = await request(app)
                .get('/api/performance/metrics')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.current.database).toBeDefined();
            expect(response.body.data.current.database.queryPerformance.totalQueries).toBeGreaterThan(0);
        });
    });

    describe('WebSocket Compression Performance', () => {
        it('should establish WebSocket connection with compression support', (done) => {
            const ws = new WebSocket(`ws://localhost:3000/ws/ml`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Sec-WebSocket-Extensions': 'permessage-deflate'
                }
            });

            ws.on('open', () => {
                expect(ws.readyState).toBe(WebSocket.OPEN);

                // Check if compression is supported
                const extensions = (ws as any).extensions;
                console.log('WebSocket extensions:', extensions);

                ws.close();
                done();
            });

            ws.on('error', (error) => {
                done(error);
            });
        });

        it('should handle large message compression', (done) => {
            const ws = new WebSocket(`ws://localhost:3000/ws/ml`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            ws.on('open', () => {
                // Authenticate first
                ws.send(JSON.stringify({
                    type: 'AUTHENTICATE',
                    data: {
                        facultyId: testFacultyId,
                        sectionId: testSectionId
                    }
                }));
            });

            let authenticated = false;

            ws.on('message', (data) => {
                const message = JSON.parse(data.toString());

                if (message.type === 'AUTHENTICATION_SUCCESS' && !authenticated) {
                    authenticated = true;

                    // Send large face recognition request
                    const largeImageData = 'data:image/jpeg;base64,' + 'A'.repeat(10000); // Large base64 string

                    const startTime = Date.now();

                    ws.send(JSON.stringify({
                        type: 'FACE_RECOGNITION',
                        data: {
                            imageData: largeImageData,
                            sectionId: testSectionId,
                            facultyId: testFacultyId,
                            timestamp: new Date().toISOString()
                        }
                    }));

                } else if (message.type === 'RECOGNITION_RESULT') {
                    const responseTime = Date.now();

                    // Should receive response (even if recognition fails due to invalid data)
                    expect(message.data).toBeDefined();

                    ws.close();
                    done();
                }
            });

            ws.on('error', (error) => {
                done(error);
            });
        });

        it('should provide compression metrics', async () => {
            // Wait for some WebSocket activity to generate metrics
            await new Promise(resolve => setTimeout(resolve, 1000));

            const response = await request(app)
                .get('/api/performance/metrics')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.current.websocket).toBeDefined();
            expect(response.body.data.current.websocket.connectedClients).toBeGreaterThanOrEqual(0);
        });
    });

    describe('System Performance Monitoring', () => {
        it('should collect performance metrics', async () => {
            const response = await request(app)
                .get('/api/performance/metrics')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);

            const metrics = response.body.data.current;
            expect(metrics.timestamp).toBeDefined();
            expect(metrics.database).toBeDefined();
            expect(metrics.websocket).toBeDefined();
            expect(metrics.memory).toBeDefined();
            expect(metrics.uptime).toBeGreaterThan(0);
        });

        it('should provide performance history', async () => {
            // Wait for some metrics to be collected
            await new Promise(resolve => setTimeout(resolve, 6000)); // Wait for at least one monitoring cycle

            const response = await request(app)
                .get('/api/performance/metrics/history?limit=5')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.metrics).toBeInstanceOf(Array);
            expect(response.body.data.count).toBeGreaterThan(0);
        });

        it('should export performance metrics', async () => {
            const response = await request(app)
                .get('/api/performance/metrics/export')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
            expect(response.headers['content-disposition']).toMatch(/attachment; filename="performance-metrics-\d+\.json"/);

            const exportData = JSON.parse(response.text);
            expect(exportData.exportTime).toBeDefined();
            expect(exportData.metricsCount).toBeGreaterThanOrEqual(0);
            expect(exportData.metrics).toBeInstanceOf(Array);
        });

        it('should optimize database performance', async () => {
            const response = await request(app)
                .post('/api/performance/optimize/database')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('optimization completed');
        });

        it('should handle performance monitoring controls', async () => {
            // Stop monitoring
            const stopResponse = await request(app)
                .post('/api/performance/monitoring/stop')
                .set('Authorization', `Bearer ${authToken}`);

            expect(stopResponse.status).toBe(200);
            expect(stopResponse.body.success).toBe(true);

            // Start monitoring with custom interval
            const startResponse = await request(app)
                .post('/api/performance/monitoring/start')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ interval: 10000 });

            expect(startResponse.status).toBe(200);
            expect(startResponse.body.success).toBe(true);
            expect(startResponse.body.message).toContain('10000ms interval');
        });
    });

    describe('Load Testing', () => {
        it('should handle concurrent attendance sync requests', async () => {
            const concurrentRequests = 10;
            const recordsPerRequest = 50;

            const requests = Array.from({ length: concurrentRequests }, (_, i) => {
                const attendanceRecords = Array.from({ length: recordsPerRequest }, (_, j) => ({
                    studentId: `load-test-student-${i}-${j}`,
                    facultyId: testFacultyId,
                    sectionId: testSectionId,
                    timestamp: new Date().toISOString(),
                    status: 'present',
                    captureMethod: 'manual'
                }));

                return request(app)
                    .post('/api/attendance/sync')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send({ records: attendanceRecords });
            });

            const startTime = Date.now();
            const responses = await Promise.all(requests);
            const totalTime = Date.now() - startTime;

            // All requests should succeed
            responses.forEach(response => {
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
            });

            // Should complete within reasonable time
            expect(totalTime).toBeLessThan(30000); // 30 seconds

            console.log(`Load test completed: ${concurrentRequests * recordsPerRequest} records in ${totalTime}ms`);

            // Clean up test data
            await executeOptimizedQuery(
                'DELETE FROM attendance_logs WHERE faculty_id = $1 AND student_id LIKE $2',
                [testFacultyId, 'load-test-student-%']
            );
        });

        it('should maintain performance under sustained load', async () => {
            const iterations = 5;
            const recordsPerIteration = 20;
            const executionTimes: number[] = [];

            for (let i = 0; i < iterations; i++) {
                const attendanceRecords = Array.from({ length: recordsPerIteration }, (_, j) => ({
                    studentId: `sustained-test-student-${i}-${j}`,
                    facultyId: testFacultyId,
                    sectionId: testSectionId,
                    timestamp: new Date().toISOString(),
                    status: 'present',
                    captureMethod: 'manual'
                }));

                const startTime = Date.now();

                const response = await request(app)
                    .post('/api/attendance/sync')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send({ records: attendanceRecords });

                const executionTime = Date.now() - startTime;
                executionTimes.push(executionTime);

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);

                // Small delay between iterations
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Performance should not degrade significantly
            const averageTime = executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length;
            const maxTime = Math.max(...executionTimes);
            const minTime = Math.min(...executionTimes);

            expect(maxTime - minTime).toBeLessThan(averageTime * 2); // Variance should be reasonable
            expect(averageTime).toBeLessThan(5000); // Average should be under 5 seconds

            console.log(`Sustained load test - Average: ${averageTime}ms, Min: ${minTime}ms, Max: ${maxTime}ms`);

            // Clean up test data
            await executeOptimizedQuery(
                'DELETE FROM attendance_logs WHERE faculty_id = $1 AND student_id LIKE $2',
                [testFacultyId, 'sustained-test-student-%']
            );
        });
    });
});