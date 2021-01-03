/* -------------------------------------------------------------------------- */
/*                                    Vars                                    */
/* -------------------------------------------------------------------------- */

var isMuted;
var videoIsPaused;
var chatDataChanel = null;
const browserName = getBrowserName();
const url = window.location.href;
const roomHash = url.substring(url.lastIndexOf('/') + 1).toLowerCase();
var mode = 'camera';
const isWebRTCSupported =
  navigator.getUserMedia ||
  navigator.webkitGetUserMedia ||
  navigator.mozGetUserMedia ||
  navigator.msGetUserMedia ||
  window.RTCPeerConnection;

let remoteVideo1isPinned = false;
let remoteVideo2isPinned = false;

function creatUUID() {
  const url = URL.createObjectURL(new Blob());
  return url.substring(url.lastIndexOf('/') + 1);
}

function getCurrentUUID() {
  const existingCookie = getCookie('userid');
  if (existingCookie !== null) {
    return existingCookie;
  }
  const newCookie = creatUUID();
  setCookie('userid', newCookie, 1);
  return newCookie;
}

const currentUserId = getCurrentUUID();

/* -------------------------------------------------------------------------- */
/*                                Element vars                                */
/* -------------------------------------------------------------------------- */

const chatInput = document.querySelector('.compose input');
const remoteVideoVanilla = document.getElementById('remote-video');
const remoteVideo = $('#remote-video');
const localVideoContainer = $('#local-video');
const captionText = $('#remote-video-text');
const localVideoText = $('#local-video-text');
const captionButtontext = $('#caption-button-text');
const entireChat = $('#entire-chat');
const chatZone = $('#chat-zone');

const videoOnSVG = $('#video-on');
const videoOffSVG = $('#video-off');

const micOnSVG = $('#mic-on');
const micOffSVG = $('#mic-off');

const screenShareOnSVG = $('#screenshare-on');
const screenShareOffSVG = $('#screenshare-off');

const micTooltip = $('#mic-tooltip');
const videoTooltip = $('#video-tooltip');
const screenshareTooltip = $('#screenshare-tooltip');

const inputSelectModal = $('#input-select-modal');
const inputSelectModalCloseButton = $('#input-select-modal-close');

const localVideo = $('#local-video');
const remoteVideoContainer1 = $('#remote-video-1-container');
const remoteVideoContainer2 = $('#remote-video-2-container');

const maximizeRemoteVideo1SVG = $('#maximize-video-1');
const minimizeRemoteVideo1SVG = $('#minimize-video-1');

const maximizeRemoteVideo2SVG = $('#maximize-video-2');
const minimizeRemoteVideo2SVG = $('#minimize-video-2');

const screenshareButtonContainer = $('#screenshare-button-container');

/* -------------------------------------------------------------------------- */
/*                                    State                                   */
/* -------------------------------------------------------------------------- */

