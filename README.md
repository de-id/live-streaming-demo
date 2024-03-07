# Streaming Live Demo by D-ID

## Initial Setup:
* (install express) open a terminal in the folder and run - npm install
* (add your api key) edit the `api.json` inside the uncompressed folder and replace the emoji with your key
* (select service) in the same `api.json` file, edit the `service` field to choose your avatar type, use `talks` for an avatar made from an image or `clips` to use a premade HQ avatar from video


## Start streaming demo:
* (bring up the app) in the folder (ctr left click on folder through finder) open the terminal run node app.js 
* You should see this message - server started on port localhost:3000
* (open the app) in the browser add localhost:3000
* (connect) press connect you should see the connection ready 
* (stream) press the start button to start streaming

## Start agent demo:
* (bring up the app) in the folder (ctr left click on folder through finder) open the terminal run node app.js 
* You should see this message - server started on port localhost:3000
* (open the app) in the browser add localhost:3000/agent
* press connect to connect to agent and start the chat
* press (New Agent API Workflow?) to get new agent. You could observe all steps in console with payloads to better understand flow

## App:
![app](./app.png)
