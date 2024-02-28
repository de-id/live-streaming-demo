const express = require('express');
const http = require('http');

const port = 3000;

const app = express();
app.use('/', express.static(__dirname));

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/index.html')
});
app.get('/agent', function(req, res) {
    res.sendFile(__dirname + '/index-agent.html')
});

const server = http.createServer(app);

server.listen(port, () => console.log(`Server started on port localhost:${port}`));
