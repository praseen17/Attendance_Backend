import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

interface Config {
    nodeEnv: string;
    port: number;
    database: {
        host: string;
        port: number;
        name: string;
        user: string;
        password: string;
        ssl: boolean;
    };
    jwt: {
        secret: string;
        expiresIn: string;
        refreshSecret: string;
        refreshExpiresIn: string;
    };
    websocket: {
        port: number;
    };
}

export const config: Config = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        name: process.env.DB_NAME || 'attendance_system',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password',
        ssl: process.env.DB_SSL === 'true',
    },
    jwt: {
        secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
        expiresIn: process.env.JWT_EXPIRES_IN || '1h',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key-change-in-production',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },
    websocket: {
        port: parseInt(process.env.WS_PORT || '3001', 10),
    },
};

// Validate required environment variables in production
if (config.nodeEnv === 'production') {
    const requiredEnvVars = [
        'JWT_SECRET',
        'JWT_REFRESH_SECRET',
        'DB_HOST',
        'DB_NAME',
        'DB_USER',
        'DB_PASSWORD'
    ];

    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

    if (missingEnvVars.length > 0) {
        console.error('Missing required environment variables:', missingEnvVars);
        process.exit(1);
    }
}