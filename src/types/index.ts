// Common types for the application

export interface Faculty {
    id: string;
    username: string;
    passwordHash: string;
    name: string;
    email: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface Student {
    id: string;
    rollNumber: string;
    name: string;
    sectionId: string;
    faceEmbedding?: Buffer;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface Section {
    id: string;
    name: string;
    grade: string;
    facultyId: string;
    studentCount: number;
    createdAt: Date;
}

export interface AttendanceLog {
    id: string;
    studentId: string;
    facultyId: string;
    sectionId: string;
    date: Date;
    status: 'present' | 'absent';
    captureMethod: 'ml' | 'manual';
    syncedAt: Date;
}

export interface AttendanceRecord {
    id?: number;
    studentId: string;
    facultyId: string;
    sectionId: string;
    timestamp: Date;
    status: 'present' | 'absent';
    syncStatus?: 'pending' | 'syncing' | 'synced' | 'failed';
    captureMethod: 'ml' | 'manual';
}

export interface LoginCredentials {
    username: string;
    password: string;
}

export interface AuthResult {
    success: boolean;
    token?: string;
    refreshToken?: string;
    user?: Omit<Faculty, 'passwordHash'>;
    error?: string;
}

export interface SyncResult {
    totalRecords: number;
    syncedRecords: number;
    failedRecords: number;
    errors: SyncError[];
}

export interface SyncError {
    recordId: number;
    error: string;
    retryCount: number;
    timestamp: Date;
}

export interface JWTPayload {
    userId: string;
    username: string;
    type: 'access' | 'refresh';
    iat?: number;
    exp?: number;
    iss?: string;
    aud?: string;
}

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
}