var VideoChat = {
  connected: [],
  willInitiateCall: false,
  localICECandidates: [],
  peerConnection: [],
  socket: io(),
  remoteVideoConnectionId: null,
  remoteVideoConnection2Id: null,
  remoteVideo: document.getElementById('remote-video-1'),
  remoteVideo2: document.getElementById('remote-video-2'),
  localVideo: document.getElementById('local-video'),
  recognition: undefined,

  // Call to getUserMedia (provided by adapter.js for cross browser compatibility)
  // asking for access to both the video and audio streams. If the request is
  // accepted callback to the onMediaStream function, otherwise callback to the
  // noMediaStream function.
  requestMediaStream: function (event) {
    logIt('requestMediaStream');
    // rePositionLocalVideo();
    navigator.mediaDevices
      .getUserMedia({
        video: true,
        audio: true,
      })
      .then((stream) => {
        VideoChat.onMediaStream(stream);
        localVideoText.text('');
        // Calling this from mediadevices.js
        reloadDeviceOptions();
      })
      .catch((error) => {
        logIt(error);
        logIt('Failed to get local webcam video, check webcam privacy settings');
        navigator.mediaDevices
          .getUserMedia({
            video: false,
            audio: true,
          })
          .then((stream) => {
            VideoChat.onMediaStream(stream);
            localVideoText.text('');
            // Calling this from mediadevices.js
            reloadDeviceOptions();
          })
          .catch((error) => {
            logIt(error);
            logIt('Failed to get fallback device. Seems like no device is available.');
          });
      });
  },

  // Called when a video stream is added to VideoChat
  onMediaStream: function (stream) {
    logIt('onMediaStream');
    // Add the stream as video's srcObject.
    // Now that we have webcam video sorted, prompt user to share URL
    Snackbar.show({
      text: `Here is the join link for your call: <br/>` + url,
      actionText: 'Copy Link',
      width: '750px',
      pos: 'top-center',
      actionTextColor: '#ffffff',
      duration: 500000,
      backgroundColor: '#16171a',
      onActionClick: function (element) {
        // Copy url to clipboard, this is achieved by creating a temporary element,
        // adding the text we want to that element, selecting it, then deleting it
        var copyContent = window.location.href;
        $('<input id="some-element">').val(copyContent).appendTo('body').select();
        document.execCommand('copy');
        var toRemove = document.querySelector('#some-element');
        toRemove.parentNode.removeChild(toRemove);
        Snackbar.close();
      },
    });
    VideoChat.localVideo.srcObject = stream;
    // VideoChat.remoteVideo.srcObject = stream;
    // VideoChat.remoteVideo2.srcObject = stream;
    // Now we're ready to join the chat room.
    VideoChat.socket.emit('join', { room: roomHash, userId: currentUserId });
    // Add listeners to the websocket
    VideoChat.socket.on('full', chatRoomFull);
    VideoChat.socket.on('offer', VideoChat.onOffer);
    VideoChat.socket.on('joined', VideoChat.someoneJoined);
    VideoChat.socket.on('willInitiateCall', () => (VideoChat.willInitiateCall = true));
  },

  someoneJoined: function (event) {
    const { userId } = event;
    console.log(`someone joined: ${userId}`);
    if (userId === currentUserId) {
      console.log('someone joined but is self');
      return;
    }
    console.warn(userId, VideoChat.remoteVideoConnectionId, VideoChat.remoteVideoConnection2Id);

    VideoChat.socket.once(
      'token',
      VideoChat.onToken(userId, () => VideoChat.createOffer(userId))
    );
    VideoChat.socket.emit('token', { room: roomHash, userId: currentUserId });
  },

  // When we receive the ephemeral token back from the server.
  onToken: function (toId, callback) {
    logIt('onToken');
    return function (token) {
      if (token.toId !== currentUserId) {
        console.log(`not responding to token ${token.toId}`);
        return;
      }
      // if (VideoChat.peerConnection[]) {
      //   console.log(`not responding to token ${token.toId}`);
      //   return
      // }
      logIt(`<<< Received token ${token.toId}`);
      // Set up a new RTCPeerConnection using the token's iceServers.
      VideoChat.peerConnection[toId] = new RTCPeerConnection({
        iceServers: token.iceServers,
      });
      // Add the local video stream to the peerConnection.
      VideoChat.localVideo.srcObject.getTracks().forEach(function (track) {
        VideoChat.peerConnection[toId].addTrack(track, VideoChat.localVideo.srcObject);
      });
      // // Add general purpose data channel to peer connection,
      // // used for text chats, captions, and toggling sending captions
      // dataChanel = VideoChat.peerConnection[toId].createDataChannel('chat', {
      //   negotiated: true,
      //   // both peers must have same id
      //   id: 0,
      // });
      // // Called when dataChannel is successfully opened
      // dataChanel.onopen = function (event) {
      //   logIt('dataChannel opened');
      // };
      // // Handle different dataChannel types
      // dataChanel.onmessage = function (event) {
      //   const receivedData = event.data;
      //   // First 4 chars represent data type
      //   const dataType = receivedData.substring(0, 4);
      //   const cleanedMessage = receivedData.slice(4);
      //   if (dataType === 'mes:') {
      //     handleRecieveMessage(cleanedMessage);
      //   } else if (dataType === 'cap:') {
      //     recieveCaptions(cleanedMessage);
      //   } else if (dataType === 'tog:') {
      //     toggleSendCaptions();
      //   }
      // };
      // Set up callbacks for the connection generating iceCandidates or
      // receiving the remote media stream.
      VideoChat.peerConnection[toId].onicecandidate = (event) => VideoChat.onIceCandidate(event, toId);
      VideoChat.peerConnection[toId].onaddstream = (event) => VideoChat.onAddStream(event, toId);
      // Set up listeners on the socket
      VideoChat.socket.on('candidate', VideoChat.onCandidate);
      VideoChat.socket.on('answer', VideoChat.onAnswer);
      VideoChat.socket.on('requestToggleCaptions', () => toggleSendCaptions());
      VideoChat.socket.on('recieveCaptions', (captions) => recieveCaptions(captions));
      // Called when there is a change in connection state
      VideoChat.peerConnection[toId].oniceconnectionstatechange = function (event) {
        switch (VideoChat.peerConnection[toId].iceConnectionState) {
          case 'connected':
            logIt('connected');
            // @TODO: Do we need to continue to be connected to reload users
            // @TODO: Can we disconnect after everyone has joined the call?
            // Once connected we no longer have a need for the signaling server, so disconnect
            // VideoChat.socket.disconnect();
            break;
          case 'disconnected':
            if (toId === VideoChat.remoteVideoConnectionId) {
              VideoChat.remoteVideo.srcObject = null;
              VideoChat.remoteVideoConnectionId = null;
              remoteVideoContainer1.hide();
            } else {
              VideoChat.remoteVideo2.srcObject = null;
              VideoChat.remoteVideoConnection2Id = null;
              remoteVideoContainer2.hide();
            }
            logIt('disconnected');
            VideoChat.connected[toId] = false
            break;
          case 'failed':
            // @TODO: fix failed getting called after disconnected
            logIt('failed');
            // VideoChat.socket.connect
            // VideoChat.createOffer();
            // Refresh page if connection has failed
            // location.reload();
            VideoChat.connected[toId] = false
            break;
          case 'closed':
            logIt('closed');
            break;
        }
      };
      callback();
    };
  },

  // When the peerConnection generates an ice candidate, send it over the socket to the peer.
  onIceCandidate: function (event, toId) {
    logIt('onIceCandidate');
    if (event.candidate) {
      logIt(`<<< Received local ICE candidate from STUN/TURN server (${event.candidate.address})`);
      if (VideoChat.connected[toId]) {
        logIt(`>>> Sending local ICE candidate (${event.candidate.address})`);
        VideoChat.socket.emit(
          'candidate',
          JSON.stringify({
            candidate: event.candidate,
            toId,
            fromId: currentUserId,
          }),
          roomHash
        );
      } else {
        // If we are not 'connected' to the other peer, we are buffering the local ICE candidates.
        // This most likely is happening on the "caller" side.
        // The peer may not have created the RTCPeerConnection yet, so we are waiting for the 'answer'
        // to arrive. This will signal that the peer is ready to receive signaling.
        VideoChat.localICECandidates.push(event.candidate);
      }
    }
  },

  // When receiving a candidate over the socket, turn it back into a real
  // RTCIceCandidate and add it to the peerConnection.
  onCandidate: function (response) {
    const { candidate, fromId, toId } = JSON.parse(response);
    if (toId !== currentUserId) {
      return;
    }
    // Update caption text
    captionText.text('Found other user... connecting');
    const rtcCandidate = new RTCIceCandidate(candidate);
    logIt(`onCandidate <<< Received remote ICE candidate (${rtcCandidate.address} - ${rtcCandidate.relatedAddress})`);
    VideoChat.peerConnection[fromId].addIceCandidate(rtcCandidate);
  },

  // Create an offer that contains the media capabilities of the browser.
  createOffer: function (socketId) {
    logIt('createOffer >>> Creating offer...');
    VideoChat.peerConnection[socketId].createOffer(
      function (offer) {
        // If the offer is created successfully, set it as the local description
        // and send it over the socket connection to initiate the peerConnection
        // on the other side.
        VideoChat.peerConnection[socketId].setLocalDescription(offer);
        VideoChat.socket.emit(
          'offer',
          JSON.stringify({
            offer,
            fromId: currentUserId,
            toId: socketId,
          }),
          roomHash
        );
      },
      function (err) {
        logIt('failed offer creation');
        logIt(err, true);
      }
    );
  },

  // When a browser receives an offer, set up a callback to be run when the
  // ephemeral token is returned from Twilio.
  onOffer: function (response) {
    const { offer, fromId, toId } = JSON.parse(response);
    if (toId !== currentUserId) {
      console.warn('onoffer toid does not equal currentuserid');
      return;
    }
    logIt('onOffer <<< Received offer');
    if (VideoChat.peerConnection[fromId]) {
      console.warn('already connected to peer');
      return;
    }
    VideoChat.socket.once('token', VideoChat.onToken(fromId, VideoChat.createAnswer({ offer, toId: fromId })));
    VideoChat.socket.emit('token', { room: roomHash, userId: currentUserId });
  },

  // Create an answer with the media capabilities that both browsers share.
  // This function is called with the offer from the originating browser, which
  // needs to be parsed into an RTCSessionDescription and added as the remote
  // description to the peerConnection object. Then the answer is created in the
  // same manner as the offer and sent over the socket.
  createAnswer: function ({ offer, toId }) {
    logIt('createAnswer');
    return function () {
      logIt('>>> Creating answer...');
      rtcOffer = new RTCSessionDescription(offer);
      VideoChat.peerConnection[toId].setRemoteDescription(rtcOffer);
      VideoChat.peerConnection[toId].createAnswer(
        function (answer) {
          VideoChat.peerConnection[toId].setLocalDescription(answer);
          VideoChat.socket.emit('answer', JSON.stringify({ answer, fromId: currentUserId, toId }), roomHash);
        },
        function (err) {
          logIt('Failed answer creation.');
          logIt(err, true);
        }
      );
    };
  },

  // When an answer is received, add it to the peerConnection as the remote description.
  onAnswer: function (response) {
    const { answer, fromId, toId } = JSON.parse(response);

    if (toId !== currentUserId) {
      console.warn(`toId not for me toid: ${toId} fromid: ${fromId}`);
      return;
    }
    if (VideoChat.peerConnection[fromId].remoteDescription) {
      console.warn(`already a remote description`);
      return;
    }

    logIt('onAnswer <<< Received answer');
    logIt(`onAnswer fromId: ${fromId}, toId: ${toId}`);
    var rtcAnswer = new RTCSessionDescription(answer);
    // Set remote description of RTCSession
    VideoChat.peerConnection[fromId].setRemoteDescription(rtcAnswer);
    // The caller now knows that the callee is ready to accept new ICE candidates, so sending the buffer over
    VideoChat.localICECandidates.forEach((candidate) => {
      // logIt(`>>> Sending local ICE candidate (${candidate.address})`);
      // Send ice candidate over websocket
      VideoChat.socket.emit(
        'candidate',
        JSON.stringify({
          candidate,
          fromId: currentUserId,
          toId: fromId,
        }),
        roomHash
      );
    });
    // Reset the buffer of local ICE candidates. This is not really needed, but it's good practice
    // VideoChat.localICECandidates = [];
  },

  // Called when a stream is added to the peer connection
  onAddStream: function (event, id) {
    console.log(`on add stream ${event.stream}, ${id}`);
    console.log(VideoChat.remoteVideoConnectionId);
    console.log(VideoChat.remoteVideoConnectionId2);
    if (id === VideoChat.remoteVideoConnectionId) {
      VideoChat.remoteVideo.srcObject = event.stream;
      return;
    } else if (id === VideoChat.remoteVideoConnection2Id) {
      VideoChat.remoteVideo2.srcObject = event.stream;
      return;
    }

    logIt('onAddStream <<< Received new stream from remote. Adding it...');
    if (VideoChat.remoteVideo.srcObject !== null && VideoChat.remoteVideo.srcObject !== undefined) {
      logIt('connect remote video 2');
      VideoChat.remoteVideoConnection2Id = id;
      VideoChat.remoteVideo2.srcObject = event.stream;
      VideoChat.remoteVideo2.style.background = 'none';
      remoteVideoContainer2.show();
      VideoChat.connected[id] = true;
      return;
    }
    logIt('connect remote video 1');
    VideoChat.remoteVideoConnectionId = id;
    // Update remote video source
    VideoChat.remoteVideo.srcObject = event.stream;
    // Close the initial share url snackbar
    Snackbar.close();
    // Remove the loading gif from video
    VideoChat.remoteVideo.style.background = 'none';
    remoteVideoContainer1.show();
    // Update connection status
    VideoChat.connected[id] = true;
    // Hide caption status text
    // captionText.fadeOut();
    // Reposition local video after a second, as there is often a delay
    // between adding a stream and the height of the video div changing
    // setTimeout(() => rePositionLocalVideo(), 500);
    // var timesRun = 0;
    // var interval = setInterval(function () {
    //   timesRun += 1;
    //   if (timesRun === 10) {
    //     clearInterval(interval);
    //   }
    //   rePositionLocalVideo();
    // }, 300);
  },
};

