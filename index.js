const fetchJsonFile = await fetch('./api.json');
const DID_API = await fetchJsonFile.json();

// Import the appropriate streaming client based on websocketClient setting
if (DID_API.websocketClient) {
  await import('./streaming-client-api-ws.js');
} else {
  await import('./streaming-client-api.js');
}
