import { ArrowUpRight, BookOpen, ScanSearch, Sparkles } from "lucide-react";
import { Brand } from "./Brand";
const starters = [
  {
    icon: ScanSearch,
    label: "Look beyond the headline",
    description: "Understand a claim in context",
    prompt: "How can I tell whether a news headline is misleading?",
  },
  {
    icon: BookOpen,
    label: "Make the complex clear",
    description: "Break down a big idea",
    prompt:
      "Explain how retrieval-augmented generation works, with a simple example.",
  },
  {
    icon: Sparkles,
    label: "Explore a new perspective",
    description: "Follow your curiosity",
    prompt: "What are some useful questions to ask when evaluating a new idea?",
  },
];
export function ChatEmptyState({
  onSelect,
}: {
  onSelect: (prompt: string) => void;
}) {
  return (
    <section className="empty-state">
      <div className="empty-mark">
        <Brand compact />
      </div>
      <p className="eyebrow">CURIOSITY, WITH CLARITY</p>
      <h1>
        What would you like to
        <br />
        <span>understand today?</span>
      </h1>
      <p className="empty-description">
        Explore an idea, untangle a question, or look closer at a claim.
        <br className="desktop-break" /> A clearer picture is one conversation
        away.
      </p>
      <div className="starter-grid">
        {starters.map(({ icon: Icon, ...item }) => (
          <button
            key={item.label}
            className="starter-card"
            onClick={() => onSelect(item.prompt)}
          >
            <Icon size={19} />
            <strong>{item.label}</strong>
            <span>{item.description}</span>
            <ArrowUpRight size={14} className="starter-arrow" />
          </button>
        ))}
      </div>
    </section>
  );
}