// Get name of browser session using user agent
function getBrowserName() {
  var name = 'Unknown';
  if (window.navigator.userAgent.indexOf('MSIE') !== -1) {
  } else if (window.navigator.userAgent.indexOf('Firefox') !== -1) {
    name = 'Firefox';
  } else if (window.navigator.userAgent.indexOf('Opera') !== -1) {
    name = 'Opera';
  } else if (window.navigator.userAgent.indexOf('Chrome') !== -1) {
    name = 'Chrome';
  } else if (window.navigator.userAgent.indexOf('Safari') !== -1) {
    name = 'Safari';
  }
  return name;
}

// Basic logging class wrapper
function logIt(message, error) {
  console.log(message, `id: ${currentUserId}`);
}

// Called when socket receives message that room is full
function chatRoomFull() {
  alert("Chat room is full. Check to make sure you don't have multiple open tabs, or try with a new room link");
  // Exit room and redirect
  window.location.href = '/newcall';
}

// Reposition local video to top left of remote video
// function rePositionLocalVideo() {
//   // Get position of remote video
//   var bounds = remoteVideo.position();
//   let localVideo = $('#local-video');
//   if (
//     /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
//       navigator.userAgent
//     )
//   ) {
//     bounds.top = $(window).height() * 0.7;
//     bounds.left += 10;
//   } else {
//     bounds.top += 10;
//     bounds.left += 10;
//   }
//   // Set position of local video
//   $('#moveable').css(bounds);
// }

