import request from 'supertest';
import app from './index';

/**
 * Test React Native compatibility with actual API endpoints
 */
const testAPIEndpoints = async () => {
    console.log('🚀 Testing React Native Compatibility with API Endpoints...\n');

    try {
        // Test 1: Health check endpoint
        console.log('1. Testing /health endpoint with React Native headers...');
        const healthResponse = await request(app)
            .get('/health')
            .set('User-Agent', 'ReactNative/0.72.0 (iPhone; iOS 16.0; Scale/3.00)')
            .set('X-React-Native', 'true');

        console.log('✅ Health endpoint response:', {
            status: healthResponse.status,
            headers: {
                'x-mobile-compatible': healthResponse.headers['x-mobile-compatible'],
                'x-api-version': healthResponse.headers['x-api-version']
            },
            body: healthResponse.body
        });

        // Test 2: API Health check endpoint
        console.log('\n2. Testing /api/health endpoint with React Native headers...');
        const apiHealthResponse = await request(app)
            .get('/api/health')
            .set('User-Agent', 'ReactNative/0.72.0')
            .set('X-React-Native', 'true');

        console.log('✅ API Health endpoint response:', {
            status: apiHealthResponse.status,
            body: apiHealthResponse.body
        });

        // Test 3: Authentication endpoint with validation error
        console.log('\n3. Testing /api/auth/login with missing credentials (React Native)...');
        const authErrorResponse = await request(app)
            .post('/api/auth/login')
            .set('Content-Type', 'application/json')
            .set('User-Agent', 'ReactNative/0.72.0')
            .send({});

        console.log('✅ Auth validation error response:', {
            status: authErrorResponse.status,
            body: authErrorResponse.body
        });

        // Test 4: Same endpoint with web browser user agent
        console.log('\n4. Testing /api/auth/login with missing credentials (Web Browser)...');
        const webAuthErrorResponse = await request(app)
            .post('/api/auth/login')
            .set('Content-Type', 'application/json')
            .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
            .send({});

        console.log('✅ Web auth validation error response:', {
            status: webAuthErrorResponse.status,
            body: webAuthErrorResponse.body
        });

        // Test 5: OPTIONS preflight for auth endpoint
        console.log('\n5. Testing OPTIONS preflight for /api/auth/login...');
        const optionsResponse = await request(app)
            .options('/api/auth/login')
            .set('Origin', 'http://localhost:19006')
            .set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'Content-Type, Authorization');

        console.log('✅ OPTIONS preflight response:', {
            status: optionsResponse.status,
            headers: {
                'access-control-allow-methods': optionsResponse.headers['access-control-allow-methods'],
                'access-control-allow-headers': optionsResponse.headers['access-control-allow-headers']
            }
        });

        // Test 6: Large payload test (simulating face recognition data)
        console.log('\n6. Testing large payload handling...');
        const largePayload = {
            imageData: 'data:image/jpeg;base64,' + 'a'.repeat(100000), // ~100KB
            timestamp: new Date().toISOString(),
            metadata: {
                width: 640,
                height: 480,
                format: 'jpeg'
            }
        };

        const largePayloadResponse = await request(app)
            .post('/api/auth/login') // Using login endpoint as it accepts POST
            .set('Content-Type', 'application/json')
            .set('User-Agent', 'ReactNative/0.72.0')
            .send(largePayload);

        console.log('✅ Large payload response:', {
            status: largePayloadResponse.status,
            bodySize: JSON.stringify(largePayloadResponse.body).length
        });

        // Test 7: Text/plain content type (React Native sometimes sends this)
        console.log('\n7. Testing text/plain content type...');
        const textPlainResponse = await request(app)
            .post('/api/auth/login')
            .set('Content-Type', 'text/plain')
            .set('User-Agent', 'ReactNative/0.72.0')
            .send(JSON.stringify({ username: 'test', password: 'test' }));

        console.log('✅ Text/plain response:', {
            status: textPlainResponse.status,
            contentParsed: textPlainResponse.body.error ? 'Yes' : 'No'
        });

        console.log('\n🎉 All API endpoint React Native compatibility tests completed!');

    } catch (error) {
        console.error('\n❌ API endpoint test failed:', error);
        throw error;
    }
};

// Export for use in other tests
export { testAPIEndpoints };

// Run tests if this file is executed directly
if (require.main === module) {
    testAPIEndpoints().then(() => {
        console.log('\n✅ All tests completed successfully');
        process.exit(0);
    }).catch((error) => {
        console.error('\n❌ Tests failed:', error);
        process.exit(1);
    });
}