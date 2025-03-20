// lib/chat-store.ts
import { Message } from "ai";
import { generateId } from "ai";

// Create a new chat and return its ID
export async function createChat(): Promise<string> {
  const id = generateId();

  // If running in browser, use localStorage
  if (typeof window !== "undefined") {
    localStorage.setItem(`chat-${id}`, JSON.stringify([]));
  }

  return id;
}

// Load chat messages by ID
export async function loadChat(id: string): Promise<Message[]> {
  // If running in browser, use localStorage
  if (typeof window !== "undefined") {
    const savedChat = localStorage.getItem(`chat-${id}`);
    if (savedChat) {
      return JSON.parse(savedChat);
    }
  }

  return [];
}

// Save chat messages
export async function saveChat({
  id,
  messages,
}: {
  id: string;
  messages: Message[];
}): Promise<void> {
  // If running in browser, use localStorage
  if (typeof window !== "undefined") {
    localStorage.setItem(`chat-${id}`, JSON.stringify(messages));
  }
}

// List all available chats
export async function listChats(): Promise<
  Array<{ id: string; title: string; createdAt: number }>
> {
  if (typeof window === "undefined") {
    return [];
  }

  const chats: Array<{ id: string; title: string; createdAt: number }> = [];

  // Loop through localStorage to find all chats
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("chat-")) {
      const id = key.replace("chat-", "");
      try {
        const messages: Message[] = JSON.parse(
          localStorage.getItem(key) || "[]",
        );
        // Use the first user message as the title, if available
        const firstUserMessage = messages.find((m) => m.role === "user");
        const title = firstUserMessage
          ? firstUserMessage.content.slice(0, 30) +
            (firstUserMessage.content.length > 30 ? "..." : "")
          : `Chat ${id.slice(0, 6)}`;

        // Use the createdAt of the first message if available, or current time
        const createdAt = messages[0]?.createdAt || Date.now();

        chats.push({ id, title, createdAt });
      } catch (e) {
        console.error(`Failed to parse chat ${id}:`, e);
      }
    }
  }

  return chats.sort((a, b) => b.createdAt - a.createdAt);
}
