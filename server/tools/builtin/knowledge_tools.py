"""
Knowledge Search Tools
Integrates mcpower FAISS vector search for semantic knowledge retrieval.
"""
import json
from pathlib import Path
from typing import Any, Optional
import structlog

from ..registry import tool_registry

logger = structlog.get_logger()

# Configuration - path to mcpower datasets
MCPOWER_PATH = Path("/home/stacy/mcpower")
DATASETS_PATH = MCPOWER_PATH / "datasets"
DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

# Lazy-loaded dependencies
_faiss = None
_SentenceTransformer = None


def _ensure_dependencies():
    """Lazy load FAISS and sentence-transformers."""
    global _faiss, _SentenceTransformer
    
    if _faiss is None:
        try:
            import faiss
            _faiss = faiss
        except ImportError:
            raise RuntimeError(
                "faiss-cpu is not installed. Run: pip install faiss-cpu"
            )
    
    if _SentenceTransformer is None:
        try:
            from sentence_transformers import SentenceTransformer
            _SentenceTransformer = SentenceTransformer
        except ImportError:
            raise RuntimeError(
                "sentence-transformers is not installed. Run: pip install sentence-transformers"
            )
    
    return _faiss, _SentenceTransformer


def _load_documents(metadata_path: Path) -> dict[str, Any]:
    """Load documents metadata from JSON file."""
    content = metadata_path.read_text(encoding='utf-8')
    data = json.loads(content)
    
    if isinstance(data, list):
        return {'model': DEFAULT_MODEL, 'documents': data}
    
    if not isinstance(data, dict):
        raise ValueError('Metadata file must contain an object or array of documents')
    
    if 'documents' not in data or not isinstance(data['documents'], list):
        raise ValueError('Metadata file missing "documents" array')
    
    return data


def _resolve_index_file(index_path: Path) -> Path:
    """Find the FAISS index file in a directory."""
    if index_path.is_file():
        return index_path
    
    candidates = sorted(
        list(index_path.glob('*.index')) + list(index_path.glob('*.faiss'))
    )
    if not candidates:
        raise FileNotFoundError(f"No FAISS index files found in {index_path}")
    
    return candidates[0]


def _get_available_datasets() -> list[dict[str, Any]]:
    """List available knowledge datasets."""
    datasets = []
    
    if not DATASETS_PATH.exists():
        return datasets
    
    for dataset_dir in DATASETS_PATH.iterdir():
        if not dataset_dir.is_dir():
            continue
        
        # Check for required files
        metadata_file = dataset_dir / "metadata.json"
        index_dir = dataset_dir / "index"
        manifest_file = dataset_dir / "manifest.json"
        
        if not metadata_file.exists() or not index_dir.exists():
            continue
        
        # Get dataset info
        info = {
            "name": dataset_dir.name,
            "path": str(dataset_dir),
            "has_manifest": manifest_file.exists(),
        }
        
        # Try to read manifest for description
        if manifest_file.exists():
            try:
                manifest = json.loads(manifest_file.read_text())
                info["description"] = manifest.get("description", "")
                info["document_count"] = manifest.get("document_count", 0)
            except Exception:
                pass
        
        datasets.append(info)
    
    return datasets


# Cache for loaded models and indexes (avoid reloading on each query)
_model_cache: dict[str, Any] = {}
_index_cache: dict[str, tuple[Any, list]] = {}


def _get_model(model_name: str):
    """Get or create a cached sentence transformer model."""
    if model_name not in _model_cache:
        _, SentenceTransformer = _ensure_dependencies()
        logger.info("loading_model", model=model_name)
        _model_cache[model_name] = SentenceTransformer(model_name)
    return _model_cache[model_name]


def _get_index_and_docs(dataset_name: str) -> tuple[Any, list, str]:
    """Get or load a cached FAISS index and documents."""
    if dataset_name not in _index_cache:
        faiss, _ = _ensure_dependencies()
        
        dataset_path = DATASETS_PATH / dataset_name
        metadata_path = dataset_path / "metadata.json"
        index_dir = dataset_path / "index"
        
        if not dataset_path.exists():
            raise FileNotFoundError(f"Dataset not found: {dataset_name}")
        if not metadata_path.exists():
            raise FileNotFoundError(f"Metadata not found: {metadata_path}")
        if not index_dir.exists():
            raise FileNotFoundError(f"Index not found: {index_dir}")
        
        # Load documents
        docs_payload = _load_documents(metadata_path)
        documents = docs_payload['documents']
        model_name = docs_payload.get('model', DEFAULT_MODEL)
        
        # Load FAISS index
        index_file = _resolve_index_file(index_dir)
        logger.info("loading_faiss_index", file=str(index_file))
        faiss_index = faiss.read_index(str(index_file))
        
        _index_cache[dataset_name] = (faiss_index, documents, model_name)
    
    return _index_cache[dataset_name]


