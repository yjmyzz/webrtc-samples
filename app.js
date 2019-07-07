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
    console.log((new Date()).getTime() + ' disconnect: ' + socketId + ' reason:' + reason);
    var message = {};
    message.from = socketId;
    message.room = '';
    socket.broadcast.emit('exit', message);
  });

  /** client->server 信令集*/
  //apply_join->申请加入房间
  socket.on('apply_join', function (message) {
    var room = message.room;
    console.log((new Date()).getTime() + ' received apply_join => ' + room);
    //判断room是否存在
    var clientsInRoom = io.sockets.adapter.rooms[room];
    var numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
    console.log((new Date()).getTime() + ' room ' + room + ' now has ' + numClients + ' client(s)');
    if (clientsInRoom) {
      console.log(Object.keys(clientsInRoom.sockets));
    }

    //获取该房间的其它用户信息
    var peers = new Array();
    if (clientsInRoom) {
      var onlineUsers = Object.keys(clientsInRoom.sockets);
      console.log((new Date()).getTime() + ' socket length ' + onlineUsers.length);
      for (var i = 0; i < onlineUsers.length; i++) {
        var peer = {};
        peer.id = onlineUsers[i];
        peers.push(peer);
      }
    }

    var data = {};
    data.id = socket.id;
    data.room = room;
    data.peers = peers;

    if (numClients === 0) {
      //不存在，首次创建房间
      socket.join(room);
      console.log((new Date()).getTime() + " " + socket.id + ' joined room: ' + room);
      //发送【joined】通知本人加入成功
      socket.emit('joined', data);
    } else if (numClients >= 2) {
      //人满了
      socket.emit('full', data);
    }
    else {
      //加入房间中
      socket.join(room);
      console.log((new Date()).getTime() + " " + socket.id + ' joined room ' + room);

      //发送【other_joined】通知其它用户，有新人进来了
      io.sockets.in(room).emit('other_joined', data);
      //发送【joined】通知本人加入成功
      socket.emit('joined', data);
    }
  });

  //【offer】转发offer消息至room其他客户端 [from,to,room,sdp]
  socket.on('offer', function (message) {
    var room = Object.keys(socket.rooms)[1];
    // console.log((new Date()).getTime() + 'received offer: ' + message.from + ' room:' + room + ' message: ' + JSON.stringify(message));
    console.log((new Date()).getTime() + ' received offer: ' + message.from + ' room: ' + room);
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
    // console.log((new Date()).getTime() + 'Received answer: ' + message.from + ' room:' + room + ' message: ' + JSON.stringify(message));
    console.log((new Date()).getTime() + ' received answer: ' + message.from + ' room:' + room);
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
    //console.log((new Date()).getTime() + 'Received candidate: ' + message.from + ' message: ' + JSON.stringify(message));
    console.log((new Date()).getTime() + ' received candidate: ' + message.from);
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
    // console.log((new Date()).getTime() + 'Received exit: ' + message.from + ' message: ' + JSON.stringify(message));
    console.log((new Date()).getTime() + ' received exit: ' + message.from);
    var room = message.room;
    //关闭该连接
    socket.leave(room);
    //获取room
    var clientsInRoom = io.sockets.adapter.rooms[room];
    if (clientsInRoom) {
      var onlineUsers = Object.keys(clientsInRoom.sockets);
      for (var i = 0; i < onlineUsers.length; i++) {
        //转发【exit】消息至其他客户端
        var otherSocket = io.sockets.connected[onlineUsers[i]];
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

