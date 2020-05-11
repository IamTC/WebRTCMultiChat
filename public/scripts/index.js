let isAlreadyCalling = false;
let getCalled = false;
let mySocket;
let connections = [];
let locVdo;
const peerConnectionConfig = {
  'iceServers': [
    { 'urls': 'stun:stun.services.mozilla.com' },
    { 'urls': 'stun:stun.l.google.com:19302' },
  ]
};

const existingCalls = [];

const { RTCPeerConnection, RTCSessionDescription } = window;

const peerConnection = new RTCPeerConnection();

function unselectUsersFromList() {
  const alreadySelectedUser = document.querySelectorAll(
    ".active-user.active-user--selected"
  );

  alreadySelectedUser.forEach(el => {
    el.setAttribute("class", "active-user");
  });
}

function createUserItemContainer(socketId) {
  const userContainerEl = document.createElement("div");

  const usernameEl = document.createElement("p");

  userContainerEl.setAttribute("class", "active-user");
  userContainerEl.setAttribute("id", socketId);
  usernameEl.setAttribute("class", "username");
  usernameEl.innerHTML = `Socket: ${socketId}`;

  userContainerEl.appendChild(usernameEl);

  userContainerEl.addEventListener("click", () => {
    unselectUsersFromList();
    userContainerEl.setAttribute("class", "active-user active-user--selected");
    const talkingWithInfo = document.getElementById("talking-with-info");
    talkingWithInfo.innerHTML = `Talking with: "Socket: ${socketId}"`;
    callUser(socketId);
  });

  return userContainerEl;
}

async function callUser(socketId) {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(new RTCSessionDescription(offer));

  mySocket.emit("call-user", {
    offer,
    to: socketId
  });
}

function updateUserList(socketIds, id, count) {
  const activeUserContainer = document.getElementById("active-user-container");

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
    const alreadyExistingUser = document.getElementById(socketId);
    if (!alreadyExistingUser) {
      const userContainerEl = createUserItemContainer(socketId);

      activeUserContainer.appendChild(userContainerEl);
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

navigator.getUserMedia(
  { video: true, audio: true },
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
);

function init() {
  const socket = io();
  mySocket = socket;

  socket.on('connect', () => {
    // mySocket = socket.id;
  })

  socket.on("update-user-list", ({ users, id, count }) => {
    updateUserList(users, id, count);
  });

  socket.on('user-joined', function (id, count, clients) {
    clients.forEach(function (socketListId) {
      if (!connections[socketListId]) {
        connections[socketListId] = new RTCPeerConnection(peerConnectionConfig);
        //Wait for their ice candidate       
        connections[socketListId].onicecandidate = function () {
          if (event.candidate != null) {
            console.log('SENDING ICE');
            socket.emit('signal', socketListId, JSON.stringify({ 'ice': event.candidate }));
          }
        }

        //Wait for their video stream
        connections[socketListId].onaddstream = function () {
          gotRemoteStream(event, socketListId)
        }

        //Add the local video stream
        console.log(locVdo);
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

  socket.on("remove-user", ({ socketId }) => {
    const elToRemove = document.getElementById(socketId);

    if (elToRemove) {
      elToRemove.remove();
    }
  });

  socket.on('signal',(id, message) => {
    gotMessageFromServer(id,message);
  });

  socket.on("call-made", async data => {
    if (getCalled) {
      const confirmed = confirm(
        `User "Socket: ${data.socket}" wants to call you. Do accept this call?`
      );

      if (!confirmed) {
        socket.emit("reject-call", {
          from: data.socket
        });

        return;
      }
    }

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(data.offer)
    );
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(new RTCSessionDescription(answer));

    socket.emit("make-answer", {
      answer,
      to: data.socket
    });
    getCalled = true;
  });

  socket.on("answer-made", async data => {
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(data.answer)
    );

    if (!isAlreadyCalling) {
      callUser(data.socket);
      isAlreadyCalling = true;
    }
  });

  socket.on("call-rejected", data => {
    alert(`User: "Socket: ${data.socket}" rejected your call.`);
    unselectUsersFromList();
  });

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
  video.muted = true;
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