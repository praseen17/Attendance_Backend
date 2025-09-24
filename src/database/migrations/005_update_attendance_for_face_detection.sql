-- Migration: Update attendance_logs table for face detection flow
-- Description: Add fields to support face detection, liveness detection, and attendance images
-- Requirements: Face detection, liveness detection, attendance image capture

-- Add new columns to attendance_logs table
ALTER TABLE attendance_logs 
ADD COLUMN IF NOT EXISTS face_detected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS liveness_detected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(5,4),
ADD COLUMN IF NOT EXISTS attendance_image BYTEA,
ADD COLUMN IF NOT EXISTS face_detection_timestamp TIMESTAMP,
ADD COLUMN IF NOT EXISTS attendance_image_timestamp TIMESTAMP;

-- Add comments for documentation
COMMENT ON COLUMN attendance_logs.face_detected IS 'Whether a face was detected in the image';
COMMENT ON COLUMN attendance_logs.liveness_detected IS 'Whether liveness was detected (human vs image)';
COMMENT ON COLUMN attendance_logs.confidence_score IS 'Confidence score from face recognition (0.0000-1.0000)';
COMMENT ON COLUMN attendance_logs.attendance_image IS 'Base64 encoded attendance image captured after marking attendance';
COMMENT ON COLUMN attendance_logs.face_detection_timestamp IS 'When face detection was performed';
COMMENT ON COLUMN attendance_logs.attendance_image_timestamp IS 'When attendance image was captured';

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_attendance_logs_face_detected ON attendance_logs(face_detected);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_liveness_detected ON attendance_logs(liveness_detected);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_confidence_score ON attendance_logs(confidence_score);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_face_detection_timestamp ON attendance_logs(face_detection_timestamp);

-- Update capture_method check constraint to include new methods
ALTER TABLE attendance_logs DROP CONSTRAINT IF EXISTS attendance_logs_capture_method_check;
ALTER TABLE attendance_logs ADD CONSTRAINT attendance_logs_capture_method_check 
    CHECK (capture_method IN ('ml', 'manual', 'face_detection'));

-- Add check constraint for confidence score
ALTER TABLE attendance_logs ADD CONSTRAINT attendance_logs_confidence_score_check 
    CHECK (confidence_score IS NULL OR (confidence_score >= 0.0000 AND confidence_score <= 1.0000));
