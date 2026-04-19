"""
Converts an ISL gloss sequence into a natural English sentence using Groq Llama-3.3.
ISL gloss is SOV-ordered with dropped function words — Llama reconstructs
proper English with correct grammar and natural phrasing.
"""

import os
from groq import AsyncGroq

_client: AsyncGroq | None = None


def _get_client() -> AsyncGroq:
    global _client
    if _client is None:
        _client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY", ""))
    return _client


SYSTEM_PROMPT = """You convert Indian Sign Language (ISL) gloss sequences into natural English sentences.

ISL gloss rules you must reverse:
- ISL is SOV (Subject-Object-Verb) — English is SVO
- Function words (articles, auxiliaries, copula) are dropped in ISL
- Negation appears clause-finally (e.g. "HE DOCTOR NOT" = "He is not a doctor")
- Questions use topic-fronting (e.g. "YOU NAME WHAT" = "What is your name?")
- Tense markers like TIME-PAST / TIME-FUTURE appear at the start

Output ONLY the natural English sentence. No explanation, no quotes."""

EXAMPLES = [
    ("ME WATER WANT", "I want water."),
    ("YOU NAME WHAT", "What is your name?"),
    ("ME HELP NEED", "I need help."),
    ("ME DOCTOR NOT", "I am not a doctor."),
    ("TIME-PAST ME EAT", "I ate already."),
    ("YOU GO WHERE", "Where are you going?"),
    ("ME UNDERSTAND NOT", "I don't understand."),
    ("ME SLEEP WANT", "I want to sleep."),
    ("YOU GOOD", "You are good."),
    ("ME THANK_YOU", "Thank you."),
]


async def gloss_to_sentence(gloss_tokens: list[str]) -> str:
    """Convert a list of ISL gloss tokens to a natural English sentence."""
    if not gloss_tokens:
        return ""

    gloss = " ".join(gloss_tokens)

    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for src, tgt in EXAMPLES:
        messages.append({"role": "user",      "content": src})
        messages.append({"role": "assistant", "content": tgt})
    messages.append({"role": "user", "content": gloss})

    client = _get_client()
    response = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=100,
        messages=messages,
    )

    return response.choices[0].message.content.strip()
