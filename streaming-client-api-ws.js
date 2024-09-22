'use strict';
const fetchJsonFile = await fetch('./api.json');
const DID_API = await fetchJsonFile.json();

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

// Set this variable to true to request stream warmup upon connection to mitigate potential jittering issues
const stream_warmup = true;
let isStreamReady = !stream_warmup;

const idleVideoElement = document.getElementById('idle-video-element');
const streamVideoElement = document.getElementById('stream-video-element');
idleVideoElement.setAttribute('playsinline', '');
streamVideoElement.setAttribute('playsinline', '');
const peerStatusLabel = document.getElementById('peer-status-label');
const iceStatusLabel = document.getElementById('ice-status-label');
const iceGatheringStatusLabel = document.getElementById('ice-gathering-status-label');
const signalingStatusLabel = document.getElementById('signaling-status-label');
const streamingStatusLabel = document.getElementById('streaming-status-label');
const streamEventLabel = document.getElementById('stream-event-label');

const presenterInputByService = {
  talks: {
    source_url: 'https://d-id-public-bucket.s3.amazonaws.com/or-roman.jpg',
  },
  clips: {
    presenter_id: 'rian-lZC6MmWfC1',
    driver_id: 'mXra4jY38i',
  },
};

const connectButton = document.getElementById('connect-button');
let ws;

connectButton.onclick = async () => {
  if (peerConnection && peerConnection.connectionState === 'connected') {
    return;
  }

  stopAllStreams();
  closePC();

  try {
    // Step 1: Connect to WebSocket
    ws = await connectToWebSocket(DID_API.websocketUrl, DID_API.websocketToken);
    console.log('WebSocket ws', ws);

    // Step 2: Send "init-stream" message to WebSocket
    const startStreamMessage = {
      type: 'init-stream',
      payload: {
        source_url: 'https://create-images-results.d-id.com/DefaultPresenters/Noelle_f/v1_image.jpeg',
      },
    };
    sendMessage(ws, startStreamMessage);

    // Step 3: Handle WebSocket response for "init-stream"
    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      const { id: newStreamId, offer, ice_servers: iceServers, session_id: newSessionId } = data;
      streamId = newStreamId;
      sessionId = newSessionId;

      console.log('init-stream response', streamId, sessionId);

      try {
        sessionClientAnswer = await createPeerConnection(offer, iceServers);

        console.log('got sessionClientAnswer', sessionClientAnswer);

        // Step 4: Send SDP answer to WebSocket
        const sdpMessage = {
          type: 'sdp',
          payload: {
            answer: sessionClientAnswer,
            session_id: sessionId,
            // stream_id: streamId,
          },
        };
        sendMessage(ws, sdpMessage);
        ws.onmessage = async (event) => {
          console.log('SDP message received:', event.data);
        };
      } catch (e) {
        console.log('Error during streaming setup', e);
        stopAllStreams();
        closePC();
        return;
      }
    };
  } catch (error) {
    console.error('Failed to connect and set up stream:', error.type);
  }
};

const startButton = document.getElementById('start-button');
startButton.onclick = async () => {
  // connectionState not supported in firefox

  if (
    (peerConnection?.signalingState === 'stable' || peerConnection?.iceConnectionState === 'connected') &&
    isStreamReady
  ) {
    const text =
      'Lily had always been afraid of heights, but today she stood at the edge of a cliff, staring at the ocean far below. She had been dared by her friends to jump, and although her heart pounded in her chest, she was determined not to back down. The salty wind whipped her hair as she took a deep breath, closing her eyes to gather courage.';
    const chunks = text.split(' ');
    chunks.push('');
    for (const chunk of chunks) {
      console.log('chunk', chunk);
      const streamMessage = {
        type: 'stream-text',
        payload: {
          input: chunk,
          provider: {
            language: 'English',
            access: 'premium',
            model_id: 'eleven_turbo_v2_5',
            type: 'elevenlabs',
            voice_id: '2EiwWnXFnvU5JabPnv8n',
          },
          // provider: {
          //   type: 'microsoft',
          //   voice_id: 'en-US-JennyNeural',
          // },
          session_id: sessionId,
          stream_id: streamId,
        },
      };
      sendMessage(ws, streamMessage);
      ws.onmessage = async (event) => {
        console.log('Stream message received:', event.data);
      };
    }
  }
};

