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

const createRoomBtn = document.getElementById('btnCreateRoom');
const joinRoomBtn = document.getElementById('btnJoinRoom');

createRoomBtn.addEventListener('click', () => {
  const roomID = prompt('Enter room identifier');
  init(roomID);
  createRoomBtn.hidden = true
  joinRoomBtn.hidden = true;
})

joinRoomBtn.addEventListener('click', () => {
  const roomId = prompt('Enter room identifier');
  init(roomId);
  createRoomBtn.hidden = true
  joinRoomBtn.hidden = true;
});

function updateUserList(clients, id, count) {
  clients.forEach((socketListId) => {
    if (!connections[socketListId]) {
      connections[socketListId] = new RTCPeerConnection(peerConnectionConfig);
      //Wait for their ice candidate       
      connections[socketListId].onicecandidate = (event) => {
        if (event.candidate != null) {
          console.log('SENDING ICE');
          mySocket.emit('signal', socketListId, JSON.stringify({ 'ice': event.candidate }));
        }
      }

      //Wait for their video stream
      connections[socketListId].onaddstream = (event) => {
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
  },
  error => {
    console.warn(error.message);
  }
)

function init(roomId) {
  if (!mySocket || !mySocket.connected) {
    const socket = io();
    mySocket = socket;

    socket.emit('joinedRoom', roomId);

    socket.on('signal', (id, message) => {
      gotMessageFromServer(id, message);
    });

    socket.on('connect', () => {

      socket.on("user-joined", (id, count, clients) => {
        updateUserList(clients, id, count);
      });


      socket.on('remove-user', (socketId) => {
        if (connections[socketId]) {
          connections[socketId].close();
          delete connections[socketId];
          if (Object.keys(connections).length < 2) {
            Object.keys(connections).forEach(key => {
              connections[key].close();
              delete connections[key];
            })
          }
          const vidEl = document.querySelector(`[data-socket='${socketId}']`)
          if (vidEl) {
            vidEl.parentNode.removeChild(vidEl);
          }
        }
      })
    });
  }
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
  if (fromId != mySocket.id) {

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