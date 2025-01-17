"use client";

import { cn } from "@/lib/utils";
import { useChat } from "ai/react";
import { ArrowUpIcon, Clipboard, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AutoResizeTextarea } from "@/components/autoresize-textarea";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ChatForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const [url, setUrl] = useState("");
  const [displayContent, setDisplayContent] = useState("");
  const [collectionName, setCollectionName] = useState<string | null>(null);

  // Modify useChat to use your backend endpoints
  const { messages, input, setInput, append, isLoading, error } = useChat({
    api: "/api/chat",
    body: {
      collection_name: collectionName,
    },
    onError: (error) => {
      toast.error("Failed to send message");
      console.error(error);
    },
  });

  const validateUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateUrl(url)) {
      toast.error("Please enter a valid URL");
      return;
    }

    try {
      const response = await fetch("http://localhost:5000/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        throw new Error("Failed to load content");
      }

      const data = await response.json();
      setDisplayContent(data.markdown);
      setCollectionName(data.collection_name);
      toast.success("Documentation loaded successfully!");
    } catch (error) {
      toast.error("Failed to load content");
      console.error(error);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(displayContent);
      toast.success("Copied to clipboard!");
    } catch (err) {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void append({ content: input, role: "user" });
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Card className="mx-auto w-full max-w-3xl border-none shadow-none">
        <CardHeader className="space-y-6">
          <CardTitle className="text-center text-4xl font-bold">
            Documix
          </CardTitle>
          <div className="flex gap-2">
            <Input
              type="url"
              placeholder="Enter URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleUrlSubmit} variant="secondary">
              <Link className="mr-2 h-4 w-4" />
              Load
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Card className="relative overflow-hidden">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 hover:bg-secondary"
              onClick={copyToClipboard}
            >
              <Clipboard className="h-4 w-4" />
            </Button>
            <div className="max-h-[300px] overflow-y-auto p-4">
              {displayContent || "Content will be displayed here"}
            </div>
          </Card>

          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  "flex w-full",
                  message.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "rounded-lg px-4 py-2 max-w-[80%]",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted",
                  )}
                >
                  {message.content}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 mx-auto w-full max-w-3xl p-4 bg-background/80 backdrop-blur">
        <form
          onSubmit={handleSubmit}
          className="relative flex items-center rounded-lg border bg-background shadow-sm"
        >
          <AutoResizeTextarea
            onKeyDown={handleKeyDown}
            onChange={(v) => setInput(v)}
            value={input}
            placeholder="Enter a message"
            className="min-h-[44px] w-full resize-none bg-transparent px-4 py-[10px] pr-12 focus:outline-none"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="submit"
                size="icon"
                variant="ghost"
                className="absolute right-1 h-8 w-8"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="animate-spin">...</div>
                ) : (
                  <ArrowUpIcon className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send message</TooltipContent>
          </Tooltip>
        </form>
      </div>
    </div>
  );
}
