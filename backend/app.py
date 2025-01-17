from flask import Flask, request, jsonify
from bs4 import BeautifulSoup
import requests
import markdown
from urllib.parse import urljoin, urlparse, urldefrag
from flask_cors import CORS
import os
import re
from openai import OpenAI
import chromadb
from typing import List, Dict
from datetime import datetime
import textwrap
import time
from dotenv import load_dotenv

app = Flask(__name__)
CORS(app)

load_dotenv()

client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))


def validate_url_format(url: str) -> bool:
    """Validate basic URL format before scraping"""
    if not url:
        return False
    try:
        result = urlparse(url)
        return all([result.scheme, result.netloc])
    except:
        return False

class DocumentScraper:
    def __init__(self):
        self.visited_urls = set()
        self.text_content = []
        self.base_url = None

    def is_valid_url(self, url) -> bool:
        """Validate URL against base_url restrictions"""
        if not self.base_url:
            raise ValueError("base_url must be set before validating URLs")
        try:
            url_without_fragment = urldefrag(url)[0]
            parsed_url = urlparse(url_without_fragment)
            parsed_base = urlparse(self.base_url)
            return (parsed_url.netloc == parsed_base.netloc and
                    parsed_url.path.startswith(parsed_base.path))
        except:
            return False

    def normalize_url(self, url):
        url_without_fragment = urldefrag(url)[0]
        if url.startswith('/'):
            base_domain = f"{str(urlparse(self.base_url).scheme)}://{str(urlparse(self.base_url).netloc)}"
            return urljoin(base_domain, url)
        return url_without_fragment

    def extract_links(self, soup, current_url):
        links = set()
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            if (href.startswith('#') or
                href.startswith('javascript:') or
                href.startswith('mailto:') or
                href.startswith('tel:')):
                continue
            absolute_url = urljoin(current_url, href)
            parsed_url = urlparse(absolute_url)
            parsed_base = urlparse(self.base_url)
            if (
                parsed_url.netloc == parsed_base.netloc and
                parsed_url.path.startswith(parsed_base.path) and
                (parsed_url.path.endswith(('.html', '.htm', '/')) or
                 '.' not in parsed_url.path.split('/')[-1])
            ):
                normalized_url = self.normalize_url(absolute_url)
                links.add(normalized_url)
        return links

    def clean_text(self, text):
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text = ' '.join(chunk for chunk in chunks if chunk)
        text = re.sub(r'\s+', ' ', text)
        return text.strip()

    def extract_text(self, soup, url):
        for element in soup.find_all(['script', 'style', 'nav', 'footer', 'header', 'aside']):
            element.decompose()

        main_content = (
            soup.find('main') or 
            soup.find('article') or 
            soup.find('div', class_='content') or
            soup.find('div', class_='documentation') or
            soup.find('div', class_='docs') or
            soup.find('div', role='main')
        )

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
            response = requests.get(url, timeout=10)  # Added timeout
            time.sleep(1)  # Basic rate limiting
            response.raise_for_status()

            soup = BeautifulSoup(response.text, 'html.parser')
            self.visited_urls.add(url)
            self.extract_text(soup, url)
            return self.extract_links(soup, url)

        except Exception as e:
            print(f"Error scraping {url}: {str(e)}")
            return set()

    def scrape_documentation(self, start_url):
        parsed_url = urlparse(start_url)
        self.base_url = f"{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path}"

        urls_to_visit = {start_url}

        while urls_to_visit and len(self.visited_urls) < 100:
            current_url = urls_to_visit.pop()
            new_urls = self.scrape_url(current_url)
            urls_to_visit.update(new_urls - self.visited_urls)

        markdown_content = f"# Documentation for {self.base_url}\n\n"
        for item in self.text_content:
            markdown_content += f"## {item['title']}\n"
            markdown_content += f"Source: {item['url']}\n\n"
            markdown_content += f"{item['content']}\n\n"
            markdown_content += "---\n\n"

        return markdown_content

class RAGSystem:
    def __init__(self, collection_name: str = "documents"):
        self.client = chromadb.PersistentClient(path="./chroma_db")
        
        self.embedding_function = chromadb.utils.embedding_functions.OpenAIEmbeddingFunction(
            api_key=os.getenv('OPENAI_API_KEY'),
            model_name="text-embedding-3-small"
        )

        try:
            self.collection = self.client.get_or_create_collection(
                name=collection_name,
                embedding_function=self.embedding_function
            )
            print(f"Using collection: {collection_name}")
        except Exception as e:
            print(f"Error with collection: {str(e)}")
            self.collection = self.client.create_collection(
                name=collection_name,
                embedding_function=self.embedding_function
            )

    def add_documents(self, documents: List[str], ids: List[str] = None):
        if ids is None:
            ids = [str(i) for i in range(len(documents))]

        print(f"Adding {len(documents)} documents to collection {self.collection.name}")

        try:
            # Add documents with proper parameters
            self.collection.add(
                documents=documents,
                ids=ids,
                metadatas=[{"source": "documentation"} for _ in ids]
            )
            print("Successfully added documents")
        except Exception as e:
            print(f"Error adding documents: {str(e)}")

    def query(self, query: str, n_results: int = 3) -> List[Dict]:
        try:
            results = self.collection.query(
                query_texts=[query],
                n_results=n_results
            )
            print(f"Found {len(results['documents'][0])} relevant documents")
            return results
        except Exception as e:
            print(f"Error querying: {str(e)}")
            return {"documents": [[]], "metadatas": [[]], "distances": [[]]}

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

            response = client.chat.completions.create(
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
    
    if not validate_url_format(url):
        return jsonify({'error': 'Invalid URL format'}), 400
    
    openai_api_key = os.getenv('OPENAI_API_KEY')

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    if not openai_api_key:
        return jsonify({'error': 'OpenAI API key is required'}), 400

    try:
        scraper = DocumentScraper()
        markdown_content = scraper.scrape_documentation(url)

        collection_name = f"docs_{urlparse(url).netloc}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        print(f"Creating collection: {collection_name}")
        
        rag_system = RAGSystem(collection_name=collection_name)
        
        documents = [item['content'] for item in scraper.text_content]
        ids = [str(i) for i in range(len(documents))]
        
        print(f"Adding {len(documents)} documents")
        rag_system.add_documents(documents, ids)

        # Store collection name in app config for future queries
        app.config['CURRENT_COLLECTION'] = collection_name

        return jsonify({
            'markdown': markdown_content,
            'message': f'Documentation scraped successfully. Processed {len(scraper.visited_urls)} pages.',
            'collection_name': collection_name 
        })

    except Exception as e:
        print(f"Error in scrape endpoint: {str(e)}")
        return jsonify({'error': str(e)}), 500
        
@app.route('/query', methods=['POST'])
def query_docs():
    try:
        data = request.get_json()
        query = data.get('query')
        collection_name = app.config.get('CURRENT_COLLECTION')
        
        if not query:
            return jsonify({'error': 'Query is required'}), 400
            
        if not collection_name:
            return jsonify({'error': 'No collection loaded'}), 400
            
        rag_system = RAGSystem(collection_name=collection_name)
        response = rag_system.generate_response(query)
        
        return jsonify({'answer': response}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500



@app.route('/collections', methods=['GET'])
def list_collections():
    try:
        client = chromadb.PersistentClient(path="./chroma_db")
        collections = client.list_collections()
        return jsonify({
            'collections': [col.name for col in collections],
            'current_collection': app.config.get('CURRENT_COLLECTION')
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)