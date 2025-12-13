"""
Tool Tutor - Main module that ties everything together.

Provides the primary interface for Felix to interact with
the tool tutor system.
"""

from pathlib import Path
from typing import Optional, List, Dict, Any

from .interfaces import ToolTutorInterface, ToolCall, NoOpToolTutor
from .examples import ExampleStore
from .voters import KeywordVoter, EmbeddingVoter, HistoryVoter, ContextVoter
from .voting import VotingSystem
from .confidence import ConfidenceParser
from .injector import ExampleInjector
from .learning import LearningModule

import structlog
logger = structlog.get_logger(__name__)


class ToolTutor(ToolTutorInterface):
    """
    Main Tool Tutor implementation.
    
    Combines all components:
    - Example injection for few-shot learning
    - Confidence parsing from LLM responses
    - Voting system for uncertain calls
    - Learning from outcomes
    """
    
    def __init__(
        self,
        data_dir: str,
        confidence_threshold: float = 0.8,
        example_count: int = 3,
        learning_enabled: bool = True,
        auto_correct: bool = True,
        voter_weights: Optional[Dict[str, float]] = None,
        embedding_model = None
    ):
        """
        Initialize the Tool Tutor.
        
        Args:
            data_dir: Directory for storing data files
            confidence_threshold: Threshold for triggering voting
            example_count: Number of examples to inject
            learning_enabled: Whether to learn from outcomes
            auto_correct: Whether to override LLM when voters disagree
            voter_weights: Custom weights for voters
            embedding_model: Pre-loaded sentence transformer model
        """
        self.data_dir = Path(data_dir)
        self.confidence_threshold = confidence_threshold
        self.example_count = example_count
        self.learning_enabled = learning_enabled
        self.auto_correct = auto_correct
        
        # Load or create embedding model
        self.embedding_model = embedding_model
        if self.embedding_model is None:
            self._load_embedding_model()
        
        # Initialize components
        self.example_store = ExampleStore(
            data_path=str(self.data_dir / "examples.json"),
            seed_path=str(self.data_dir / "seed" / "examples.json"),
            embedding_model=self.embedding_model
        )
        
        self.voting_system = VotingSystem(
            example_store=self.example_store,
            history_path=str(self.data_dir / "history.json"),
            weights=voter_weights
        )
        
        self.confidence_parser = ConfidenceParser()
        
        self.injector = ExampleInjector(self.example_store)
        
        self.learning = LearningModule(
            example_store=self.example_store,
            history_voter=self.voting_system.history_voter,
            stats_path=str(self.data_dir / "stats.json")
        )
        
        logger.info(
            "tool_tutor_initialized",
            threshold=confidence_threshold,
            examples=self.example_store.get_stats()["total"]
        )
    
    def _load_embedding_model(self):
        """Load sentence transformer model for embeddings."""
        try:
            from sentence_transformers import SentenceTransformer
            self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
            logger.info("embedding_model_loaded", model="all-MiniLM-L6-v2")
        except ImportError:
            logger.warning("sentence_transformers_not_installed")
            self.embedding_model = None
        except Exception as e:
            logger.error("embedding_model_failed", error=str(e))
            self.embedding_model = None
    
    def prepare_prompt(
        self, 
        query: str, 
        system_prompt: str,
        context: Optional[List[dict]] = None
    ) -> tuple[str, str]:
        """
        Prepare the prompt before sending to LLM.
        
        Injects relevant few-shot examples into system prompt.
        
        Args:
            query: User's current query
            system_prompt: Base system prompt
            context: Conversation context (unused but available)
            
        Returns:
            Tuple of (modified_system_prompt, query)
        """
        if self.example_count <= 0:
            return system_prompt, query
        
        enhanced_prompt = self.injector.inject(
            query=query,
            system_prompt=system_prompt,
            count=self.example_count
        )
        
        return enhanced_prompt, query
    
    def process_tool_call(
        self,
        query: str,
        llm_response: str,
        context: Optional[List[dict]] = None
    ) -> Optional[ToolCall]:
        """
        Process LLM response, apply voting if uncertain.
        
        Returns the final tool call decision.
        """
        # Parse LLM response
        tool_call = self.confidence_parser.parse(llm_response)
        
        if tool_call is None:
            logger.debug("no_tool_call_found", response=llm_response[:100])
            return None
        
        logger.info(
            "tool_call_parsed",
            tool=tool_call.tool,
            confidence=round(tool_call.confidence, 3)
        )
        
        # Check if we need to vote
        if tool_call.confidence >= self.confidence_threshold:
            # LLM is confident, trust it
            return tool_call
        
        # LLM is uncertain, ask voters
        vote_result = self.voting_system.vote(
            query=query,
            llm_suggestion=tool_call.tool,
            candidates=self.confidence_parser.get_candidates(llm_response),
            context=context
        )
        
        logger.info(
            "voting_completed",
            llm_tool=tool_call.tool,
            vote_winner=vote_result.winner,
            vote_confidence=round(vote_result.confidence, 3)
        )
        
        # Decide whether to override
        should_override = (
            self.auto_correct and
            vote_result.winner != tool_call.tool and
            vote_result.confidence > tool_call.confidence
        )
        
        if should_override:
            logger.info(
                "overriding_llm",
                from_tool=tool_call.tool,
                to_tool=vote_result.winner
            )
            tool_call.original_tool = tool_call.tool
            tool_call.tool = vote_result.winner
            tool_call.overridden = True
            tool_call.confidence = vote_result.confidence
        
        return tool_call
    
    def record_result(
        self,
        query: str,
        tool_call: ToolCall,
        success: bool,
        error: Optional[str] = None
    ) -> None:
        """
        Record the outcome of a tool call.
        """
        if not self.learning_enabled:
            return
        
        if success:
            self.learning.record_success(query, tool_call)
        else:
            self.learning.record_failure(query, tool_call, error)
    
    # Additional utility methods
    
    def get_stats(self) -> Dict[str, Any]:
        """Get comprehensive statistics."""
        return {
            "learning": self.learning.get_stats(),
            "examples": self.example_store.get_stats(),
            "config": {
                "confidence_threshold": self.confidence_threshold,
                "example_count": self.example_count,
                "learning_enabled": self.learning_enabled,
                "auto_correct": self.auto_correct
            },
            "voter_weights": self.voting_system.get_voter_weights()
        }
    
    def test_query(self, query: str) -> Dict[str, Any]:
        """
        Test a query without executing.
        
        Shows what the tutor would do for this query.
        """
        # Get vote results
        vote_result = self.voting_system.vote(query=query)
        
        # Get similar examples
        similar = self.example_store.find_similar(query, limit=3)
        
        return {
            "query": query,
            "vote": {
                "winner": vote_result.winner,
                "confidence": vote_result.confidence,
                "votes": vote_result.votes,
                "breakdown": vote_result.voter_breakdown
            },
            "similar_examples": [
                {"query": ex.query, "tool": ex.tool, "similarity": sim}
                for ex, sim in similar
            ],
            "explanation": self.voting_system.explain_vote(vote_result)
        }
    
    def set_confidence_threshold(self, threshold: float):
        """Update confidence threshold."""
        self.confidence_threshold = max(0.0, min(1.0, threshold))
        logger.info("threshold_updated", threshold=self.confidence_threshold)
    
    def add_example(
        self,
        query: str,
        tool: str,
        args: Dict[str, Any]
    ):
        """Manually add an example."""
        self.example_store.add(
            query=query,
            tool=tool,
            args=args,
            success=True,
            source="manual"
        )


