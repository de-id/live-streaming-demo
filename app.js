const express = require('express');
const http = require('http');
const cors = require('cors');

const port = 3000;

const app = express();
app.use(cors({ origin: 'http://localhost:3000' }));

app.use('/', express.static(__dirname));

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/index.html')
});
app.get('/agents', function(req, res) {
    res.sendFile(__dirname + '/index-agents.html')
});

const server = http.createServer(app);

server.listen(port, () => console.log(`Server started on port localhost:${port}\nhttp://localhost:${port}\nhttp://localhost:${port}/agents`));