// Reposition captions to bottom of video
// function rePositionCaptions() {
//   // Get remote video position
//   var bounds = remoteVideo.position();
//   bounds.top -= 10;
//   bounds.top = bounds.top + remoteVideo.height() - 1 * captionText.height();
//   // Reposition captions
//   captionText.css(bounds);
// }

// Fullscreen
// function openFullscreen() {
//   try {
//     // var elem = document.getElementById("remote-video");
//     var elem = document.getElementById("body");
//     if (!isFullscreen) {
//       VideoChat.remoteVideo.classList.add("fullscreen");
//       isFullscreen = true;
//       if (elem.requestFullscreen) {
//         elem.requestFullscreen();
//       } else if (elem.mozRequestFullScreen) {
//         /* Firefox */
//         elem.mozRequestFullScreen();
//       } else if (elem.webkitRequestFullscreen) {
//         /* Chrome, Safari and Opera */
//
//         elem.webkitRequestFullscreen();
//         setTimeout(windowResized, 1000);
//       } else if (elem.msRequestFullscreen) {
//         /* IE/Edge */
//         elem.msRequestFullscreen();
//       }
//     } else {
//       isFullscreen = false;
//       VideoChat.remoteVideo.classList.remove("fullscreen");
//       if (document.exitFullscreen) {
//         document.exitFullscreen();
//       } else if (document.mozCancelFullScreen) {
//         /* Firefox */
//         document.mozCancelFullScreen();
//       } else if (document.webkitExitFullscreen) {
//         /* Chrome, Safari and Opera */
//         document.webkitExitFullscreen();
//       } else if (document.msExitFullscreen) {
//         /* IE/Edge */
//         document.msExitFullscreen();
//       }
//     }
//   } catch (e) {
//     logIt(e);
//   }
//   setTimeout(windowResized, 1000);
// }
// End Fullscreen

