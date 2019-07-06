'use strict'

function $(id) {
    return document.getElementById(id);
}

const LOCAL = "本地";
const REMOTE = "对方";

var socket = io('wss://127.0.0.1:9443');
var socketId;
var roomId;
var rtcConnects = {};

var localVideo = $('localVideo');
var remoteVideo = $('remoteVideo');
var localFilter = $('localFilter');
var remoteFilter = $('remoteFilter');
var tdLocalBox = $('tdLocalBox');
var tdRemoteBox = $('tdRemoteBox');
var btnJoin = $('btnJoin');
var btnLeave = $('btnLeave');
var btnOpenCamera = $('btnOpenCamera');
var btnCloseCamera = $('btnCloseCamera');
var btnLocalSnap = $('btnLocalSnap');
var btnLocalRecord = $('btnLocalRecord');
var btnLocalStopRecord = $('btnLocalStopRecord');
var btnLocalPlay = $('btnLocalPlay');
var btnLocalDownload = $('btnLocalDownload');
var btnRemoteSnap = $('btnRemoteSnap');
var btnRemoteRecord = $('btnRemoteRecord');
var btnRemoteStopRecord = $('btnRemoteStopRecord');
var btnRemotePlay = $('btnRemotePlay');
var btnRemoteDownload = $('btnRemoteDownload');

window.localStream = null;
window.remoteStream = null;

window.localBuffer = null;
window.localMediaRecorder = null;

window.remoteBuffer = null;
window.remoteMediaRecorder = null;

var config = {
    'iceServers': [{
      'urls': 'turn:52.80.64.4:3478',
      'credential': "yjmyzz",
      'username': "yjmyzz.cnblogs.com"
    }]
};

var offerOptions = {
    offerToReceiveAudio: 1,
    offerToReceiveVideo: 1
};


//退出房间
function exit() {
    var data = {};
    data.from = socketId;
    data.room = roomId;
    socket.emit('exit', data);
    socketId = '';
    roomId = '';
    for (var i in rtcConnects) {
        var pc = rtcConnects[i];
        pc.close();
        pc = null;
    }
    rtcConnects = {};
}

//创建webrtc peerconnection
function createPeerConn(socketId) {
    var pc = rtcConnects[socketId];
    if (typeof (pc) == 'undefined') {
        pc = new RTCPeerConnection(config);
        pc.onicecandidate = e => onIceCandidate(pc, socketId, e);
        pc.ontrack = e => onTrack(pc, socketId, e);
        if (window.localStream != null) {
            window.localStream.getTracks().forEach(function (track) {
                pc.addTrack(track, window.localStream);
            });
        }
        pc.onremovestream = e => onRemoveStream(pc, socketId, e);
        rtcConnects[socketId] = pc;
    }
    return pc;
}

//移除webRtc连接
function removeRtcConnect(socketId) {
    delete rtcConnects[socketId];
}

//绑定本地摄像头流至video展示
function gotStream(stream) {
    console.log('Received local stream');
    localVideo.srcObject = stream;
    window.localStream = stream;
}

//获取icecandidate信息回调
function onIceCandidate(pc, id, event) {
    console.log('onIceCandidate to ' + id + ' candidate ' + event);
    if (event.candidate != null) {
        var message = {};
        message.from = socketId;
        message.to = id;
        message.room = roomId;
        var candidate = {};
        candidate.sdpMid = event.candidate.sdpMid;
        candidate.sdpMLineIndex = event.candidate.sdpMLineIndex;
        candidate.sdp = event.candidate.candidate;
        message.candidate = candidate;
        socket.emit('candidate', message);
    }
}

// //获取对端stream数据回调--onaddstream模式
// function onAddStream(pc, id, event) {
//     console.log('onAddStream from ' + id);
//     remoteVideo.srcObject = event.stream;
//     window.remoteStream = event.stream;
// }

//获取对端stream数据回调--onTrack模式
function onTrack(pc, id, event) {
    console.log('onTrack from ' + id);
    remoteVideo.srcObject = event.streams[0];
    window.remoteStream = event.streams[0];

}

//onRemoveStream回调
function onRemoveStream(pc, id, event) {
    console.log('onRemoveStream from ' + id);
    //peer关闭
    getOrCreateRtcConnect(id).close;
    createPeerConn(id).close;
    //删除peer对象
    delete rtcConnects[id];
    //移除video
    remoteVideo.srcObject = null;
}

