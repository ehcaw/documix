"use client";

import { useChat } from "ai/react";
import { useState, useEffect, useCallback } from "react";
import { ThreadList } from "@/components/assistant-ui/thread-list";
import { Thread } from "@/components/assistant-ui/thread";
import { ModelConfiguration } from "@/components/configuration";
import { configurationStore } from "@/lib/stores";
import { createChat, loadChat, saveChat } from "@/lib/chat-store";
import { createIdGenerator } from "ai";

interface ChatProps {
  userId?: string;
}

const ChatComponent = ({ userId }: ChatProps) => {
  // Get configuration from store
  const { provider, openAiAPIKey, groqAPIKey, modelName } =
    configurationStore();
  const { embeddingModel, embeddingProvider } = configurationStore();

  // Create state to track the current thread ID
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize with a new chat if needed
  useEffect(() => {
    const initChat = async () => {
      if (!activeThreadId) {
        // Create a new chat
        const id = await createChat();
        setActiveThreadId(id);
        setInitialMessages([]);
      } else {
        // Load existing chat
        const messages = await loadChat(activeThreadId);
        setInitialMessages(messages);
      }
      setIsLoading(false);
    };

    initChat();
  }, []);

  // Load messages when activeThreadId changes
  useEffect(() => {
    const loadMessages = async () => {
      if (activeThreadId) {
        setIsLoading(true);
        const messages = await loadChat(activeThreadId);
        setInitialMessages(messages);
        setMessages(messages);
        setIsLoading(false);
      }
    };

    if (activeThreadId) {
      loadMessages();
    }
  }, [activeThreadId]);

  // Optimized message saving with debouncing
  const debouncedSaveMessages = useCallback(
    async (id: string, messagesToSave: any[]) => {
      if (id && messagesToSave.length > 0) {
        await saveChat({
          id,
          messages: messagesToSave,
        });
      }
    },
    []
  );

  // Set up chat using the Vercel AI SDK with improved streaming options
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading: chatLoading,
    reload,
    stop,
    setMessages,
  } = useChat({
    api:
      provider === "openai"
        ? `/api/chat/openai?model=${modelName}&embeddingProvider=${embeddingProvider}&embeddingModel=${embeddingModel}&userId=${userId}`
        : `/api/chat/groq?model=${modelName}&embeddingProvider=${embeddingProvider}&embeddingModel=${embeddingModel}&userId=${userId}`,
    headers: {
      Authorization: `Bearer ${
        provider === "openai" ? openAiAPIKey : groqAPIKey
      }`,
    },
    body: {
      modelName,
      apiKey: provider === "openai" ? openAiAPIKey : groqAPIKey,
      id: activeThreadId, // Include chat ID in API request
    },
    id: activeThreadId || undefined,
    initialMessages,
    generateId: createIdGenerator({ prefix: "msg_", size: 16 }),
    sendExtraMessageFields: true, // Send id and createdAt for each message
    onFinish: async (message) => {
      if (activeThreadId) {
        // Save completed conversation to local storage
        await saveChat({
          id: activeThreadId,
          messages: [...messages, message],
        });
      }
    },
    // Improve streaming performance
    experimental_streamingComponent: true, // Enable streaming optimizations (if available)
  });

  // Create a new chat thread
  const handleNewThread = async () => {
    const id = await createChat();
    setActiveThreadId(id);
    setMessages([]);
  };

  // Save messages when they change
  useEffect(() => {
    const saveMessages = async () => {
      if (activeThreadId && messages.length > 0) {
        // Don't save too frequently during streaming - only when messages array changes
        // This won't trigger during token-by-token streaming due to how useChat handles streaming
        await debouncedSaveMessages(activeThreadId, messages);
      }
    };

    saveMessages();
  }, [activeThreadId, messages, debouncedSaveMessages]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">Loading...</div>
    );
  }

  return (
    <div className="h-[calc(70vh)] flex flex-col">
      <div className="grid h-full grid-cols-[200px_1fr] gap-x-2 px-4 py-4 overflow-hidden">
        {/* Left sidebar */}
        <div className="flex flex-col overflow-hidden">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-medium">Chats</h2>
            <ModelConfiguration />
          </div>

          <div className="overflow-y-auto flex-grow">
            <ThreadList
              onNewThread={handleNewThread}
              activeThreadId={activeThreadId}
              setActiveThreadId={setActiveThreadId}
            />
          </div>
        </div>

        {/* Right chat area */}
        <div className="overflow-hidden flex flex-col">
          {activeThreadId ? (
            <Thread
              messages={messages}
              input={input}
              handleInputChange={handleInputChange}
              handleSubmit={handleSubmit}
              isLoading={chatLoading}
              onReload={reload}
              onStop={stop}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Select a thread or create a new one to start chatting
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatComponent;