/* -------------------------------------------------------------------------- */
/*                               Toolbox actions                              */
/* -------------------------------------------------------------------------- */

function muteMicrophone() {
  isMuted = !isMuted;

  const connections = VideoChat.peerConnection;

  for (const key of Object.keys(VideoChat.peerConnection)) {
    const connection = VideoChat.peerConnection[key];
    var audioTrack = null;
    connection.getSenders().find(function (s) {
      if (s.track.kind === 'audio') {
        audioTrack = s.track;
      }
    });
    audioTrack.enabled = !isMuted;
  }

  // Update mute button text and icon
  const muteText = isMuted ? 'Unmute' : 'Mute';
  micTooltip.text(muteText);

  if (isMuted) {
    micOffSVG.show();
    micOnSVG.hide();
  } else {
    micOffSVG.hide();
    micOnSVG.show();
  }
}

function pauseVideo() {
  videoIsPaused = !videoIsPaused;

  const connections = VideoChat.peerConnection;
  for (const key of Object.keys(VideoChat.peerConnection)) {
    const connection = VideoChat.peerConnection[key];
    var videoTrack = null;
    // Get video track to pause
    connection.getSenders().find(function (s) {
      if (s.track.kind === 'video') {
        videoTrack = s.track;
      }
    });
    videoTrack.enabled = !videoIsPaused;
  }

  const text = videoIsPaused ? 'Unpause Video' : 'Pause Video';
  videoTooltip.text(text);

  if (videoIsPaused) {
    localVideoContainer.hide();
    videoOffSVG.show();
    videoOnSVG.hide();
  } else {
    localVideoContainer.show();
    videoOffSVG.hide();
    videoOnSVG.show();
  }
}

