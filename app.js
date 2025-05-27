const express = require('express');
const http = require('http');
const cors = require('cors');

const port = 3000;

const app = express();
app.use(cors({ origin: 'http://localhost:3000' }));
app.use('/', express.static(__dirname));

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

app.get('/ws-streaming', function (req, res) {
  res.sendFile(__dirname + '/index-ws.html');
});

app.get('/agents', function (req, res) {
  res.sendFile(__dirname + '/index-agents.html');
});

// Route for the chat demo
app.get('/chat', (req, res) => {
  res.sendFile(__dirname + '/ws-chat-demo.html');
});

const server = http.createServer(app);

server.listen(port, () =>
  console.log(
    `Server started on port localhost:${port}\nhttp://localhost:${port}\nhttp://localhost:${port}/agents\nhttp://localhost:${port}/ws-streaming\nhttp://localhost:${port}/chat`
  )
);
