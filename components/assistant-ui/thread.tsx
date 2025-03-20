import {
  FC,
  FormEvent,
  KeyboardEvent,
  useRef,
  useEffect,
  useState,
} from "react";
import {
  CheckIcon,
  CopyIcon,
  PencilIcon,
  RefreshCwIcon,
  SendHorizontalIcon,
  ArrowDownIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { Message } from "ai";
import { useInView } from "react-intersection-observer"; // Add this import

interface ThreadProps {
  messages: Message[];
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
  onReload: () => void;
  onStop: () => void;
}

export const Thread: FC<ThreadProps> = ({
  messages,
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
  onReload,
  onStop,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);

  // Track if user is at bottom of scroll
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Handle scrolling
  const scrollToBottom = () => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  // Watch for scroll position to show/hide scroll button
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      // Consider "at bottom" if within 20px of the bottom
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 20;
      setIsAtBottom(isNearBottom);
      setShowScrollButton(!isNearBottom);

      if (!isNearBottom) {
        setUserHasScrolledUp(true);
      } else if (isNearBottom && !isLoading) {
        setUserHasScrolledUp(false);
      }
    };

    // Initial check
    handleScroll();

    viewport.addEventListener("scroll", handleScroll);
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [isLoading]);

  // Optimized scroll to bottom on new messages

  // Reset user scroll state when chat is completed
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      // If streaming just ended, and user was at bottom, keep them there
      if (isAtBottom) {
        scrollToBottom();
      }
    }
  }, [isLoading, isAtBottom, messages.length]);

  // Scroll on new messages or during streaming
  useEffect(() => {
    const isNewUserMessage =
      messages.length > 0 && messages[messages.length - 1].role === "user";

    const shouldScrollToBottom =
      // Scroll if streaming and user hasn't scrolled away
      (isLoading && !userHasScrolledUp) ||
      // Scroll on new user messages only
      (isNewUserMessage && !userHasScrolledUp) ||
      // Always scroll if it's the first message
      messages.length === 1;

    if (shouldScrollToBottom) {
      // Use requestAnimationFrame to ensure DOM is updated before scrolling
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    }
  }, [messages, isLoading, userHasScrolledUp]);

  // Copy message text to clipboard
  const copyToClipboard = (text: string, messageId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(messageId);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  // Handle editing message
  const startEditing = (message: Message) => {
    setEditingMessageId(message.id);
    setEditText(message.content);
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditText("");
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        const form = e.currentTarget.form;
        if (form) {
          handleSubmit({
            preventDefault: () => {},
            currentTarget: form,
          } as unknown as FormEvent<HTMLFormElement>);
        }
      }
    }
  };

  // Handle suggestion clicks
  const handleSuggestionClick = (suggestion: string) => {
    const form = document.createElement("form");
    const input = document.createElement("input");
    input.name = "prompt";
    input.value = suggestion;
    form.appendChild(input);
    handleSubmit({
      currentTarget: form,
    } as unknown as FormEvent<HTMLFormElement>);
  };

  // Memoize the last assistant message for better streaming renders
  const lastAssistantMessage = messages
    .filter((m) => m.role === "assistant")
    .slice(-1)[0];

  return (
    <div
      className="bg-background box-border flex flex-col overflow-hidden"
      style={{
        ["--thread-max-width" as string]: "42rem",
        height: "100%",
      }}
    >
      {" "}
      <div
        ref={viewportRef}
        className="flex flex-col items-center overflow-y-auto scroll-smooth bg-inherit px-4 pt-4"
        style={{ height: "calc(100% - 2rem)", maxHeight: "calc(100% - 2rem)" }}
      >
        {messages.length === 0 && (
          <div className="flex w-full max-w-[var(--thread-max-width)] flex-col">
            <div className="flex w-full flex-col items-center justify-center py-8">
              <p className="font-medium">How can I help you today?</p>
            </div>
          </div>
        )}

        {/* Message list - optimized for streaming */}
        {messages.map((message, i) => (
          <div
            key={message.id}
            className={
              message.role === "user"
                ? "grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] gap-y-2 [&:where(>*)]:col-start-2 w-full max-w-[var(--thread-max-width)] py-4"
                : "grid grid-cols-[auto_auto_1fr] grid-rows-[auto_1fr] relative w-full max-w-[var(--thread-max-width)] py-4"
            }
          >
            {message.role === "user" ? (
              <>
                {/* User message action bar */}
                <div className="flex flex-col items-end col-start-1 row-start-2 mr-3 mt-2.5">
                  <TooltipIconButton
                    tooltip="Edit"
                    onClick={() => startEditing(message)}
                  >
                    <PencilIcon />
                  </TooltipIconButton>
                </div>

                {/* User message content */}
                {editingMessageId === message.id ? (
                  <div className="bg-muted my-4 flex w-full max-w-[var(--thread-max-width)] flex-col gap-2 rounded-xl">
                    <textarea
                      className="text-foreground flex h-8 w-full resize-none bg-transparent p-4 pb-0 outline-none"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                    />
                    <div className="mx-3 mb-3 flex items-center justify-center gap-2 self-end">
                      <Button variant="ghost" onClick={cancelEditing}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => {
                          // Logic for submitting edited message would go here
                          cancelEditing();
                        }}
                      >
                        Send
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-muted text-foreground max-w-[calc(var(--thread-max-width)*0.8)] break-words rounded-3xl px-5 py-2.5 col-start-2 row-start-2">
                    {message.content}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Assistant message content - with optimized rendering for streaming */}
                <div className="text-foreground w-full max-w-[calc(var(--thread-max-width)*0.8)] break-words leading-7 col-span-2 col-start-2 row-start-1 my-1.5">
                  {/* Only use ReactMarkdown when message is complete or for messages other than the last one */}
                  {i !== messages.length - 1 || !isLoading ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      className="prose dark:prose-invert prose-sm max-w-none"
                      skipHtml={true}
                    >
                      {message.content}
                    </ReactMarkdown>
                  ) : (
                    // For streaming content (last message and still loading), use pre-wrap for better performance
                    <div className="prose dark:prose-invert prose-sm max-w-none whitespace-pre-wrap">
                      {message.content}
                      {isLoading && message === lastAssistantMessage && (
                        <span className="ml-1 inline-block h-4 w-1.5 animate-pulse bg-current opacity-60"></span>
                      )}
                    </div>
                  )}
                </div>

                {/* Assistant message action bar */}
                <div className="text-muted-foreground flex gap-1 col-start-3 row-start-2 -ml-1">
                  <TooltipIconButton
                    tooltip="Copy"
                    onClick={() => copyToClipboard(message.content, message.id)}
                  >
                    {copiedMessageId === message.id ? (
                      <CheckIcon />
                    ) : (
                      <CopyIcon />
                    )}
                  </TooltipIconButton>
                  <TooltipIconButton tooltip="Refresh" onClick={onReload}>
                    <RefreshCwIcon />
                  </TooltipIconButton>
                </div>
              </>
            )}
          </div>
        ))}

        {/* Visible element for scrollIntoView */}
        <div ref={messagesEndRef} className="h-0 w-full" />

        {/* Input composer */}
        <div className="sticky bottom-0 mt-4 flex w-full max-w-[var(--thread-max-width)] flex-col items-center justify-end rounded-t-lg bg-inherit pb-2 pt-2">
          {showScrollButton && (
            <TooltipIconButton
              tooltip="Scroll to bottom"
              variant="outline"
              className="absolute -top-8 rounded-full"
              onClick={scrollToBottom}
            >
              <ArrowDownIcon />
            </TooltipIconButton>
          )}

          {/* Suggestions shown when there are no messages */}
          {messages.length === 0 && (
            <div className="mb-4 w-full flex items-stretch justify-center gap-4">
              <button
                className="hover:bg-muted/80 flex max-w-sm grow basis-0 flex-col items-center justify-center rounded-lg border p-3 transition-colors ease-in"
                onClick={() =>
                  handleSuggestionClick(
                    "How do I create a client component in React?",
                  )
                }
              >
                <span className="line-clamp-2 text-ellipsis text-sm font-semibold">
                  How do I create a client component in React?
                </span>
              </button>
              <button
                className="hover:bg-muted/80 flex max-w-sm grow basis-0 flex-col items-center justify-center rounded-lg border p-3 transition-colors ease-in"
                onClick={() =>
                  handleSuggestionClick(
                    "How do I create a workflow with Langchain?",
                  )
                }
              >
                <span className="line-clamp-2 text-ellipsis text-sm font-semibold">
                  How do I create a workflow with Langchain?
                </span>
              </button>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="focus-within:border-ring/20 flex w-full flex-wrap items-end rounded-lg border bg-inherit px-2.5 shadow-sm transition-colors ease-in"
          >
            <textarea
              name="prompt"
              rows={1}
              autoFocus
              placeholder="Write a message..."
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              className="placeholder:text-muted-foreground max-h-40 flex-grow resize-none border-none bg-transparent px-2 py-4 text-sm outline-none focus:ring-0 disabled:cursor-not-allowed"
            />
            {!isLoading ? (
              <TooltipIconButton
                tooltip="Send"
                variant="default"
                className="my-2.5 size-8 p-2 transition-opacity ease-in"
                type="submit"
              >
                <SendHorizontalIcon />
              </TooltipIconButton>
            ) : (
              <TooltipIconButton
                tooltip="Cancel"
                variant="default"
                className="my-2.5 size-8 p-2 transition-opacity ease-in"
                onClick={onStop}
              >
                <CircleStopIcon />
              </TooltipIconButton>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

const CircleStopIcon = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      width="16"
      height="16"
    >
      <rect width="10" height="10" x="3" y="3" rx="2" />
    </svg>
  );
};