function changeDisplayModeTo(newMode) {
  mode = newMode;
  if (newMode === 'camera') {
    screenShareOnSVG.show();
    screenShareOffSVG.hide();
    screenshareTooltip.text('Share Screen');
  } else {
    screenShareOnSVG.hide();
    screenShareOffSVG.show();
    screenshareTooltip.text('Share Camera');
  }
}

// Swap camera / screen share
function screenshare() {
  // If mode is camera then switch to screen share
  if (mode === 'camera') {
    // Request screen share, note we don't want to capture audio
    // as we already have the stream from the Webcam
    navigator.mediaDevices
      .getDisplayMedia({
        video: true,
        audio: false,
      })
      .then(function (stream) {
        // // Close allow screenshare snackbar
        // Snackbar.close();
        changeDisplayModeTo('screen');
        swapVideoStream(stream);
      })
      .catch(function (err) {
        logIt(err);
        logIt('Error sharing screen');
        // Snackbar.close();
      });
  } else {
    navigator.mediaDevices
      .getUserMedia({
        video: true,
        audio: true,
      })
      .then(function (stream) {
        changeDisplayModeTo('camera');
        swapVideoStream(stream);
      });
  }
}

function toggleSettingsModal() {
  if (inputSelectModal.is(':visible')) {
    inputSelectModal.hide();
  } else {
    inputSelectModal.show();
  }
}

function pinVideo1() {
  console.log("here");
  if (remoteVideo1isPinned) {
    remoteVideoContainer1.show();
    if (VideoChat.remoteVideoConnection2Id != null) {
      remoteVideoContainer2.show();
    }
    localVideo.show();

    maximizeRemoteVideo1SVG.show();
    minimizeRemoteVideo1SVG.hide();
  } else {
    remoteVideoContainer1.show();
    remoteVideoContainer2.hide();
    localVideo.hide();

    maximizeRemoteVideo1SVG.hide();
    minimizeRemoteVideo1SVG.show();
  }
  remoteVideo1isPinned = !remoteVideo1isPinned;
}

function pinVideo2() {
  if (remoteVideo2isPinned) {
    remoteVideoContainer1.show();
    if (VideoChat.remoteVideoConnection2Id != null) {
      remoteVideoContainer2.show();
    }
    localVideo.show();

    maximizeRemoteVideo2SVG.show();
    minimizeRemoteVideo2SVG.hide();
  } else {
    remoteVideoContainer1.show();
    remoteVideoContainer2.hide();
    localVideo.hide();

    maximizeRemoteVideo2SVG.hide();
    minimizeRemoteVideo2SVG.show();
  }
  remoteVideo2isPinned = !remoteVideo2isPinned;
}

