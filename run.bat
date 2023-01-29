@echo off
start "" cmd /k "cd venv\Scripts & activate & cd ..\..\api & title Autopilot & python -B server.py"
start "" cmd /k "cd website & title Web Server & node server.js"
