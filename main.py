from machine import ADC, Pin, I2C
import wifimgr
import time
import machine
from umqtt.simple import MQTTClient
import utime

# LED
led = machine.Pin("LED", machine.Pin.OUT)

#Calibraton values
min_moisture=19200
max_moisture=49300
upper_threshold = 32.5
lower_threshold = 28.5

readDelay = 10 # delay between readings

Moisture_Pin = 26
soil = ADC(Pin(Moisture_Pin)) # Soil moisture PIN reference

wlan = wifimgr.get_connection()
if wlan is None:
    print("Não foi possível iniciar a ligação")
    while True:
        pass
    
print("OK")
print(wlan)
led_state = "OFF"
led.low()

adcpin = 4
sensor = machine.ADC(adcpin)

mqtt_server = '2.tcp.eu.ngrok.io'
client_id = 'teste'
topic_pub = b'test'
topic_port = '16693'
is_client_message = False

def mqtt_callback(topic, msg):
    global led_state
    print("Received message: %s" % msg)
    if msg == b"ON":
        led.high()
        led_state = "ON"
    elif msg == b"OFF":
        led.low()
        led_state = "OFF"

def mqtt_connect():
    client = MQTTClient(client_id, mqtt_server, port=16693, user="Pedro", password="test",  keepalive=3600)
    client.set_callback(mqtt_callback)
    client.set_last_will("test", "Disconnected")
    client.connect()
    print('Connected to %s MQTT Broker'%(mqtt_server))
    client.subscribe(topic_pub)
    return client

def reconnect():
    print('Failed to connect to the MQTT Broker. Reconnecting...')
    time.sleep(5)
    machine.reset()
    
try:
    client = mqtt_connect()
except OSError as e:
    reconnect()

last_send_time = utime.time()

while True:
    #print("Sending messages")
    client.check_msg()
    current_time = utime.time()
    
    if current_time - last_send_time >= readDelay:
        moisture = (max_moisture-soil.read_u16())*100/(max_moisture-min_moisture)
        if moisture <= upper_threshold:
            if led_state == "OFF":
                led_state = "ON"
                led.high()  
        elif moisture >= lower_threshold:
            if led_state == "ON":
                led_state = "OFF"
                led.low() 
        topic_msg = str("%.2f" % moisture +"%" + led_state)
        print("moisture: " + "%.2f" % moisture +"% (adc: "+str(soil.read_u16())+")")
        client.publish(topic_pub, topic_msg, retain=True)
        last_send_time = current_time
          
    #utime.sleep(1) # set a delay between readings
    
    
    #led.high()
    #time.sleep(1)
    #led.low()
    #time.sleep(1)
    
        