@tool_registry.register(
    description="PRIORITY TOOL: Search local knowledge bases FIRST before web_search. Contains test-facts, documentation, and local information that web_search cannot find. Always try this tool first for factual questions.",
    category="knowledge",
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search query - describe what you're looking for"
            },
            "dataset": {
                "type": "string",
                "description": "Optional: specific dataset to search ('test-facts', 'cherry-studio-docs', or 'sample-docs'). Omit to search all."
            },
            "num_results": {
                "type": "integer",
                "description": "Number of results to return (default: 3)"
            }
        },
        "required": ["query"]
    }
)
async def knowledge_search(
    query: str,
    dataset: str = "",
    num_results: int = 3
) -> dict:
    """
    Search knowledge datasets using semantic similarity.
    
    Args:
        query: Search query text
        dataset: Name of the dataset to search (empty = search all)
        num_results: Maximum number of results to return
    
    Returns:
        Dictionary with search results including snippets and relevance scores
    """
    try:
        faiss, _ = _ensure_dependencies()
        
        # Handle None/invalid values from LLM - be very defensive
        if num_results is None or num_results == "":
            num_results = 3
        try:
            num_results = int(num_results)
        except (ValueError, TypeError):
            num_results = 3
        
        if dataset is None:
            dataset = ""
        dataset = str(dataset).strip()
        
        # If no dataset specified, search all available datasets
        if not dataset:
            all_datasets = _get_available_datasets()
            all_results = []
            
            for ds in all_datasets:
                try:
                    ds_name = ds['name']
                    faiss_index, documents, model_name = _get_index_and_docs(ds_name)
                    
                    if faiss_index.ntotal == 0:
                        continue
                    
                    model = _get_model(model_name)
                    query_embedding = model.encode([query], convert_to_numpy=True)
                    query_vec = query_embedding.astype('float32')
                    faiss.normalize_L2(query_vec)
                    
                    top_k = min(num_results, faiss_index.ntotal)
                    scores, indices = faiss_index.search(query_vec, top_k)
                    
                    for score, idx in zip(scores[0], indices[0]):
                        if idx < 0 or idx >= len(documents):
                            continue
                        doc = documents[idx]
                        title = doc.get('title') or doc.get('path') or f'Document {idx}'
                        snippet = doc.get('snippet') or doc.get('content', '')[:300]
                        all_results.append({
                            "title": title,
                            "snippet": snippet,
                            "score": float(score),
                            "path": doc.get('path', ''),
                            "dataset": ds_name
                        })
                except Exception as e:
                    logger.warning("dataset_search_error", dataset=ds['name'], error=str(e))
                    continue
            
            # Sort by score and take top results
            all_results.sort(key=lambda x: x['score'], reverse=True)
            results = all_results[:num_results]
            
            if results:
                top = results[0]
                response_text = f"Found {len(results)} result(s). Most relevant from '{top['dataset']}': \"{top['title']}\" - {top['snippet'][:150]}..."
            else:
                response_text = f"No relevant results found for '{query}' in any knowledge base."
            
            return {
                "text": response_text,
                "results": results,
                "query": query
            }
        
        # Search specific dataset
        faiss_index, documents, model_name = _get_index_and_docs(dataset)
        
        if faiss_index.ntotal == 0:
            return {
                "text": f"The knowledge base '{dataset}' is empty.",
                "results": []
            }
        
        # Get cached model and encode query
        model = _get_model(model_name)
        query_embedding = model.encode([query], convert_to_numpy=True)
        query_vec = query_embedding.astype('float32')
        faiss.normalize_L2(query_vec)
        
        # Search
        top_k = min(max(num_results, 1), faiss_index.ntotal)
        scores, indices = faiss_index.search(query_vec, top_k)
        
        # Format results
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(documents):
                continue
            
            doc = documents[idx]
            title = doc.get('title') or doc.get('path') or f'Document {idx}'
            snippet = doc.get('snippet') or doc.get('content', '')[:300]
            
            results.append({
                "title": title,
                "snippet": snippet,
                "score": float(score),
                "path": doc.get('path', '')
            })
        
        # Generate natural language response
        if results:
            top_result = results[0]
            response_text = f"Found {len(results)} result(s) in '{dataset}'. "
            response_text += f"Most relevant: \"{top_result['title']}\" - {top_result['snippet'][:150]}..."
        else:
            response_text = f"No relevant results found for '{query}' in the {dataset} knowledge base."
        
        return {
            "text": response_text,
            "results": results,
            "dataset": dataset,
            "query": query
        }
    
    except FileNotFoundError as e:
        return {
            "text": f"Knowledge base error: {str(e)}",
            "error": str(e)
        }
    except Exception as e:
        logger.error("knowledge_search_error", error=str(e), query=query, dataset=dataset)
        return {
            "text": f"Search failed: {str(e)}",
            "error": str(e)
        }


@tool_registry.register(
    description="List available knowledge datasets that can be searched.",
    category="knowledge",
    parameters={
        "type": "object",
        "properties": {},
        "required": []
    }
)
async def list_knowledge_datasets() -> dict:
    """
    List all available knowledge datasets.
    
    Returns:
        Dictionary with list of available datasets
    """
    try:
        datasets = _get_available_datasets()
        
        if not datasets:
            return {
                "text": "No knowledge datasets are currently available.",
                "datasets": []
            }
        
        # Format response
        dataset_names = [d['name'] for d in datasets]
        response_text = f"Available knowledge bases: {', '.join(dataset_names)}"
        
        return {
            "text": response_text,
            "datasets": datasets
        }
    
    except Exception as e:
        logger.error("list_datasets_error", error=str(e))
        return {
            "text": f"Failed to list datasets: {str(e)}",
            "error": str(e)
        }
