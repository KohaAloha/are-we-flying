@echo off
start "" cmd /k "cd venv\Scripts & activate & cd ..\..\api\elevation & title ElevationServer & python -B server.py"
start "" cmd /k "cd api-node & title APIServer & node server.js"
start "" cmd /k "cd website & title WebServer & node server.js"
