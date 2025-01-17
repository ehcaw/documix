from flask import Flask, request, jsonify
from bs4 import BeautifulSoup
import requests
import markdown
from urllib.parse import urljoin, urlparse, urldefrag
from flask_cors import CORS
from langchain_nvidia_ai_endpoints import NVIDIAEmbeddings
from langchain_community.vectorstores import Chroma
import os
import re
import openai
import chromadb
from chromadb.utils import embedding_functions
from typing import List, Dict
import datetime
import textwrap

app = Flask(__name__)
CORS(app)

openai.api_key = os.getenv('OPENAI_API_KEY')

class DocumentScraper:
    def __init__(self):
        self.visited_urls = set()
        self.text_content = []
        self.base_url = None

    def is_valid_url(self, url):
        if not url:
            return False
        # Remove fragment identifier
        url_without_fragment = urldefrag(url)[0]
        # Check if URL is from the same domain and path
        parsed_url = urlparse(url_without_fragment)
        parsed_base = urlparse(self.base_url)
        return (parsed_url.netloc == parsed_base.netloc and
                parsed_url.path.startswith(parsed_base.path))

    def normalize_url(self, url):
        # Remove fragment identifier
        url_without_fragment = urldefrag(url)[0]
        if url.startswith('/'):
            base_domain = f"{str(urlparse(self.base_url).scheme)}://{str(urlparse(self.base_url).netloc)}"
            return urljoin(base_domain, url)
        return url_without_fragment

    def extract_links(self, soup, current_url):
        links = set()
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']

            # Skip anchor links, javascript, and mailto links
            if (href.startswith('#') or
                href.startswith('javascript:') or
                href.startswith('mailto:') or
                href.startswith('tel:')):
                continue

            # Convert relative to absolute URL
            absolute_url = urljoin(current_url, href)
            parsed_url = urlparse(absolute_url)
            parsed_base = urlparse(self.base_url)

            # Check if the URL is valid and belongs to the same documentation
            if (
                # Same domain
                parsed_url.netloc == parsed_base.netloc and
                # Starts with same base path
                parsed_url.path.startswith(parsed_base.path) and
                # Common doc extensions or no extension
                (parsed_url.path.endswith(('.html', '.htm', '/')) or
                 '.' not in parsed_url.path.split('/')[-1])
            ):
                # Normalize and add the URL
                normalized_url = self.normalize_url(absolute_url)
                links.add(normalized_url)

        return links

    def clean_text(self, text):
        # Remove extra whitespace and empty lines
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text = ' '.join(chunk for chunk in chunks if chunk)

        # Remove duplicate spaces
        text = re.sub(r'\s+', ' ', text)

        return text.strip()

    def extract_text(self, soup, url):
        # Remove unnecessary elements
        for element in soup.find_all(['script', 'style', 'nav', 'footer', 'header']):
            element.decompose()

        # Extract main content
        main_content = soup.find('main') or soup.find('article') or soup.find('div', class_='content')

        if main_content:
            text = main_content.get_text()
        else:
            text = soup.get_text()

        cleaned_text = self.clean_text(text)

        if cleaned_text:
            self.text_content.append({
                "content": cleaned_text,
                "url": url,
                "title": soup.title.string if soup.title else url
            })

    def scrape_url(self, url):
        if url in self.visited_urls:
            return set()

        try:
            print(f"Scraping: {url}")
            response = requests.get(url)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, 'html.parser')
            self.visited_urls.add(url)

            # Extract text content
            self.extract_text(soup, url)

            # Return new links to visit
            return self.extract_links(soup, url)

        except Exception as e:
            print(f"Error scraping {url}: {str(e)}")
            return set()

    def scrape_documentation(self, start_url):
        # Extract base URL path
        parsed_url = urlparse(start_url)
        self.base_url = f"{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path}"

        urls_to_visit = {start_url}

        while urls_to_visit and len(self.visited_urls) < 100:  # Limit to prevent infinite loops
            current_url = urls_to_visit.pop()
            new_urls = self.scrape_url(current_url)
            urls_to_visit.update(new_urls - self.visited_urls)

        # Convert content to markdown sections
        markdown_content = f"# Documentation for {self.base_url}\n\n"

        # Group content by URL paths for better organization
        '''
        for item in self.text_content:
            markdown_content += f"## {item['title']}\n"
            markdown_content += f"Source: {item['url']}\n\n"
            markdown_content += f"{item['content']}\n\n"
            markdown_content += "---\n\n"
        '''
        for item in self.text_content:
            markdown_content = markdown_content + markdown.markdown(item)
        return markdown_content

