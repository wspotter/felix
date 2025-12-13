"""
Voting System - Aggregates votes from multiple voters.

Combines signals from keyword matching, embedding similarity,
user history, and conversation context to select the best tool.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional, Any

from .interfaces import VoteResult
from .voters import KeywordVoter, EmbeddingVoter, HistoryVoter, ContextVoter
from .examples import ExampleStore

import structlog
logger = structlog.get_logger(__name__)


@dataclass
class VoterConfig:
    """Configuration for a voter."""
    name: str
    weight: float
    enabled: bool = True


class VotingSystem:
    """
    Aggregates votes from multiple voters to select the best tool.
    
    Each voter provides confidence scores for tools, and the
    voting system combines them using configurable weights.
    """
    
    def __init__(
        self,
        example_store: ExampleStore,
        history_path: str,
        weights: Optional[Dict[str, float]] = None
    ):
        """
        Initialize the voting system.
        
        Args:
            example_store: Store for tool call examples
            history_path: Path to user history data
            weights: Optional custom weights {voter_name: weight}
        """
        # Default weights
        self.weights = weights or {
            "keyword": 0.25,
            "embedding": 0.35,
            "history": 0.20,
            "context": 0.20,
        }
        
        # Normalize weights to sum to 1.0
        total = sum(self.weights.values())
        if total > 0:
            self.weights = {k: v / total for k, v in self.weights.items()}
        
        # Initialize voters
        self.keyword_voter = KeywordVoter()
        self.embedding_voter = EmbeddingVoter(example_store)
        self.history_voter = HistoryVoter(history_path)
        self.context_voter = ContextVoter()
        
        self.example_store = example_store
    
    def vote(
        self,
        query: str,
        llm_suggestion: Optional[str] = None,
        candidates: Optional[List[str]] = None,
        context: Optional[List[dict]] = None,
        user_id: str = "default"
    ) -> VoteResult:
        """
        Run all voters and aggregate results.
        
        Args:
            query: User's query
            llm_suggestion: Tool the LLM suggested (if any)
            candidates: List of candidate tools to consider
            context: Recent conversation messages
            user_id: User identifier for history
            
        Returns:
            VoteResult with winner, confidence, and breakdown
        """
        # Collect votes from each voter
        voter_results = {}
        
        # Keyword voter
        keyword_votes = self.keyword_voter.vote(query)
        voter_results["keyword"] = keyword_votes
        
        # Embedding voter
        embedding_votes = self.embedding_voter.vote(query)
        voter_results["embedding"] = embedding_votes
        
        # History voter
        history_votes = self.history_voter.vote(query, user_id)
        voter_results["history"] = history_votes
        
        # Context voter
        context_votes = self.context_voter.vote(query, context)
        voter_results["context"] = context_votes
        
        # Aggregate votes
        aggregated = self._aggregate_votes(voter_results, candidates)
        
        # Add LLM suggestion as a weak signal if provided
        if llm_suggestion and llm_suggestion not in aggregated:
            aggregated[llm_suggestion] = 0.1  # Small boost for LLM's choice
        elif llm_suggestion:
            aggregated[llm_suggestion] += 0.1  # Boost existing
        
        # Find winner
        if aggregated:
            winner = max(aggregated, key=aggregated.get)
            confidence = aggregated[winner]
        else:
            winner = llm_suggestion or ""
            confidence = 0.0
        
        logger.info(
            "vote_completed",
            query=query[:50],
            winner=winner,
            confidence=round(confidence, 3),
            voter_count=len(voter_results)
        )
        
        return VoteResult(
            winner=winner,
            confidence=confidence,
            votes=aggregated,
            voter_breakdown=voter_results
        )
    
    def _aggregate_votes(
        self,
        voter_results: Dict[str, Dict[str, float]],
        candidates: Optional[List[str]] = None
    ) -> Dict[str, float]:
        """
        Aggregate votes from all voters using weights.
        
        Args:
            voter_results: {voter_name: {tool: score}}
            candidates: Optional list of valid candidate tools
            
        Returns:
            {tool: aggregated_score}
        """
        aggregated = {}
        
        for voter_name, votes in voter_results.items():
            weight = self.weights.get(voter_name, 0)
            
            for tool, score in votes.items():
                # Filter by candidates if provided
                if candidates and tool not in candidates:
                    continue
                
                weighted_score = score * weight
                aggregated[tool] = aggregated.get(tool, 0) + weighted_score
        
        return aggregated
    
    def record_usage(self, tool: str, user_id: str = "default"):
        """Record a tool usage for history."""
        self.history_voter.record(tool, user_id)
    
    def get_voter_weights(self) -> Dict[str, float]:
        """Get current voter weights."""
        return self.weights.copy()
    
    def set_voter_weights(self, weights: Dict[str, float]):
        """Set voter weights."""
        # Normalize
        total = sum(weights.values())
        if total > 0:
            self.weights = {k: v / total for k, v in weights.items()}
    
    def explain_vote(self, vote_result: VoteResult) -> str:
        """
        Generate human-readable explanation of a vote.
        
        Args:
            vote_result: Result from vote()
            
        Returns:
            Explanation string
        """
        lines = [f"Winner: {vote_result.winner} (confidence: {vote_result.confidence:.2f})"]
        lines.append("")
        lines.append("Voter breakdown:")
        
        for voter_name, votes in vote_result.voter_breakdown.items():
            weight = self.weights.get(voter_name, 0)
            lines.append(f"  {voter_name} (weight: {weight:.2f}):")
            
            if votes:
                sorted_votes = sorted(votes.items(), key=lambda x: x[1], reverse=True)
                for tool, score in sorted_votes[:3]:  # Top 3
                    lines.append(f"    {tool}: {score:.3f}")
            else:
                lines.append("    (no votes)")
        
        return "\n".join(lines)
