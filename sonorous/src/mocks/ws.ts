/**
 * Mock simulator WebSocket. Used only when VITE_USE_MSW=true.
 * Implements the SimulatorSocket interface but pushes canned payloads
 * from glossScenarios fixtures on a timer \u2014 no network involved.
 * This gives the UI a fully realistic stream to demo against.
 */

import type { ClientMsg, ServerMsg, GlossToken } from "@/api/types";
import type { WsStatus } from "@/api/socket";
import { glossScenarios, pickScenario } from "./fixtures/glossStreams";

type Listener = (msg: ServerMsg) => void;
type StatusListener = (s: WsStatus) => void;

export class MockSimulatorSocket {
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private status: WsStatus = "idle";
  private timers: number[] = [];
  private mode: "speech2isl" | "isl2speech" = "speech2isl";
  private scenarioIdx = 0;

  get currentStatus() {
    return this.status;
  }

  connect() {
    this.setStatus("connecting");
    window.setTimeout(() => this.setStatus("open"), 350);
  }

  disconnect() {
    this.clearTimers();
    this.setStatus("closed");
  }

  send(msg: ClientMsg) {
    if (msg.type === "start") {
      this.mode = msg.mode;
      this.clearTimers();
      this.runScenario();
    } else if (msg.type === "stop") {
      this.clearTimers();
    } else if (msg.type === "ping") {
      this.emit({ type: "pong", t: msg.t });
    }
  }

  onMessage(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  onStatus(l: StatusListener) {
    this.statusListeners.add(l);
    l(this.status);
    return () => this.statusListeners.delete(l);
  }

  private setStatus(s: WsStatus) {
    this.status = s;
    this.statusListeners.forEach((l) => l(s));
  }

  private emit(msg: ServerMsg) {
    this.listeners.forEach((l) => l(msg));
  }

  private schedule(fn: () => void, delay: number) {
    this.timers.push(window.setTimeout(fn, delay));
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private runScenario() {
    const urlParams = new URLSearchParams(window.location.search);
    const scenarioParam = urlParams.get("mock-scenario");
    const scenario =
      scenarioParam === "cycle"
        ? glossScenarios[this.scenarioIdx++ % glossScenarios.length]
        : pickScenario(scenarioParam);

    // Mode-specific orchestration
    if (this.mode === "speech2isl") {
      this.runSpeechToIsl(scenario);
    } else {
      this.runIslToSpeech(scenario);
    }
  }

  private runSpeechToIsl(scenario: ReturnType<typeof pickScenario>) {
    const t0 = performance.now();

    // Stream partial transcripts
    scenario.transcriptChunks.forEach((chunk, i) => {
      this.schedule(() => {
        const latency = 80 + Math.random() * 120;
        this.emit({
          type: "transcript",
          partial: i < scenario.transcriptChunks.length - 1,
          text: chunk.text,
          confidence: chunk.confidence,
          timestampMs: Math.round(performance.now() - t0),
        });
        this.emit({
          type: "log",
          level: "info",
          msg: `STT chunk ${i + 1}/${scenario.transcriptChunks.length}`,
          latencyMs: Math.round(latency),
          meta: { text: chunk.text, confidence: chunk.confidence },
        });
      }, 400 + i * 450);
    });

    // Emit full gloss
    this.schedule(
      () => {
        this.emit({
          type: "gloss",
          tokens: scenario.tokens,
          sentiment: scenario.sentiment,
          sourceText: scenario.sourceText,
        });
        this.emit({
          type: "log",
          level: "info",
          msg: "Gloss translation ready",
          latencyMs: 120 + Math.floor(Math.random() * 80),
          meta: { tokens: scenario.tokens.length, sentiment: scenario.sentiment },
        });
      },
      scenario.transcriptChunks.length * 450 + 200,
    );

    // Sequence avatar cues
    let cumulative =
      scenario.transcriptChunks.length * 450 + 300;
    scenario.avatarCues.forEach((cue) => {
      this.schedule(() => {
        this.emit({
          type: "avatar_cue",
          clip: cue.clip,
          durationMs: cue.durationMs,
          morphTargets: morphForSentiment(scenario.sentiment),
        });
        this.emit({
          type: "log",
          level: "info",
          msg: `Avatar cue: ${cue.clip}`,
          latencyMs: 40 + Math.floor(Math.random() * 30),
        });
      }, cumulative);
      cumulative += cue.durationMs + 80;
    });
  }

  private runIslToSpeech(scenario: ReturnType<typeof pickScenario>) {
    // Simulate landmark-driven recognition: progressive confidence
    const targetText = buildFromTokens(scenario.tokens);
    const totalSteps = 6;
    for (let i = 1; i <= totalSteps; i++) {
      this.schedule(() => {
        const slice = targetText
          .split(" ")
          .slice(0, Math.ceil((targetText.split(" ").length * i) / totalSteps))
          .join(" ");
        const confidence = Math.min(0.55 + i * 0.07, 0.94);
        this.emit({
          type: "transcript",
          partial: i < totalSteps,
          text: slice,
          confidence,
          timestampMs: i * 400,
        });
        this.emit({
          type: "log",
          level: "info",
          msg: `ISL recognition frame ${i}`,
          latencyMs: 60 + Math.floor(Math.random() * 50),
          meta: { confidence },
        });
      }, 350 * i);
    }

    // Emit TTS when confident
    this.schedule(
      () => {
        this.emit({
          type: "tts_ready",
          audioUrl: "", // real backend provides URL; player falls back to Web Speech API
          captions: scenario.sourceText,
        });
        this.emit({
          type: "log",
          level: "info",
          msg: "TTS synthesized",
          latencyMs: 180,
          meta: { text: scenario.sourceText },
        });
      },
      350 * totalSteps + 200,
    );
  }
}

function buildFromTokens(tokens: GlossToken[]) {
  return tokens.map((t) => t.gloss.toLowerCase()).join(" ");
}

function morphForSentiment(
  s: "neutral" | "happy" | "urgent" | "sad",
): Record<string, number> {
  switch (s) {
    case "happy":
      return { mouthSmile: 0.6, browInnerUp: 0.2, eyeWideL: 0.1, eyeWideR: 0.1 };
    case "urgent":
      return { browDownL: 0.6, browDownR: 0.6, mouthOpen: 0.3 };
    case "sad":
      return { mouthFrown: 0.5, browInnerUp: 0.4 };
    default:
      return { mouthSmile: 0.1 };
  }
}

let _mock: MockSimulatorSocket | null = null;
export function getMockSocket() {
  if (!_mock) _mock = new MockSimulatorSocket();
  return _mock;
}
