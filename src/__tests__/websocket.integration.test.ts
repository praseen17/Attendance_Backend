import WebSocket from 'ws';
import { createServer } from 'http';
import { app } from '../index';
import { generateAccessToken } from '../utils/auth';

describe('WebSocket Integration Tests', () => {
    let server: any;
    let wsServer: any;
    let port: number;
    const testFacultyId = 'ws-test-faculty';
    const testSectionId = 'ws-test-section';
    const testStudentId = 'ws-test-student';

    beforeAll(async () => {
        // Create HTTP server
        server = createServer(app);

        // Find available port
        port = await new Promise((resolve) => {
            const testServer = server.listen(0, () => {
                const assignedPort = (testServer.address() as any).port;
                testServer.close(() => resolve(assignedPort));
            });
        });

        // Start server
        server.listen(port);

        // Wait for server to be ready
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterAll(async () => {
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }
    });

    describe('ML Model WebSocket Communication', () => {
        it('should establish WebSocket connection successfully', async () => {
            const authToken = generateAccessToken(testFacultyId, 'wstest');

            return new Promise<void>((resolve, reject) => {
                const ws = new WebSocket(`ws://localhost:${port}/ws/ml-model`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });

                const timeout = setTimeout(() => {
                    ws.close();
                    reject(new Error('Connection timeout'));
                }, 5000);

                ws.on('open', () => {
                    clearTimeout(timeout);
                    ws.close();
                    resolve();
                });

                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });
        });

        it('should reject WebSocket connection without authentication', async () => {
            return new Promise<void>((resolve, reject) => {
                const ws = new WebSocket(`ws://localhost:${port}/ws/ml-model`);

                const timeout = setTimeout(() => {
                    reject(new Error('Connection should have been rejected'));
                }, 2000);

                ws.on('open', () => {
                    clearTimeout(timeout);
                    ws.close();
                    reject(new Error('Connection should not have been established'));
                });

                ws.on('close', (code) => {
                    clearTimeout(timeout);
                    if (code === 1008) { // Policy violation (unauthorized)
                        resolve();
                    } else {
                        reject(new Error(`Unexpected close code: ${code}`));
                    }
                });

                ws.on('error', () => {
                    clearTimeout(timeout);
                    resolve(); // Error is expected for unauthorized connection
                });
            });
        });

        it('should handle face recognition request and response', async () => {
            const authToken = generateAccessToken(testFacultyId, 'wstest');

            return new Promise<void>((resolve, reject) => {
                const ws = new WebSocket(`ws://localhost:${port}/ws/ml-model`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });

                const timeout = setTimeout(() => {
                    ws.close();
                    reject(new Error('Test timeout'));
                }, 10000);

                ws.on('open', () => {
                    // Send face recognition request
                    const faceData = {
                        type: 'face_recognition',
                        imageData: 'base64-encoded-image-data',
                        sectionId: testSectionId,
                        timestamp: new Date().toISOString()
                    };

                    ws.send(JSON.stringify(faceData));
                });

                ws.on('message', (data) => {
                    try {
                        const response = JSON.parse(data.toString());

                        expect(response.type).toBe('face_recognition_result');
                        expect(response).toHaveProperty('success');

                        if (response.success) {
                            expect(response).toHaveProperty('studentId');
                            expect(response).toHaveProperty('confidence');
                        } else {
                            expect(response).toHaveProperty('error');
                        }

                        clearTimeout(timeout);
                        ws.close();
                        resolve();
                    } catch (error) {
                        clearTimeout(timeout);
                        ws.close();
                        reject(error);
                    }
                });

                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });
        });

        it('should handle multiple concurrent face recognition requests', async () => {
            const authToken = generateAccessToken(testFacultyId, 'wstest');
            const concurrentRequests = 3;

            const connectionPromises = Array.from({ length: concurrentRequests }, (_, index) => {
                return new Promise<void>((resolve, reject) => {
                    const ws = new WebSocket(`ws://localhost:${port}/ws/ml-model`, {
                        headers: {
                            'Authorization': `Bearer ${authToken}`
                        }
                    });

                    const timeout = setTimeout(() => {
                        ws.close();
                        reject(new Error(`Connection ${index} timeout`));
                    }, 10000);

                    ws.on('open', () => {
                        const faceData = {
                            type: 'face_recognition',
                            imageData: `base64-encoded-image-data-${index}`,
                            sectionId: testSectionId,
                            timestamp: new Date().toISOString(),
                            requestId: `req-${index}`
                        };

                        ws.send(JSON.stringify(faceData));
                    });

                    ws.on('message', (data) => {
                        try {
                            const response = JSON.parse(data.toString());

                            expect(response.type).toBe('face_recognition_result');
                            expect(response.requestId).toBe(`req-${index}`);

                            clearTimeout(timeout);
                            ws.close();
                            resolve();
                        } catch (error) {
                            clearTimeout(timeout);
                            ws.close();
                            reject(error);
                        }
                    });

                    ws.on('error', (error) => {
                        clearTimeout(timeout);
                        reject(error);
                    });
                });
            });

            await Promise.all(connectionPromises);
        });

        it('should handle WebSocket connection errors gracefully', async () => {
            const authToken = generateAccessToken(testFacultyId, 'wstest');

            return new Promise<void>((resolve, reject) => {
                const ws = new WebSocket(`ws://localhost:${port}/ws/ml-model`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });

                const timeout = setTimeout(() => {
                    ws.close();
                    reject(new Error('Test timeout'));
                }, 5000);

                ws.on('open', () => {
                    // Send invalid message format
                    ws.send('invalid-json-message');
                });

                ws.on('message', (data) => {
                    try {
                        const response = JSON.parse(data.toString());

                        expect(response.type).toBe('error');
                        expect(response.error).toContain('Invalid message format');

                        clearTimeout(timeout);
                        ws.close();
                        resolve();
                    } catch (error) {
                        clearTimeout(timeout);
                        ws.close();
                        reject(error);
                    }
                });

                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    // WebSocket errors are expected for invalid messages
                    resolve();
                });
            });
        });

        it('should handle ML model service unavailable scenario', async () => {
            const authToken = generateAccessToken(testFacultyId, 'wstest');

            return new Promise<void>((resolve, reject) => {
                const ws = new WebSocket(`ws://localhost:${port}/ws/ml-model`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });

                const timeout = setTimeout(() => {
                    ws.close();
                    reject(new Error('Test timeout'));
                }, 10000);

                ws.on('open', () => {
                    // Send face recognition request when ML service might be unavailable
                    const faceData = {
                        type: 'face_recognition',
                        imageData: 'test-image-data',
                        sectionId: testSectionId,
                        timestamp: new Date().toISOString(),
                        forceError: true // Special flag to simulate ML service error
                    };

                    ws.send(JSON.stringify(faceData));
                });

                ws.on('message', (data) => {
                    try {
                        const response = JSON.parse(data.toString());

                        expect(response.type).toBe('face_recognition_result');
                        expect(response.success).toBe(false);
                        expect(response.error).toBeDefined();
                        expect(response.fallbackToManual).toBe(true);

                        clearTimeout(timeout);
                        ws.close();
                        resolve();
                    } catch (error) {
                        clearTimeout(timeout);
                        ws.close();
                        reject(error);
                    }
                });

                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });
        });
    });

    describe('WebSocket Connection Management', () => {
        it('should handle connection cleanup on client disconnect', async () => {
            const authToken = generateAccessToken(testFacultyId, 'wstest');

            return new Promise<void>((resolve, reject) => {
                const ws = new WebSocket(`ws://localhost:${port}/ws/ml-model`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });

                const timeout = setTimeout(() => {
                    reject(new Error('Test timeout'));
                }, 5000);

                ws.on('open', () => {
                    // Immediately close connection to test cleanup
                    ws.close();
                });

                ws.on('close', (code) => {
                    clearTimeout(timeout);
                    expect(code).toBe(1000); // Normal closure
                    resolve();
                });

                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });
        });

        it('should handle server-initiated connection close', async () => {
            const authToken = generateAccessToken(testFacultyId, 'wstest');

            return new Promise<void>((resolve, reject) => {
                const ws = new WebSocket(`ws://localhost:${port}/ws/ml-model`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });

                const timeout = setTimeout(() => {
                    ws.close();
                    reject(new Error('Test timeout'));
                }, 5000);

                ws.on('open', () => {
                    // Send a message that triggers server to close connection
                    const closeRequest = {
                        type: 'close_connection',
                        reason: 'test_cleanup'
                    };

                    ws.send(JSON.stringify(closeRequest));
                });

                ws.on('close', (code, reason) => {
                    clearTimeout(timeout);
                    expect(code).toBe(1000); // Normal closure
                    resolve();
                });

                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });
        });
    });
});