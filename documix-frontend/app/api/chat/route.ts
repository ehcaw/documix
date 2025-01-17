export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const lastMessage = messages[messages.length - 1];

    const response = await fetch("http://localhost:5000/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: lastMessage.content,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to get response");
    }

    const data = await response.json();
    
    if (!data.answer) {
      throw new Error("No answer received from backend");
    }

    return Response.json({ role: "assistant", content: data.answer });
  } catch (error) {
    console.error('Chat API Error:', error);
    return Response.json(
      { error: "Failed to process chat request" },
      { status: 500 }
    );
  }
}
