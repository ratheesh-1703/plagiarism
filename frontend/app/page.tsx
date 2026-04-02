import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-12 text-center">
      <h1 className="mb-4 text-5xl font-black tracking-tight text-slateNight">Plagiarism Detection with Semantic Similarity</h1>
      <p className="mb-8 max-w-2xl text-slate-700">
        Detect paraphrased plagiarism using Sentence-BERT embeddings, cosine similarity, visual heatmaps, and sentence-level reports.
      </p>
      <div className="flex flex-wrap justify-center gap-4">
        <Link className="btn-primary" href="/register">Create account</Link>
        <Link className="rounded-xl border border-slate-300 bg-white/80 px-5 py-3 font-semibold" href="/login">Login</Link>
      </div>
    </main>
  );
}
