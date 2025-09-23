# Offline Attendance Sync Backend

Backend API for the offline attendance synchronization system designed for rural schools with unreliable network connectivity.

## Features

- JWT-based authentication
- PostgreSQL database integration
- WebSocket support for ML model communication
- Offline-first sync capabilities
- React Native mobile app compatibility

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## Installation

1. Install dependencies:
```bash
npm install
```

2. Copy environment configuration:
```bash
cp .env.example .env
```

3. Update the `.env` file with your database credentials and JWT secrets.

4. Build the project:
```bash
npm run build
```

## Development

Start the development server:
```bash
npm run dev
```

## Scripts

- `npm run build` - Build the TypeScript project
- `npm run start` - Start the production server
- `npm run dev` - Start the development server with hot reload
- `npm run test` - Run tests
- `npm run migrate` - Run database migrations

## API Endpoints

### Health Check
- `GET /health` - Server health status

### Authentication (Coming in Task 4)
- `POST /api/auth/login` - Faculty login
- `POST /api/auth/refresh` - Refresh JWT token

### Attendance Sync (Coming in Task 6)
- `POST /api/attendance/sync` - Sync attendance records
- `GET /api/attendance/student/:studentId` - Get attendance history

### Student Management (Coming in Task 5)
- `GET /api/students/section/:sectionId` - Get students by section
- `GET /api/faculty/:facultyId/sections` - Get faculty sections

## Environment Variables

See `.env.example` for all required environment variables.

## Database

The application uses PostgreSQL for data storage. Database schema and migrations will be implemented in Task 2.

## WebSocket

WebSocket server for ML model integration will be implemented in Task 7.