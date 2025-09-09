@echo off
setlocal enabledelayedexpansion

REM Minecraft Server Windows Service Installation Script
REM This script installs the Minecraft server as a Windows service with MetricsBridge mod detection

echo ========================================
echo Minecraft Server Service Installer
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
set SERVICE_DISPLAY_NAME=Minecraft Server
set SERVICE_DESCRIPTION=Minecraft Server with MetricsBridge Mod Detection
set WRAPPER_JAR=MinecraftServiceWrapper.jar
set WRAPPER_CLASS=MinecraftServiceWrapper
set JAVA_HOME=%JAVA_HOME%
set SERVER_DIR=%CD%

echo Checking prerequisites...

REM Check if Java is installed
java -version >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Java is not installed or not in PATH
    echo Please install Java 21 or higher and ensure it's in your PATH
    echo Download from: https://adoptium.net/
    pause
    exit /b 1
)

REM Get Java version
for /f "tokens=3" %%g in ('java -version 2^>^&1 ^| findstr /i "version"') do (
    set JAVA_VERSION=%%g
)
echo Java version found: %JAVA_VERSION%

REM Check if server.jar exists
if not exist "server.jar" (
    echo WARNING: server.jar not found in current directory
    echo Please ensure you have downloaded the Minecraft server jar
    echo and placed it in the same directory as this script
    echo.
    set /p CONTINUE="Continue anyway? (y/N): "
    if /i not "!CONTINUE!"=="y" (
        echo Installation cancelled
        pause
        exit /b 1
    )
)

REM Check if MetricsBridge mod is installed
set MOD_FOUND=0
if exist "mods\*.jar" (
    for %%f in (mods\*.jar) do (
        echo %%~nxf | findstr /i "metricsbridge" >nul
        if !errorLevel! equ 0 (
            set MOD_FOUND=1
            echo Found MetricsBridge mod: %%~nxf
        )
    )
)

if %MOD_FOUND% equ 0 (
    echo WARNING: MetricsBridge mod not found in mods directory
    echo The service will run in terminal mode until the mod is installed
    echo.
)

REM Compile the service wrapper
echo Compiling service wrapper...
javac MinecraftServiceWrapper.java
if %errorLevel% neq 0 (
    echo ERROR: Failed to compile MinecraftServiceWrapper.java
    echo Please ensure you have the Java Development Kit (JDK) installed
    pause
    exit /b 1
)

REM Create JAR file
echo Creating service wrapper JAR...
jar cf %WRAPPER_JAR% MinecraftServiceWrapper.class
if %errorLevel% neq 0 (
    echo ERROR: Failed to create service wrapper JAR
    pause
    exit /b 1
)

REM Clean up class file
del MinecraftServiceWrapper.class

echo Service wrapper compiled successfully

REM Check if service already exists
sc query %SERVICE_NAME% >nul 2>&1
if %errorLevel% equ 0 (
    echo Service %SERVICE_NAME% already exists
    set /p REMOVE="Remove existing service? (y/N): "
    if /i "!REMOVE!"=="y" (
        echo Stopping existing service...
        sc stop %SERVICE_NAME% >nul 2>&1
        timeout /t 3 >nul
        echo Removing existing service...
        sc delete %SERVICE_NAME% >nul 2>&1
        timeout /t 2 >nul
    ) else (
        echo Installation cancelled
        pause
        exit /b 1
    )
)

REM Create the service
echo Installing Windows service...
sc create %SERVICE_NAME% ^
    binPath= "java -jar \"%SERVER_DIR%\%WRAPPER_JAR%\"" ^
    DisplayName= "%SERVICE_DESCRIPTION%" ^
    start= auto ^
    obj= "NT AUTHORITY\LocalService"

if %errorLevel% neq 0 (
    echo ERROR: Failed to create Windows service
    echo Make sure you have administrator privileges
    pause
    exit /b 1
)

REM Configure service recovery options
echo Configuring service recovery options...
sc failure %SERVICE_NAME% reset= 86400 actions= restart/5000/restart/5000/restart/5000

REM Set service description
sc description %SERVICE_NAME% "%SERVICE_DESCRIPTION%"

echo.
echo ========================================
echo Service Installation Complete!
echo ========================================
echo.
echo Service Name: %SERVICE_NAME%
echo Display Name: %SERVICE_DISPLAY_NAME%
echo Description: %SERVICE_DESCRIPTION%
echo.
echo The service will:
echo - Start automatically when Windows boots
echo - Run as a service when MetricsBridge mod is installed
echo - Run in terminal mode when MetricsBridge mod is not installed
echo - Automatically restart if it crashes
echo.

if %MOD_FOUND% equ 1 (
    echo MetricsBridge mod detected - service will start in service mode
    echo Web interface will be available at: http://localhost:8765
) else (
    echo MetricsBridge mod not found - service will start in terminal mode
    echo Install the mod to enable service mode and web interface
)

echo.
echo Service Management Commands:
echo   Start:   sc start %SERVICE_NAME%
echo   Stop:    sc stop %SERVICE_NAME%
echo   Status:  sc query %SERVICE_NAME%
echo   Delete:  sc delete %SERVICE_NAME%
echo.
echo Or use the Windows Services management console (services.msc)
echo.

set /p START_NOW="Start the service now? (Y/n): "
if /i not "!START_NOW!"=="n" (
    echo Starting service...
    sc start %SERVICE_NAME%
    if %errorLevel% equ 0 (
        echo Service started successfully!
        echo Check the Windows Event Viewer for service logs
    ) else (
        echo Failed to start service. Check Windows Event Viewer for details.
    )
)

echo.
echo Installation complete!
pause