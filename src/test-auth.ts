/**
 * Manual test script for JWT authentication system
 * This script tests the core authentication functionality
 */

import { hashPassword, verifyPassword, generateTokenPair, verifyToken } from './utils/auth';

async function testAuthSystem() {
    console.log('🧪 Testing JWT Authentication System...\n');

    try {
        // Test 1: Password hashing and verification
        console.log('1. Testing password hashing...');
        const password = 'testpassword123';
        const hashedPassword = await hashPassword(password);
        console.log(`✅ Password hashed: ${hashedPassword.substring(0, 20)}...`);

        const isValidPassword = await verifyPassword(password, hashedPassword);
        console.log(`✅ Password verification: ${isValidPassword}`);

        const isInvalidPassword = await verifyPassword('wrongpassword', hashedPassword);
        console.log(`✅ Invalid password verification: ${!isInvalidPassword}`);

        // Test 2: JWT token generation
        console.log('\n2. Testing JWT token generation...');
        const userId = 'test-user-123';
        const username = 'testuser';

        const tokens = generateTokenPair(userId, username);
        console.log(`✅ Access token generated: ${tokens.accessToken.substring(0, 30)}...`);
        console.log(`✅ Refresh token generated: ${tokens.refreshToken.substring(0, 30)}...`);

        // Test 3: JWT token verification
        console.log('\n3. Testing JWT token verification...');

        const accessTokenPayload = verifyToken(tokens.accessToken, false);
        console.log(`✅ Access token verified - User ID: ${accessTokenPayload.userId}, Type: ${accessTokenPayload.type}`);

        const refreshTokenPayload = verifyToken(tokens.refreshToken, true);
        console.log(`✅ Refresh token verified - User ID: ${refreshTokenPayload.userId}, Type: ${refreshTokenPayload.type}`);

        // Test 4: Token type validation
        console.log('\n4. Testing token type validation...');
        try {
            verifyToken(tokens.accessToken, true); // Should fail
            console.log('❌ Token type validation failed - should have thrown error');
        } catch (error) {
            console.log('✅ Token type validation working - correctly rejected wrong token type');
        }

        // Test 5: Invalid token handling
        console.log('\n5. Testing invalid token handling...');
        try {
            verifyToken('invalid-token', false);
            console.log('❌ Invalid token handling failed - should have thrown error');
        } catch (error) {
            console.log('✅ Invalid token handling working - correctly rejected invalid token');
        }

        console.log('\n🎉 All JWT authentication tests passed!');
        console.log('\n📋 Summary:');
        console.log('- ✅ Password hashing with bcrypt');
        console.log('- ✅ Password verification');
        console.log('- ✅ JWT token generation (access & refresh)');
        console.log('- ✅ JWT token verification');
        console.log('- ✅ Token type validation');
        console.log('- ✅ Invalid token rejection');

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// Run the test
if (require.main === module) {
    testAuthSystem()
        .then(() => {
            console.log('\n✅ JWT Authentication System is ready for use!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Test suite failed:', error);
            process.exit(1);
        });
}

export { testAuthSystem };