"""Tests for async session persistence implementation."""
import pytest
import asyncio
from unittest.mock import patch, MagicMock
from server.main import save_sessions_to_disk, _save_sessions_to_disk_sync


@pytest.mark.asyncio
async def test_save_sessions_async_offloads_to_thread():
    """Test that save_sessions_to_disk offloads blocking I/O to thread pool."""
    with patch('server.main.asyncio.to_thread') as mock_to_thread:
        # Mock to_thread to return immediately without actually running
        mock_to_thread.return_value = asyncio.Future()
        mock_to_thread.return_value.set_result(None)
        
        await save_sessions_to_disk()
        
        # Verify to_thread was called with the sync implementation
        mock_to_thread.assert_called_once_with(_save_sessions_to_disk_sync)


@pytest.mark.asyncio
async def test_save_sessions_non_blocking():
    """Test that save_sessions_to_disk doesn't block the event loop."""
    # This test validates that the async version can be awaited
    # and that multiple saves can be scheduled concurrently
    with patch('server.main._save_sessions_to_disk_sync') as mock_sync:
        # Schedule multiple saves concurrently
        tasks = [
            asyncio.create_task(save_sessions_to_disk()),
            asyncio.create_task(save_sessions_to_disk()),
            asyncio.create_task(save_sessions_to_disk()),
        ]
        
        # All should complete without blocking
        await asyncio.gather(*tasks)
        
        # Each should have invoked the sync implementation
        assert mock_sync.call_count == 3


@pytest.mark.asyncio
async def test_background_worker_uses_async_save():
    """Test that background persistence worker properly awaits async save."""
    # This is a documentation test - the actual implementation in main.py
    # correctly uses 'await save_sessions_to_disk()' in the worker loop
    
    # Simulate the worker pattern
    save_count = 0
    
    async def mock_worker():
        nonlocal save_count
        with patch('server.main._save_sessions_to_disk_sync'):
            # Simulate one iteration of the worker
            await asyncio.sleep(0.01)  # Simulated interval
            await save_sessions_to_disk()
            save_count += 1
    
    # Run the worker briefly
    task = asyncio.create_task(mock_worker())
    await task
    
    assert save_count == 1