/* -------------------------------------------------------------------------- */
/*                                  Text Chat                                 */
/* -------------------------------------------------------------------------- */

// Add text message to chat screen on page
// function addMessageToScreen(msg, isOwnMessage) {
//   if (isOwnMessage) {
//     $('.chat-messages').append(
//       '<div class="message-item customer cssanimation fadeInBottom"><div class="message-bloc"><div class="message">' +
//         msg +
//         '</div></div></div>'
//     );
//   } else {
//     $('.chat-messages').append(
//       '<div class="message-item moderator cssanimation fadeInBottom"><div class="message-bloc"><div class="message">' +
//         msg +
//         '</div></div></div>'
//     );
//   }
// }

// Listen for enter press on chat input
// chatInput.addEventListener('keypress', function (event) {
//   if (event.keyCode === 13) {
//     // Prevent page refresh on enter
//     event.preventDefault();
//     var msg = chatInput.value;
//     // Prevent cross site scripting
//     msg = msg.replace(/</g, '&lt;').replace(/>/g, '&gt;');
//     // Make links clickable
//     msg = msg.autoLink();
//     // Send message over data channel
//     dataChanel.send('mes:' + msg);
//     // Add message to screen
//     addMessageToScreen(msg, true);
//     // Auto scroll chat down
//     chatZone.scrollTop(chatZone[0].scrollHeight);
//     // Clear chat input
//     chatInput.value = '';
//   }
// });

// // Called when a message is recieved over the dataChannel
// function handleRecieveMessage(msg) {
//   // Add message to screen
//   addMessageToScreen(msg, false);
//   // Auto scroll chat down
//   chatZone.scrollTop(chatZone[0].scrollHeight);
//   // Show chat if hidden
//   if (entireChat.is(':hidden')) {
//     toggleChat();
//   }
// }

// // Show and hide chat
// function toggleChat() {
//   var chatIcon = document.getElementById('chat-icon');
//   var chatText = $('#chat-text');
//   if (entireChat.is(':visible')) {
//     entireChat.fadeOut();
//     // Update show chat buttton
//     chatText.text('Show Chat');
//     chatIcon.classList.remove('fa-comment-slash');
//     chatIcon.classList.add('fa-comment');
//   } else {
//     entireChat.fadeIn();
//     // Update show chat buttton
//     chatText.text('Hide Chat');
//     chatIcon.classList.remove('fa-comment');
//     chatIcon.classList.add('fa-comment-slash');
//   }
// }
// End Text chat

/* -------------------------------------------------------------------------- */
/*                                Device select                               */
/* -------------------------------------------------------------------------- */

function swapVideoStream(stream) {
  VideoChat.localVideo.srcObject.getVideoTracks().forEach((track) => track.stop());
  // Get current video track
  let videoTrack = stream.getVideoTracks()[0];
  // Add listen for if the current track swaps, swap back
  // NOTE: this happens when user stops sharing stream
  videoTrack.onended = function () {
    screenshare()
  };
  // if (VideoChat.connected) {
  for (const key of Object.keys(VideoChat.peerConnection)) {
    const connection = VideoChat.peerConnection[key];
    // Find sender
    const sender = connection.getSenders().find(function (s) {
      // make sure tack types match
      return s.track.kind === videoTrack.kind;
    });
    // Replace sender track
    sender.replaceTrack(videoTrack);
  }
  videoTrack.enabled = !videoIsPaused;
  // }
  // Update local video object
  VideoChat.localVideo.srcObject = stream;
}

$('#availableVideoInput').change(function () {
  const value = $('#availableVideoInput').val();
  getVideoDeviceById(value)
    .then((stream) => swapVideoStream(stream))
    .catch((error) => console.error(error));
});

