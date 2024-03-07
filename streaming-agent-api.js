'use strict';
import DID_API from './api.json' assert { type: 'json' };

if (DID_API.key == '🤫') alert('Please put your api key inside ./api.json and restart..');

const RTCPeerConnection = (
  window.RTCPeerConnection ||
  window.webkitRTCPeerConnection ||
  window.mozRTCPeerConnection
).bind(window);

let peerConnection;
let streamId;
let sessionId;
let sessionClientAnswer;
let statsIntervalId;
let videoIsPlaying;
let lastBytesReceived;

const videoElement = document.getElementById('video-element');
videoElement.setAttribute('playsinline', '');
const peerStatusLabel = document.getElementById('peer-status-label');
const iceStatusLabel = document.getElementById('ice-status-label');
const iceGatheringStatusLabel = document.getElementById('ice-gathering-status-label');
const signalingStatusLabel = document.getElementById('signaling-status-label');
const streamingStatusLabel = document.getElementById('streaming-status-label');

playIdleVideo();
const textArea = document.getElementById('textArea');

const presenterInputByService = {
  // agents: {
  //   source_url: 'https://alonbalon.s3.eu-west-1.amazonaws.com/scarlett.png',
  // },
  talks: {
    source_url: 'https://alonbalon.s3.eu-west-1.amazonaws.com/scarlett.png',
  },
  clips: {
    presenter_id: 'rian-lZC6MmWfC1',
    driver_id: 'mXra4jY38i',
  },
};
async function createPeerConnection(offer, iceServers) {
  if (!peerConnection) {
    peerConnection = new RTCPeerConnection({ iceServers });
    peerConnection.addEventListener('icegatheringstatechange', onIceGatheringStateChange, true);
    peerConnection.addEventListener('icecandidate', onIceCandidate, true);
    peerConnection.addEventListener('iceconnectionstatechange', onIceConnectionStateChange, true);
    peerConnection.addEventListener('connectionstatechange', onConnectionStateChange, true);
    peerConnection.addEventListener('signalingstatechange', onSignalingStateChange, true);
    peerConnection.addEventListener('track', onTrack, true);
  }

  await peerConnection.setRemoteDescription(offer);
  console.log('set remote sdp OK');

  const sessionClientAnswer = await peerConnection.createAnswer();
  console.log('create local sdp OK');

  await peerConnection.setLocalDescription(sessionClientAnswer);
  console.log('set local sdp OK');

  let dc = await peerConnection.createDataChannel('JanusDataChannel');

  dc.onopen = () => {
    console.log('datachannel open');
  };

  dc.onmessage = (event) => {
    console.log('event: ', event);
    let msg = event.data;
    let msgType = 'chat/answer:';
    if (msg.includes(msgType)) {
      msg = decodeURIComponent(msg.replace(msgType, ''));
      console.log(msg);
      document.getElementById('msgHistory').innerHTML += `<span>${msg}</span><br>`;
    } else {
      console.log(msg);
    }
  };

  dc.onclose = () => {
    console.log('datachannel close');
  };

  return sessionClientAnswer;
}
function onIceGatheringStateChange() {
  iceGatheringStatusLabel.innerText = peerConnection.iceGatheringState;
  iceGatheringStatusLabel.className = 'iceGatheringState-' + peerConnection.iceGatheringState;
}
function onIceCandidate(event) {
  if (event.candidate) {
    const { candidate, sdpMid, sdpMLineIndex } = event.candidate;

    // WEBRTC API CALL 3 - Submit network information
    fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}/ice`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${DID_API.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        candidate,
        sdpMid,
        sdpMLineIndex,
        session_id: sessionId,
      }),
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
}
function onSignalingStateChange() {
  signalingStatusLabel.innerText = peerConnection.signalingState;
  signalingStatusLabel.className = 'signalingState-' + peerConnection.signalingState;
}
function onVideoStatusChange(videoIsPlaying, stream) {
  let status;
  if (videoIsPlaying) {
    status = 'streaming';

    const remoteStream = stream;
    setVideoElement(remoteStream);
  } else {
    status = 'empty';
    playIdleVideo();
  }
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
      if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
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
function setVideoElement(stream) {
  if (!stream) return;
  videoElement.classList.add('animated');
  videoElement.muted = false;
  videoElement.srcObject = stream;
  videoElement.loop = false;
  setTimeout(() => {
    videoElement.classList.remove('animated');
  }, 1000);

  // safari hotfix
  if (videoElement.paused) {
    videoElement
      .play()
      .then((_) => {})
      .catch((e) => {});
  }
}
function playIdleVideo() {
  document.getElementById('start-button').removeAttribute('disabled');
  videoElement.srcObject = undefined;
  videoElement.src = 'scarlett_idle.mp4';
  videoElement.loop = true;
}
function stopAllStreams() {
  if (videoElement.srcObject) {
    console.log('stopping video streams');
    videoElement.srcObject.getTracks().forEach((track) => track.stop());
    videoElement.srcObject = null;
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
  clearInterval(statsIntervalId);
  iceGatheringStatusLabel.innerText = '';
  signalingStatusLabel.innerText = '';
  iceStatusLabel.innerText = '';
  peerStatusLabel.innerText = '';
  console.log('stopped peer connection');
  if (pc === peerConnection) {
    peerConnection = null;
  }
}

async function fetchWithRetries(url, options, retries = 1) {
  const maxRetryCount = 5; // Maximum number of retries
  const maxDelaySec = 10; // Maximum delay in seconds

  try {
    const response = await axios.get(url, options);
    console.log(response);
    if (response.data.status === 'done') {
      console.log(response.data.id + ': ' + response.data.status);
      return response;
    } else {
      throw new Error('Response status is not "done"');
    }
  } catch (err) {
    if (retries <= maxRetryCount) {
      const delay = Math.min(Math.pow(2, retries) / 4 + Math.random(), maxDelaySec) * 1000;

      await new Promise((resolve) => setTimeout(resolve, delay));

      console.log(`Request failed, retrying ${retries}/${maxRetryCount}. Error ${err}`);
      return fetchWithRetries(url, options, retries + 1);
    } else {
      throw new Error(`Max retries exceeded. error: ${err}`);
    }
  }
}


const connectButton = document.getElementById('connect-button');
connectButton.onclick = async () => {
  if (peerConnection && peerConnection.connectionState === 'connected') {
    return;
  }
  stopAllStreams();
  closePC();

  // WEBRTC API CALL 1 - Create a new stream
  const sessionResponse = await fetchWithRetries(`${DID_API.url}/${DID_API.service}/streams`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(presenterInputByService[DID_API.service]),
  });

  const { id: newStreamId, offer, ice_servers: iceServers, session_id: newSessionId } = await sessionResponse.json();
  streamId = newStreamId;
  sessionId = newSessionId;
  try {
    sessionClientAnswer = await createPeerConnection(offer, iceServers);
  } catch (e) {
    console.log('error during streaming setup', e);
    stopAllStreams();
    closePC();
    return;
  }

  // WEBRTC API CALL 2 - Start a stream
  const sdpResponse = await fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}/sdp`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      answer: sessionClientAnswer,
      session_id: sessionId,
    }),
  });
};