const destroyButton = document.getElementById('destroy-button');
destroyButton.onclick = async () => {
  const streamMessage = {
    type: 'delete-stream',
    payload: {
      session_id: sessionId,
      stream_id: streamId,
    },
  };
  sendMessage(ws, streamMessage);
  ws.onmessage = async (event) => {
    console.log('Stream deleted:', event.data);
  };

  stopAllStreams();
  closePC();
};

function onIceGatheringStateChange() {
  iceGatheringStatusLabel.innerText = peerConnection.iceGatheringState;
  iceGatheringStatusLabel.className = 'iceGatheringState-' + peerConnection.iceGatheringState;
}
function onIceCandidate(event) {
  console.log('onIceCandidate', event);
  if (event.candidate) {
    const { candidate, sdpMid, sdpMLineIndex } = event.candidate;
    sendMessage(ws, {
      type: 'ice',
      payload: {
        // stream_id: streamId,
        session_id: sessionId,
        candidate,
        sdpMid,
        sdpMLineIndex,
      },
    });
    ws.onmessage = async (event) => {
      console.log('Ice message received:', event.data);
    };
  } else {
    sendMessage(ws, {
      type: 'ice',
      payload: {
        //  stream_id: streamId,
        session_id: sessionId,
      },
    });
    ws.onmessage = async (event) => {
      console.log('Ice message received on else:', event.data);
    };
  }
}
function onIceConnectionStateChange() {
  iceStatusLabel.innerText = peerConnection.iceConnectionState;
  iceStatusLabel.className = 'iceConnectionState-' + peerConnection.iceConnectionState;
  if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'closed') {
    stopAllStreams();
    closePC();
  }
}
function onConnectionStateChange() {
  // not supported in firefox
  peerStatusLabel.innerText = peerConnection.connectionState;
  peerStatusLabel.className = 'peerConnectionState-' + peerConnection.connectionState;
  console.log('peerConnection', peerConnection.connectionState);

  if (peerConnection.connectionState === 'connected') {
    playIdleVideo();
    /**
     * A fallback mechanism: if the 'stream/ready' event isn't received within 5 seconds after asking for stream warmup,
     * it updates the UI to indicate that the system is ready to start streaming data.
     */
    setTimeout(() => {
      if (!isStreamReady) {
        console.log('forcing stream/ready');
        isStreamReady = true;
        streamEventLabel.innerText = 'ready';
        streamEventLabel.className = 'streamEvent-ready';
      }
    }, 5000);
  }
}
function onSignalingStateChange() {
  signalingStatusLabel.innerText = peerConnection.signalingState;
  signalingStatusLabel.className = 'signalingState-' + peerConnection.signalingState;
}

function onVideoStatusChange(videoIsPlaying, stream) {
  let status;

  if (videoIsPlaying) {
    status = 'streaming';
    streamVideoOpacity = isStreamReady ? 1 : 0;
    setStreamVideoElement(stream);
  } else {
    status = 'empty';
    streamVideoOpacity = 0;
  }

  streamVideoElement.style.opacity = streamVideoOpacity;
  idleVideoElement.style.opacity = 1 - streamVideoOpacity;

  streamingStatusLabel.innerText = status;
  streamingStatusLabel.className = 'streamingState-' + status;
}

