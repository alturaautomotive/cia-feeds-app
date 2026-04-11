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

export function useVoiceInput(options?: UseVoiceInputOptions): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef<string>("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUtteranceCompleteRef = useRef<UseVoiceInputOptions["onUtteranceComplete"]>(
    options?.onUtteranceComplete,
  );
  const silenceTimeoutMsRef = useRef<number>(options?.silenceTimeoutMs ?? 2000);
  const isListeningRef = useRef<boolean>(false);
  const intentionalStopRef = useRef<boolean>(false);

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
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let finalAppend = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalAppend += text;
        } else {
          interim += text;
        }
      }
      if (finalAppend) {
        finalTranscriptRef.current =
          (finalTranscriptRef.current ? finalTranscriptRef.current + " " : "") + finalAppend.trim();
        setTranscript(finalTranscriptRef.current);
      }
      setInterimTranscript(interim);

      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null;
        const text = finalTranscriptRef.current.trim();
        if (!text) return;
        finalTranscriptRef.current = "";
        setTranscript("");
        setInterimTranscript("");
        onUtteranceCompleteRef.current?.(text);
      }, silenceTimeoutMsRef.current);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone access denied. Please allow microphone access in your browser.");
        intentionalStopRef.current = true;
      } else if (event.error === "no-speech") {
        // Silently ignore — continuous mode can recover.
      } else if (event.error === "audio-capture") {
        setError("No microphone found. Please connect a microphone.");
        intentionalStopRef.current = true;
      } else if (event.error === "aborted") {
        // User-initiated stop; not a real error.
        intentionalStopRef.current = true;
      } else {
        setError(`Voice input error: ${event.error}`);
        intentionalStopRef.current = true;
      }
    };

    recognition.onend = () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      // Flush any remaining transcript before deciding whether to restart.
      const leftover = finalTranscriptRef.current.trim();
      if (leftover) {
        finalTranscriptRef.current = "";
        setTranscript("");
        setInterimTranscript("");
        onUtteranceCompleteRef.current?.(leftover);
      }

      // If the user hasn't intentionally stopped, the browser may have
      // auto-ended the session. Attempt to restart transparently.
      if (isListeningRef.current && !intentionalStopRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          // Fall through to fully stopping.
        }
      }

      intentionalStopRef.current = false;
      setIsListening(false);
      setInterimTranscript("");
    };

    recognitionRef.current = recognition;

    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      intentionalStopRef.current = true;
      try {
        recognition.abort();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    };
  }, []);

  const startListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    setError(null);
    finalTranscriptRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    intentionalStopRef.current = false;
    try {
      recognition.start();
    } catch {
      // Can throw if already started; ignore.
    }
  }, []);

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    intentionalStopRef.current = true;
    isListeningRef.current = false;
    try {
      recognition.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const resetTranscript = useCallback(() => {
    finalTranscriptRef.current = "";
    setTranscript("");
    setInterimTranscript("");
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    resetTranscript,
    isSupported,
    error,
  };
}
