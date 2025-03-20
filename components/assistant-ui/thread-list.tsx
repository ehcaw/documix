import { FC, useEffect, useState } from "react";
import { ArchiveIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { listChats } from "@/lib/chat-store";

interface Thread {
  id: string;
  title: string;
  createdAt: number;
}

interface ThreadListProps {
  onNewThread: () => void;
  activeThreadId: string | null;
  setActiveThreadId: (id: string) => void;
}

export const ThreadList: FC<ThreadListProps> = ({
  onNewThread,
  activeThreadId,
  setActiveThreadId,
}) => {
  const [threads, setThreads] = useState<Thread[]>([]);

  // Load the list of threads
  useEffect(() => {
    const loadThreads = async () => {
      const chatList = await listChats();
      setThreads(chatList);
    };

    loadThreads();

    // Remove the interval
    // const interval = setInterval(loadThreads, 2000);
    // return () => clearInterval(interval);
  }, [activeThreadId]); // Reload when activeThreadId changes

  // Handle archiving a thread
  const handleArchiveThread = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // Remove from localStorage
    if (typeof window !== "undefined") {
      localStorage.removeItem(`chat-${id}`);
    }

    // Remove from state
    setThreads(threads.filter((thread) => thread.id !== id));

    // Don't auto-create a new thread, just reset active thread ID
    if (id === activeThreadId) {
      setActiveThreadId(""); // Set to null instead of creating new thread
    }
  };

  return (
    <div className="flex flex-col items-stretch gap-1.5">
      {/* New Thread Button */}
      <Button
        className="flex items-center justify-start gap-1 rounded-lg px-2.5 py-2 text-start"
        variant="ghost"
        onClick={onNewThread}
      >
        <PlusIcon />
        New Thread
      </Button>

      {/* Thread Items */}
      <div className="mt-2">
        {threads.length === 0 ? (
          <div className="text-muted-foreground px-3 py-2 text-sm">
            No threads yet
          </div>
        ) : (
          threads.map((thread) => (
            <div
              key={thread.id}
              className={`flex items-center gap-2 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 ${
                thread.id === activeThreadId ? "bg-muted" : "hover:bg-muted"
              }`}
              onClick={() => setActiveThreadId(thread.id)}
            >
              <button className="flex-grow px-3 py-2 text-start">
                <p className="text-sm">{thread.title || "New Chat"}</p>
              </button>
              <TooltipIconButton
                className="hover:text-primary text-foreground ml-auto mr-3 size-4 p-0"
                variant="ghost"
                tooltip="Archive thread"
                onClick={(e) => handleArchiveThread(thread.id, e)}
              >
                <ArchiveIcon />
              </TooltipIconButton>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
