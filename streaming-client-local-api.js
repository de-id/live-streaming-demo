'use strict';

const OPENAI_API_KEY = "sk-SoTDJTGQamBDvBugOprRT3BlbkFJOo7uv1KTzeefPxRUjUEmxxxxxxxxx";
const DID_API_KEY = "YzJodmRHVnNRR2R0WVdsc0xtTnZiUTp2LU9LU1FpSXVNdDJZQWZqMWk0Umg="
// My Key below
// const DID_API_KEY = "dGltLmphY2tzb25AdGhvdWdodGxhYnMuY28ubno:M8y6Rr00rRPuClsZfGRRL";
const DID_URL = "https://api.d-id.com";

const RTCPeerConnection = (window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection).bind(window);

let peerConnection;
let streamId;
let sessionId;
let sessionClientAnswer;


const talkVideo = document.getElementById('talk-video');
talkVideo.setAttribute('playsinline', '');
const peerStatusLabel = document.getElementById('peer-status-label');
const iceStatusLabel = document.getElementById('ice-status-label');
const iceGatheringStatusLabel = document.getElementById('ice-gathering-status-label');
const signalingStatusLabel = document.getElementById('signaling-status-label');

const connect = async () => {
  console.log('bs');
  if (peerConnection && peerConnection.connectionState === 'connected') {
    return;
  }

  stopAllStreams();
  closePC();

  const sessionResponse = await fetch(`${DID_URL}/talks/streams`, {
    method: 'POST',
    headers: {'Authorization': `Basic ${DID_API_KEY}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      source_url: "https://www.thoughtlabs.co.nz/images/team/William.Tonkin.jpg",
      type: "microsoft",
      voice_id: "ga-IE-OrlaNeural"

    }),
  });
  
  const { id: newStreamId, offer, ice_servers: iceServers, session_id: newSessionId } = await sessionResponse.json()
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

  const sdpResponse = await fetch(`${DID_URL}/talks/streams/${streamId}/sdp`,
    {
      method: 'POST',
      headers: {Authorization: `Basic ${DID_API_KEY}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({answer: sessionClientAnswer, session_id: sessionId})
    });
}

const talk = async (data, firstRun = true) => {
  if (peerConnection?.signalingState === 'stable' || peerConnection?.iceConnectionState === 'connected') {
    const talkResponse = await fetch(`${DID_URL}/talks/streams/${streamId}`,
      {
        method: 'POST',
        headers: { Authorization: `Basic ${DID_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          'script': {
            'type': 'text',
            'input': firstRun ? 'Hey, what do you want to know?' : data,
          },
          'driver_url': 'bank://lively/driver-02/flipped',
          'config': {
            'stitch': true,
            'result_format': 'mov',
          },
          'session_id': sessionId
        })
      });
      firstRun = false
  }
}

setTimeout(connect, 2000);

//setTimeout(talk, 8000);

// const talkButton = document.getElementById('talk-button');
// talkButton.onclick = async () => {
//   talk();
// };

const destroyButton = document.getElementById('destroy-button');
destroyButton.onclick = async () => {
  await fetch(`${DID_URL}/talks/streams/${streamId}`,
    {
      method: 'DELETE',
      headers: {Authorization: `Basic ${DID_API_KEY}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({session_id: sessionId})
    });

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
    
    fetch(`${DID_URL}/talks/streams/${streamId}/ice`,
      {
        method: 'POST',
        headers: {Authorization: `Basic ${DID_API_KEY}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({ candidate, sdpMid, sdpMLineIndex, session_id: sessionId})
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
function onTrack(event) {
  const remoteStream = event.streams[0];
  setVideoElement(remoteStream);
}

async function createPeerConnection(offer, iceServers) {
  if (!peerConnection) {
    peerConnection = new RTCPeerConnection({iceServers});
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

  return sessionClientAnswer;
}

function setVideoElement(stream) {
  if (!stream) return;

  console.log('stream');
  console.log(stream);

  talkVideo.srcObject = stream;

  // safari hotfix
  if (talkVideo.paused) {
    talkVideo.play().then(_ => {}).catch(e => {});
  }
}

function stopAllStreams() {
  if (talkVideo.srcObject) {
    console.log('stopping video streams');
    talkVideo.srcObject.getTracks().forEach(track => track.stop());
    talkVideo.srcObject = null;
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
  iceGatheringStatusLabel.innerText = '';
  signalingStatusLabel.innerText = '';
  iceStatusLabel.innerText = '';
  peerStatusLabel.innerText = '';
  console.log('stopped peer connection');
  if (pc === peerConnection) {
    peerConnection = null;
  }
}

const askButton = document.getElementById('ask-button');

askButton.onclick = async () => {
  const q = document.getElementById('question').value;
  if (!q || q === "") return;

  askChatGPT(q);
};

const askChatGPT = async (q) => {
  
  const myHeaders = new Headers();
  myHeaders.append("Content-Type", "application/json");
  myHeaders.append("Authorization", `Bearer ${OPENAI_API_KEY}`);

  const raw = JSON.stringify({
    "messages": [
      {
        "role": "user",
        "content": q
      }
    ],
    "temperature": 0.7,
    "model": "gpt-3.5-turbo",
    "max_tokens": 650,
    "top_p": 1,
    "frequency_penalty": 0,
    "presence_penalty": 0,
    "stream": false
  });

  const requestOptions = {
    method: 'POST',
    headers: myHeaders,
    body: raw,
    redirect: 'follow'
  };

  fetch("http://192.168.86.183:8080/v1/chat/completions", requestOptions)
    .then(response => response.json())
    .then(result => {
      talk(result.choices[0].message.content, false)
    })
    .catch(error => console.log('error', error));
}



const resultsContainer = document.getElementById('recognition-result');
const partialContainer = document.getElementById('partial');

partialContainer.textContent = "Loading Speech Engine...";

const channel = new MessageChannel();
const model = await Vosk.createModel('vosk-model-small-en-us-0.15.zip');
model.registerPort(channel.port1);

const sampleRate = 48000;

const recognizer = new model.KaldiRecognizer(sampleRate);
recognizer.setWords(true);

recognizer.on("result", (message) => {
    const result = message.result;
  
    if (result.text.trim()==="") return;

    const textarea = document.getElementById('question');
    const curv = textarea.value;
    
    textarea.value = curv + ' ' + result.text;
});
// recognizer.on("partialresult", (message) => {
//     const partial = message.result.partial;

//     partialContainer.textContent = partial;
// });

partialContainer.textContent = "Service Ready";


let audioContext;
let firstTime = true;

async function init() {

  if (!firstTime) {

    return audioContext.resume();
  }

  console.log('innnnnnn');
  
  const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          sampleRate
      },
  });
  
  audioContext = new AudioContext();
  await audioContext.audioWorklet.addModule('recognizer-processor.js')
  const recognizerProcessor = new AudioWorkletNode(audioContext, 'recognizer-processor', { channelCount: 1, numberOfInputs: 1, numberOfOutputs: 1 });
  recognizerProcessor.port.postMessage({action: 'init', recognizerId: recognizer.id}, [ channel.port2 ])
  recognizerProcessor.connect(audioContext.destination);
  
  const source = audioContext.createMediaStreamSource(mediaStream);
  source.connect(recognizerProcessor);

  firstTime = false;
}


async function stopListeningAndAskChatGpt () {
  audioContext.suspend();

  const q = document.getElementById('question').value;

  if (q.trim()!=="") {
    askChatGPT(q);
  }
}


let listening = false;

const speakButton = document.getElementById('speak-button');
speakButton.onclick = async () => {
  console.log('sure')

  if (listening) {
    speakButton.innerText = "Speak";
    speakButton.classList.add('bg-blue-500');
    speakButton.classList.remove('bg-red-500');
    stopListeningAndAskChatGpt();
  } else {
    speakButton.innerText = "I'm done";
    speakButton.classList.remove('bg-blue-500');
    speakButton.classList.add('bg-red-500');
    init();
  }

  listening = !listening;
};