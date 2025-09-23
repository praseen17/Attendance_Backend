import { Pool } from 'pg';
import { getPool } from './connection';
import { hashPassword } from '../utils/auth';

interface FacultyData {
    username: string;
    password: string;
    name: string;
    email: string;
    department?: string;
}

// Real-time faculty data for the attendance system
const facultyData: FacultyData[] = [
    {
        username: 'john.smith',
        password: 'SecurePass123!',
        name: 'Dr. John Smith',
        email: 'john.smith@university.edu',
        department: 'Computer Science'
    },
    {
        username: 'sarah.johnson',
        password: 'SecurePass456!',
        name: 'Prof. Sarah Johnson',
        email: 'sarah.johnson@university.edu',
        department: 'Information Technology'
    },
    {
        username: 'michael.brown',
        password: 'SecurePass789!',
        name: 'Dr. Michael Brown',
        email: 'michael.brown@university.edu',
        department: 'Computer Science'
    },
    {
        username: 'emily.davis',
        password: 'SecurePass101!',
        name: 'Prof. Emily Davis',
        email: 'emily.davis@university.edu',
        department: 'Mathematics'
    },
    {
        username: 'admin',
        password: 'AdminPass2024!',
        name: 'System Administrator',
        email: 'admin@university.edu',
        department: 'Administration'
    }
];

export async function seedFacultyData(): Promise<void> {
    const pool = getPool();

    try {
        console.log('Starting faculty data seeding...');

        // Check if faculty table exists and has data
        const checkQuery = 'SELECT COUNT(*) as count FROM faculty';
        const checkResult = await pool.query(checkQuery);
        const existingCount = parseInt(checkResult.rows[0].count);

        if (existingCount > 0) {
            console.log(`Faculty table already has ${existingCount} records. Skipping seed.`);
            return;
        }

        // Insert faculty data
        for (const faculty of facultyData) {
            const hashedPassword = await hashPassword(faculty.password);

            const insertQuery = `
                INSERT INTO faculty (username, password_hash, name, email, is_active)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (username) DO NOTHING
            `;

            await pool.query(insertQuery, [
                faculty.username,
                hashedPassword,
                faculty.name,
                faculty.email,
                true
            ]);

            console.log(`✓ Created faculty: ${faculty.name} (${faculty.username})`);
        }

        console.log('Faculty data seeding completed successfully!');
        console.log('\n=== LOGIN CREDENTIALS ===');
        facultyData.forEach(faculty => {
            console.log(`Username: ${faculty.username}`);
            console.log(`Password: ${faculty.password}`);
            console.log(`Name: ${faculty.name}`);
            console.log('---');
        });

    } catch (error) {
        console.error('Error seeding faculty data:', error);
        throw error;
    }
}

export async function getFacultyList(): Promise<void> {
    const pool = getPool();

    try {
        const query = 'SELECT username, name, email, is_active, created_at FROM faculty ORDER BY name';
        const result = await pool.query(query);

        console.log('\n=== CURRENT FACULTY MEMBERS ===');
        result.rows.forEach(faculty => {
            console.log(`Name: ${faculty.name}`);
            console.log(`Username: ${faculty.username}`);
            console.log(`Email: ${faculty.email}`);
            console.log(`Status: ${faculty.is_active ? 'Active' : 'Inactive'}`);
            console.log(`Created: ${faculty.created_at}`);
            console.log('---');
        });

    } catch (error) {
        console.error('Error getting faculty list:', error);
    }
}

// Run seeding if this file is executed directly
if (require.main === module) {
    seedFacultyData()
        .then(() => getFacultyList())
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Seeding failed:', error);
            process.exit(1);
        });
}