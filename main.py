from machine import Pin, I2C
import wifimgr
import time
import machine
from umqtt.simple import MQTTClient
import utime
import BME280

# Configura o pino LED como saída
led = machine.Pin("LED", machine.Pin.OUT)

# Inicializa a interface I2C com os pinos SCL e SDA especificados
i2c = I2C(id=0, scl=Pin(5), sda=Pin(4), freq=10000)

# Inicializa o sensor BME280 utilizando a interface I2C
bme = BME280.BME280(i2c=i2c)

# Define o intervalo de leitura em segundos
readDelay = 10 

# Conecta-se à rede WiFi utilizando a biblioteca wifimgr
wlan = wifimgr.get_connection()
if wlan is None:
    # Se a conexão falhar, imprime uma mensagem de erro e entra num ciclo infinito
    print("Failed to initialize connection")
    while True:
        pass

print("WiFi Connected")

# Configurações do servidor MQTT
mqtt_server = '0.tcp.eu.ngrok.io'
client_id = 'teste'
topic_pub = b'test'
led_state = "OFF"
led.low()  # Desliga o LED inicialmente

# Função de callback para processar mensagens recebidas pelo MQTT
def mqtt_callback(topic, msg):
    global led_state
    print("Received message: %s" % msg)
    if msg == b"ON":
        led.high()  # Liga o LED
        led_state = "ON"
    elif msg == b"OFF":
        led.low()  # Desliga o LED
        led_state = "OFF"

# Função para conectar ao servidor MQTT
def mqtt_connect():
    client = MQTTClient(client_id, mqtt_server, port=10916, user="Pedro", password="test", keepalive=3600)
    client.set_callback(mqtt_callback)  # Define a função de callback para mensagens MQTT
    client.set_last_will("test", "Disconnected")  # Define a mensagem de última vontade
    client.connect()  # Conecta ao servidor MQTT
    print('Connected to %s MQTT Broker' % (mqtt_server))
    client.subscribe(topic_pub)  # Subscreve ao tópico definido
    return client

# Função para tentar reconectar ao servidor MQTT em caso de falha
def reconnect():
    print('Failed to connect to the MQTT Broker. Reconnecting...')
    time.sleep(5)
    machine.reset()  # Reinicia a máquina

# Tenta conectar ao servidor MQTT, e se falhar, tenta reconectar
try:
    client = mqtt_connect()
except OSError as e:
    reconnect()

last_send_time = utime.time()  # Armazena o tempo atual

# Ciclo principal
while True:
    client.check_msg()  # Verifica mensagens recebidas pelo MQTT
    current_time = utime.time()  # Obtém o tempo atual

    # Se o tempo decorrido for maior ou igual ao intervalo de leitura
    if current_time - last_send_time >= readDelay:
        tempC = bme.temperature  # Lê a temperatura do sensor
        hum = bme.humidity  # Lê a humidade do sensor
        pres = bme.pressure  # Lê a pressão do sensor
        # Formata a mensagem a ser enviada com os valores lidos e o estado do LED
        topic_msg = "{}/{}/{}/{}".format(tempC, hum, pres, led_state)
        print(topic_msg)  # Imprime a mensagem no terminal
        client.publish(topic_pub, topic_msg, retain=True)  # Publica a mensagem no tópico MQTT
        last_send_time = current_time  # Atualiza o tempo da última leitura
