"""
Converts natural English text to ISL gloss sequence + NMM flags using Claude.

ISL grammar rules applied:
  - SOV word order (verb moves to end)
  - Topic fronting for questions
  - Drop articles, auxiliaries, copula
  - Negation clause-finally
  - Tense markers TIME-PAST / TIME-FUTURE at start
  - NMM: "question" for yes/no and wh-questions, "negation" for negative sentences
"""

import json
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


SYSTEM_PROMPT = """You convert English sentences into Indian Sign Language (ISL) gloss sequences.

ISL grammar rules to apply:
1. SOV order — move verb to end: "She drinks water" → SHE WATER DRINK
2. Topic fronting — wh-word goes last: "What is your name?" → YOU NAME WHAT
3. Drop function words — remove a/an/the, is/are/was/were/am, do/does/did
4. Negation clause-finally — NOT goes last: "I don't know" → ME KNOW NOT
5. Tense markers — "I ate" → TIME-PAST ME EAT, "I will go" → TIME-FUTURE ME GO
6. Use uppercase ISL gloss words

Also output the NMM (non-manual marker):
- "question" — for any question (yes/no or wh-question)
- "negation" — for negative sentences
- "none" — for everything else

Respond ONLY with valid JSON: {"gloss": ["TOKEN", ...], "nmm": "none"|"question"|"negation"}
No explanation, no markdown, no backticks — just the raw JSON object."""

EXAMPLES = [
    ("What is your name?",          '{"gloss": ["YOU", "NAME", "WHAT"], "nmm": "question"}'),
    ("I want water.",                '{"gloss": ["ME", "WATER", "WANT"], "nmm": "none"}'),
    ("I need help.",                 '{"gloss": ["ME", "HELP", "NEED"], "nmm": "none"}'),
    ("I don't understand.",          '{"gloss": ["ME", "UNDERSTAND", "NOT"], "nmm": "negation"}'),
    ("Are you okay?",                '{"gloss": ["YOU", "OKAY", "YES-NO"], "nmm": "question"}'),
    ("Thank you very much.",         '{"gloss": ["ME", "THANK_YOU"], "nmm": "none"}'),
    ("Where are you going?",         '{"gloss": ["YOU", "GO", "WHERE"], "nmm": "question"}'),
    ("I already ate.",               '{"gloss": ["TIME-PAST", "ME", "EAT"], "nmm": "none"}'),
    ("He is not a doctor.",          '{"gloss": ["HE", "DOCTOR", "NOT"], "nmm": "negation"}'),
    ("Please stop.",                 '{"gloss": ["PLEASE", "STOP"], "nmm": "none"}'),
    ("Can you come here?",           '{"gloss": ["YOU", "HERE", "COME", "CAN"], "nmm": "question"}'),
    ("I will go tomorrow.",          '{"gloss": ["TIME-FUTURE", "ME", "GO"], "nmm": "none"}'),
]


async def text_to_gloss(text: str) -> dict:
    """
    Convert English text to ISL gloss + NMM.
    Returns: {"gloss": [...], "nmm": "none"|"question"|"negation"}
    """
    if not text.strip():
        return {"gloss": [], "nmm": "none"}

    messages = []
    for src, tgt in EXAMPLES:
        messages.append({"role": "user",      "content": src})
        messages.append({"role": "assistant", "content": tgt})
    messages.append({"role": "user", "content": text.strip()})

    client = _get_client()
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=150,
        system=SYSTEM_PROMPT,
        messages=messages,
    )

    raw = response.content[0].text.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Fallback: treat each word as a gloss token
        words = [w.upper() for w in text.split() if w.isalpha()]
        return {"gloss": words, "nmm": "none"}
