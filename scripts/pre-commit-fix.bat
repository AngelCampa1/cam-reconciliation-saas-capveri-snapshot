@echo off
REM Pre-commit formatting fix script for Windows
REM Runs all formatters and linters to prepare code for committing

echo ====================================
echo Pre-Commit Formatting Fix
echo ====================================
echo.

REM Backend formatting
echo Running backend formatters...
cd backend

echo   - Black (code formatting)...
python -m black app tests
if errorlevel 1 goto error

echo   - isort (import sorting)...
python -m isort app tests --profile black
if errorlevel 1 goto error

echo   - Ruff (linting with auto-fix)...
python -m ruff check app tests --fix
if errorlevel 1 echo   (Some Ruff issues require manual fixing)

echo [92m✓ Backend formatting complete[0m
echo.

REM Frontend formatting
echo Running frontend formatters...
cd ..\frontend

echo   - Prettier (code formatting)...
call npm run format
if errorlevel 1 goto error

echo   - ESLint (linting with auto-fix)...
call npm run lint:fix
if errorlevel 1 echo   (Some ESLint warnings are expected)

echo [92m✓ Frontend formatting complete[0m
echo.

REM Test pre-commit hooks
echo Testing pre-commit hooks...
cd ..
pre-commit run --all-files
if errorlevel 1 (
    echo.
    echo [93mNote: Some pre-commit hooks may have failed.[0m
    echo Review the output above and fix any remaining issues manually.
    echo.
    exit /b 1
)

echo.
echo [92m====================================
echo ✓ All formatting checks passed!
echo ====================================[0m
echo.
echo You can now commit with: git add . ^&^& git commit
exit /b 0

:error
echo.
echo [91mError: Formatting failed. Please review the errors above.[0m
exit /b 1
