import asyncio
import os
from dotenv import load_dotenv
from server.llm.ollama import list_models_for_backend

load_dotenv()

async def main():
    """
    Test model listing for all supported backends.
    Reads configuration from .env file.
    """
    print("="*30)
    print("Backend Health Check")
    print("="*30)

    # --- Test Ollama ---
    print("\n[1] Testing Ollama...")
    try:
        ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        models = await list_models_for_backend("ollama", ollama_url)
        if models:
            print(f"  ✅ SUCCESS: Found {len(models)} models.")
            for model in models[:3]:
                print(f"     - {model.get('name')}")
        else:
            print("  ❌ FAILURE: No models returned.")
    except Exception as e:
        print(f"  ❌ ERROR: {e}")

    # --- Test LM Studio ---
    print("\n[2] Testing LM Studio...")
    try:
        lmstudio_url = os.getenv("LMSTUDIO_URL", "http://localhost:1234")
        models = await list_models_for_backend("lmstudio", lmstudio_url)
        if models:
            print(f"  ✅ SUCCESS: Found {len(models)} models.")
            for model in models[:3]:
                print(f"     - {model.get('name')}")
        else:
            print("  ❌ FAILURE: No models returned.")
    except Exception as e:
        print(f"  ❌ ERROR: {e}")

    # --- Test OpenRouter ---
    print("\n[3] Testing OpenRouter...")
    # OpenRouter uses OPENAI_API_KEY when backend is 'openai' with OpenRouter URL
    openrouter_api_key = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY")
    openai_url = os.getenv("OPENAI_URL", "")
    is_openrouter = "openrouter.ai" in openai_url
    
    if not openrouter_api_key and not is_openrouter:
        print("  ⚠️ SKIPPED: No OpenRouter API key configured.")
    else:
        try:
            # Use 'openai' backend with OpenRouter URL for compatibility
            openrouter_url = openai_url if is_openrouter else os.getenv("OPENROUTER_URL", "https://openrouter.ai")
            models = await list_models_for_backend(
                "openai",  # Use openai backend which now supports OpenRouter detection
                openrouter_url,
                api_key=openrouter_api_key
            )
            if models:
                print(f"  ✅ SUCCESS: Found {len(models)} models.")
                for model in models[:3]:
                    print(f"     - {model.get('name')}")
            else:
                print("  ❌ FAILURE: No models returned.")
        except Exception as e:
            print(f"  ❌ ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(main())