//offer创建成功回调
function onCreateOfferSuccess(pc, id, offer) {
    console.log('createOffer: success ' + ' id:' + id + ' offer ' + JSON.stringify(offer));
    pc.setLocalDescription(offer);
    var message = {};
    message.from = socketId;
    message.to = id;
    message.room = roomId;
    message.sdp = offer.sdp;
    socket.emit('offer', message);
}

//offer创建失败回调
function onCreateOfferError(pc, id, error) {
    console.log('createOffer: fail error ' + error);
}

//answer创建成功回调
function onCreateAnswerSuccess(pc, id, offer) {
    console.log('createAnswer: success ' + ' id:' + id + ' offer ' + JSON.stringify(offer));
    pc.setLocalDescription(offer);
    var message = {};
    message.from = socketId;
    message.to = id;
    message.room = roomId;
    message.sdp = offer.sdp;
    socket.emit('answer', message);
}

//answer创建失败回调
function onCreateAnswerError(pc, id, error) {
    console.log('createAnswer: fail error ' + error);
}

//加入房间成功的回调
socket.on('created', async function (data) {
    console.log('created: ' + JSON.stringify(data));
    socketId = data.id;
    roomId = data.room;
    for (let i = 0; i < data.peers.length; i++) {
        var otherSocketId = data.peers[i].id;
        var pc = createPeerConn(otherSocketId);
        const offer = await pc.createOffer(offerOptions);
        onCreateOfferSuccess(pc, otherSocketId, offer);
    }
})

//joined [id,room]
socket.on('joined', function (data) {
    console.log('joined: ' + JSON.stringify(data));
    createPeerConn(data.from);
})

//offer [from,to,room,sdp]
socket.on('offer', function (data) {
    console.log('offer: ' + JSON.stringify(data));
    var pc = createPeerConn(data.from);
    var rtcDescription = { type: 'offer', sdp: data.sdp };
    pc.setRemoteDescription(new RTCSessionDescription(rtcDescription));
    pc.createAnswer(offerOptions)
        .then(offer => onCreateAnswerSuccess(pc, data.from, offer), error => onCreateAnswerError(pc, otherSocketId, error));
})

//answer回调
socket.on('answer', function (data) {
    console.log('answer: ' + JSON.stringify(data));
    var pc = createPeerConn(data.from);
    var rtcDescription = { type: 'answer', sdp: data.sdp };
    pc.setRemoteDescription(new RTCSessionDescription(rtcDescription));
})

//收集网络链路的候选者回调
socket.on('candidate', function (data) {
    console.log('candidate: ' + JSON.stringify(data));
    var iceData = data.candidate;
    var pc = createPeerConn(data.from);
    var rtcIceCandidate = new RTCIceCandidate({
        candidate: iceData.sdp,
        sdpMid: iceData.sdpMid,
        sdpMLineIndex: iceData.sdpMLineIndex
    });
    pc.addIceCandidate(rtcIceCandidate);
})

//离开房间的回调
socket.on('exit', function (data) {
    console.log('exit: ' + JSON.stringify(data));
    //判断是否为当前连接 
    var pc = rtcConnects[data.from];
    if (typeof (pc) == 'undefined') {
        return;
    } else {
        //peer关闭
        createPeerConn(data.from).close;
        //删除peer对象
        delete rtcConnects[data.from];
        //移除video
        remoteVideo.srcObject = null;

    }
})

function setVideoFilter(objSel, objVideo) {
    objVideo.className = objSel.value;
}

function snapPicture(objFilter, objTd, objVideo) {
    var canvas = document.createElement("canvas");
    canvas.className = objFilter.value + " pic";
    canvas.getContext('2d').drawImage(objVideo, 0, 0, canvas.width, canvas.height);
    objTd.innerHTML = '';
    objTd.appendChild(canvas);
}

