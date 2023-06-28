
const express = require('express');
const http = require('http');
const cors = require("cors");

const corsOptions = {
	origin: "https://chat.thoughtlabs.co.nz"
};

const port = 3000;
const host = '192.168.86.183'

const app = express();
app.use('/', express.static(__dirname));
app.use(require("cors"));
const server = http.createServer(app);
app.options('*', cors());
app.set('trust proxy', 'loopback, linklocal, uniquelocal')

server.listen(3000, host);
server.on('listening', function() {
    console.log('Express server started on port %s at %s', server.address().port, server.address().address);
});
