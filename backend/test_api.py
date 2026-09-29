import os

from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")

print("API key loaded:", bool(api_key))

client = genai.Client(
    api_key=api_key,
    http_options=types.HttpOptions(
        timeout=60000
    )
)

print("Sending request...")

response = client.models.generate_content(
    model="gemini-3.5-flash-lite",
    contents="Say hello in one sentence."
)

print("Response received:")
print(response.text)

client.close()