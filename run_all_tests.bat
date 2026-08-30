@echo off
cd /d c:\Users\DELL\Documents\DevOps\devshop\application\backend
echo Running backend tests...
call mvn clean test -q
if errorlevel 1 (
    echo Backend tests FAILED
    exit /b 1
) else (
    echo Backend tests PASSED
)

cd /d c:\Users\DELL\Documents\DevOps\devshop\application\frontend
echo Running frontend tests...
call npm test -- --run
if errorlevel 1 (
    echo Frontend tests FAILED
    exit /b 1
) else (
    echo Frontend tests PASSED
)

echo Running frontend build...
call npm run build
if errorlevel 1 (
    echo Frontend build FAILED
    exit /b 1
) else (
    echo Frontend build PASSED
)

echo All tests and builds completed successfully!
