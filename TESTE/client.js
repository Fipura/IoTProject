document.getElementById('mqttForm').addEventListener('submit', function(event) {
    // Prevent the form from submitting normally
    event.preventDefault();

    // Get the broker address from the form input
    var brokerAddress = document.getElementById('brokerAddress').value;

    // Make a POST request to the server
  fetch('/mqtt-broker', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ brokerAddress: brokerAddress }),
  });
});