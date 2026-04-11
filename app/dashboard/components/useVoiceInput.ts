"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseVoiceInputOptions {
  onUtteranceComplete?: (transcript: string) => void;
  silenceTimeoutMs?: number;
}

interface UseVoiceInputReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  isSupported: boolean;
  error: string | null;
}

const SILENCE_RMS_THRESHOLD = 0.01;
const SILENCE_CHECK_INTERVAL_MS = 100;
const MIN_UTTERANCE_MS = 500;

export function useVoiceInput(options?: UseVoiceInputOptions): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recorderStartedAtRef = useRef<number>(0);
  const silenceStartRef = useRef<number | null>(null);
  const silenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intentionalStopRef = useRef<boolean>(false);
  const isListeningRef = useRef<boolean>(false);
  const isFlushingRef = useRef<boolean>(false);
  const onUtteranceCompleteRef = useRef<UseVoiceInputOptions["onUtteranceComplete"]>(
    options?.onUtteranceComplete,
  );
  const silenceTimeoutMsRef = useRef<number>(options?.silenceTimeoutMs ?? 2000);

  useEffect(() => {
    onUtteranceCompleteRef.current = options?.onUtteranceComplete;
  }, [options?.onUtteranceComplete]);

  useEffect(() => {
    silenceTimeoutMsRef.current = options?.silenceTimeoutMs ?? 2000;
  }, [options?.silenceTimeoutMs]);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasGetUserMedia =
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices !== "undefined" &&
      typeof navigator.mediaDevices.getUserMedia === "function";
    const hasMediaRecorder = typeof window.MediaRecorder !== "undefined";
    setIsSupported(hasGetUserMedia && hasMediaRecorder);
  }, []);

  const clearSilenceInterval = useCallback(() => {
    if (silenceIntervalRef.current) {
      clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
    silenceStartRef.current = null;
  }, []);

  const teardownAudioGraph = useCallback(() => {
    clearSilenceInterval();
    try {
      sourceRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    sourceRef.current = null;
    try {
      analyserRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    analyserRef.current = null;
    if (audioContextRef.current) {
      try {
        void audioContextRef.current.close();
      } catch {
        /* ignore */
      }
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, [clearSilenceInterval]);

  const postAudioForTranscription = useCallback(async (blob: Blob) => {
    const fd = new FormData();
    const ext = blob.type.includes("mp4")
      ? "mp4"
      : blob.type.includes("ogg")
        ? "ogg"
        : "webm";
    fd.append("audio", blob, `audio.${ext}`);

    const res = await fetch("/api/listings/transcribe", {
      method: "POST",
      body: fd,
    });

    if (!res.ok) {
      throw new Error(`Transcription failed with status ${res.status}`);
    }

    const data = (await res.json()) as { transcript?: string };
    return (data.transcript ?? "").trim();
  }, []);

  const startSilenceDetection = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buffer = new Uint8Array(analyser.fftSize);
    silenceStartRef.current = null;

    silenceIntervalRef.current = setInterval(() => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteTimeDomainData(buffer);
      // Compute RMS of signal, normalized to [-1, 1].
      let sumSquares = 0;
      for (let i = 0; i < buffer.length; i++) {
        const normalized = (buffer[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / buffer.length);

      const now = Date.now();
      const elapsedSinceStart = now - recorderStartedAtRef.current;

      if (rms < SILENCE_RMS_THRESHOLD) {
        if (silenceStartRef.current === null) {
          silenceStartRef.current = now;
        }
        const silentFor = now - silenceStartRef.current;
        if (
          silentFor >= silenceTimeoutMsRef.current &&
          elapsedSinceStart >= MIN_UTTERANCE_MS &&
          !isFlushingRef.current &&
          mediaRecorderRef.current?.state === "recording"
        ) {
          // Trigger flush by stopping the recorder — onstop handler will post audio.
          try {
            mediaRecorderRef.current.stop();
          } catch {
            /* ignore */
          }
        }
      } else {
        silenceStartRef.current = null;
      }
    }, SILENCE_CHECK_INTERVAL_MS);
  }, []);

  const startRecorder = useCallback(
    (stream: MediaStream) => {
      const mimeCandidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      let mimeType: string | undefined;
      for (const candidate of mimeCandidates) {
        if (
          typeof MediaRecorder !== "undefined" &&
          typeof MediaRecorder.isTypeSupported === "function" &&
          MediaRecorder.isTypeSupported(candidate)
        ) {
          mimeType = candidate;
          break;
        }
      }

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorderStartedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        const durationMs = Date.now() - recorderStartedAtRef.current;

        const shouldRestart = isListeningRef.current && !intentionalStopRef.current;

        if (chunks.length === 0 || durationMs < MIN_UTTERANCE_MS) {
          if (shouldRestart && streamRef.current) {
            startRecorder(streamRef.current);
          } else {
            setInterimTranscript("");
          }
          return;
        }

        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });

        isFlushingRef.current = true;
        setInterimTranscript("Transcribing…");

        try {
          const text = await postAudioForTranscription(blob);
          if (text) {
            setTranscript(text);
            onUtteranceCompleteRef.current?.(text);
            // Clear after firing so consumers see a transient value.
            setTranscript("");
          }
        } catch {
          setError("Transcription failed. Please try again.");
        } finally {
          isFlushingRef.current = false;
          setInterimTranscript("");

          // Restart the recorder for the next utterance if still listening.
          if (isListeningRef.current && !intentionalStopRef.current && streamRef.current) {
            startRecorder(streamRef.current);
          }
        }
      };

      mediaRecorderRef.current = recorder;
      try {
        recorder.start();
        if (isListeningRef.current) {
          setInterimTranscript("Recording…");
        }
      } catch {
        /* ignore */
      }
    },
    [postAudioForTranscription],
  );

  const startListening = useCallback(async () => {
    if (isListeningRef.current) return;
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof window.MediaRecorder === "undefined"
    ) {
      setError("Voice input is not supported in this browser.");
      return;
    }

    setError(null);
    setTranscript("");
    setInterimTranscript("");
    intentionalStopRef.current = false;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError("Microphone access denied. Please allow microphone access in your browser.");
      } else if (name === "NotFoundError") {
        setError("No microphone found. Please connect a microphone.");
      } else {
        setError("Could not access microphone.");
      }
      return;
    }

    streamRef.current = stream;

    try {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) {
        throw new Error("AudioContext unavailable");
      }
      const audioContext = new AudioCtor();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      analyserRef.current = analyser;
      source.connect(analyser);
    } catch {
      teardownAudioGraph();
      setError("Could not initialize audio analysis.");
      return;
    }

    setIsListening(true);
    isListeningRef.current = true;
    startRecorder(stream);
    startSilenceDetection();
  }, [startRecorder, startSilenceDetection, teardownAudioGraph]);

  const stopListening = useCallback(() => {
    if (!isListeningRef.current) return;
    intentionalStopRef.current = true;
    isListeningRef.current = false;
    setIsListening(false);
    clearSilenceInterval();

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      // Let the onstop handler flush the final utterance, then tear down.
      const originalOnStop = recorder.onstop;
      recorder.onstop = async (event) => {
        if (typeof originalOnStop === "function") {
          await originalOnStop.call(recorder, event);
        }
        teardownAudioGraph();
      };
      try {
        recorder.stop();
      } catch {
        teardownAudioGraph();
      }
    } else {
      teardownAudioGraph();
    }

    setInterimTranscript("");
  }, [clearSilenceInterval, teardownAudioGraph]);

  const resetTranscript = useCallback(() => {
    chunksRef.current = [];
    setTranscript("");
    setInterimTranscript("");
  }, []);

  useEffect(() => {
    return () => {
      intentionalStopRef.current = true;
      isListeningRef.current = false;
      clearSilenceInterval();
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state === "recording") {
        try {
          recorder.stop();
        } catch {
          /* ignore */
        }
      }
      teardownAudioGraph();
    };
  }, [clearSilenceInterval, teardownAudioGraph]);

  return {
    isListening,
    transcript,
    interimTranscript,
    startListening: () => {
      void startListening();
    },
    stopListening,
    resetTranscript,
    isSupported,
    error,
  };
}
