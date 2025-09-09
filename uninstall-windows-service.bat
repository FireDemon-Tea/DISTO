@echo off
setlocal enabledelayedexpansion

REM Minecraft Server Windows Service Uninstallation Script
REM This script removes the Minecraft server Windows service

echo ========================================
echo Minecraft Server Service Uninstaller
echo ========================================
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must be run as Administrator
    echo Right-click and select "Run as administrator"
    pause
    exit /b 1
)

REM Configuration
set SERVICE_NAME=MinecraftServer
set WRAPPER_JAR=MinecraftServiceWrapper.jar

echo Checking if service exists...

REM Check if service exists
sc query %SERVICE_NAME% >nul 2>&1
if %errorLevel% neq 0 (
    echo Service %SERVICE_NAME% does not exist
    echo Nothing to uninstall
    pause
    exit /b 0
)

echo Service %SERVICE_NAME% found
echo.

REM Show service status
echo Current service status:
sc query %SERVICE_NAME%
echo.

REM Ask for confirmation
set /p CONFIRM="Are you sure you want to uninstall the Minecraft server service? (y/N): "
if /i not "%CONFIRM%"=="y" (
    echo Uninstallation cancelled
    pause
    exit /b 0
)

echo.
echo Uninstalling service...

REM Stop the service if it's running
echo Stopping service...
sc stop %SERVICE_NAME% >nul 2>&1
if %errorLevel% equ 0 (
    echo Service stopped successfully
) else (
    echo Service was not running or already stopped
)

REM Wait a moment for the service to fully stop
echo Waiting for service to stop...
timeout /t 3 >nul

REM Delete the service
echo Removing service...
sc delete %SERVICE_NAME% >nul 2>&1
if %errorLevel% equ 0 (
    echo Service removed successfully
) else (
    echo ERROR: Failed to remove service
    echo You may need to restart your computer and try again
    pause
    exit /b 1
)

REM Ask about removing wrapper files
echo.
set /p REMOVE_FILES="Remove service wrapper files? (Y/n): "
if /i not "%REMOVE_FILES%"=="n" (
    if exist "%WRAPPER_JAR%" (
        del "%WRAPPER_JAR%"
        echo Removed %WRAPPER_JAR%
    )
    if exist "MinecraftServiceWrapper.java" (
        del "MinecraftServiceWrapper.java"
        echo Removed MinecraftServiceWrapper.java
    )
    if exist "MinecraftServiceWrapper.class" (
        del "MinecraftServiceWrapper.class"
        echo Removed MinecraftServiceWrapper.class
    )
    echo Service wrapper files removed
) else (
    echo Service wrapper files kept
)

echo.
echo ========================================
echo Uninstallation Complete!
echo ========================================
echo.
echo The Minecraft server service has been successfully removed.
echo.
echo Your Minecraft server files are still intact:
echo - server.jar
echo - world data
echo - mods
echo - config files
echo.
echo You can still run the server manually by double-clicking server.jar
echo or using: java -jar server.jar nogui
echo.

pause