import { useEffect, useRef, useState } from "react";
import logo from "/assets/openai-logomark.svg";
import EventLog from "./EventLog";
import SessionControls from "./SessionControls";

// --- Session Update: Tool Configuration ---
const sessionUpdate = {
  type: "session.update",
  session: {
    tools: [
      {
        type: "function",
        name: "adjust_playback",
        description: "Rewind or fast-forward in a podcast a number of seconds.",
        parameters: {
          type: "object",
          strict: true,
          properties: {
            RewindBool: {
              type: "string",
              description: "Rewind is true, fast forward is false",
            },
            Seconds: {
              type: "string",
              description: "Number of Seconds",
            },
          },
          required: ["RewindBool", "Seconds"],
        },
      },
      {
        type: "function",
        name: "play_pause",
        description: "Play or pause.",
        parameters: {
          type: "object",
          strict: true,
          properties: {
            PauseBool: {
              type: "string",
              description: "Pause is true, play is false",
            },
          },
          required: ["PauseBool"],
        },
      },
    ],
    tool_choice: "auto",
  },
};


// --- ToolPanel Component ---
function ToolPanel({
  isSessionActive,
  sendClientEvent,
  events,
  adjustAudioPlayback,
  adjustAudioPlayPause,
}) {
  const [functionAdded, setFunctionAdded] = useState(false);
  const [functionCallOutput, setFunctionCallOutput] = useState(null);

  // Helper: Sends a "do not respond" event after a delay.
  const sendDoNotRespondEvent = () => {
    setTimeout(() => {
      sendClientEvent({
        type: "response.create",
        response: { instructions: "Do not respond." },
      });
    }, 500);
  };

  useEffect(() => {
    if (!events || events.length === 0) return;

    // Send session update once when the session is created.
    const oldestEvent = events[events.length - 1];
    if (!functionAdded && oldestEvent.type === "session.created") {
      sendClientEvent(sessionUpdate);
      setFunctionAdded(true);
    }

    // Process the latest event for function call responses.
    const latestEvent = events[0];
    if (latestEvent.type === "response.done" && latestEvent.response.output) {
      latestEvent.response.output.forEach((output) => {
        if (output.type === "function_call") {
          if (output.name === "adjust_playback") {
            setFunctionCallOutput(output);
            const { RewindBool, Seconds } = JSON.parse(output.arguments);
            if (adjustAudioPlayback) {
              adjustAudioPlayback(RewindBool, Seconds);
            }
            sendDoNotRespondEvent();
          } else if (output.name === "play_pause") {
            const { PauseBool } = JSON.parse(output.arguments);
            if (adjustAudioPlayPause) {
              adjustAudioPlayPause(PauseBool);
            }
            sendDoNotRespondEvent();
          }
        }
      });
    }
  }, [
    events,
    functionAdded,
    sendClientEvent,
    adjustAudioPlayback,
    adjustAudioPlayPause,
  ]);

  // Reset tool-related state when the session is no longer active.
  useEffect(() => {
    if (!isSessionActive) {
      setFunctionAdded(false);
      setFunctionCallOutput(null);
    }
  }, [isSessionActive]);

  return (
    <section className="h-[500px] w-full flex flex-col gap-4">
      <div className="h-full bg-gray-50 rounded-md p-4">
        <h2 className="text-lg font-bold">Playback Tool</h2>
        {isSessionActive ? (
          functionCallOutput ? (
            <FunctionCallOutput functionCallOutput={functionCallOutput} />
          ) : (
            <p>Thoughts on the playback adjustment...</p>
          )
        ) : (
          <p>Start the session to use this tool...</p>
        )}
      </div>
    </section>
  );
}

