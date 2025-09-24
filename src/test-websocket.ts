import WebSocket from 'ws';

/**
 * Test script for WebSocket ML integration
 */
async function testWebSocketConnection() {
    const WS_URL = 'ws://localhost:3000/ws/ml';

    console.log('Testing WebSocket connection to:', WS_URL);

    try {
        const ws = new WebSocket(WS_URL);

        ws.on('open', () => {
            console.log('✅ WebSocket connection established');

            // Test authentication
            const authMessage = {
                type: 'AUTHENTICATE',
                sessionId: 'test-session',
                data: {
                    facultyId: 'faculty-123',
                    sectionId: 'section-456'
                }
            };

            console.log('📤 Sending authentication message...');
            ws.send(JSON.stringify(authMessage));
        });

        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            console.log('📥 Received message:', message);

            if (message.type === 'AUTHENTICATION_SUCCESS') {
                console.log('✅ Authentication successful');

                // Test face recognition
                const faceRecognitionMessage = {
                    type: 'FACE_RECOGNITION',
                    data: {
                        imageData: 'base64-encoded-image-data-here',
                        sessionId: 'test-session',
                        facultyId: 'faculty-123',
                        sectionId: 'section-456'
                    }
                };

                console.log('📤 Sending face recognition request...');
                ws.send(JSON.stringify(faceRecognitionMessage));
            }

            if (message.type === 'FACE_RECOGNITION_RESULT') {
                console.log('✅ Face recognition result received:', message.data);

                // Close connection after successful test
                setTimeout(() => {
                    ws.close();
                }, 1000);
            }

            if (message.type === 'PING') {
                console.log('📤 Responding to ping with pong...');
                ws.send(JSON.stringify({
                    type: 'PONG',
                    sessionId: 'test-session',
                    data: { timestamp: new Date().toISOString() }
                }));
            }
        });

        ws.on('close', (code, reason) => {
            console.log(`🔌 WebSocket connection closed: ${code} - ${reason}`);
        });

        ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error);
        });

    } catch (error) {
        console.error('❌ Failed to connect to WebSocket:', error);
    }
}

// Test API endpoints
async function testWebSocketAPI() {
    const BASE_URL = 'http://localhost:3000/api';

    try {
        // Test WebSocket status endpoint
        console.log('\n🔍 Testing WebSocket status API...');

        // Note: This would require authentication in a real scenario
        // For testing, you might need to modify the route temporarily or use a valid JWT token

        console.log('ℹ️  To test API endpoints, you need to:');
        console.log('1. Start the server: npm run dev');
        console.log('2. Login to get a JWT token');
        console.log('3. Use the token to access /api/websocket/status');
        console.log('4. Use the token to access /api/websocket/sessions');
        console.log('5. Use the token to access /api/websocket/test-ml');

    } catch (error) {
        console.error('❌ API test failed:', error);
    }
}

// Run tests
if (require.main === module) {
    console.log('🚀 Starting WebSocket tests...\n');

    // Wait a bit for server to start if running concurrently
    setTimeout(async () => {
        await testWebSocketConnection();
        await testWebSocketAPI();
    }, 2000);
}

export { testWebSocketConnection, testWebSocketAPI };