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
    source_url: 'https://create-images-results.d-id.com/DefaultPresenters/Emma_f/v1_image.jpeg',
  },
  clips: {
    presenter_id: 'v2_public_alex@qcvo4gupoy',
    driver_id: 'e3nbserss8',
  },
};

const PRESENTER_TYPE = DID_API.service === 'clips' ? 'clip' : 'talk';

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
    ws = await connectToWebSocket(DID_API.websocketUrl, DID_API.key);

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
  } catch (error) {
    console.error('Failed to connect and set up stream:', error.type);
  }
};

const streamWordButton = document.getElementById('stream-word-button');
streamWordButton.onclick = async () => {
  const text = 'This is a demo of the D-ID WebSocket Streaming API with text chunks.';
  const text2 = 'Real-time video streaming is easy with D-ID';

  let chunks = text.split(' ');
  chunks.push('<break time="3s" />'); // Note : ssml part tags should be grouped together to be sent on the same chunk
  chunks.push(...text2.split(' '));

  // Indicates end of text stream
  chunks.push('');

  for (const [index, chunk] of chunks.entries()) {
    const streamMessage = {
      type: 'stream-text',
      payload: {
        script: {
          type: 'text',
          input: chunk + ' ',
          provider: {
            type: 'microsoft',
            voice_id: 'en-US-JennyNeural',
          },
          ssml: true,
        },
        config: {
          stitch: true,
        },
        apiKeysExternal: {
          elevenlabs: { key: '' },
        },
        background: {
          color: '#FFFFFF',
        },
        index, // Note : add index to track the order of the chunks (better performance), optional field
        session_id: sessionId,
        stream_id: streamId,
        presenter_type: PRESENTER_TYPE,
      },
    };

    sendMessage(ws, streamMessage);
  }
};

const streamAudioButton = document.getElementById('stream-audio-button');
streamAudioButton.onclick = async () => {
  // Note : we use elevenlabs to stream pcm chunks, you can use any other provider
  const elevenKey = DID_API.elevenlabsKey;
  if (!elevenKey) {
    const errorMessage = 'Please put your elevenlabs key inside ./api.json and restart..';
    alert(errorMessage);
    console.error(errorMessage);
    return;
  }
  async function stream(text, voiceId = '21m00Tcm4TlvDq8ikWAM') {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=pcm_16000`,
      {
        method: 'POST',
        headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model_id: 'eleven_turbo_v2_5' }),
        // Please see the list of available models here - https://docs.d-id.com/reference/tts-elevenlabs#%EF%B8%8F-voice-config
      }
    );

    return response.body;
  }

  const streamText =
    'This is a demo of the D-ID WebSocket Streaming API with audio PCM chunks. <break time="1s" /> Real-time video streaming is easy with D-ID';

  const activeStream = await stream(streamText);
  let i = 0;
  // Note: PCM chunks
  for await (const chunk of activeStream) {
    // Imporatnt Note : 30KB is the max chunk size + keep max concurrent requests up to 300, adjust chunk size as needed
    const splitted = splitArrayIntoChunks([...chunk], 10000); // chunk size: 10KB
    for (const [_, chunk] of splitted.entries()) {
      sendStreamMessage([...chunk], i++);
    }
  }
  sendStreamMessage(Array.from(new Uint8Array(0)), i);
  console.log('done', i);
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

  // Close WebSocket connection
  if (ws) {
    ws.close();
    ws = null;
  }

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
  idleVideoElement.src = DID_API.service == 'clips' ? 'alex_v2_idle.mp4' : 'emma_idle.mp4';
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
  pcDataChannel.removeEventListener('message', onStreamEvent, true);

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
      index, // Note : add index to track the order of the chunks (better performance), optional field
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
