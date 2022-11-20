@echo off
start "" cmd /k "cd venv\Scripts & activate & cd ..\..\api & python server.py"
start "" cmd /k "cd website & npm start"
