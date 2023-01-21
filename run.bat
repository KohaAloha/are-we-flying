@echo off
start "" cmd /k "cd venv\Scripts & activate & cd ..\..\api & title Autopilot && python server.py"
start "" cmd /k "cd website & npm start"
