import request from 'supertest';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { reactNativeCompatibility, formatSuccessResponse } from './middleware/reactNativeCompatibility';
import { errorHandler } from './middleware/errorHandler';

// Create a simple test app
const createTestApp = () => {
    const app = express();

    // Security middleware with React Native compatibility
    app.use(helmet({
        crossOriginEmbedderPolicy: false,
        contentSecurityPolicy: false,
    }));

    // CORS configuration for React Native compatibility
    app.use(cors({
        origin: true,
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

    // Body parsing middleware
    app.use(express.json({
        limit: '10mb',
        type: ['application/json', 'text/plain']
    }));
    app.use(express.urlencoded({ extended: true }));

    // React Native compatibility middleware
    app.use(reactNativeCompatibility);

    // Test routes
    app.get('/health', (req, res) => {
        res.json(formatSuccessResponse({ status: 'OK' }, 'Health check successful'));
    });

    app.post('/test-post', (req, res) => {
        res.json(formatSuccessResponse({ received: req.body }, 'Data received successfully'));
    });

    app.get('/error-test', (req, res, next) => {
        const error = new Error('Test error') as any;
        error.statusCode = 400;
        next(error);
    });

    // Error handling middleware
    app.use(errorHandler);

    return app;
};

const runTests = async () => {
    console.log('🚀 Testing React Native Compatibility...\n');

    const app = createTestApp();

    try {
        // Test 1: Basic health check with React Native headers
        console.log('1. Testing health check with React Native headers...');
        const healthResponse = await request(app)
            .get('/health')
            .set('User-Agent', 'ReactNative/0.72.0 (iPhone; iOS 16.0; Scale/3.00)')
            .set('X-React-Native', 'true');

        console.log('✅ Health check response:', {
            status: healthResponse.status,
            headers: {
                'x-mobile-compatible': healthResponse.headers['x-mobile-compatible'],
                'x-api-version': healthResponse.headers['x-api-version'],
                'access-control-allow-origin': healthResponse.headers['access-control-allow-origin']
            },
            body: healthResponse.body
        });

        // Test 2: OPTIONS preflight request
        console.log('\n2. Testing OPTIONS preflight request...');
        const optionsResponse = await request(app)
            .options('/test-post')
            .set('Origin', 'http://localhost:19006')
            .set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'Content-Type, Authorization');

        console.log('✅ OPTIONS response:', {
            status: optionsResponse.status,
            headers: {
                'access-control-allow-methods': optionsResponse.headers['access-control-allow-methods'],
                'access-control-allow-headers': optionsResponse.headers['access-control-allow-headers']
            }
        });

        // Test 3: POST with JSON data
        console.log('\n3. Testing POST with JSON data...');
        const postResponse = await request(app)
            .post('/test-post')
            .set('Content-Type', 'application/json')
            .set('User-Agent', 'ReactNative/0.72.0')
            .send({ test: 'data', timestamp: new Date().toISOString() });

        console.log('✅ POST response:', {
            status: postResponse.status,
            body: postResponse.body
        });

        // Test 4: POST with text/plain (React Native sometimes sends this)
        console.log('\n4. Testing POST with text/plain content type...');
        const textResponse = await request(app)
            .post('/test-post')
            .set('Content-Type', 'text/plain')
            .set('User-Agent', 'ReactNative/0.72.0')
            .send(JSON.stringify({ test: 'text-data' }));

        console.log('✅ Text/plain response:', {
            status: textResponse.status,
            body: textResponse.body
        });

        // Test 5: Error response format for React Native
        console.log('\n5. Testing error response format for React Native...');
        const errorResponse = await request(app)
            .get('/error-test')
            .set('User-Agent', 'ReactNative/0.72.0');

        console.log('✅ Error response:', {
            status: errorResponse.status,
            body: errorResponse.body
        });

        // Test 6: Error response format for web browser
        console.log('\n6. Testing error response format for web browser...');
        const webErrorResponse = await request(app)
            .get('/error-test')
            .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');

        console.log('✅ Web error response:', {
            status: webErrorResponse.status,
            body: webErrorResponse.body
        });

        // Test 7: okhttp user agent (Android React Native)
        console.log('\n7. Testing okhttp user agent detection...');
        const okHttpResponse = await request(app)
            .get('/health')
            .set('User-Agent', 'okhttp/4.9.0');

        console.log('✅ okhttp response:', {
            status: okHttpResponse.status,
            headers: {
                'x-mobile-compatible': okHttpResponse.headers['x-mobile-compatible']
            }
        });

        console.log('\n🎉 All React Native compatibility tests passed!');

    } catch (error) {
        console.error('\n❌ React Native compatibility test failed:', error);
        throw error;
    }
};

// Run tests
runTests().then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
}).catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
});