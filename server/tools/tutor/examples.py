"""
Example Store - Storage and retrieval of tool call examples.

Stores successful tool calls as examples for few-shot learning.
Uses JSON file storage with pre-computed embeddings for fast similarity search.
"""

import json
import os
from pathlib import Path
from typing import List, Optional, Dict, Any
from datetime import datetime
import numpy as np

from .interfaces import Example

import structlog
logger = structlog.get_logger(__name__)


class ExampleStore:
    """
    Persistent storage for tool call examples.
    
    Features:
    - JSON file storage (simple, portable)
    - Pre-computed embeddings for fast similarity search
    - Filter by tool, source, success status
    - Seed examples for bootstrap
    """
    
    def __init__(
        self, 
        data_path: str,
        seed_path: Optional[str] = None,
        embedding_model = None
    ):
        """
        Initialize the example store.
        
        Args:
            data_path: Path to examples.json file
            seed_path: Path to seed examples (loaded on first run)
            embedding_model: SentenceTransformer model for embeddings
        """
        self.data_path = Path(data_path)
        self.seed_path = Path(seed_path) if seed_path else None
        self.embedding_model = embedding_model
        self.examples: List[Example] = []
        
        self._load()
    
    def _load(self):
        """Load examples from disk, seeding if needed."""
        if self.data_path.exists():
            try:
                with open(self.data_path, 'r') as f:
                    data = json.load(f)
                    self.examples = [Example.from_dict(ex) for ex in data]
                logger.info("examples_loaded", count=len(self.examples))
            except Exception as e:
                logger.error("examples_load_failed", error=str(e))
                self.examples = []
        
        # If empty and seed exists, load seed
        if not self.examples and self.seed_path and self.seed_path.exists():
            self._load_seed()
    
    def _load_seed(self):
        """Load seed examples for bootstrap."""
        try:
            with open(self.seed_path, 'r') as f:
                data = json.load(f)
                self.examples = [Example.from_dict(ex) for ex in data]
            
            # Compute embeddings for seed examples
            if self.embedding_model:
                self._compute_embeddings(self.examples)
            
            self._save()
            logger.info("seed_examples_loaded", count=len(self.examples))
        except Exception as e:
            logger.error("seed_load_failed", error=str(e))
    
    def _save(self):
        """Save examples to disk."""
        try:
            self.data_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.data_path, 'w') as f:
                json.dump([ex.to_dict() for ex in self.examples], f, indent=2)
        except Exception as e:
            logger.error("examples_save_failed", error=str(e))
    
    def _compute_embeddings(self, examples: List[Example]):
        """Compute embeddings for examples that don't have them."""
        if not self.embedding_model:
            return
        
        to_embed = [ex for ex in examples if ex.embedding is None]
        if not to_embed:
            return
        
        try:
            queries = [ex.query for ex in to_embed]
            embeddings = self.embedding_model.encode(queries, convert_to_numpy=True)
            
            for ex, emb in zip(to_embed, embeddings):
                ex.embedding = emb.tolist()
            
            logger.info("embeddings_computed", count=len(to_embed))
        except Exception as e:
            logger.error("embedding_compute_failed", error=str(e))
    
    def add(
        self, 
        query: str, 
        tool: str, 
        args: Dict[str, Any],
        success: bool = True,
        source: str = "auto"
    ) -> Example:
        """
        Add a new example.
        
        Args:
            query: User query
            tool: Tool that was called
            args: Arguments passed to tool
            success: Whether the call succeeded
            source: How the example was created ("auto", "manual", "correction")
            
        Returns:
            The created Example
        """
        example = Example(
            id="",  # Will be auto-generated
            query=query,
            tool=tool,
            args=args,
            success=success,
            source=source
        )
        
        # Compute embedding
        if self.embedding_model:
            self._compute_embeddings([example])
        
        self.examples.append(example)
        self._save()
        
        logger.info("example_added", tool=tool, source=source)
        return example
    
    def find_similar(
        self, 
        query: str, 
        limit: int = 3,
        min_similarity: float = 0.3,
        tool_filter: Optional[str] = None,
        success_only: bool = True
    ) -> List[tuple]:
        """
        Find examples similar to a query.
        
        Args:
            query: Query to find similar examples for
            limit: Maximum number of results
            min_similarity: Minimum cosine similarity threshold
            tool_filter: Only return examples for this tool
            success_only: Only return successful examples
            
        Returns:
            List of (Example, similarity_score) tuples, sorted by similarity
        """
        if not self.embedding_model:
            logger.warning("no_embedding_model")
            return []
        
        # Filter examples
        candidates = self.examples
        if success_only:
            candidates = [ex for ex in candidates if ex.success]
        if tool_filter:
            candidates = [ex for ex in candidates if ex.tool == tool_filter]
        
        # Get examples with embeddings
        candidates = [ex for ex in candidates if ex.embedding is not None]
        
        if not candidates:
            return []
        
        try:
            # Embed query
            query_embedding = self.embedding_model.encode([query], convert_to_numpy=True)[0]
            
            # Compute similarities
            results = []
            for ex in candidates:
                ex_embedding = np.array(ex.embedding)
                similarity = np.dot(query_embedding, ex_embedding) / (
                    np.linalg.norm(query_embedding) * np.linalg.norm(ex_embedding)
                )
                if similarity >= min_similarity:
                    results.append((ex, float(similarity)))
            
            # Sort by similarity descending
            results.sort(key=lambda x: x[1], reverse=True)
            
            return results[:limit]
            
        except Exception as e:
            logger.error("similarity_search_failed", error=str(e))
            return []
    
    def get_by_tool(
        self, 
        tool: str, 
        limit: int = 10,
        success_only: bool = True
    ) -> List[Example]:
        """Get examples for a specific tool."""
        results = [ex for ex in self.examples if ex.tool == tool]
        if success_only:
            results = [ex for ex in results if ex.success]
        return results[:limit]
    
    def get_all(self, limit: int = 100) -> List[Example]:
        """Get all examples."""
        return self.examples[:limit]
    
    def delete(self, example_id: str) -> bool:
        """Delete an example by ID."""
        initial_count = len(self.examples)
        self.examples = [ex for ex in self.examples if ex.id != example_id]
        
        if len(self.examples) < initial_count:
            self._save()
            logger.info("example_deleted", id=example_id)
            return True
        return False
    
    def get_stats(self) -> Dict[str, Any]:
        """Get statistics about stored examples."""
        by_tool = {}
        by_source = {}
        success_count = 0
        
        for ex in self.examples:
            by_tool[ex.tool] = by_tool.get(ex.tool, 0) + 1
            by_source[ex.source] = by_source.get(ex.source, 0) + 1
            if ex.success:
                success_count += 1
        
        return {
            "total": len(self.examples),
            "success_count": success_count,
            "failure_count": len(self.examples) - success_count,
            "by_tool": by_tool,
            "by_source": by_source,
            "has_embeddings": sum(1 for ex in self.examples if ex.embedding is not None)
        }
    
    def export_training_data(self) -> List[dict]:
        """
        Export examples in a format suitable for fine-tuning.
        
        Returns format compatible with OpenAI/Llama fine-tuning.
        """
        training_data = []
        
        for ex in self.examples:
            if not ex.success:
                continue
            
            training_data.append({
                "messages": [
                    {"role": "user", "content": ex.query},
                    {"role": "assistant", "content": f"TOOL: {ex.tool}\nARGS: {json.dumps(ex.args)}"}
                ]
            })
        
        return training_data
