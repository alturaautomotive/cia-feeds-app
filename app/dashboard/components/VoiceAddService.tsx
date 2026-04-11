"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SERVICES_FIELDS } from "@/lib/verticals";
import { useVoiceInput } from "./useVoiceInput";

interface Props {
  onListingAdded: () => void;
}

interface ChatMessage {
  role: "assistant" | "user";
  text: string;
}

type Phase = "collecting" | "image" | "confirming" | "done";

const INITIAL_ASSISTANT_MESSAGE =
  "Tell me about the service you'd like to add. You can describe it naturally — I'll fill in the details for you.";

export function VoiceAddService({ onListingAdded }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: INITIAL_ASSISTANT_MESSAGE },
  ]);
  const [collectedFields, setCollectedFields] = useState<Record<string, string>>({});
  const [textInput, setTextInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [phase, setPhase] = useState<Phase>("collecting");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedUserText, setLastFailedUserText] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleSendMessageRef = useRef<(text: string) => Promise<void>>(async () => {});
  const isProcessingRef = useRef(false);
  const pendingUtteranceRef = useRef<string>("");
  const messagesRef = useRef<ChatMessage[]>(messages);

  const handleUtteranceComplete = useCallback((finalText: string) => {
    const trimmed = finalText.trim();
    if (!trimmed) return;
    if (isProcessingRef.current) {
      pendingUtteranceRef.current = pendingUtteranceRef.current
        ? `${pendingUtteranceRef.current} ${trimmed}`
        : trimmed;
      return;
    }
    void handleSendMessageRef.current(trimmed);
  }, []);

  const {
    isListening,
    interimTranscript,
    startListening,
    stopListening,
    resetTranscript,
    isSupported,
    error: voiceError,
  } = useVoiceInput({ onUtteranceComplete: handleUtteranceComplete });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, phase]);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  async function handleSendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isProcessingRef.current) return;

    setError(null);
    setLastFailedUserText(null);
    const userMessage: ChatMessage = { role: "user", text: trimmed };
    const nextMessages = [...messagesRef.current, userMessage];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    setTextInput("");
    isProcessingRef.current = true;
    setIsProcessing(true);

    const attemptFetch = () =>
      fetch("/api/listings/voice-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: trimmed,
          history: nextMessages,
          collectedFields,
        }),
      });

    try {
      let res: Response;
      try {
        res = await attemptFetch();
      } catch {
        // Network error on first attempt — retry once
        res = await attemptFetch();
      }

      if (!res.ok && res.status !== 429) {
        // Silent auto-retry for non-429 errors
        try {
          res = await attemptFetch();
        } catch {
          // ignore — we'll handle below via the prior failing res
        }
      }

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          retryAfterMs?: number;
        };
        let errorText = "Something went wrong. Please try again.";
        if (res.status === 429) {
          const seconds = Math.ceil((data.retryAfterMs ?? 1000) / 1000);
          errorText = `You're sending messages too fast. Please wait ${seconds} seconds and try again.`;
        }
        setMessages((prev) => [...prev, { role: "assistant", text: errorText }]);
        setLastFailedUserText(trimmed);
        return;
      }

      const data = (await res.json()) as {
        extractedFields: Record<string, string>;
        followUpQuestion: string | null;
        allFieldsFilled: boolean;
      };

      setCollectedFields(data.extractedFields || {});

      if (data.followUpQuestion) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: data.followUpQuestion as string },
        ]);
      }

      if (data.allFieldsFilled) {
        stopListening();
        setPhase("image");
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Something went wrong. Please try again." },
      ]);
      setLastFailedUserText(trimmed);
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
      const pending = pendingUtteranceRef.current.trim();
      if (pending) {
        pendingUtteranceRef.current = "";
        void handleSendMessageRef.current(pending);
      }
    }
  }

  function handleRetryLastMessage() {
    if (!lastFailedUserText || isProcessingRef.current) return;
    const textToRetry = lastFailedUserText;
    setLastFailedUserText(null);
    // Remove the trailing assistant error bubble and the failed user message
    // so handleSendMessage can re-add the user message cleanly.
    const trimmed = [...messagesRef.current];
    if (trimmed.length > 0 && trimmed[trimmed.length - 1].role === "assistant") {
      trimmed.pop();
    }
    if (trimmed.length > 0 && trimmed[trimmed.length - 1].role === "user") {
      trimmed.pop();
    }
    messagesRef.current = trimmed;
    setMessages(trimmed);
    void handleSendMessageRef.current(textToRetry);
  }

  handleSendMessageRef.current = handleSendMessage;

  function handleToggleMic() {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }

  function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!textInput.trim()) return;
    void handleSendMessage(textInput);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files ?? []);
    if (selectedFiles.length === 0) return;
    e.target.value = "";

    const remaining = 10 - imageUrls.length;
    if (remaining <= 0) {
      setError("Maximum 10 images allowed.");
      return;
    }

    const filesToUpload = selectedFiles.slice(0, remaining);
    setUploadingImages(true);
    setError(null);

    try {
      const fd = new FormData();
      for (const file of filesToUpload) {
        fd.append("files", file);
      }

      const res = await fetch("/api/listings/upload-image", { method: "POST", body: fd });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Image upload failed.");
        return;
      }

      const data = await res.json();
      setImageUrls((prev) => [...prev, ...data.urls].slice(0, 10));
    } catch {
      setError("Image upload failed. Please try again.");
    } finally {
      setUploadingImages(false);
    }
  }

  function removeImage(index: number) {
    setImageUrls((prev) => prev.filter((_, i) => i !== index));
  }

  function startEditField(key: string) {
    setEditingField(key);
    setEditValue(collectedFields[key] ?? "");
  }

  function saveEditField() {
    if (!editingField) return;
    setCollectedFields((prev) => ({ ...prev, [editingField]: editValue.trim() }));
    setEditingField(null);
    setEditValue("");
  }

  function cancelEditField() {
    setEditingField(null);
    setEditValue("");
  }

  async function handleCreateListing() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...collectedFields, imageUrls }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to add listing.");
        return;
      }

      stopListening();
      setPhase("done");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Service created successfully!" },
      ]);
      onListingAdded();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    stopListening();
    setMessages([{ role: "assistant", text: INITIAL_ASSISTANT_MESSAGE }]);
    setCollectedFields({});
    setImageUrls([]);
    setPhase("collecting");
    setError(null);
    setTextInput("");
    resetTranscript();
  }

  // Voice-agent errors render as inline chat bubbles; image-upload and
  // listing-creation errors still use setError and surface in the banner
  // alongside browser speech errors.
  const bannerError = voiceError || (phase !== "collecting" ? error : null);

  return (
    <div className="flex flex-col gap-4">
      {bannerError && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-700">{bannerError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Chat area */}
        <div className="md:col-span-2 flex flex-col bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-80 min-h-64">
            {messages.map((msg, i) => {
              const isLast = i === messages.length - 1;
              const showRetry =
                isLast &&
                msg.role === "assistant" &&
                lastFailedUserText !== null &&
                !isProcessing;
              return (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-indigo-600 text-white"
                        : "bg-white text-gray-900 border border-gray-200"
                    }`}
                  >
                    <div>{msg.text}</div>
                    {showRetry && (
                      <button
                        type="button"
                        onClick={handleRetryLastMessage}
                        className="mt-2 text-[11px] bg-indigo-600 text-white px-2 py-0.5 rounded hover:bg-indigo-700"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {isListening && interimTranscript && (
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-lg px-3 py-2 text-sm bg-indigo-100 text-indigo-900 italic">
                  {interimTranscript}
                </div>
              </div>
            )}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="rounded-lg px-3 py-2 text-sm bg-white text-gray-500 border border-gray-200">
                  Thinking&hellip;
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          {phase === "collecting" && (
            <div className="border-t border-gray-200 bg-white p-3">
              {!isSupported && (
                <p className="text-xs text-gray-500 mb-2">
                  Voice input is not supported in this browser. You can type your responses instead.
                </p>
              )}
              <form onSubmit={handleTextSubmit} className="flex items-center gap-2">
                {isSupported && (
                  <button
                    type="button"
                    data-element-id="voice-mic-btn"
                    onClick={handleToggleMic}
                    disabled={isProcessing}
                    className={`flex items-center justify-center w-10 h-10 rounded-full text-white transition-all ${
                      isListening
                        ? "bg-red-500 animate-pulse"
                        : "bg-indigo-600 hover:bg-indigo-700"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    aria-label={isListening ? "Stop recording" : "Start recording"}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </button>
                )}
                {isSupported && isListening && (
                  <button
                    type="button"
                    data-element-id="voice-done-btn"
                    onClick={stopListening}
                    className="flex items-center justify-center h-10 px-3 rounded-md border border-gray-400 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-100"
                    aria-label="Stop voice session"
                  >
                    Done
                  </button>
                )}
                <input
                  type="text"
                  data-element-id="voice-text-input"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder={isListening ? "Listening…" : "Type your response…"}
                  disabled={isProcessing}
                  className="flex-1 border border-gray-400 bg-white rounded-md px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!textInput.trim() || isProcessing}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Field summary sidebar */}
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-900">Collected Fields</h3>
            <button
              type="button"
              onClick={handleReset}
              className="text-[11px] text-gray-500 hover:text-gray-700"
            >
              Reset
            </button>
          </div>
          <ul className="space-y-1.5">
            {SERVICES_FIELDS.map((field) => {
              const value = collectedFields[field.key];
              const filled = typeof value === "string" && value.trim().length > 0;
              const isEditing = editingField === field.key;
              return (
                <li key={field.key} className="text-xs">
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] flex-shrink-0 ${
                        filled ? "bg-green-500 text-white" : "bg-gray-200 text-gray-400"
                      }`}
                    >
                      {filled ? "\u2713" : ""}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-700">{field.label}</div>
                      {isEditing ? (
                        <div className="mt-1 flex flex-col gap-1">
                          {field.type === "select" && field.options ? (
                            <select
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full border border-gray-400 bg-white rounded px-1.5 py-0.5 text-xs text-gray-900"
                            >
                              <option value="">Select...</option>
                              {field.options.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : field.type === "textarea" ? (
                            <textarea
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              rows={2}
                              className="w-full border border-gray-400 bg-white rounded px-1.5 py-0.5 text-xs text-gray-900"
                            />
                          ) : (
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full border border-gray-400 bg-white rounded px-1.5 py-0.5 text-xs text-gray-900"
                            />
                          )}
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={saveEditField}
                              className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded hover:bg-indigo-700"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditField}
                              className="text-[10px] text-gray-500 px-2 py-0.5 rounded hover:bg-gray-100"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditField(field.key)}
                          className={`block w-full text-left truncate ${
                            filled ? "text-gray-900" : "text-gray-400"
                          } hover:text-indigo-600`}
                        >
                          {filled ? value : "Not filled"}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Image upload phase */}
      {phase === "image" && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            Add photos (optional)
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            Services don&apos;t require images, but adding some helps your listing stand out.
          </p>

          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageUpload}
          />

          {imageUrls.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {imageUrls.map((url, i) => (
                <div key={i} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    className="w-16 h-16 rounded object-cover border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}

          <div
            className="border-2 border-dashed rounded-lg p-4 text-center text-sm cursor-pointer border-gray-300 text-gray-400 hover:border-gray-400"
            onClick={() => !uploadingImages && imageInputRef.current?.click()}
          >
            {uploadingImages
              ? "Uploading\u2026"
              : imageUrls.length > 0
                ? `${imageUrls.length} image(s) added. Click to add more.`
                : "Click to upload images"}
          </div>

          <div className="flex justify-end gap-2 mt-3">
            <button
              type="button"
              onClick={() => setPhase("collecting")}
              className="text-sm text-gray-500 px-3 py-1.5 rounded hover:bg-gray-100"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setPhase("confirming")}
              className="bg-indigo-600 text-white px-4 py-1.5 rounded-md text-sm font-semibold hover:bg-indigo-700"
            >
              {imageUrls.length > 0 ? "Continue" : "Skip and continue"}
            </button>
          </div>
        </div>
      )}

      {/* Confirmation phase */}
      {phase === "confirming" && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Review your service</h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 mb-4">
            {SERVICES_FIELDS.map((field) => (
              <div key={field.key}>
                <dt className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                  {field.label}
                </dt>
                <dd className="text-sm text-gray-900 break-words">
                  {collectedFields[field.key] || (
                    <span className="text-gray-400">Not filled</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>

          {imageUrls.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">
                Images
              </div>
              <div className="flex flex-wrap gap-2">
                {imageUrls.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={url}
                    alt=""
                    className="w-16 h-16 rounded object-cover border border-gray-200"
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPhase("image")}
              className="text-sm text-gray-500 px-3 py-1.5 rounded hover:bg-gray-100"
            >
              Back
            </button>
            <button
              type="button"
              data-element-id="voice-create-btn"
              onClick={handleCreateListing}
              disabled={submitting}
              className="bg-indigo-600 text-white px-5 py-1.5 rounded-md text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating\u2026" : "Create Service"}
            </button>
          </div>
        </div>
      )}

      {/* Done phase */}
      {phase === "done" && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <p className="text-sm text-green-800 font-semibold mb-2">Service created successfully!</p>
          <button
            type="button"
            onClick={handleReset}
            className="text-sm bg-indigo-600 text-white px-4 py-1.5 rounded-md hover:bg-indigo-700"
          >
            Add another
          </button>
        </div>
      )}
    </div>
  );
}