function startRecord(tdBox, flag) {
    var options = {
        mimeType: 'video/webm;codecs=vp8'
    }
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.error(`${options.mimeType} is not supported!`);
        return;
    }

    if (flag === LOCAL) {
        window.localBuffer = [];
        try {
            window.localMediaRecorder = new MediaRecorder(window.localStream, options);
        } catch (e) {
            console.error('Failed to create MediaRecorder:', e);
            return;
        }

        window.localMediaRecorder.ondataavailable = (e) => {
            if (e && e.data && e.data.size > 0) {
                window.localBuffer.push(e.data);
            }
        };
        window.localMediaRecorder.start(10);
    }
    else {
        window.remoteBuffer = [];
        try {
            window.remoteMediaRecorder = new MediaRecorder(window.remoteStream, options);
        } catch (e) {
            console.error('Failed to create MediaRecorder:', e);
            return;
        }

        window.remoteMediaRecorder.ondataavailable = (e) => {
            if (e && e.data && e.data.size > 0) {
                window.remoteBuffer.push(e.data);
            }
        };
        window.remoteMediaRecorder.start(10);
    }

    tdBox.innerHTML = flag + "视频录制中...";
}



function stopRecord(tdBox, flag) {
    if (flag === LOCAL) {
        if (window.localMediaRecorder != null) {
            window.localMediaRecorder.stop();
        }
    }
    else {
        if (window.remoteMediaRecorder != null) {
            window.remoteMediaRecorder.stop();
        }
    }
    tdBox.innerHTML = flag + "视频已停止录制";
}

function play(objFilter, tdBox, flag) {
    var video = document.createElement("video");
    video.className = objFilter.value;
    video.src = null;
    var blob = null;
    if (flag === LOCAL) {
        blob = new Blob(window.localBuffer, { type: 'video/webm' });
    }
    else {
        blob = new Blob(window.remoteBuffer, { type: 'video/webm' });
    }
    video.src = window.URL.createObjectURL(blob);
    video.srcObject = null;
    video.controls = true;
    tdBox.innerHTML = '';
    tdBox.appendChild(video);
    video.play();
}

function downloadVideo(flag) {
    var blob = null;
    if (flag === LOCAL) {
        blob = new Blob(window.localBuffer, { type: 'video/webm' });
    }
    else {
        blob = new Blob(window.remoteBuffer, { type: 'video/webm' });
    }
    var url = window.URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';
    a.download = flag + '-video.webm';
    a.click();
}

window.addEventListener("load", function () {

    if (!navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia) {
        console.log('webrtc is not supported!');
        alert("webrtc is not supported!");
        return;
    }

    //加入房间
    btnJoin.onclick = () => {
        var roomName = $('roomName').value;
        if (roomName) {
            socket.emit('createAndJoinRoom', { room: roomName })
        } else {
            console.log('请输入房间名称!');
            alert("请输入房间名称!");
        }
    }

    //离开房间
    btnLeave.onclick = () => {
        exit();
    }

    //打开摄像头
    btnOpenCamera.onclick = () => {
        startCamera();
    }

    //关闭摄像头
    btnCloseCamera.onclick = () => {
        if (window.localStream != null) {
            window.localStream.getTracks().forEach(e => {
                e.stop();
            });
            window.localStream = null;
            exit();
        }
    }

    //切换本机视频滤镜
    localFilter.onchange = () => { setVideoFilter(localFilter, localVideo); }

    //切换远程视频滤镜
    remoteFilter.onchange = () => { setVideoFilter(remoteFilter, remoteVideo); }

    //本地视频截屏
    btnLocalSnap.onclick = () => { snapPicture(localFilter, tdLocalBox, localVideo); }

    //本地视频录制
    btnLocalRecord.onclick = () => { startRecord(tdLocalBox, LOCAL); }

    //本地录制停止
    btnLocalStopRecord.onclick = () => { stopRecord(tdLocalBox, LOCAL); }

    //本地(录制的)视频播放
    btnLocalPlay.onclick = () => { play(localFilter, tdLocalBox, LOCAL); }

    //本地(录制的)视频下载
    btnLocalDownload.onclick = () => { downloadVideo(LOCAL); }

    //对方视频截屏
    btnRemoteSnap.onclick = () => { snapPicture(remoteFilter, tdRemoteBox, remoteVideo) };

    //对方视频录制
    btnRemoteRecord.onclick = () => { startRecord(tdRemoteBox, REMOTE); }

    //对方录制停止
    btnRemoteStopRecord.onclick = () => { stopRecord(tdRemoteBox, REMOTE); }

    //对方(录制的)视频播放
    btnRemotePlay.onclick = () => { play(remoteFilter, tdRemoteBox, REMOTE); }

    //对方(录制的)视频下载
    btnRemoteDownload.onclick = () => { downloadVideo(REMOTE); }

}, false);