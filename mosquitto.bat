@echo off
set /p address="Enter MQTT broker address: "
set /p port="Enter port: "
cd /d "C:\Program Files\mosquitto"
mosquitto_sub -h %address% -p %port% -t "test" -u "Pedro" -P "test"
pause