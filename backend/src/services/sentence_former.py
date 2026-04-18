"""
Converts an ISL gloss sequence into a natural English sentence using Claude.
ISL gloss is SOV-ordered with dropped function words — Claude reconstructs
proper English with correct grammar and natural phrasing.
"""

import os
import anthropic

_client = None

def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        kwargs = {"api_key": os.getenv("ANTHROPIC_API_KEY", "")}
        base_url = os.getenv("ANTHROPIC_BASE_URL")
        if base_url:
            kwargs["base_url"] = base_url
        _client = anthropic.Anthropic(**kwargs)
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

    # Build few-shot messages
    messages = []
    for src, tgt in EXAMPLES:
        messages.append({"role": "user", "content": src})
        messages.append({"role": "assistant", "content": tgt})
    messages.append({"role": "user", "content": gloss})

    client = _get_client()
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=100,
        system=SYSTEM_PROMPT,
        messages=messages,
    )

    return response.content[0].text.strip()
