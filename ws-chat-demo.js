'use strict';

const fetchJsonFile = await fetch('./api.json');
const DID_API = await fetchJsonFile.json();

// Azure OpenAI constants for chat
const AZURE_CHAT_MODEL = "gpt-4.1";
const AZURE_CHAT_API_VERSION = "2025-01-01-preview";
const AZURE_CHAT_DEPLOYMENT = "gpt-4.1";

// Azure OpenAI constants for TTS
const AZURE_TTS_MODEL = "gpt-4o-mini-tts";
const AZURE_TTS_API_VERSION = "2025-03-01-preview";
const AZURE_TTS_DEPLOYMENT = "gpt-4o-mini-tts";

if (DID_API.key == '🤫') alert('Please put your api key inside ./api.json and restart..');

const RTCPeerConnection = (
  window.RTCPeerConnection ||
  window.webkitRTCPeerConnection ||
  window.mozRTCPeerConnection
).bind(window);

let peerConnection;
let pcDataChannel;
let streamId;
let sessionId;
let sessionClientAnswer;

let statsIntervalId;
let lastBytesReceived;
let videoIsPlaying = false;
let streamVideoOpacity = 0;

const stream_warmup = true;
let isStreamReady = !stream_warmup;

const idleVideoElement = document.getElementById('idle-video-element');
const streamVideoElement = document.getElementById('stream-video-element');
idleVideoElement.setAttribute('playsinline', '');
streamVideoElement.setAttribute('playsinline', '');

const presenterInputByService = {
  talks: {
    source_url: 'https://create-images-results.d-id.com/DefaultPresenters/Emma_f/v1_image.jpeg',
  },
  clips: {
    presenter_id: 'v2_public_alex@qcvo4gupoy',
    driver_id: 'e3nbserss8',
  },
};

const PRESENTER_TYPE = DID_API.service === 'clips' ? 'clip' : 'talk';

const connectButton = document.getElementById('connect-button');
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');
const chatMessages = document.getElementById('chat-messages');
const statusElement = document.getElementById('status');
let ws;

// Add chat history array at the top level
let chatHistory = [
  {
    role: "system",
    content: "You are a helpful AI assistant. Keep your responses concise (1-3 sentences) and engaging. Format your responses as a JSON object with two fields: 'text' for the main response and 'instructions' for voice delivery instructions (3-5 sentences describing tone, emotion, and delivery style). Example: {\"text\": \"Your response here\", \"instructions\": \"Voice: Warm and friendly, with a natural conversational tone. Tone: Engaging and empathetic, making the conversation feel personal and meaningful. Delivery: Clear and articulate, with appropriate pauses and emphasis to maintain listener interest.\"}"
  }
];

function updateButtonStates(isConnected, isStreaming = false) {
  chatInput.disabled = !isConnected || isStreaming;
  sendButton.disabled = !isConnected || isStreaming;
  statusElement.textContent = isConnected ? (isStreaming ? 'Streaming...' : 'Connected') : 'Disconnected';
}

// Initialize button states
updateButtonStates(false);

// Connect button click handler
connectButton.addEventListener('change', async () => {
  if (connectButton.checked) {
    try {
      // Step 1: Connect to WebSocket
      ws = await connectToWebSocket(DID_API.websocketUrl, DID_API.key);
      updateButtonStates(true);

      // Step 2: Send "init-stream" message to WebSocket
      const startStreamMessage = {
        type: 'init-stream',
        payload: {
          ...presenterInputByService[DID_API.service],
          presenter_type: PRESENTER_TYPE,
        },
      };
      sendMessage(ws, startStreamMessage);

      // Step 3: Handle WebSocket responses by message type
      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        switch (data.messageType) {
          case 'init-stream':
            const { id: newStreamId, offer, ice_servers: iceServers, session_id: newSessionId } = data;
            streamId = newStreamId;
            sessionId = newSessionId;
            console.log('init-stream', newStreamId, newSessionId);
            try {
              sessionClientAnswer = await createPeerConnection(offer, iceServers);
              // Step 4: Send SDP answer to WebSocket
              const sdpMessage = {
                type: 'sdp',
                payload: {
                  answer: sessionClientAnswer,
                  session_id: sessionId,
                  presenter_type: PRESENTER_TYPE,
                },
              };
              sendMessage(ws, sdpMessage);
            } catch (e) {
              console.error('Error during streaming setup', e);
              stopAllStreams();
              closePC();
              connectButton.checked = false;
              updateButtonStates(false);
              return;
            }
            break;

          case 'sdp':
            console.log('SDP message received:', event.data);
            break;

          case 'delete-stream':
            console.log('Stream deleted:', event.data);
            break;
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        connectButton.checked = false;
        updateButtonStates(false);
        stopAllStreams();
        closePC();
      };

      ws.onclose = () => {
        console.log('WebSocket connection closed');
        connectButton.checked = false;
        updateButtonStates(false);
        stopAllStreams();
        closePC();
      };

    } catch (error) {
      console.error('Failed to connect and set up stream:', error);
      connectButton.checked = false;
      updateButtonStates(false);
    }
  } else {
    // Disconnect logic
    if (ws) {
      ws.send(JSON.stringify({ type: 'delete' }));
      ws.close();
      ws = null;
    }
    updateButtonStates(false);
  }
});

