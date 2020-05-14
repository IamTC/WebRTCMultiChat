let isAlreadyCalling = false;
let getCalled = false;
let mySocket;
let connections = [];
let locVdo;
const peerConnectionConfig = {
  'iceServers': [
    { 'url': 'stun:stun.services.mozilla.com' },
    { 'url': 'stun:stun.l.google.com:19302' },
    {
      'url': 'turn:157.245.149.157:3478?transport=udp',
      'username': 'test',
      'credential': 'test'
    }
  ]
};

const existingCalls = [];

const { RTCPeerConnection, RTCSessionDescription } = window;

const peerConnection = new RTCPeerConnection();

function updateUserList(socketIds, id, count) {
  socketIds.forEach(socketId => {
    if (!connections[socketId]) {
      connections[socketId] = new RTCPeerConnection(peerConnectionConfig);
      connections[socketId].onicecandidate = (event) => {
        if (event.candidate != null) {
          console.log('SENDING ICE');
          mySocket.emit('signal', socketId, JSON.stringify({ ice: event.candidate }));
        }
      }

      connections[socketId].onaddstream = (event) => {
        gotRemoteStream(event, socketId);
      }

      connections[socketId].addStream(locVdo);
    }
  });
  if (count >= 2) {
    connections[id].createOffer().then(function (description) {
      connections[id].setLocalDescription(description).then(function () {
        // console.log(connections);
        mySocket.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }));
      }).catch(e => console.log(e));
    });
  }
}

navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(
  stream => {
    const localVideo = document.getElementById("local-video");
    if (localVideo) {
      localVideo.srcObject = stream;
    }
    locVdo = stream;

    stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));
    init();
  },
  error => {
    console.warn(error.message);
  }
)

function init() {
  const socket = io();
  mySocket = socket;

  socket.on("update-user-list", ({ users, id, count }) => {
    updateUserList(users, id, count);
  });

  socket.on('user-joined', function (id, count, clients) {
    clients.forEach(function (socketListId) {
      if (!connections[socketListId]) {
        connections[socketListId] = new RTCPeerConnection(peerConnectionConfig);
        //Wait for their ice candidate       
        connections[socketListId].onicecandidate = function (event) {
          if (event.candidate != null) {
            console.log('SENDING ICE');
            socket.emit('signal', socketListId, JSON.stringify({ 'ice': event.candidate }));
          }
        }

        //Wait for their video stream
        connections[socketListId].onaddstream = function (event) {
          gotRemoteStream(event, socketListId)
        }

        //Add the local video stream
        connections[socketListId].addStream(locVdo);
      }
    });

    //Create an offer to connect with your local description
    if (count >= 2) {
      connections[id].createOffer().then(function (description) {
        connections[id].setLocalDescription(description).then(function () {
          // console.log(connections);
          socket.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }));
        }).catch(e => console.log(e));
      });
    }
  });

  socket.on('signal', (id, message) => {
    gotMessageFromServer(id, message);
  });

  socket.on('remove-user', (id) => {
    const vidEl = document.querySelector(`[data-socket='${id.socketId}']`)
    vidEl.parentNode.removeChild(vidEl);
  })

  peerConnection.ontrack = function ({ streams: [stream] }) {
    const remoteVideo = document.getElementById("remote-video");
    if (remoteVideo) {
      remoteVideo.srcObject = stream;
    }
  };

}

function gotRemoteStream(event, id) {

  var video = document.createElement('video'),
    div = document.createElement('div')

  video.setAttribute('data-socket', id);
  video.className = 'remote-video';
  video.srcObject = event.stream;
  video.autoplay = true;
  video.muted = false;
  video.playsinline = true;

  div.appendChild(video);
  document.querySelector('.video-container').appendChild(div);
}

function gotMessageFromServer(fromId, message) {

  //Parse the incoming signal
  var signal = JSON.parse(message)

  //Make sure it's not coming from yourself
  if (fromId != mySocket.socketId) {

    if (signal.sdp) {
      connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(function () {
        if (signal.sdp.type == 'offer') {
          connections[fromId].createAnswer().then(function (description) {
            connections[fromId].setLocalDescription(description).then(function () {
              mySocket.emit('signal', fromId, JSON.stringify({ 'sdp': connections[fromId].localDescription }));
            }).catch(e => console.log(e));
          }).catch(e => console.log(e));
        }
      }).catch(e => console.log(e));
    }

    if (signal.ice) {
      connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice)).catch(e => console.log(e));
    }
  }
}