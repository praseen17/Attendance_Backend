export interface MLRequest {
    type: 'FACE_RECOGNITION';
    data: {
        imageData: string; // Base64 encoded image
        sessionId: string;
        facultyId: string;
        sectionId: string;
    };
}

export interface MLResponse {
    type: 'FACE_RECOGNITION_RESULT' | 'ERROR';
    sessionId: string;
    data: {
        success: boolean;
        studentId?: string;
        confidence?: number;
        error?: string;
    };
}

export interface WebSocketMessage {
    type: string;
    sessionId: string;
    data: any;
}

export interface ClientSession {
    id: string;
    facultyId: string;
    sectionId: string;
    connectedAt: Date;
    lastActivity: Date;
}