def create_tool_tutor(
    settings = None,
    enabled: bool = True,
    data_dir: Optional[str] = None,
    **kwargs
) -> ToolTutorInterface:
    """
    Factory function to create a tool tutor.
    
    Returns NoOpToolTutor if disabled.
    
    Args:
        settings: Optional Settings object to pull config from
        enabled: Whether to enable the tutor (override)
        data_dir: Data directory path
        **kwargs: Additional arguments for ToolTutor
        
    Returns:
        ToolTutorInterface implementation
    """
    # Pull from settings if provided
    if settings is not None:
        enabled = settings.tool_tutor_enabled
        kwargs.setdefault('confidence_threshold', settings.tool_tutor_confidence_threshold)
        kwargs.setdefault('example_count', settings.tool_tutor_example_count)
        kwargs.setdefault('learning_enabled', settings.tool_tutor_learning_enabled)
        kwargs.setdefault('auto_correct', settings.tool_tutor_auto_correct)
        kwargs.setdefault('voter_weights', {
            "keyword": settings.tool_tutor_voter_keyword_weight,
            "embedding": settings.tool_tutor_voter_embedding_weight,
            "history": settings.tool_tutor_voter_history_weight,
            "context": settings.tool_tutor_voter_context_weight,
        })
    
    if not enabled:
        logger.info("tool_tutor_disabled")
        return NoOpToolTutor()
    
    if data_dir is None:
        # Default to server/tools/tutor/data
        data_dir = str(Path(__file__).parent / "data")
    
    return ToolTutor(data_dir=data_dir, **kwargs)
