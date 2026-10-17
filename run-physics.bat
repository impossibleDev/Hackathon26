@echo off
cd /d "%~dp0"
if not exist out mkdir out
javac -d out src\PhysicsSimulator.java
if errorlevel 1 (
    echo Build failed.
    pause
    exit /b 1
)
java -cp out PhysicsSimulator