// Send message handler
sendButton.addEventListener('click', async () => {
  const message = chatInput.value.trim();
  if (!message) return;

  // Add user message to chat
  addMessageToChat('user', message);
  chatInput.value = '';

  // Add user message to history
  chatHistory.push({
    role: "user",
    content: message
  });

  try {
    // Get AI response from Azure OpenAI
    const response = await fetch(`${DID_API.azureEndpoint}/openai/deployments/${AZURE_CHAT_DEPLOYMENT}/chat/completions?api-version=${AZURE_CHAT_API_VERSION}`, {
      method: 'POST',
      headers: {
        'api-key': DID_API.azureKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: chatHistory,
        max_completion_tokens: 800,
        temperature: 1,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
        model: AZURE_CHAT_MODEL
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const aiResponse = await response.json();
    const aiMessage = aiResponse.choices[0].message.content;
    
    // Parse the JSON response
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(aiMessage);
    } catch (e) {
      // If parsing fails, use the message as is and generate default instructions
      parsedResponse = {
        text: aiMessage,
        instructions: "Voice: Warm and friendly, with a natural conversational tone. Tone: Engaging and empathetic, making the conversation feel personal and meaningful. Delivery: Clear and articulate, with appropriate pauses and emphasis to maintain listener interest."
      };
    }

    // Add AI response to history
    chatHistory.push({
      role: "assistant",
      content: aiMessage
    });

    // Add AI response to chat with instructions
    addMessageToChat('ai', parsedResponse.text, parsedResponse.instructions);

    // Get TTS response
    const ttsResponse = await fetch(`${DID_API.azureEndpoint}/openai/deployments/${AZURE_TTS_DEPLOYMENT}/audio/speech?api-version=${AZURE_TTS_API_VERSION}`, {
      method: 'POST',
      headers: {
        'api-key': DID_API.azureKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: AZURE_TTS_MODEL,
        voice: 'ballad',
        input: parsedResponse.text,
        response_format: "pcm",
        instructions: parsedResponse.instructions
      })
    });

    if (!ttsResponse.ok) {
      throw new Error(`HTTP error! status: ${ttsResponse.status}`);
    }

    // Process audio response
    const audioStream = await processAudioResponse(ttsResponse);
    let i = 0;
    for await (const chunk of audioStream) {
      const splitted = splitArrayIntoChunks([...chunk], 10000);
      for (const [_, chunk] of splitted.entries()) {
        sendStreamMessage([...chunk], i++);
      }
    }
    sendStreamMessage(Array.from(new Uint8Array(0)), i);

    // Ensure video is playing
    if (streamVideoElement.srcObject) {
      streamVideoElement.mute = false;
      if (streamVideoElement.paused) {
        streamVideoElement.play().catch(e => console.error('Error playing stream video:', e));
      }
    }

  } catch (error) {
    console.error('Error:', error);
    addMessageToChat('ai', 'Sorry, there was an error processing your message.');
  }
});

// Enter key handler for chat input
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendButton.click();
  }
});

