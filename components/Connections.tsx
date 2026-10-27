"use client";
import { useEffect, useState } from "react";
import { getPassword, setPassword, type Status } from "@/lib/client";

function Pill({ on, onText = "Connected", offText = "Not set" }: { on: boolean; onText?: string; offText?: string }) {
  return <span className={`pill ${on ? "pill-ok" : "pill-warn"}`}>{on ? onText : offText}</span>;
}

const PROVIDER_LABEL: Record<string, string> = { groq: "Groq", anthropic: "Claude", openai: "OpenAI", gemini: "Gemini" };

export default function Connections({ status }: { status: Status | null }) {
  const [pw, setPw] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => setPw(getPassword()), []);

  if (!status) return <div className="card"><p className="note">Checking connections…</p></div>;

  return (
    <div className="card stack" style={{ gap: 14 }}>
      <h2 className="h" style={{ fontSize: 16 }}>Connections</h2>

      <div className="conn">
        <div className="conn-top"><span className="conn-name">SerpApi</span><Pill on={status.serpapi} /></div>
        <span className="mono">Free plan · 250 searches a month</span>
        <p className="note">Google autocomplete, People Also Ask and related searches. 2 searches per brief.</p>
      </div>

      <div className="conn">
        <div className="conn-top">
          <span className="conn-name">Brief LLM</span>
          <Pill on={!!status.briefLlm} onText={PROVIDER_LABEL[status.briefLlm || ""] || "Set"} />
        </div>
        {status.briefModel && <span className="mono">{status.briefModel}</span>}
        <p className="note">
          {status.briefLlm ? "Writes intent, headings and FAQs from the Google data." : "Add GROQ_API_KEY in Vercel, then redeploy."}
        </p>
      </div>

      <div className="conn">
        <div className="conn-top">
          <span className="conn-name">AI engines</span>
          <Pill on={Object.values(status.engines).some(Boolean)}
            onText={`${Object.values(status.engines).filter(Boolean).length} of 4 set`} offText="None set" />
        </div>
        <p className="note">
          {[["chatgpt", "ChatGPT"], ["perplexity", "Perplexity"], ["gemini", "Gemini"], ["claude", "Claude"]]
            .map(([id, l]) => `${l} ${status.engines[id] ? "✓" : "–"}`).join(" · ")}
        </p>
      </div>

      <div className="conn">
        <div className="conn-top"><span className="conn-name">Google Sheets</span><Pill on={status.sheets} offText="Optional" /></div>
        <p className="note">Saves every brief and tracker run to your sheet.</p>
      </div>

      {status.passwordRequired && (
        <form
          className="conn"
          onSubmit={(e) => {
            e.preventDefault();
            setPassword(pw);
            setSaved(true);
          }}
        >
          <label htmlFor="app-pw" className="conn-name">App password</label>
          <input id="app-pw" type="password" value={pw} onChange={(e) => { setPw(e.target.value); setSaved(false); }} autoComplete="current-password" />
          <button className="btn" type="submit">{saved ? "Saved" : "Save on this device"}</button>
        </form>
      )}

      <p className="note">Keys live in Vercel environment variables, never in the browser.</p>
    </div>
  );
}
