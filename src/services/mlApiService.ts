import fetch from 'node-fetch';

export interface AnalyzeFaceRequest {
    imageData: string; // base64
    sectionId: string;
    facultyId: string;
}

export interface AnalyzeFaceResponse {
    success: boolean;
    studentId?: string;
    confidence?: number;
    error?: string;
}

export interface EnrollStudentRequest {
    imageData: string; // base64
    studentId: string;
    name: string;
    sectionId: string;
}

export interface EnrollStudentResponse {
    success: boolean;
    message?: string;
    error?: string;
}

const ML_API_URL = process.env.ML_API_URL || '';
const ML_API_KEY = process.env.ML_API_KEY || '';

async function postJson<T>(path: string, body: unknown): Promise<T> {
    const url = `${ML_API_URL}${path}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': ML_API_KEY ? `Bearer ${ML_API_KEY}` : '',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`ML API ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
}

export const mlApiService = {
    analyzeFace(req: AnalyzeFaceRequest) {
        return postJson<AnalyzeFaceResponse>('/recognize', req);
    },
    enrollStudent(req: EnrollStudentRequest) {
        return postJson<EnrollStudentResponse>('/enroll', req);
    },
};


