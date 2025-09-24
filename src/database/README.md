# Database Setup

This directory contains the PostgreSQL database schema and migration system for the Offline Attendance Sync backend.

## Structure

```
database/
├── migrations/           # SQL migration files
├── connection.ts        # Database connection pool setup
├── migrate.ts          # Migration runner
├── init.ts             # Database initialization
├── models.ts           # TypeScript interfaces for database models
├── utils.ts            # Database utility functions
├── reset.ts            # Database reset script
├── test.ts             # Database testing script
└── index.ts            # Main exports
```

## Database Schema

### Tables

1. **faculty** - Faculty authentication and profile data
   - `id` (UUID, Primary Key)
   - `username` (VARCHAR(50), Unique)
   - `password_hash` (VARCHAR(255))
   - `name` (VARCHAR(100))
   - `email` (VARCHAR(100), Unique)
   - `is_active` (BOOLEAN)
   - `created_at`, `updated_at` (TIMESTAMP)

2. **sections** - Class/section management
   - `id` (UUID, Primary Key)
   - `name` (VARCHAR(50))
   - `grade` (VARCHAR(10))
   - `faculty_id` (UUID, Foreign Key → faculty.id)
   - `student_count` (INTEGER, auto-updated)
   - `created_at`, `updated_at` (TIMESTAMP)

3. **students** - Student registry
   - `id` (UUID, Primary Key)
   - `roll_number` (VARCHAR(20), Unique)
   - `name` (VARCHAR(100))
   - `section_id` (UUID, Foreign Key → sections.id)
   - `face_embedding` (BYTEA, optional)
   - `is_active` (BOOLEAN)
   - `created_at`, `updated_at` (TIMESTAMP)

4. **attendance_logs** - Attendance records
   - `id` (UUID, Primary Key)
   - `student_id` (UUID, Foreign Key → students.id)
   - `faculty_id` (UUID, Foreign Key → faculty.id)
   - `section_id` (UUID, Foreign Key → sections.id)
   - `date` (DATE)
   - `status` ('present' | 'absent')
   - `capture_method` ('ml' | 'manual')
   - `synced_at`, `created_at` (TIMESTAMP)
   - Unique constraint on (student_id, date)

### Features

- **UUID Primary Keys** - Using uuid-ossp extension for unique identifiers
- **Automatic Timestamps** - `updated_at` fields automatically updated via triggers
- **Student Count Tracking** - Section student count automatically maintained
- **Performance Indexes** - Optimized indexes for common query patterns
- **Data Integrity** - Foreign key constraints and check constraints
- **Migration System** - Version-controlled schema changes

## Usage

### Environment Setup

Configure your database connection in `.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=attendance_system
DB_USER=postgres
DB_PASSWORD=your_password
DB_SSL=false
```

### Available Commands

```bash
# Initialize database and run all migrations
npm run db:init

# Run pending migrations only
npm run db:migrate

# Check migration status
npm run db:status

# Reset database (drops all tables)
npm run db:reset

# Test database functionality
npm run db:test
```

### Migration System

Migrations are stored in `migrations/` directory and named with sequential numbers:
- `001_create_faculty_table.sql`
- `002_create_sections_table.sql`
- `003_create_students_table.sql`
- `004_create_attendance_logs_table.sql`

The migration system:
- Tracks executed migrations in a `migrations` table
- Runs migrations in sequential order
- Uses transactions for atomic execution
- Supports rollback on failure

### Database Utilities

The `utils.ts` file provides common database operations:

```typescript
import { query, findById, insert, updateById, deleteById } from './database';

// Basic queries
const result = await query('SELECT * FROM faculty WHERE id = $1', [facultyId]);

// CRUD operations
const faculty = await findById('faculty', facultyId);
const newFaculty = await insert('faculty', { username, password_hash, name, email });
const updated = await updateById('faculty', facultyId, { name: 'New Name' });
const deleted = await deleteById('faculty', facultyId);

// Transactions
await withTransaction(async (client) => {
    await client.query('INSERT INTO faculty ...');
    await client.query('INSERT INTO sections ...');
});
```

## Requirements Satisfied

This implementation satisfies the following requirements:

- **6.2**: Complete student registry with sections and faculty relationships
- **6.3**: Secure credential storage with proper authentication tables
- **Database Performance**: Optimized indexes for common query patterns
- **Data Integrity**: Foreign key constraints and validation
- **Migration System**: Version-controlled schema management
- **Connection Pooling**: Efficient database connection management

## Security Features

- Password hashing support (bcrypt integration ready)
- SQL injection prevention through parameterized queries
- Proper foreign key constraints
- Data validation through check constraints
- Secure connection configuration options