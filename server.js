const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
let ws;

// Enable CORS for frontend requests
app.use(cors());

app.use('/', express.static(__dirname));
app.use(express.json());

app.get('/ws', function (req, res) {
  console.log('serving /');
  res.sendFile(__dirname + '/index-ws.html');
});

// Setup WebSocket connection to external API
const connectToWebSocketAPI = (url, token) => {
  return new Promise((resolve, reject) => {
    const wsUrl = `${url}?authorization=Bearer ${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connection opened.');
      resolve(ws);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      reject(err);
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed.');
    };
  });
};

// API route to proxy the WebSocket connection
app.post('/connect', async (req, res) => {
  try {
    ws = await connectToWebSocketAPI(process.env.WEBSOCKET_URL, process.env.WEBSOCKET_TOKEN);
    const startStreamMessage = {
      type: 'init-stream',
      payload: {
        source_url: 'https://create-images-results.d-id.com/DefaultPresenters/Noelle_f/v1_image.jpeg',
      },
    };
    sendMessage(ws, startStreamMessage);
    let responseSent = false;
    ws.onmessage = async (event) => {
      if (responseSent) return;
      const data = JSON.parse(event.data);
      const { id: newStreamId, offer, ice_servers: iceServers, session_id: newSessionId } = data;
      sessionId = newSessionId;

      res.json({
        id: newStreamId,
        offer,
        ice_servers: iceServers,
        session_id: newSessionId,
      });
      responseSent = true;
    };
  } catch (error) {
    res.status(500).json({ message: 'Failed to connect to WebSocket', error });
  }
});

app.post('/ice-candidate', (req, res) => {
  const { candidate, sdpMid, sdpMLineIndex, session_id } = req.body.payload;
  if (ws) {
    sendMessage(ws, { type: 'ice', payload: { candidate, sdpMid, sdpMLineIndex, session_id } });
    res.status(200).send('ICE candidate sent');
  } else {
    res.status(500).send('WebSocket connection not found');
  }
});

app.post('/sdp-answer', (req, res) => {
  const { answer, session_id } = req.body.payload;

  if (ws) {
    sendMessage(ws, { type: 'sdp', payload: { answer: answer, session_id: session_id } });
    res.status(200).send('SDP answer sent');
  } else {
    res.status(500).send('WebSocket connection not found');
  }
});

app.post('/stream-text', (req, res) => {
  if (ws) {
    sendMessage(ws, { type: 'stream-text', payload: { ...req.body.payload } });
    res.status(200).send('SDP answer sent');
  } else {
    res.status(500).send('WebSocket connection not found');
  }
});

// Serve the frontend
app.use(express.static('public'));

app.listen(port, () => {
  console.log(`Server started on port localhost:${port}\nhttp://localhost:${port}/ws`);
});

function sendMessage(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
    // console.log('Message sent:', message);
  } else {
    console.error('WebSocket is not open. Cannot send message.');
  }
}