function swapAudioStream(stream) {
  VideoChat.localVideo.srcObject.getAudioTracks().forEach((track) => track.stop());
  const audioTrack = stream.getAudioTracks()[0];
  // if (VideoChat.connected) {
  for (const key of Object.keys(VideoChat.peerConnection)) {
    const connection = VideoChat.peerConnection[key];
    // Find sender
    const sender = connection.getSenders().find(function (s) {
      // make sure tack types match
      return s.track.kind === audioTrack.kind;
    });
    // Replace sender track
    sender.replaceTrack(audioTrack);
  }
  audioTrack.enabled = !isMuted;
  // }
}

$('#availableAudioInput').change(function () {
  const value = $('#availableAudioInput').val();
  getAudioDeviceById(value)
    .then((stream) => swapAudioStream(stream))
    .catch((error) => console.error(error));
});

/* -------------------------------------------------------------------------- */
/*                                    Init                                    */
/* -------------------------------------------------------------------------- */

function init() {
  //  Try and detect in-app browsers and redirect
  var ua = navigator.userAgent || navigator.vendor || window.opera;
  if (
    DetectRTC.isMobileDevice &&
    (ua.indexOf('FBAN') > -1 || ua.indexOf('FBAV') > -1 || ua.indexOf('Instagram') > -1)
  ) {
    if (DetectRTC.osName === 'iOS') {
      window.location.href = '/notsupportedios';
    } else {
      window.location.href = '/notsupported';
    }
  }

  // Redirect all iOS browsers that are not Safari
  if (DetectRTC.isMobileDevice) {
    if (DetectRTC.osName === 'iOS' && !DetectRTC.browser.isSafari) {
      // window.location.href = '/notsupportedios';
    }
  }

  if (!isWebRTCSupported || browserName === 'MSIE') {
    window.location.href = '/notsupported';
  }

  // Set tab title
  document.title = 'Ring Upp - ' + url.substring(url.lastIndexOf('/') + 1);

  // get webcam on load
  VideoChat.requestMediaStream();

  // Captions hidden by default
  // captionText.text('').fadeOut();

  // Make local video draggable
  // $('#moveable').draggable({ containment: 'window' });

  // Hide button labels on load
  // $('.HoverState').hide();

  // Text chat hidden by default
  // entireChat.hide();

  // Show hide button labels on hover
  $(document).ready(function () {
    $('.hoverButton').mouseover(function () {
      $('.HoverState').hide();
      $(this).next().show();
    });
    $('.hoverButton').mouseout(function () {
      $('.HoverState').hide();
    });
  });

  // Fade out / show UI on mouse move
  $(document).mouseleave(function () {
    if ($('#header').is(':visible')) {
      // @TODO: disabled for design purposes
      $('#header').fadeOut();
      $('#toolbox').fadeOut();
    }
  });

  $(document).click(function () {
    if (DetectRTC.isMobileDevice) {
      if ($('#header').is(':hidden')) {
        $('#header').fadeIn();
        $('#toolbox').fadeIn();

        setTimeout(() => {
          $('#header').fadeOut();
          $('#toolbox').fadeOut();
        }, 8000);
      }
    }
  });

  $(document).mouseover(function () {
    if ($('#header').is(':hidden')) {
      $('#header').fadeIn();
      $('#toolbox').fadeIn();
    }
  });

  if (DetectRTC.isMobileDevice) {
    setTimeout(() => {
      $('#header').fadeOut();
      $('#toolbox').fadeOut();
    }, 8000);

    screenshareButtonContainer.hide()
  }

  // Show accept webcam snackbar
  Snackbar.show({
    text: 'Please allow microphone and webcam access',
    actionText: 'Show Me How',
    width: '455px',
    pos: 'top-right',
    actionTextColor: '#ffffff',
    duration: 50000,
    onActionClick: function (element) {
      window.open(
        'https://getacclaim.zendesk.com/hc/en-us/articles/360001547832-Setting-the-default-camera-on-your-browser',
        '_blank'
      );
    },
  });

  // Set caption text on start
  captionText.text('Waiting for other user to join...').fadeIn();

  // Reposition captions on start
  // rePositionCaptions();

  // On change media devices refresh page and switch to system default
  // navigator.mediaDevices.ondevicechange = () => window.location.reload();
}

init();
