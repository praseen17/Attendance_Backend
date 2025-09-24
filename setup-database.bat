@echo off
echo Setting up PostgreSQL database for attendance system...

REM Stop and remove existing container if it exists
docker stop postgres-attendance 2>nul
docker rm postgres-attendance 2>nul

REM Start new PostgreSQL container
docker run --name postgres-attendance ^
  -e POSTGRES_PASSWORD=F!ve ^
  -e POSTGRES_DB=Attendance ^
  -p 5432:5432 ^
  -d postgres:13

echo Waiting for PostgreSQL to start...
timeout /t 10 /nobreak >nul

echo PostgreSQL container started successfully!
echo.
echo Database Details:
echo Host: localhost
echo Port: 5432
echo Database: Attendance
echo Username: postgres
echo Password: F!ve
echo.
echo You can now start your backend with: npm start
pause