class RAGSystem:
    def __init__(self, collection_name: str = "documents"):
        self.client = chromadb.Client()

        self.embedding_function = NVIDIAEmbeddings(model="NV-Embed-QA")

        try:
            self.collection = self.client.get_collection(
                name=collection_name,
                embedding_function=self.embedding_function
            )
        except:
            self.collection = self.client.create_collection(
                name=collection_name,
                embedding_function=self.embedding_function
            )

    def add_documents(self, documents: List[str], ids: List[str] = None):
        """Add documents to the collection"""
        if ids is None:
            ids = [str(i) for i in range(len(documents))]

        # Split documents into chunks of ~1000 characters
        chunks = []
        chunk_ids = []

        for doc_id, doc in zip(ids, documents):
            doc_chunks = textwrap.wrap(doc, 1000)
            chunks.extend(doc_chunks)
            chunk_ids.extend([f"{doc_id}_chunk_{i}" for i in range(len(doc_chunks))])

        # Add to collection
        self.collection.add(
            documents=chunks,
            ids=chunk_ids
        )

    def query(self, query: str, n_results: int = 3) -> List[Dict]:
        """Query the collection and return most relevant documents"""
        results = self.collection.query(
            query_texts=[query],
            n_results=n_results
        )

        return results

    def generate_response(self, query: str, n_results: int = 3) -> str:
        try:
            context = self.query(query, n_results)

            if not context['documents'][0]:
                return "No relevant documents found to answer the query."

            prompt = f"""Use the following documents as context to answer the question.
            If you cannot answer based on the context, say so.

            Context:
            {' '.join(context['documents'][0])}

            Question: {query}

            Answer:"""

            response = openai.ChatCompletion.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that answers questions based on the provided context."},
                    {"role": "user", "content": prompt}
                ]
            )

            return response.choices[0].message.content

        except Exception as e:
            return f"Error generating response: {str(e)}"

@app.route('/scrape', methods=['POST'])
def scrape():
    data = request.get_json()
    url = data.get('url')
    nvidia_api_key = os.getenv('NVIDIA_API_KEY')
    openai_api_key = os.getenv('OPENAI_API_KEY')

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    if not nvidia_api_key or not openai_api_key:
        return jsonify({'error': 'API keys are required'}), 400

    try:
        # Initialize scraper and get content
        scraper = DocumentScraper()
        markdown_content = scraper.scrape_documentation(url)

        # Initialize RAG system with a unique collection name based on URL and timestamp
        collection_name = f"docs_{urlparse(url).netloc}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        rag_system = RAGSystem(collection_name=collection_name)

        # Add documents to RAG system
        documents = [item['content'] for item in scraper.text_content]
        ids = [str(i) for i in range(len(documents))]
        rag_system.add_documents(documents, ids)

        # Store the collection name in a way that's accessible for queries
        # You might want to use a database or file for this in production
        app.config['CURRENT_COLLECTION'] = collection_name

        return jsonify({
            'markdown': markdown_content,
            'message': f'Documentation scraped successfully. Processed {len(scraper.visited_urls)} pages.',
            'collection_name': collection_name
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/query', methods=['POST'])
def query_docs():
    data = request.get_json()
    query = data.get('query')
    collection_name = data.get('collection_name') or app.config.get('CURRENT_COLLECTION')

    if not query:
        return jsonify({'error': 'Query is required'}), 400

    if not collection_name:
        return jsonify({'error': 'No active document collection'}), 400

    try:
        # Initialize RAG system with the stored collection
        rag_system = RAGSystem(collection_name=collection_name)

        # Generate response using RAG
        response = rag_system.generate_response(query)

        # Get relevant documents for context
        relevant_docs = rag_system.query(query)

        return jsonify({
            'answer': response,
            'relevant_documents': relevant_docs['documents'][0],
            'metadata': relevant_docs.get('metadatas', [])
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/collections', methods=['GET'])
def list_collections():
    try:
        client = chromadb.Client()
        collections = client.list_collections()
        return jsonify({
            'collections': [col.name for col in collections]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
