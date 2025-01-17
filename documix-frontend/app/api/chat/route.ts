import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { messages, body } = await req.json();
    const lastMessage = messages[messages.length - 1];

    const response = await fetch("http://localhost:5000/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: lastMessage.content,
        collection_name: body.collection_name,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to get response");
    }

    const data = await response.json();

    return NextResponse.json({ role: "assistant", content: data.answer });
  } catch (error) {
    console.error(error);
    return NextResponse.error();
  }
}
