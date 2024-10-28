import './App.css';
import { useRef, useEffect, useState, useCallback } from 'react'
import io from 'socket.io-client'

const socket = io('https://tetra-pleasant-utterly.ngrok-free.app/remote-ctrl', {
  path: '/socket.io',
  transports: ['websocket', 'polling']
})


// Socket connection logging
socket.on('connect', () => console.log('🟢 Socket connected! ID:', socket.id))
socket.on('disconnect', (reason) => console.log('🔴 Socket disconnected:', reason))
socket.on('connect_error', (error) => console.log('⚠️ Connection error:', error.message))

function App() {
  const videoRef = useRef()
  const rtcPeerConnection = useRef(new RTCPeerConnection({
    iceServers: [
      {
        urls: "stun:stun.cloudflare.com:3478",
        username: "g08602e91d453312ec8d8c16865e13921e87c06a5d140b66ad88c10c45459d3e",
        credential: "934e576d7fd9148d1d1eb82bd7e0b341cf842de18f77720dee6411e4c5957514"
      },
      {
        urls: "turn:turn.cloudflare.com:3478?transport=udp",
        username: "g08602e91d453312ec8d8c16865e13921e87c06a5d140b66ad88c10c45459d3e",
        credential: "934e576d7fd9148d1d1eb82bd7e0b341cf842de18f77720dee6411e4c5957514"
      },
      {
        urls: "turn:turn.cloudflare.com:3478?transport=tcp",
        username: "g08602e91d453312ec8d8c16865e13921e87c06a5d140b66ad88c10c45459d3e",
        credential: "934e576d7fd9148d1d1eb82bd7e0b341cf842de18f77720dee6411e4c5957514"
      },
      {
        urls: "turns:turn.cloudflare.com:5349?transport=tcp",
        username: "g08602e91d453312ec8d8c16865e13921e87c06a5d140b66ad88c10c45459d3e",
        credential: "934e576d7fd9148d1d1eb82bd7e0b341cf842de18f77720dee6411e4c5957514"
      }
    ]
  }))
  

  const [selectedScreen, _setSelectedScreen] = useState(1)
  const selectedScreenRef = useRef(selectedScreen)

  const setSelectedScreen = newSelectedScreen => {
    selectedScreenRef.current = newSelectedScreen
    _setSelectedScreen(newSelectedScreen)
  }

  const handleStream = useCallback((selectedScreen, _stream) => {
    console.log('🎥 Adding stream to peer connection')
    setSelectedScreen(selectedScreen)
    socket.emit('selectedScreen', selectedScreen)
    rtcPeerConnection.current.addStream(_stream)
  }, [])

  const getUserMedia = async (constraints) => {
    try {
      await navigator.mediaDevices.getUserMedia(constraints)
      const offerOptions = {
        offerToReceiveVideo: 1,
        offerToReceiveAudio: 0
      }
      const offer = await rtcPeerConnection.current.createOffer(offerOptions)
      await rtcPeerConnection.current.setLocalDescription(offer)
      console.log('📤 Sending offer')
      socket.emit('offer', offer)
    } catch (e) { 
      console.log('❌ getUserMedia error:', e) 
    }
  }

  useEffect(() => {
    // WebRTC connection state logging
    rtcPeerConnection.current.onconnectionstatechange = () => {
      console.log('🌐 WebRTC Connection State:', rtcPeerConnection.current.connectionState)
    }

    rtcPeerConnection.current.oniceconnectionstatechange = () => {
      console.log('❄️ ICE Connection State:', rtcPeerConnection.current.iceConnectionState)
    }

    rtcPeerConnection.current.onicegatheringstatechange = () => {
      console.log('🔍 ICE Gathering State:', rtcPeerConnection.current.iceGatheringState)
    }

    rtcPeerConnection.current.onsignalingstatechange = () => {
      console.log('📡 Signaling State:', rtcPeerConnection.current.signalingState)
    }

    const getStream = async (selectedScreen) => {
      try {
        console.log('🎥 Getting stream for screen:', selectedScreen)
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: selectedScreen.id,
              minWidth: 1712,
              maxWidth: 1712,
              minHeight: 963,
              maxHeight: 963
            }
          }
        })
        console.log('✅ Stream obtained:', stream.getVideoTracks()[0].getSettings())
        handleStream(selectedScreen, stream)
      } catch (e) {
        console.log('❌ Stream error:', e)
      }
    }
    

    (window.electronAPI && window.electronAPI.getScreenId((event, screenId) => {
      console.log('🖥️ Renderer received screenId:', screenId)
      getStream(screenId)
    })) || getUserMedia({ video: true, audio: false })

    socket.on('offer', offerSDP => {
      console.log('📥 Received offer')
      rtcPeerConnection.current.setRemoteDescription(
        new RTCSessionDescription(offerSDP)
      ).then(() => {
        rtcPeerConnection.current.createAnswer().then(sdp => {
          rtcPeerConnection.current.setLocalDescription(sdp)
          console.log('📤 Sending answer')
          socket.emit('answer', sdp)
        })
      })
    })

    socket.on('answer', answerSDP => {
      console.log('📥 Received answer')
      if (rtcPeerConnection.current.signalingState === "stable") {
        console.log('📡 Signaling state is stable, skipping answer')
        return
      }
      rtcPeerConnection.current.setRemoteDescription(
        new RTCSessionDescription(answerSDP)
      )
    })
    

    socket.on('icecandidate', icecandidate => {
      console.log('❄️ Adding ICE candidate')
      rtcPeerConnection.current.addIceCandidate(
        new RTCIceCandidate(icecandidate)
      )
    })

    rtcPeerConnection.current.onicecandidate = (e) => {
      if (e.candidate) {
        console.log('❄️ Sending ICE candidate')
        socket.emit('icecandidate', e.candidate)
      }
    }

    rtcPeerConnection.current.ontrack = (e) => {
      console.log('📺 Track received:', e.track.kind)
      videoRef.current.srcObject = e.streams[0]
      videoRef.current.onloadedmetadata = () => videoRef.current.play()
    }

    socket.on('selectedScreen', selectedScreen => {
      console.log('🖥️ Screen selection updated:', selectedScreen)
      setSelectedScreen(selectedScreen)
    })

  }, [handleStream])

  const handleMouseClick = (e) => {
    console.log('🖱️ Mouse click')
    socket.emit('mouse_click', {})
  }

  const handleMouseMove = ({clientX, clientY}) => {
    socket.emit('mouse_move', {
      clientX, clientY,
      clientWidth: window.innerWidth,
      clientHeight: window.innerHeight,
    })
  }

  return (
    <div className="App">
      <div
        style={{
          display: 'block',
          backgroundColor: 'black',
          margin: 0,
        }}
        onMouseMove={handleMouseMove}
        onClick={handleMouseClick}
      >
        <video ref={videoRef} className="video">video not available</video>
      </div>
    </div>
  );
}

export default App;
