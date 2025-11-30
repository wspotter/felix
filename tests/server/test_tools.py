"""
Tests for tool registry and built-in tools.
"""
import pytest
import asyncio
from datetime import datetime


class TestToolRegistry:
    """Test the tool registration system."""
    
    def test_registry_exists(self):
        """Test that tool registry is importable."""
        from server.tools import tool_registry
        
        assert tool_registry is not None
    
    def test_registry_has_list_tools(self):
        """Test that registry can list tools."""
        from server.tools import tool_registry
        
        tools = tool_registry.list_tools()
        
        assert isinstance(tools, list)
        assert len(tools) > 0
    
    def test_registry_has_get_tool(self):
        """Test that registry can get a tool by name."""
        from server.tools import tool_registry
        
        # get_current_time should always exist
        tool = tool_registry.get_tool("get_current_time")
        
        assert tool is not None
    
    def test_tool_has_name(self):
        """Test that tools have names."""
        from server.tools import tool_registry
        
        tools = tool_registry.list_tools()
        
        for tool in tools:
            assert hasattr(tool, 'name')
            assert len(tool.name) > 0
    
    def test_tool_has_description(self):
        """Test that tools have descriptions."""
        from server.tools import tool_registry
        
        tools = tool_registry.list_tools()
        
        for tool in tools:
            assert hasattr(tool, 'description')
            assert len(tool.description) > 0


class TestDateTimeTools:
    """Test built-in date/time tools."""
    
    @pytest.mark.asyncio
    async def test_get_current_time(self):
        """Test get_current_time tool."""
        from server.tools import tool_registry
        
        tool = tool_registry.get_tool("get_current_time")
        assert tool is not None
        
        # Use tool.execute() instead of tool.func()
        result = await tool.execute()
        
        assert isinstance(result, str)
        assert len(result) > 0
    
    @pytest.mark.asyncio
    async def test_get_current_date(self):
        """Test get_current_date tool."""
        from server.tools import tool_registry
        
        tool = tool_registry.get_tool("get_current_date")
        assert tool is not None
        
        result = await tool.execute()
        
        assert isinstance(result, str)
        # Should contain current year
        assert str(datetime.now().year) in result
    
    @pytest.mark.asyncio
    async def test_get_day_of_week(self):
        """Test get_day_of_week tool."""
        from server.tools import tool_registry
        
        tool = tool_registry.get_tool("get_day_of_week")
        if tool is None:
            pytest.skip("get_day_of_week tool not available")
        
        # Use correct parameter name: date_str
        result = await tool.execute(date_str="2025-01-01")
        
        assert isinstance(result, str)
        # Jan 1, 2025 is a Wednesday
        assert "Wednesday" in result or "wednesday" in result.lower()


class TestUtilityTools:
    """Test utility tools."""
    
    @pytest.mark.asyncio
    async def test_calculate(self):
        """Test calculate tool."""
        from server.tools import tool_registry
        
        tool = tool_registry.get_tool("calculate")
        if tool is None:
            pytest.skip("calculate tool not available")
        
        result = await tool.execute(expression="2 + 2")
        
        # The DuckDuckGo API may or may not return a result
        # Just verify we get a string response
        assert isinstance(result, str)
    
    @pytest.mark.asyncio
    async def test_tell_joke(self):
        """Test tell_joke tool."""
        from server.tools import tool_registry
        
        tool = tool_registry.get_tool("tell_joke")
        if tool is None:
            pytest.skip("tell_joke tool not available")
        
        result = await tool.execute()
        
        assert isinstance(result, str)
        assert len(result) > 10  # A joke should have some content


class TestSystemTools:
    """Test system information tools."""
    
    @pytest.mark.asyncio
    async def test_get_system_info(self):
        """Test get_system_info tool."""
        from server.tools import tool_registry
        
        tool = tool_registry.get_tool("get_system_info")
        if tool is None:
            pytest.skip("get_system_info tool not available")
        
        result = await tool.execute()
        
        assert isinstance(result, (str, dict))
    
    @pytest.mark.asyncio
    async def test_get_uptime(self):
        """Test get_uptime tool."""
        from server.tools import tool_registry
        
        tool = tool_registry.get_tool("get_uptime")
        if tool is None:
            pytest.skip("get_uptime tool not available")
        
        result = await tool.execute()
        
        assert isinstance(result, str)


class TestToolDefinitions:
    """Test that tools generate proper OpenAI-compatible definitions."""
    
    def test_tool_to_openai_format(self):
        """Test converting tools to OpenAI function format."""
        from server.tools import tool_registry
        
        # Check the get_tools_for_llm method
        tools = tool_registry.get_tools_for_llm()
        
        assert isinstance(tools, list)
        assert len(tools) > 0
        
        for tool in tools:
            assert 'type' in tool
            assert tool['type'] == 'function'
            assert 'function' in tool
            assert 'name' in tool['function']
            assert 'description' in tool['function']
            assert 'parameters' in tool['function']


class TestToolExecution:
    """Test tool execution via registry."""
    
    @pytest.mark.asyncio
    async def test_execute_via_registry(self):
        """Test executing a tool via the registry execute method."""
        from server.tools import tool_registry
        
        result = await tool_registry.execute("get_current_time")
        
        assert isinstance(result, str)
        assert len(result) > 0
    
    @pytest.mark.asyncio
    async def test_execute_unknown_tool_raises(self):
        """Test that executing unknown tool raises ValueError."""
        from server.tools import tool_registry
        
        with pytest.raises(ValueError):
            await tool_registry.execute("unknown_tool_that_does_not_exist")
