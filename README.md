# Documix - Advanced AI-Powered Documentation Assistant

Documix is an AI-powered documentation and knowledge base assistant that helps you quickly find, understand, and interact with complex documentation. It lets you load documentation from URLs or upload files (including PDF, Markdown, and text files), indexes the content for semantic search, and provides an intuitive chat interface to query your knowledge base.

Live demo: [documix.xyz](https://documix.xyz)

## Features

- 🌐 **URL Scraping**: Load documentation directly from any website
- 📁 **File Upload**: Support for PDF, Markdown, and text files
- 🧠 **Semantic Search**: Powered by embeddings (OpenAI or local Ollama) for accurate document retrieval
- 💬 **AI Chat Interface**: Chat with your documentation using state-of-the-art LLMs
- 🚀 **Multiple LLM Options**: Support for OpenAI, Groq, and local models via Ollama
- 🔄 **Persistence**: Save and restore your chat sessions
- 📈 **Vector Store Integration**: Uses Upstash Vector for efficient semantic search

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- API keys for OpenAI or Groq


**Vector Database Maintenance:**
Please note that our vector database and caches are cleared regularly. Information you embedded more than a few days ago may no longer be available. For persistent usage, consider setting up your own Upstash Vector instance.

## Usage

1. **Load Documentation**:
   - Enter a URL to scrape documentation from a website
   - Or upload PDF, Markdown, or text files

2. **Process and Embed**:
   - Documents will be processed and embedded on demand
   - View embedding status in the Sources tab

3. **Chat with Your Docs**:
   - Switch to the Chat tab
   - Ask questions about your documentation
   - The AI will respond using the knowledge from your loaded documents

4. **Manage Sessions**:
   - Create new chat threads
   - Archive old conversations
   - Return to previous discussions

### Custom Model Configuration

You can choose between different language models for chat:

1. **Groq**: Various models including llama3-70b, deepseek r1 70b, etc.
2. **OpenAI**: GPT-4o, GPT o3 mini, GPT o1 mini

## Deployment Notes

### Vector Database Persistence

When deploying your own instance of Documix:

- The default configuration uses a shared vector database that is periodically cleared
- Configure your local deployment with dedicated environment variables (as listed in .env.example for your vector instance

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- Built with [Next.js](https://nextjs.org/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Vector search by [Upstash Vector](https://upstash.com/vector)
- Embedding models by [Nomic AI](https://nomic.ai/)
- LLM providers: [Groq](https://groq.com/), [OpenAI](https://openai.com/), and [Ollama](https://ollama.ai/)

---

Created with ❤️ by Ryan
