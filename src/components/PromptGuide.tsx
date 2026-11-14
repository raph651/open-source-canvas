import { useState } from 'react';
import { Check, Copy, Lightbulb, X } from 'lucide-react';
import { LISTED_MODELS, MODEL_BY_ID } from '../data';
import { GENERAL_TIPS, PROMPT_TIPS } from '../lib/promptGuide';
import type { ModelId } from '../types';

interface PromptGuideProps {
  /** model to open on, usually the selected node's */
  initialModel?: ModelId;
  onClose: () => void;
}

const GUIDE_MODELS = LISTED_MODELS.filter((model) => PROMPT_TIPS[model.id]);

export function PromptGuide({ initialModel, onClose }: PromptGuideProps) {
  const start = initialModel && PROMPT_TIPS[initialModel] ? initialModel : GUIDE_MODELS[0]?.id;
  const [modelId, setModelId] = useState<ModelId | undefined>(start);
  const [copied, setCopied] = useState(false);
  const tips = modelId ? PROMPT_TIPS[modelId] : undefined;
  const model = modelId ? MODEL_BY_ID[modelId] : undefined;

  const copyExample = () => {
    if (!tips) return;
    void navigator.clipboard?.writeText(tips.example).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };

  return (
    <aside className="prompt-guide" aria-label="Prompt guide">
      <div className="versions-panel__head">
        <div>
          <span className="eyebrow">HOW TO PROMPT</span>
          <h2>Prompt guide</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close prompt guide">
          <X size={16} />
        </button>
      </div>

      <label className="prompt-guide__pick">
        <span>Model</span>
        <select value={modelId ?? ''} onChange={(event) => setModelId(event.target.value as ModelId)}>
          {(['image', 'video'] as const).map((family) => (
            <optgroup key={family} label={family === 'image' ? 'Image' : 'Video'}>
              {GUIDE_MODELS.filter((item) => item.family === family).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <div className="prompt-guide__body">
        {tips && model && (
          <>
            <p className="prompt-guide__best" style={{ borderColor: model.accent }}>{tips.bestFor}</p>

            <section>
              <h3>Rules</h3>
              <ol className="prompt-guide__rules">
                {tips.rules.map((rule) => <li key={rule}>{rule}</li>)}
              </ol>
            </section>

            <section>
              <div className="prompt-guide__example-head">
                <h3>Example</h3>
                <button type="button" onClick={copyExample}>
                  {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="prompt-guide__example">{tips.example}</p>
            </section>

            <section>
              <h3>Avoid</h3>
              <ul className="prompt-guide__avoid">
                {tips.avoid.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          </>
        )}

        <section className="prompt-guide__general">
          <h3><Lightbulb size={11} /> Every model</h3>
          <ul>
            {GENERAL_TIPS.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      </div>
    </aside>
  );
}