// --- Main App Component ---
export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [events, setEvents] = useState([]);
  const [dataChannel, setDataChannel] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const peerConnection = useRef(null);
  const audioElement = useRef(null); // For remote audio playback during a session.
  const testAudioRef = useRef(null); // For playing above-the-clouds.mp3 locally.

  // Start a session: set up the peer connection, media, and data channel.
  async function startSession() {
    try {
      // Get an ephemeral key from the server.
      const tokenResponse = await fetch("/token");
      const data = await tokenResponse.json();
      const EPHEMERAL_KEY = data.client_secret.value;

      // Create a new peer connection.
      const pc = new RTCPeerConnection();

      // Set up remote audio playback.
      audioElement.current = document.createElement("audio");
      audioElement.current.autoplay = true;
      pc.ontrack = (e) => {
        audioElement.current.srcObject = e.streams[0];
      };

      // Add local microphone audio.
      let mediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (error) {
        console.error("Error accessing microphone:", error);
        return;
      }
      pc.addTrack(mediaStream.getTracks()[0]);

      // Create a data channel for events.
      const dc = pc.createDataChannel("oai-events");
      setDataChannel(dc);

      // Create and set local SDP offer.
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const baseUrl = "https://api.openai.com/v1/realtime";
      const model = "gpt-4o-realtime-preview-2024-12-17";
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          "Content-Type": "application/sdp",
        },
      });

      const answer = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer);

      peerConnection.current = pc;
    } catch (err) {
      console.error("Error starting session:", err);
    }
  }

  // Stop the session: clean up the peer connection and data channel.
  function stopSession() {
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    setDataChannel(null);
    setIsSessionActive(false);
  }

  // Send an event to the remote endpoint via the data channel.
  function sendClientEvent(event) {
    if (dataChannel && dataChannel.readyState === "open") {
      dataChannel.send(JSON.stringify(event));
    }
  }

  // Send a text message event via the data channel.
  function sendTextMessage(text) {
    if (dataChannel && dataChannel.readyState === "open") {
      const event = { type: "text", text };
      dataChannel.send(JSON.stringify(event));
    }
  }

  // Adjust the playback time of the local audio based on parameters.
  function adjustAudioPlayback(RewindBool, seconds) {
    if (testAudioRef.current) {
      const currentTime = testAudioRef.current.currentTime;
      const adjustment = parseFloat(seconds);
      if (RewindBool === "true") {
        testAudioRef.current.currentTime = Math.max(currentTime - adjustment, 0);
      } else {
        testAudioRef.current.currentTime = currentTime + adjustment;
      }
    }
  }

  // Toggle play/pause on the local audio element.
  function adjustAudioPlayPause(PauseBool) {
    if (testAudioRef.current) {
      if (PauseBool === "true") {
        testAudioRef.current.pause();
        setIsPlaying(false);
      } else {
        testAudioRef.current.play();
        setIsPlaying(true);
      }
    }
  }

  // Set up data channel event listeners when the channel is available.
  useEffect(() => {
    if (dataChannel) {
      let wasPlayingBeforeSpeech = false;

      const handleMessage = (e) => {
        const event = JSON.parse(e.data);
        setEvents((prev) => [event, ...prev]);

        // When speech starts, pause the test audio.
        if (
          event.type === "input_audio_buffer.speech_started" &&
          testAudioRef.current
        ) {
          wasPlayingBeforeSpeech = !testAudioRef.current.paused;
          testAudioRef.current.pause();
          setIsPlaying(false);
        }

        // When speech stops, resume the test audio if it was playing.
        if (
          event.type === "output_audio_buffer.audio_stopped" &&
          testAudioRef.current &&
          wasPlayingBeforeSpeech
        ) {
          testAudioRef.current.play();
          setIsPlaying(true);
          wasPlayingBeforeSpeech = false;
        }
      };

      dataChannel.addEventListener("message", handleMessage);
      dataChannel.addEventListener("open", () => {
        setIsSessionActive(true);
        setEvents([]);
      });

      return () => {
        dataChannel.removeEventListener("message", handleMessage);
      };
    }
  }, [dataChannel]);

  return (
    <>
      <nav className="absolute top-0 left-0 right-0 h-16 flex items-center">
        <div className="flex items-center gap-4 w-full m-4 pb-2 border-b border-gray-200">
          <img style={{ width: "24px" }} src={logo} alt="OpenAI Logo" />
          <h1 className="text-lg font-bold">Walkman</h1>
        </div>
      </nav>
      <main className="absolute top-16 left-0 right-0 bottom-0">
        <section className="absolute top-0 left-0 right-[500px] bottom-0 flex">
          <section className="absolute top-0 left-0 right-0 bottom-32 px-4 overflow-y-auto">
            <EventLog events={events} />
          </section>
          <section className="absolute h-32 left-0 right-0 bottom-0 p-4">
            <SessionControls
              startSession={startSession}
              stopSession={stopSession}
              sendClientEvent={sendClientEvent}
              sendTextMessage={sendTextMessage}
              events={events}
              isSessionActive={isSessionActive}
            />
          </section>
        </section>
        <section className="absolute top-0 w-[500px] right-0 bottom-5 p-4 pt-0 overflow-y-auto">
          <ToolPanel
            sendClientEvent={sendClientEvent}
            events={events}
            isSessionActive={isSessionActive}
            adjustAudioPlayback={adjustAudioPlayback}
            adjustAudioPlayPause={adjustAudioPlayPause}
          />
          <div className="mt-4">
            <h2 className="text-lg font-bold">Playback Menu</h2>
          </div>
          <figure>
            <figcaption>Listen to the Recording:</figcaption>
            <audio
              ref={testAudioRef}
              controls
              src="/assets/above-the-clouds.mp3"
            />
          </figure>
        </section>
      </main>
    </>
  );
}