const startButton = document.getElementById('start-button');
startButton.onclick = async () => {
  // Pasting the user's message to the "history"
  document.getElementById(
    'msgHistory'
  ).innerHTML += `<span style='opacity:0.5'><u>User:</u> ${textArea.value}</span><br>`;
  let txtAreaValue = document.getElementById('textArea').value;
  // Clearing the text-box
  document.getElementById('textArea').value = '';

  // connectionState not supported in firefox
  if (peerConnection?.signalingState === 'stable' || peerConnection?.iceConnectionState === 'connected') {
    // Step 4 in the API- Create a talk stream - CHANGED FROM STREAMS ENDPOINT TO AGENT ENDPOINT
    const playResponse = await fetchWithRetries(`${DID_API.url}/agents/${agentId}/chat/${chatId}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${DID_API.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        streamId: streamId,
        sessionId: sessionId,
        messages: [
          {
            role: 'user',
            content: txtAreaValue,
            created_at: new Date().toString(),
          },
        ],
      }),
    });
  }
};

const destroyButton = document.getElementById('destroy-button');
destroyButton.onclick = async () => {
  await fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session_id: sessionId }),
  });

  stopAllStreams();
  closePC();
};

// MAJOR CHANGE IN THE CODE - AGENTS API WORKFLOW
async function agentsAPIworkflow() {
  axios.defaults.baseURL = 'https://api.d-id.com/';
  axios.defaults.headers.common['Authorization'] = `Basic ${DID_API.key}`;
  axios.defaults.headers.common['content-type'] = 'application/json';

  // STEP 1 : Create Knowledge - createKnowledge()
  const createKnowledge = await axios.post('/knowledge', {
    name: 'knowledge',
    description: 'knowledge',
  });

  console.log('Create Knowledge:', createKnowledge.data);
  let knowledgeId = createKnowledge.data.id;
  console.log('Knowledge ID: ' + knowledgeId);

  // STEP 2: Create Document inside the Knowledge
  const createDocument = await axios.post(`/knowledge/${knowledgeId}/documents`, {
    documentType: 'pdf',
    source_url: 'https://alonbalon.s3.eu-west-1.amazonaws.com/marketing.pdf',
    title: 'MWC Marketing',
  });
  console.log('Create Document: ', createDocument.data);

  // BUG WITH THE IDS HERE - Sepearted by #
  let documentId = createDocument.data.id;
  let splitArr = documentId.split('#');
  documentId = splitArr[1];
  console.log('Document ID: ' + documentId);
  //

  // STEP 3 - GET Document Status
  await fetchWithRetries(`/knowledge/${knowledgeId}/documents/${documentId}`);

  // STEP 4 - GET Knowledge Status
  await fetchWithRetries(`/knowledge/${knowledgeId}`);

  // STEP 5: Create Agent
  const createAgent = await axios.post('/agents', {
    knowledge: {
      provider: 'pinecone',
      embedder: {
        provider: 'pinecone',
        model: 'ada02',
      },
      id: knowledgeId,
    },
    presenter: {
      type: 'talk',
      voice: {
        type: 'microsoft',
        voice_id: 'en-US-JennyMultilingualV2Neural',
      },
      thumbnail: 'https://alonbalon.s3.eu-west-1.amazonaws.com/scarlett.png',
      source_url: 'https://alonbalon.s3.eu-west-1.amazonaws.com/scarlett.png',
    },
    llm: {
      type: 'openai',
      provider: 'openai',
      model: 'gpt-3.5-turbo-1106',
    },
    preview_name: 'Scarlett',
    preview_description:
      "You are Scarlett, an AI designed to assist with information about MWC Barcelona. You are multilingual, providing and translating information in any language! Answer questions in all languages!. you have comprehensive, up-to-date knowledge of the MWC event, including booth numbers, agenda, and speakers. Always respond kindly, offering precise information and guidance. Explain complex details simply and direct users efficiently, ensuring a helpful and engaging experience. Prioritize clarity, accuracy, and friendliness in every interaction. If you don't know an answer or the question is not related to MWC, direct users to the MWC website at http://www.mwcbarcelona.com.",
  });
  console.log('Create Agent: ', createAgent.data);
  let agentId = createAgent.data.id;
  console.log('Agent ID: ' + agentId);

  // STEP 6: GET Agent Status
  await fetchWithRetries(`/agents/${agentId}`);

  // STEP 7: Create Chat with Agent ID
  const createChat = await axios.post(`/agents/${agentId}/chat`);
  console.log('Create Chat: ', createChat.data);
  let chatId = createChat.data.id;
  console.log('Chat ID: ' + chatId);

  // THEN THE 3 STREAMS (WEBRTC) API CALLS
  // THE 4th STREAMS CALL IS POST agents/{agentId}/chat/{chatId} (with SessionID and StreamID)
  return { agentId: agentId, chatId: chatId };
}

// Button and function binding
const agentsButton = document.getElementById('agents-button');
agentsButton.onclick = async () => {
  const agentsIds = ({} = await agentsAPIworkflow());
  console.log(agentsIds);
  agentId = agentsIds.agentId;
  chatId = agentsIds.chatId;
};

// Initial Agent Values
let agentId = 'agt_H_X57P_o';
let chatId = 'cht_VAixOdSHqftRLgZVxmTK3';
console.log(agentId, chatId);
