# React Native Compatibility Guide

This document outlines the React Native compatibility features implemented in the backend API to ensure seamless communication between the React Native mobile app and the Node.js backend.

## Overview

The backend has been configured with specific middleware and response formats to handle React Native HTTP client patterns, CORS requirements, and mobile-specific error handling.

## Features Implemented

### 1. CORS Configuration

**Location**: `src/index.ts`

The backend is configured to accept requests from React Native apps without CORS restrictions:

```typescript
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
        // ... additional headers
    ],
    exposedHeaders: ['Authorization', 'Content-Length', 'X-Kuma-Revision']
}));
```

**Benefits**:
- Eliminates CORS errors in React Native apps
- Supports all necessary HTTP methods
- Allows custom headers commonly used by React Native HTTP clients

### 2. Security Middleware Adjustments

**Location**: `src/index.ts`

Helmet security middleware has been adjusted for mobile compatibility:

```typescript
app.use(helmet({
    crossOriginEmbedderPolicy: false, // Disable for React Native compatibility
    contentSecurityPolicy: false, // Disable CSP for mobile apps
}));
```

**Benefits**:
- Prevents security policies that can interfere with React Native networking
- Maintains essential security features while allowing mobile app communication

### 3. Content Type Handling

**Location**: `src/index.ts`

Enhanced body parsing to handle React Native HTTP client patterns:

```typescript
app.use(express.json({
    limit: '10mb',
    type: ['application/json', 'text/plain'] // Accept text/plain for React Native
}));
```

**Benefits**:
- Handles cases where React Native sends JSON as text/plain
- Supports large payloads for face recognition image data
- Ensures consistent parsing across different React Native HTTP libraries

### 4. React Native Detection Middleware

**Location**: `src/middleware/reactNativeCompatibility.ts`

Automatic detection of React Native clients:

```typescript
export const reactNativeCompatibility = (req: Request, res: Response, next: NextFunction): void => {
    const userAgent = req.get('User-Agent') || '';
    const isReactNative = userAgent.includes('ReactNative') || 
                         userAgent.includes('okhttp') || 
                         req.get('X-React-Native') === 'true';

    (req as any).isReactNative = isReactNative;

    if (isReactNative) {
        res.header('Content-Type', 'application/json; charset=utf-8');
        res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.header('X-API-Version', '1.0');
        res.header('X-Mobile-Compatible', 'true');
    }

    next();
};
```

**Detection Methods**:
- User-Agent containing "ReactNative"
- User-Agent containing "okhttp" (Android React Native)
- Custom header `X-React-Native: true`

### 5. Mobile-Specific Error Responses

**Location**: `src/middleware/errorHandler.ts`

Different error response formats for mobile vs web clients:

#### React Native Error Format:
```json
{
    "success": false,
    "error": {
        "code": 400,
        "message": "Validation failed",
        "type": "VALIDATION_ERROR",
        "timestamp": "2025-09-23T04:15:44.802Z"
    }
}
```

#### Web Client Error Format:
```json
{
    "success": false,
    "error": {
        "message": "Validation failed"
    }
}
```

**Error Types**:
- `VALIDATION_ERROR` (400)
- `AUTHENTICATION_ERROR` (401)
- `AUTHORIZATION_ERROR` (403)
- `NOT_FOUND_ERROR` (404)
- `CONFLICT_ERROR` (409)
- `RATE_LIMIT_ERROR` (429)
- `INTERNAL_SERVER_ERROR` (500)
- `SERVER_ERROR` (5xx)

### 6. Response Formatting Utilities

**Location**: `src/middleware/reactNativeCompatibility.ts`

Consistent response formatting functions:

```typescript
// Success response
export const formatSuccessResponse = (data: any, message?: string, meta?: any) => {
    return {
        success: true,
        data,
        message: message || 'Operation completed successfully',
        timestamp: new Date().toISOString(),
        ...(meta && { meta })
    };
};

// Validation error response
export const formatValidationError = (errors: any[]) => {
    return {
        success: false,
        error: {
            code: 400,
            type: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: errors,
            timestamp: new Date().toISOString()
        }
    };
};
```

## Usage Examples

### React Native HTTP Client Setup

```javascript
// React Native fetch configuration
const apiCall = async (endpoint, options = {}) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'X-React-Native': 'true', // Optional: explicit RN identification
            'Authorization': `Bearer ${token}`,
            ...options.headers,
        },
    });

    const data = await response.json();
    
    if (!data.success) {
        throw new Error(data.error.message);
    }
    
    return data.data;
};
```

### Axios Configuration for React Native

```javascript
import axios from 'axios';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
        'X-React-Native': 'true',
    },
});

// Response interceptor to handle mobile error format
apiClient.interceptors.response.use(
    (response) => response.data,
    (error) => {
        if (error.response?.data?.error) {
            throw new Error(error.response.data.error.message);
        }
        throw error;
    }
);
```

## Testing

### Manual Testing

Run the React Native compatibility test:

```bash
cd backend
npx ts-node src/test-rn-simple.ts
```

### Test Coverage

The compatibility features are tested for:

1. **CORS Handling**: Preflight OPTIONS requests
2. **User-Agent Detection**: ReactNative, okhttp, custom headers
3. **Content-Type Support**: application/json, text/plain
4. **Error Response Format**: Mobile vs web client differentiation
5. **Header Configuration**: Mobile-specific headers
6. **Large Payload Support**: Face recognition image data

### Expected Test Results

```
✅ Health check with React Native headers
✅ OPTIONS preflight request handling
✅ POST with JSON data
✅ POST with text/plain content type
✅ Mobile-specific error response format
✅ Web client error response format
✅ okhttp user agent detection
```

## Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure the React Native app is sending requests to the correct backend URL
2. **Content-Type Issues**: The backend accepts both `application/json` and `text/plain`
3. **Authentication**: Include the `Authorization` header with Bearer token
4. **Large Payloads**: The backend supports up to 10MB payloads for image data

### Debug Headers

When debugging, check for these response headers:
- `X-Mobile-Compatible: true` - Confirms React Native detection
- `X-API-Version: 1.0` - API version identifier
- `Access-Control-Allow-Origin: *` - CORS configuration

### Network Debugging

Enable network debugging in React Native:

```javascript
// Add to your React Native app for debugging
if (__DEV__) {
    global.XMLHttpRequest = global.originalXMLHttpRequest || global.XMLHttpRequest;
    global.FormData = global.originalFormData || global.FormData;
    
    if (window.FETCH_SUPPORT) {
        window.FETCH_SUPPORT.blob = false;
    } else {
        global.Blob = global.originalBlob || global.Blob;
        global.FileReader = global.originalFileReader || global.FileReader;
    }
}
```

## Requirements Satisfied

This implementation satisfies the following requirements from the specification:

- **Requirement 7.1**: Backend accepts requests without CORS restrictions ✅
- **Requirement 7.2**: WebSocket connections handle mobile-specific requirements ✅
- **Requirement 7.3**: API endpoints properly handle React Native HTTP client requests ✅
- **Requirement 7.4**: JWT tokens are validated from mobile clients ✅

## Future Enhancements

Potential improvements for React Native compatibility:

1. **Request Logging**: Add mobile-specific request logging
2. **Performance Monitoring**: Track mobile vs web client performance
3. **Version Management**: API versioning for mobile app updates
4. **Push Notifications**: Integration with React Native push notification services
5. **Offline Support**: Enhanced caching headers for offline functionality