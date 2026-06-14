"""One-off script: generate BudgetSnavings brand assets (app icon + splash) via Gemini Nano Banana."""

import asyncio
import base64
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv(Path(__file__).parent / ".env")

API_KEY = os.getenv("EMERGENT_LLM_KEY")
OUT_DIR = Path(__file__).parent.parent / "frontend" / "assets" / "images"
OUT_DIR.mkdir(parents=True, exist_ok=True)


ICON_PROMPT = """Design a modern minimalist mobile app icon for a personal finance app named "BudgetSnavings".

Style requirements:
- Square 1:1 composition, edge to edge artwork (no rounded corners — iOS will apply them automatically).
- Deep moss-green background (#2E4D40 to #3B6352 subtle gradient).
- Centerpiece: a stylized white wallet OR receipt with a soft glowing camera-scan corner brackets overlay, suggesting "snap a receipt".
- Add one warm gold accent (#D4A017) — like a coin or sparkle — for premium fintech feel.
- Flat geometric design, clean shapes, subtle inner shadow for depth.
- No text, no letters, no words anywhere in the image. Pure iconographic.
- Crisp, vector-style, high contrast, professional fintech brand mark.
- Looks great at small sizes on a home screen.

The icon should evoke: smart spending, automatic capture, savings."""


SPLASH_PROMPT = """Create a splash screen graphic for a mobile finance app named "BudgetSnavings".

Style requirements:
- Square 1:1 composition, transparent or solid off-white background (#F2F2F7).
- Center: the same moss-green wallet/receipt brand mark with a gold coin accent and soft camera-scan corner brackets.
- Single hero icon, centered, with generous empty padding around it (the icon should occupy only the central 40-50% of the canvas).
- Flat, clean, vector style. Soft outer glow in light moss-green for warmth.
- No text, no letters, no words. Pure icon only.
- Premium fintech feel."""


async def generate(prompt: str, filename: str) -> Path:
    chat = LlmChat(
        api_key=API_KEY,
        session_id=f"asset-{filename}",
        system_message="You are an expert brand designer producing high-quality vector-style icons.",
    )
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(
        modalities=["image", "text"]
    )

    msg = UserMessage(text=prompt)
    text, images = await chat.send_message_multimodal_response(msg)

    if not images:
        raise RuntimeError(f"No image returned for {filename}. Text: {text[:200]}")

    img = images[0]
    out_path = OUT_DIR / filename
    out_path.write_bytes(base64.b64decode(img["data"]))
    print(f"Saved {out_path} ({len(img['data'])//1024} KB encoded)")
    return out_path


async def main():
    if not API_KEY:
        print("Missing EMERGENT_LLM_KEY", file=sys.stderr)
        sys.exit(1)

    print("Generating app icon…")
    await generate(ICON_PROMPT, "icon.png")

    print("Generating splash icon…")
    await generate(SPLASH_PROMPT, "splash-icon.png")

    # Adaptive icon (Android foreground) — reuse same brand mark
    print("Generating adaptive (Android) foreground…")
    await generate(SPLASH_PROMPT, "adaptive-icon.png")

    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