function onTrack(event) {
  /**
   * The following code is designed to provide information about wether currently there is data
   * that's being streamed - It does so by periodically looking for changes in total stream data size
   *
   * This information in our case is used in order to show idle video while no video is streaming.
   * To create this idle video use the POST https://api.d-id.com/talks (or clips) endpoint with a silent audio file or a text script with only ssml breaks
   * https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html#break-tag
   * for seamless results use `config.fluent: true` and provide the same configuration as the streaming video
   */

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

function onStreamEvent(message) {
  /**
   * This function handles stream events received on the data channel.
   * The 'stream/ready' event received on the data channel signals the end of the 2sec idle streaming.
   * Upon receiving the 'ready' event, we can display the streamed video if one is available on the stream channel.
   * Until the 'ready' event is received, we hide any streamed video.
   * Additionally, this function processes events for stream start, completion, and errors. Other data events are disregarded.
   */

  if (pcDataChannel.readyState === 'open') {
    let status;
    const [event, _] = message.data.split(':');

    switch (event) {
      case 'stream/started':
        status = 'started';
        break;
      case 'stream/done':
        status = 'done';
        break;
      case 'stream/ready':
        status = 'ready';
        break;
      case 'stream/error':
        status = 'error';
        break;
      default:
        status = 'dont-care';
        break;
    }

    // Set stream ready after a short delay, adjusting for potential timing differences between data and stream channels
    if (status === 'ready') {
      setTimeout(() => {
        console.log('stream/ready');
        isStreamReady = true;
        streamEventLabel.innerText = 'ready';
        streamEventLabel.className = 'streamEvent-ready';
      }, 1000);
    } else {
      console.log(event);
      streamEventLabel.innerText = status === 'dont-care' ? event : status;
      streamEventLabel.className = 'streamEvent-' + status;
    }
  }
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
    pcDataChannel.addEventListener('message', onStreamEvent, true);
  }

  await peerConnection.setRemoteDescription(offer);
  console.log('set remote sdp OK');

  const sessionClientAnswer = await peerConnection.createAnswer();
  console.log('create local sdp OK');

  await peerConnection.setLocalDescription(sessionClientAnswer);
  console.log('set local sdp OK');

  return sessionClientAnswer;
}

function setStreamVideoElement(stream) {
  if (!stream) return;

  streamVideoElement.srcObject = stream;
  streamVideoElement.loop = false;
  streamVideoElement.mute = !isStreamReady;

  // safari hotfix
  if (streamVideoElement.paused) {
    streamVideoElement
      .play()
      .then((_) => {})
      .catch((e) => {});
  }
}

function playIdleVideo() {
  idleVideoElement.src = DID_API.service == 'clips' ? 'rian_idle.mp4' : 'or_idle.mp4';
}

function stopAllStreams() {
  if (streamVideoElement.srcObject) {
    console.log('stopping video streams');
    streamVideoElement.srcObject.getTracks().forEach((track) => track.stop());
    streamVideoElement.srcObject = null;
    streamVideoOpacity = 0;
  }
}

function closePC(pc = peerConnection) {
  if (!pc) return;
  console.log('stopping peer connection');
  pc.close();
  pc.removeEventListener('icegatheringstatechange', onIceGatheringStateChange, true);
  pc.removeEventListener('icecandidate', onIceCandidate, true);
  pc.removeEventListener('iceconnectionstatechange', onIceConnectionStateChange, true);
  pc.removeEventListener('connectionstatechange', onConnectionStateChange, true);
  pc.removeEventListener('signalingstatechange', onSignalingStateChange, true);
  pc.removeEventListener('track', onTrack, true);
  pc.removeEventListener('onmessage', onStreamEvent, true);

  clearInterval(statsIntervalId);
  isStreamReady = !stream_warmup;
  streamVideoOpacity = 0;
  iceGatheringStatusLabel.innerText = '';
  signalingStatusLabel.innerText = '';
  iceStatusLabel.innerText = '';
  peerStatusLabel.innerText = '';
  streamEventLabel.innerText = '';
  console.log('stopped peer connection');
  if (pc === peerConnection) {
    peerConnection = null;
  }
}

const maxRetryCount = 3;
const maxDelaySec = 4;

async function connectToWebSocket(url, token) {
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
}

function sendMessage(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
    console.log('Message sent:', message);
  } else {
    console.error('WebSocket is not open. Cannot send message.');
  }
}