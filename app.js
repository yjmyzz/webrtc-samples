var https = require('https');
var fs = require('fs');
var options = {
  key: fs.readFileSync('keys/server.key'),
  cert: fs.readFileSync('keys/server.crt')
}
var socketIO = require('socket.io');
var apps = https.createServer(options);
apps.listen(9443);

var io = socketIO.listen(apps);
io.sockets.on('connection', function (socket) {
  socket.on('disconnect', function (reason) {
    var socketId = socket.id;
    console.log('disconnect: ' + socketId + ' reason:' + reason);
    var message = {};
    message.from = socketId;
    message.room = '';
    socket.broadcast.emit('exit', message);
  });

  /** client->server 信令集*/
  //【createAndJoinRoom】  创建并加入Room中 [room]
  socket.on('createAndJoinRoom', function (message) {
    var room = message.room;
    console.log('Received createAndJoinRoom：' + room);
    //判断room是否存在
    var clientsInRoom = io.sockets.adapter.rooms[room];
    var numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
    console.log('Room ' + room + ' now has ' + numClients + ' client(s)');
    if (clientsInRoom) {
      console.log(Object.keys(clientsInRoom.sockets));
    }
    if (numClients === 0) {
      /** room 不存在 不存在则创建（socket.join）*/
      //加入并创建房间
      socket.join(room);
      console.log('Client ID ' + socket.id + ' created room ' + room);

      //发送【created】消息至客户端 [id,room,peers]
      var data = {};
      //socket id
      data.id = socket.id;
      //room id
      data.room = room;
      //其他连接 为空
      data.peers = [];
      //发送
      socket.emit('created', data);
    } else {
      /** room 存在 */
      //发送【joined】消息至该room其他客户端 [id,room]
      var data = {};
      //socket id
      data.id = socket.id;
      //room id
      data.room = room;
      //发送房间内其他客户端
      io.sockets.in(room).emit('joined', data);

      //发送【created】消息至客户端 [id,room,peers]
      var data = {};
      //socket id
      data.id = socket.id;
      //room id
      data.room = room;
      //其他连接
      var peers = new Array();
      var otherSocketIds = Object.keys(clientsInRoom.sockets);
      console.log('Socket length ' + otherSocketIds.length);
      for (var i = 0; i < otherSocketIds.length; i++) {
        var peer = {};
        peer.id = otherSocketIds[i];
        peers.push(peer);
      }
      data.peers = peers;
      //发送
      socket.emit('created', data);

      //加入房间中
      socket.join(room);
      console.log('Client ID ' + socket.id + ' joined room ' + room);
    }

  });

  //【offer】转发offer消息至room其他客户端 [from,to,room,sdp]
  socket.on('offer', function (message) {
    var room = Object.keys(socket.rooms)[1];
    console.log('Received offer: ' + message.from + ' room:' + room + ' message: ' + JSON.stringify(message));
    //转发【offer】消息至其他客户端
    //根据id找到对应连接
    var otherClient = io.sockets.connected[message.to];
    if (!otherClient) {
      return;
    }
    otherClient.emit('offer', message);

  });

  //【answer】转发answer消息至room其他客户端 [from,to,room,sdp]
  socket.on('answer', function (message) {
    var room = Object.keys(socket.rooms)[1];
    console.log('Received answer: ' + message.from + ' room:' + room + ' message: ' + JSON.stringify(message));
    //转发【answer】消息至其他客户端
    //根据id找到对应连接
    var otherClient = io.sockets.connected[message.to];
    if (!otherClient) {
      return;
    }
    otherClient.emit('answer', message);
  });

  //【candidate】转发candidate消息至room其他客户端 [from,to,room,candidate[sdpMid,sdpMLineIndex,sdp]]
  socket.on('candidate', function (message) {
    console.log('Received candidate: ' + message.from + ' message: ' + JSON.stringify(message));
    //转发【candidate】消息至其他客户端
    //根据id找到对应连接
    var otherClient = io.sockets.connected[message.to];
    if (!otherClient) {
      return;
    }
    otherClient.emit('candidate', message);
  });

  //【exit】关闭连接转发exit消息至room其他客户端 [from,room]
  socket.on('exit', function (message) {
    console.log('Received exit: ' + message.from + ' message: ' + JSON.stringify(message));
    var room = message.room;
    //关闭该连接
    socket.leave(room);
    //获取room
    var clientsInRoom = io.sockets.adapter.rooms[room];
    if (clientsInRoom) {
      var otherSocketIds = Object.keys(clientsInRoom.sockets);
      for (var i = 0; i < otherSocketIds.length; i++) {
        //转发【exit】消息至其他客户端
        var otherSocket = io.sockets.connected[otherSocketIds[i]];
        otherSocket.emit('exit', message);
      }
    }
  });

});



/** 构建html页 */
var serveIndex = require('serve-index');
var express = require("express");
var htmlApp = express();
htmlApp.use(serveIndex('./html'));
htmlApp.use(express.static("./html"))
var httpsServer = https.createServer(options, htmlApp);
httpsServer.listen(8442, "0.0.0.0");