function addMessageToChat(type, message, instructions = null) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}-message`;
  messageDiv.textContent = message;
  chatMessages.appendChild(messageDiv);

  if (instructions) {
    const instructionsDiv = document.createElement('div');
    instructionsDiv.className = 'message instructions-message';
    instructionsDiv.textContent = instructions;
    chatMessages.appendChild(instructionsDiv);
  }

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function processAudioResponse(response) {
  function applyLowPass(input, windowSize = 3) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      let sum = 0;
      let count = 0;
      for (let j = -Math.floor(windowSize/2); j <= Math.floor(windowSize/2); j++) {
        const idx = i + j;
        if (idx >= 0 && idx < input.length) {
          sum += input[idx];
          count++;
        }
      }
      output[i] = sum / count;
    }
    return output;
  }

  function normalizeInt16(samples) {
    let max = 0;
    for (let i = 0; i < samples.length; i++) {
      max = Math.max(max, Math.abs(samples[i]));
    }

    if (max === 0) return samples;

    const scale = 32767 / max;
    const output = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      output[i] = Math.round(samples[i] * scale);
    }
    return output;
  }

  const ratio = 24/16;
  const transformer = {
    transform(chunk, controller) {
      const inputData = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.byteLength / 2);
      const filteredData = applyLowPass(inputData);
      const normalizedData = normalizeInt16(filteredData);
      const outputLength = Math.floor(normalizedData.length / ratio);
      const outputData = new Int16Array(outputLength);

      for (let i = 0; i < outputLength; i++) {
        const inputIndex = i * ratio;
        const lowerIndex = Math.floor(inputIndex);
        const upperIndex = Math.min(lowerIndex + 1, normalizedData.length - 1);
        const lambda = inputIndex - lowerIndex;

        outputData[i] = Math.round(
          lambda * normalizedData[upperIndex] + (1 - lambda) * normalizedData[lowerIndex]
        );
      }

      const rawBytes = new Uint8Array(outputData.length * 2);
      for (let i = 0; i < outputData.length; i++) {
        rawBytes[i * 2] = outputData[i] & 0xFF;
        rawBytes[i * 2 + 1] = (outputData[i] >> 8) & 0xFF;
      }
      controller.enqueue(rawBytes);
    }
  };

  return response.body.pipeThrough(new TransformStream(transformer));
}

function onIceGatheringStateChange() {
  console.log('ICE gathering state:', peerConnection.iceGatheringState);
}

function onIceCandidate(event) {
  if (event.candidate) {
    const { candidate, sdpMid, sdpMLineIndex } = event.candidate;
    sendMessage(ws, {
      type: 'ice',
      payload: {
        session_id: sessionId,
        candidate,
        sdpMid,
        sdpMLineIndex,
      },
    });
  } else {
    sendMessage(ws, {
      type: 'ice',
      payload: {
        stream_id: streamId,
        session_id: sessionId,
        presenter_type: PRESENTER_TYPE,
      },
    });
  }
}

function onIceConnectionStateChange() {
  console.log('ICE connection state:', peerConnection.iceConnectionState);
  if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'closed') {
    stopAllStreams();
    closePC();
  }
}

function onConnectionStateChange() {
  console.log('Peer connection state:', peerConnection.connectionState);
  if (peerConnection.connectionState === 'connected') {
    playIdleVideo();
    setTimeout(() => {
      if (!isStreamReady) {
        console.log('forcing stream/ready');
        isStreamReady = true;
      }
    }, 5000);
  }
}

function onSignalingStateChange() {
  console.log('Signaling state:', peerConnection.signalingState);
}

function onVideoStatusChange(videoIsPlaying, stream) {
  if (videoIsPlaying) {
    streamVideoOpacity = isStreamReady ? 1 : 0;
    setStreamVideoElement(stream);
    streamVideoElement.style.opacity = streamVideoOpacity;
    streamVideoElement.mute = !isStreamReady;
    idleVideoElement.style.opacity = 0;
    updateButtonStates(true, true); // Disable input while streaming
    
    // Ensure stream video plays when active
    if (streamVideoElement.paused) {
      streamVideoElement.play().catch(e => console.error('Error playing stream video:', e));
    }
  } else {
    streamVideoOpacity = 0;
    streamVideoElement.style.opacity = 0;
    streamVideoElement.mute = true;
    idleVideoElement.style.opacity = 1;
    updateButtonStates(true, false); // Re-enable input when not streaming
    // Ensure idle video is playing when stream is not active
    if (idleVideoElement.paused) {
      idleVideoElement.play().catch(e => console.error('Error playing idle video:', e));
    }
  }
}

function onTrack(event) {
  if (!event.track) return;

  statsIntervalId = setInterval(async () => {
    const stats = await peerConnection.getStats(event.track);
    stats.forEach((report) => {
      if (report.type === 'inbound-rtp' && report.kind === 'video') {
        const videoStatusChanged = videoIsPlaying !== report.bytesReceived > lastBytesReceived;
        if (videoStatusChanged) {
          videoIsPlaying = report.bytesReceived > lastBytesReceived;
          onVideoStatusChange(videoIsPlaying, event.streams[0]);
        }
        lastBytesReceived = report.bytesReceived;
      }
    });
  }, 500);
}

async function createPeerConnection(offer, iceServers) {
  if (!peerConnection) {
    peerConnection = new RTCPeerConnection({ iceServers });
    pcDataChannel = peerConnection.createDataChannel('JanusDataChannel');
    peerConnection.addEventListener('icegatheringstatechange', onIceGatheringStateChange, true);
    peerConnection.addEventListener('icecandidate', onIceCandidate, true);
    peerConnection.addEventListener('iceconnectionstatechange', onIceConnectionStateChange, true);
    peerConnection.addEventListener('connectionstatechange', onConnectionStateChange, true);
    peerConnection.addEventListener('signalingstatechange', onSignalingStateChange, true);
    peerConnection.addEventListener('track', onTrack, true);
  }

  await peerConnection.setRemoteDescription(offer);
  const sessionClientAnswer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(sessionClientAnswer);
  return sessionClientAnswer;
}

function setStreamVideoElement(stream) {
  if (!stream) return;
  streamVideoElement.srcObject = stream;
  streamVideoElement.loop = false;
  streamVideoElement.mute = !isStreamReady;

  if (streamVideoElement.paused) {
    streamVideoElement.play().catch(e => console.error('Error playing stream video:', e));
  }
}

function playIdleVideo() {
  idleVideoElement.src = DID_API.service == 'clips' ? 'alex_v2_idle.mp4' : 'emma_idle.mp4';
  idleVideoElement.loop = true;
  idleVideoElement.style.opacity = 1;
  idleVideoElement.play().catch(e => console.error('Error playing idle video:', e));
}

function stopAllStreams() {
  if (streamVideoElement.srcObject) {
    streamVideoElement.srcObject.getTracks().forEach(track => track.stop());
    streamVideoElement.srcObject = null;
    streamVideoOpacity = 0;
  }
}

function closePC(pc = peerConnection) {
  if (!pc) return;
  pc.close();
  pc.removeEventListener('icegatheringstatechange', onIceGatheringStateChange, true);
  pc.removeEventListener('icecandidate', onIceCandidate, true);
  pc.removeEventListener('iceconnectionstatechange', onIceConnectionStateChange, true);
  pc.removeEventListener('connectionstatechange', onConnectionStateChange, true);
  pc.removeEventListener('signalingstatechange', onSignalingStateChange, true);
  pc.removeEventListener('track', onTrack, true);

  clearInterval(statsIntervalId);
  isStreamReady = !stream_warmup;
  streamVideoOpacity = 0;
  if (pc === peerConnection) {
    peerConnection = null;
  }
}

async function connectToWebSocket(url, token) {
  return new Promise((resolve, reject) => {
    const wsUrl = `${url}?authorization=Basic ${encodeURIComponent(token)}`;
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
}

function sendMessage(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  } else {
    console.error('WebSocket is not open. Cannot send message.');
  }
}

function sendStreamMessage(input, index) {
  const streamMessage = {
    type: 'stream-audio',
    payload: {
      script: {
        type: 'audio',
        input,
      },
      config: {
        stitch: true,
      },
      background: {
        color: '#FFFFFF',
      },
      index,
      session_id: sessionId,
      stream_id: streamId,
      presenter_type: PRESENTER_TYPE,
    },
  };

  sendMessage(ws, streamMessage);
}

function splitArrayIntoChunks(array, size) {
  if (!Array.isArray(array)) {
    throw new TypeError('Input should be an array');
  }
  if (typeof size !== 'number' || size <= 0) {
    throw new TypeError('Size should be a positive number');
  }

  const result = [];
  for (let i = 0; i < array.length; i += size) {
    const chunk = array.slice(i, i + size);
    result.push(chunk);
  }
  return result;
} 