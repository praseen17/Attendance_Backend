# WebSocket API Documentation

## Overview

The WebSocket server provides real-time communication for ML-based face recognition functionality. It enables the React Native frontend to send face data and receive student identification results in real-time.

## Connection

**Endpoint:** `ws://localhost:3000/ws/ml`

## Message Format

All messages follow this JSON structure:
```json
{
  "type": "MESSAGE_TYPE",
  "sessionId": "unique-session-id",
  "data": {
    // Message-specific data
  }
}
```

## Client-to-Server Messages

### 1. Authentication
```json
{
  "type": "AUTHENTICATE",
  "sessionId": "client-session-id",
  "data": {
    "facultyId": "faculty-uuid",
    "sectionId": "section-uuid"
  }
}
```

### 2. Face Recognition Request
```json
{
  "type": "FACE_RECOGNITION",
  "data": {
    "imageData": "base64-encoded-image-data",
    "sessionId": "client-session-id",
    "facultyId": "faculty-uuid",
    "sectionId": "section-uuid"
  }
}
```

### 3. Ping (Keep-Alive)
```json
{
  "type": "PING",
  "sessionId": "client-session-id",
  "data": {}
}
```

## Server-to-Client Messages

### 1. Connection Established
```json
{
  "type": "CONNECTION_ESTABLISHED",
  "sessionId": "server-generated-session-id",
  "data": {
    "message": "WebSocket connection established successfully"
  }
}
```

### 2. Authentication Success
```json
{
  "type": "AUTHENTICATION_SUCCESS",
  "sessionId": "session-id",
  "data": {
    "message": "Authentication successful",
    "facultyId": "faculty-uuid",
    "sectionId": "section-uuid"
  }
}
```

### 3. Face Recognition Result
```json
{
  "type": "FACE_RECOGNITION_RESULT",
  "sessionId": "session-id",
  "data": {
    "success": true,
    "studentId": "student-uuid",
    "confidence": 0.95
  }
}
```

### 4. Error Response
```json
{
  "type": "ERROR",
  "sessionId": "session-id",
  "data": {
    "error": "Error message description"
  }
}
```

### 5. Pong (Keep-Alive Response)
```json
{
  "type": "PONG",
  "sessionId": "session-id",
  "data": {
    "timestamp": "2024-01-01T12:00:00.000Z"
  }
}
```

## Connection Flow

1. **Connect** to WebSocket endpoint
2. **Receive** `CONNECTION_ESTABLISHED` message
3. **Send** `AUTHENTICATE` message with faculty and section IDs
4. **Receive** `AUTHENTICATION_SUCCESS` confirmation
5. **Send** `FACE_RECOGNITION` requests as needed
6. **Receive** `FACE_RECOGNITION_RESULT` responses
7. **Handle** periodic `PING`/`PONG` for keep-alive

## Error Handling

### Common Error Messages
- `"Client must be authenticated before face recognition"`
- `"Faculty ID and Section ID are required for authentication"`
- `"ML model service is not connected"`
- `"Face recognition processing failed"`
- `"Invalid message format"`

### Connection Issues
- The server automatically sends `PING` messages every 15 seconds
- Clients inactive for more than 30 seconds are disconnected
- Implement exponential backoff for reconnection attempts

## REST API Endpoints

### Get WebSocket Status
```
GET /api/websocket/status
Authorization: Bearer <jwt-token>
```

Response:
```json
{
  "websocket": {
    "connected": true,
    "connectedClients": 3,
    "endpoint": "/ws/ml"
  },
  "mlModel": {
    "connected": true,
    "status": "active"
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Get Active Sessions
```
GET /api/websocket/sessions
Authorization: Bearer <jwt-token>
```

Response:
```json
{
  "sessions": [
    {
      "id": "session-uuid",
      "facultyId": "faculty-uuid",
      "sectionId": "section-uuid",
      "connectedAt": "2024-01-01T12:00:00.000Z",
      "lastActivity": "2024-01-01T12:05:00.000Z"
    }
  ],
  "totalSessions": 1
}
```

### Test ML Model
```
POST /api/websocket/test-ml
Authorization: Bearer <jwt-token>
```

Response:
```json
{
  "message": "ML model test completed",
  "result": {
    "type": "FACE_RECOGNITION_RESULT",
    "sessionId": "test-session",
    "data": {
      "success": true,
      "studentId": "student-123",
      "confidence": 0.87
    }
  },
  "connected": true
}
```

## Implementation Notes

### Security
- Authentication required before face recognition requests
- Session-based access control
- Automatic cleanup of inactive connections

### Performance
- Heartbeat mechanism prevents connection timeouts
- Efficient message routing using session IDs
- Graceful error handling and recovery

### ML Integration
- Simulated ML responses for development/testing
- Extensible interface for real ML model integration
- Fallback handling when ML service is unavailable

## Testing

Run WebSocket tests:
```bash
npm run test:websocket
```

Run manual WebSocket test:
```bash
npm run test:ws
```