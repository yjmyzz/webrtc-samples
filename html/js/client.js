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
var dc = null;
var dcIsOpen = false;

var localVideo = $('localVideo');
var remoteVideo = $('remoteVideo');
var localFilter = $('localFilter');
var remoteFilter = $('remoteFilter');
var tdLocalBox = $('tdLocalBox');
var tdRemoteBox = $('tdRemoteBox');
var txtMsg = $("txtMsg");
var divMsg = $("divMsg");
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
var btnSend = $("btnSend");
var btnClearMsg = $("btnClearMsg");
var btnSendFile = $("btnSendFile");
var inputFile = $("inputFile");
var chunkLength = 10000;

window.localStream = null;
window.remoteStream = null;

window.localBuffer = null;
window.localMediaRecorder = null;

window.remoteBuffer = null;
window.remoteMediaRecorder = null;
var arrayToStoreChunks = [];
var fileTotalBlocks = 0;
var fileCurrentBlockIndex = 0;

//这里根据需求，改成真正的stun/turn服务器地址
var config = {
    'iceServers': [{
        'urls': 'stun:127.0.0.1:32769',
    },
    {
        'urls': 'stun:stun.xten.com:3478',
    },
    {
        'urls': 'stun:stun.voxgratia.org:3478',
    },
    {
        'urls': 'stun:stun.ideasip.com:3478',
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
function createOrGetExistPeerConn(socketId) {
    var pc = rtcConnects[socketId];
    if (typeof (pc) == 'undefined') {
        pc = new RTCPeerConnection(config);
        pc.onicecandidate = e => onIceCandidate(pc, socketId, e);
        pc.ontrack = e => onTrack(pc, socketId, e);
        //创建datachannel(注：这个dc无法接收消息，必须在pc.ondatachannel中拿到的dc才是对方创建的datachannel)
        dc = pc.createDataChannel("chat");
        console.log((new Date()).getTime() + ' createDataChannel , from:' + socketId);
        pc.ondatachannel = function (ev) {
            console.log((new Date()).getTime() + ' ondatachannel , event:' + JSON.stringify(event));
            dc = ev.channel;
        };

        dc.onopen = function (event) {
            console.log((new Date()).getTime() + ' datachannel is open, event: ' + JSON.stringify(event));
            dcIsOpen = true;
        }
        dc.onmessage = function (event) {
            console.log((new Date()).getTime() + ' onmessage, event.data:' + event.data);
            var div = document.createElement("div");
            div.className = "right";
            var eventData = JSON.parse(event.data);
            if (eventData.type != undefined && eventData.type === "file") {
                //传递文件
                arrayToStoreChunks.push(eventData.message);
                if (eventData.last) {
                    saveToDisk(arrayToStoreChunks.join(''), eventData.fileName, eventData.mimeType);
                    arrayToStoreChunks = [];
                }
            }
            else {
                //纯文字聊天
                div.innerText = "对方说：" + eventData.message;
                divMsg.appendChild(div);
            }
        }
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


function onReadAsDataURL(event, fileContent, fileName, mimeType) {
    var data = {};
    data.type = "file";
    // 首次调用
    if (event) {
        fileContent = event.target.result;
        fileTotalBlocks = parseInt(fileContent.length / chunkLength);
        fileCurrentBlockIndex = 0;
    }

    if (fileContent.length > chunkLength) {
        data.message = fileContent.slice(0, chunkLength);
    } else {
        data.message = fileContent;
        data.last = true;
        data.fileName = fileName;
        data.mimeType = mimeType;
    }

    if (!dc || !dcIsOpen) {
        alert('datachannel not ready!');
        return;
    }

    var jsonData = JSON.stringify(data);
    dc.send(jsonData);

    console.log("send file data=> " + jsonData);

    var remainingDataURL = fileContent.slice(data.message.length);
    if (remainingDataURL.length) {
        setTimeout(function () {
            onReadAsDataURL(null, remainingDataURL, fileName, mimeType);
            fileCurrentBlockIndex += 1;
            // 显示进度
            $('lblProcess').innerText = fileCurrentBlockIndex + "/" + fileTotalBlocks;
        }, 10)
    }
}

//保存接收到的文件到本机磁盘
function saveToDisk(fileUrl, fileName, mimeType) {   
    var a = document.createElement('a');
    a.href = fileUrl;
    a.style.display = 'none';
    a.download = fileName;
    a.click();
}

//移除webRtc连接
function removeRtcConnect(socketId) {
    delete rtcConnects[socketId];
}

//绑定本地摄像头流至video展示
function gotStream(stream) {
    console.log((new Date()).getTime() + ' received local stream');
    localVideo.srcObject = stream;
    window.localStream = stream;
}

//获取icecandidate信息回调
function onIceCandidate(pc, id, event) {
    // console.log((new Date()).getTime() + 'onIceCandidate: to ' + id + ' candidate ' + event);
    console.log((new Date()).getTime() + ' onIceCandidate: to ' + id + ' ,from ' + socketId);
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

//获取对端stream数据回调--onTrack模式
function onTrack(pc, id, event) {
    console.log((new Date()).getTime() + ' onTrack from ' + id);
    remoteVideo.srcObject = event.streams[0];
    window.remoteStream = event.streams[0];

}

//onRemoveStream回调
function onRemoveStream(pc, id, event) {
    console.log((new Date()).getTime() + ' onRemoveStream from ' + id);
    //peer关闭
    createOrGetExistPeerConn(id).close;
    //删除peer对象
    delete rtcConnects[id];
    //移除video
    remoteVideo.srcObject = null;
}

//offer创建成功回调
function onCreateOfferSuccess(pc, id, offer) {
    // console.log((new Date()).getTime() + 'createOffer: success ' + ' id:' + id + ' offer ' + JSON.stringify(offer));
    console.log((new Date()).getTime() + ' createOffer: success ' + ' from:' + socketId + ' to:' + id);
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
    console.log((new Date()).getTime() + ' createOffer: fail error ' + error);
}

//answer创建成功回调
function onCreateAnswerSuccess(pc, id, offer) {
    // console.log((new Date()).getTime() + 'createAnswer: success ' + ' id:' + id + ' offer ' + JSON.stringify(offer));
    console.log((new Date()).getTime() + ' createAnswer: success ' + ' from:' + socketId + ' to:' + id);
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
    console.log((new Date()).getTime() + ' createAnswer: fail error ' + error);
}

//加入房间成功的回调
socket.on('joined', async function (data) {
    console.log((new Date()).getTime() + ' on joined: ' + JSON.stringify(data));
    socketId = data.id;
    roomId = data.room;
    for (let i = 0; i < data.peers.length; i++) {
        var otherSocketId = data.peers[i].id;
        var pc = createOrGetExistPeerConn(otherSocketId);
        const offer = await pc.createOffer(offerOptions);
        onCreateOfferSuccess(pc, otherSocketId, offer);
    }
})

//joined [id,room]
socket.on('other_joined', function (data) {
    console.log((new Date()).getTime() + ' on other_joined: ' + JSON.stringify(data));
    createOrGetExistPeerConn(data.from);
})

//offer [from,to,room,sdp]
socket.on('offer', function (data) {
    // console.log((new Date()).getTime() + 'offer: ' + JSON.stringify(data));
    console.log((new Date()).getTime() + ' on offer, from: ' + data.from);
    var pc = createOrGetExistPeerConn(data.from);
    var rtcDescription = { type: 'offer', sdp: data.sdp };
    pc.setRemoteDescription(new RTCSessionDescription(rtcDescription));
    pc.createAnswer(offerOptions)
        .then(offer => onCreateAnswerSuccess(pc, data.from, offer), error => onCreateAnswerError(pc, otherSocketId, error));
})

//answer回调
socket.on('answer', function (data) {
    // console.log((new Date()).getTime() + 'answer: ' + JSON.stringify(data));
    console.log((new Date()).getTime() + ' on answer, from: ' + data.from);
    var pc = createOrGetExistPeerConn(data.from);
    var rtcDescription = { type: 'answer', sdp: data.sdp };
    pc.setRemoteDescription(new RTCSessionDescription(rtcDescription));
})

//收集网络链路的候选者回调
socket.on('candidate', function (data) {
    // console.log((new Date()).getTime() + 'candidate: ' + JSON.stringify(data));
    console.log((new Date()).getTime() + ' on candidate, from ' + data.from)
    var iceData = data.candidate;
    var pc = createOrGetExistPeerConn(data.from);
    var rtcIceCandidate = new RTCIceCandidate({
        candidate: iceData.sdp,
        sdpMid: iceData.sdpMid,
        sdpMLineIndex: iceData.sdpMLineIndex
    });
    pc.addIceCandidate(rtcIceCandidate);
})

socket.on("full", function (data) {
    console.log((new Date()).getTime() + ' on full: ' + JSON.stringify(data));
    alert('房间已满！');
})

//离开房间的回调
socket.on('exit', function (data) {
    console.log((new Date()).getTime() + ' on exit: ' + JSON.stringify(data));
    //判断是否为当前连接 
    var pc = rtcConnects[data.from];
    if (typeof (pc) == 'undefined') {
        return;
    } else {
        //peer关闭
        createOrGetExistPeerConn(data.from).close;
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
        console.log((new Date()).getTime() + ' webrtc is not supported!');
        alert("webrtc is not supported!");
        return;
    }

    //加入房间
    btnJoin.onclick = () => {
        var roomName = $('roomName').value;
        if (roomName) {
            socket.emit('apply_join', { room: roomName })
        } else {
            console.log((new Date()).getTime() + ' 请输入房间名称!');
            alert("请输入房间名称!");
            $('roomName').focus();

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

    // 清空聊天内容
    btnClearMsg.onclick = () => {
        divMsg.innerHTML = "";
    }

    //发送聊天内容
    btnSend.onclick = () => {
        if (txtMsg.value.length <= 0) {
            alert('请输入聊天内容！');
            txtMsg.focus();
            return;
        }
        if (!dc || !dcIsOpen) {
            alert('datachannel not ready!');
            return;
        }
        var message = { "message": txtMsg.value, "from": socketId };
        dc.send(JSON.stringify(message));
        console.log("send message:" + txtMsg.value + ", from:" + socketId);
        var div = document.createElement("div");
        div.className = "left";
        div.innerText = "我说：" + txtMsg.value;
        divMsg.appendChild(div);
        txtMsg.value = "";
    }

    //发送文件内容
    btnSendFile.onclick = () => {
        var file = inputFile.files[0];
        var reader = new window.FileReader();
        reader.readAsDataURL(file);       
        reader.onload = function (event) {
            onReadAsDataURL(event, null, file.name, file.type);
        }
    }

}, false);