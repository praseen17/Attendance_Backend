-- Migration: Create faculty table
-- Description: Create faculty table for authentication and user management
-- Requirements: 6.2, 6.3

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create trigger function for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create faculty table
CREATE TABLE IF NOT EXISTS faculty (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_faculty_username ON faculty(username);
CREATE INDEX IF NOT EXISTS idx_faculty_email ON faculty(email);
CREATE INDEX IF NOT EXISTS idx_faculty_is_active ON faculty(is_active);

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_faculty_updated_at 
    BEFORE UPDATE ON faculty 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();