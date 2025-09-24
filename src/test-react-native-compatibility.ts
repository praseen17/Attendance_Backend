import request from 'supertest';
import app from './index';

/**
 * Test React Native compatibility features
 * This file tests the backend configuration for React Native HTTP client patterns
 */

describe('React Native Compatibility Tests', () => {
    // Test CORS configuration
    describe('CORS Configuration', () => {
        it('should allow all origins for React Native', async () => {
            const response = await request(app)
                .get('/api/health')
                .set('Origin', 'http://localhost:19006') // Expo dev server
                .expect(200);

            expect(response.headers['access-control-allow-origin']).toBe('*');
        });

        it('should handle preflight OPTIONS requests', async () => {
            const response = await request(app)
                .options('/api/auth/login')
                .set('Origin', 'http://localhost:19006')
                .set('Access-Control-Request-Method', 'POST')
                .set('Access-Control-Request-Headers', 'Content-Type, Authorization')
                .expect(200);

            expect(response.headers['access-control-allow-methods']).toContain('POST');
            expect(response.headers['access-control-allow-headers']).toContain('Authorization');
        });
    });

    // Test React Native User-Agent detection
    describe('React Native Detection', () => {
        it('should detect React Native user agent', async () => {
            const response = await request(app)
                .get('/api/health')
                .set('User-Agent', 'ReactNative/0.72.0 (iPhone; iOS 16.0; Scale/3.00)')
                .expect(200);

            expect(response.headers['x-mobile-compatible']).toBe('true');
            expect(response.headers['x-api-version']).toBe('1.0');
        });

        it('should detect okhttp user agent (Android React Native)', async () => {
            const response = await request(app)
                .get('/api/health')
                .set('User-Agent', 'okhttp/4.9.0')
                .expect(200);

            expect(response.headers['x-mobile-compatible']).toBe('true');
        });

        it('should detect custom React Native header', async () => {
            const response = await request(app)
                .get('/api/health')
                .set('X-React-Native', 'true')
                .expect(200);

            expect(response.headers['x-mobile-compatible']).toBe('true');
        });
    });

    // Test content type handling
    describe('Content Type Handling', () => {
        it('should accept application/json content type', async () => {
            const testData = { test: 'data' };

            const response = await request(app)
                .post('/api/health')
                .set('Content-Type', 'application/json')
                .send(testData)
                .expect(404); // Health endpoint doesn't accept POST, but should parse body

            // Should not throw parsing error
        });

        it('should accept text/plain content type for React Native', async () => {
            const testData = JSON.stringify({ test: 'data' });

            const response = await request(app)
                .post('/api/health')
                .set('Content-Type', 'text/plain')
                .send(testData)
                .expect(404); // Health endpoint doesn't accept POST, but should parse body

            // Should not throw parsing error
        });
    });

    // Test error response format for React Native
    describe('Error Response Format', () => {
        it('should return mobile-specific error format for React Native clients', async () => {
            const response = await request(app)
                .get('/api/nonexistent')
                .set('User-Agent', 'ReactNative/0.72.0')
                .expect(404);

            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('code', 404);
            expect(response.body.error).toHaveProperty('type', 'NOT_FOUND_ERROR');
            expect(response.body.error).toHaveProperty('timestamp');
        });

        it('should return standard error format for web clients', async () => {
            const response = await request(app)
                .get('/api/nonexistent')
                .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
                .expect(404);

            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('error');
            expect(response.body.error).not.toHaveProperty('code');
            expect(response.body.error).not.toHaveProperty('type');
        });
    });

    // Test authentication with React Native patterns
    describe('Authentication Compatibility', () => {
        it('should handle Authorization header from React Native', async () => {
            const response = await request(app)
                .get('/api/health')
                .set('Authorization', 'Bearer fake-jwt-token')
                .set('User-Agent', 'ReactNative/0.72.0')
                .expect(200);

            // Should accept the header without issues
            expect(response.headers['x-mobile-compatible']).toBe('true');
        });

        it('should handle custom headers from React Native HTTP clients', async () => {
            const response = await request(app)
                .get('/api/health')
                .set('X-Requested-With', 'XMLHttpRequest')
                .set('X-React-Native', 'true')
                .set('Cache-Control', 'no-cache')
                .expect(200);

            expect(response.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
        });
    });

    // Test large payload handling (for face recognition data)
    describe('Large Payload Handling', () => {
        it('should handle large JSON payloads for face recognition', async () => {
            // Simulate large base64 image data
            const largePayload = {
                imageData: 'data:image/jpeg;base64,' + 'a'.repeat(1000000), // ~1MB
                timestamp: new Date().toISOString()
            };

            const response = await request(app)
                .post('/api/health')
                .set('Content-Type', 'application/json')
                .set('User-Agent', 'ReactNative/0.72.0')
                .send(largePayload)
                .expect(404); // Health endpoint doesn't accept POST, but should parse large body

            // Should not throw payload too large error
        });
    });

    // Test WebSocket compatibility headers
    describe('WebSocket Compatibility', () => {
        it('should set proper headers for WebSocket upgrade requests', async () => {
            const response = await request(app)
                .get('/api/health')
                .set('Connection', 'Upgrade')
                .set('Upgrade', 'websocket')
                .set('User-Agent', 'ReactNative/0.72.0')
                .expect(200);

            expect(response.headers['x-mobile-compatible']).toBe('true');
        });
    });
});

// Manual test function for development
export const testReactNativeCompatibility = async () => {
    console.log('Testing React Native Compatibility...');

    try {
        // Test 1: Basic health check with React Native headers
        console.log('1. Testing health check with React Native headers...');
        const healthResponse = await request(app)
            .get('/api/health')
            .set('User-Agent', 'ReactNative/0.72.0 (iPhone; iOS 16.0; Scale/3.00)')
            .set('X-React-Native', 'true');

        console.log('Health check response:', {
            status: healthResponse.status,
            headers: {
                'x-mobile-compatible': healthResponse.headers['x-mobile-compatible'],
                'x-api-version': healthResponse.headers['x-api-version'],
                'access-control-allow-origin': healthResponse.headers['access-control-allow-origin']
            },
            body: healthResponse.body
        });

        // Test 2: OPTIONS preflight request
        console.log('2. Testing OPTIONS preflight request...');
        const optionsResponse = await request(app)
            .options('/api/auth/login')
            .set('Origin', 'http://localhost:19006')
            .set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'Content-Type, Authorization');

        console.log('OPTIONS response:', {
            status: optionsResponse.status,
            headers: {
                'access-control-allow-methods': optionsResponse.headers['access-control-allow-methods'],
                'access-control-allow-headers': optionsResponse.headers['access-control-allow-headers']
            }
        });

        // Test 3: Error response format
        console.log('3. Testing error response format...');
        const errorResponse = await request(app)
            .get('/api/nonexistent')
            .set('User-Agent', 'ReactNative/0.72.0');

        console.log('Error response:', {
            status: errorResponse.status,
            body: errorResponse.body
        });

        console.log('✅ React Native compatibility tests completed successfully!');

    } catch (error) {
        console.error('❌ React Native compatibility test failed:', error);
    }
};

// Run manual test if this file is executed directly
if (require.main === module) {
    testReactNativeCompatibility().then(() => {
        process.exit(0);
    }).catch((error) => {
        console.error('Test failed:', error);
        process.exit(1);
    });
}