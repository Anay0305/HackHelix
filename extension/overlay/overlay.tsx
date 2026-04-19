import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { SignSequencerAvatar } from "./SignSequencerAvatar";
import { useExtensionStore } from "./extensionStore";

function Overlay() {
  const setPoseSequence = useExtensionStore((s) => s.setPoseSequence);
  const setGloss = useExtensionStore((s) => s.setGloss);
  const gloss = useExtensionStore((s) => s.gloss);

  // Signal to parent content script that React is mounted and ready
  useEffect(() => {
    window.parent.postMessage({ type: "ready" }, "*");
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === "init") {
        const { poseData } = event.data;
        setGloss(poseData.gloss || []);
        setPoseSequence(null);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [setGloss, setPoseSequence]);

  const handleClose = () => {
    window.parent.postMessage({ type: "close" }, "*");
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          borderRadius: "16px",
        }}
      />

      <button
        onClick={handleClose}
        style={{
          position: "absolute",
          top: "12px",
          right: "12px",
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          border: "none",
          background: "rgba(255,255,255,0.2)",
          color: "white",
          fontSize: "18px",
          cursor: "pointer",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: "bold",
          transition: "background 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.3)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.2)";
        }}
      >
        ×
      </button>

      {gloss.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "12px",
            left: "12px",
            right: "52px",
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
            zIndex: 10,
          }}
        >
          {gloss.map((word, i) => (
            <span
              key={i}
              style={{
                background: "rgba(0,0,0,0.30)",
                backdropFilter: "blur(4px)",
                color: "white",
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "13px",
                fontFamily: "monospace",
                letterSpacing: "0.05em",
              }}
            >
              {word}
            </span>
          ))}
        </div>
      )}

      <Canvas
        camera={{ position: [0, 1.55, 3.2], fov: 42 }}
        style={{ position: "absolute", inset: 0 }}
      >
        <ambientLight intensity={1.5} />
        <directionalLight position={[0, 2, 5]} intensity={2} />
        <SignSequencerAvatar />
        <OrbitControls
          enablePan={false}
          enableZoom={false}
        />
      </Canvas>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Overlay />
    </StrictMode>
  );
}
