import { Pool } from 'pg';
import { Faculty, CreateFacultyInput } from '../database/models';
import { hashPassword, verifyPassword, generateTokenPair, TokenPair } from '../utils/auth';
import { getPool } from '../database/connection';

export interface LoginCredentials {
    username: string;
    password: string;
}

export interface LoginResult {
    success: boolean;
    user?: {
        id: string;
        username: string;
        name: string;
        email: string;
    };
    tokens?: TokenPair;
    error?: string;
}

export interface UserProfile {
    id: string;
    username: string;
    name: string;
    email: string;
    isActive: boolean;
    createdAt: Date;
}

export class AuthService {
    private pool: Pool;

    constructor() {
        this.pool = getPool();
    }

    /**
     * Authenticate user with username and password
     */
    async login(credentials: LoginCredentials): Promise<LoginResult> {
        try {
            const { username, password } = credentials;

            // Find faculty by username
            const query = `
        SELECT id, username, password_hash, name, email, is_active, created_at
        FROM faculty 
        WHERE username = $1 AND is_active = true
      `;

            const result = await this.pool.query(query, [username]);

            if (result.rows.length === 0) {
                return {
                    success: false,
                    error: 'Invalid username or password'
                };
            }

            const faculty = result.rows[0] as Faculty;

            // Verify password
            const isPasswordValid = await verifyPassword(password, faculty.password_hash);

            if (!isPasswordValid) {
                return {
                    success: false,
                    error: 'Invalid username or password'
                };
            }

            // Generate tokens
            const tokens = generateTokenPair(faculty.id, faculty.username);

            return {
                success: true,
                user: {
                    id: faculty.id,
                    username: faculty.username,
                    name: faculty.name,
                    email: faculty.email
                },
                tokens
            };
        } catch (error) {
            console.error('Login error:', error);
            return {
                success: false,
                error: 'Authentication failed'
            };
        }
    }

    /**
     * Get user profile by ID
     */
    async getUserProfile(userId: string): Promise<UserProfile | null> {
        try {
            const query = `
        SELECT id, username, name, email, is_active, created_at
        FROM faculty 
        WHERE id = $1 AND is_active = true
      `;

            const result = await this.pool.query(query, [userId]);

            if (result.rows.length === 0) {
                return null;
            }

            const faculty = result.rows[0];
            return {
                id: faculty.id,
                username: faculty.username,
                name: faculty.name,
                email: faculty.email,
                isActive: faculty.is_active,
                createdAt: faculty.created_at
            };
        } catch (error) {
            console.error('Get user profile error:', error);
            return null;
        }
    }

    /**
     * Create a new faculty user (for testing/admin purposes)
     */
    async createFaculty(input: CreateFacultyInput): Promise<Faculty | null> {
        try {
            // Hash the password
            const hashedPassword = await hashPassword(input.password_hash);

            const query = `
        INSERT INTO faculty (username, password_hash, name, email, is_active)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;

            const values = [
                input.username,
                hashedPassword,
                input.name,
                input.email,
                input.is_active ?? true
            ];

            const result = await this.pool.query(query, values);
            return result.rows[0] as Faculty;
        } catch (error) {
            console.error('Create faculty error:', error);
            return null;
        }
    }

    /**
     * Check if username already exists
     */
    async usernameExists(username: string): Promise<boolean> {
        try {
            const query = 'SELECT id FROM faculty WHERE username = $1';
            const result = await this.pool.query(query, [username]);
            return result.rows.length > 0;
        } catch (error) {
            console.error('Username exists check error:', error);
            return false;
        }
    }

    /**
     * Update faculty password
     */
    async updatePassword(userId: string, newPassword: string): Promise<boolean> {
        try {
            const hashedPassword = await hashPassword(newPassword);

            const query = `
        UPDATE faculty 
        SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND is_active = true
      `;

            const result = await this.pool.query(query, [hashedPassword, userId]);
            return (result.rowCount ?? 0) > 0;
        } catch (error) {
            console.error('Update password error:', error);
            return false;
        }
    }
}