import { useState } from "react";
import { FiCheck, FiX, FiRefreshCw } from "react-icons/fi";

// Interactive end-of-module quiz. Reads a quiz definition (questions with a
// correct-answer index) from courseContent. On submit it scores the answers,
// reveals the correct choices, and calls onComplete so the module's quiz
// "chapter" is marked done. Retake resets local state without un-completing.
const ModuleQuiz = ({ quiz, onComplete, completed }) => {
  const [picked, setPicked] = useState({}); // qIndex → optionIndex
  const [submitted, setSubmitted] = useState(false);

  const total = quiz.questions.length;
  const answeredAll = Object.keys(picked).length === total;
  const score = quiz.questions.reduce(
    (acc, q, i) => acc + (picked[i] === q.answer ? 1 : 0),
    0
  );

  const submit = () => {
    setSubmitted(true);
    onComplete?.();
  };

  const retake = () => {
    setPicked({});
    setSubmitted(false);
  };

  return (
    <div>
      <p className="text-paper-dim text-base leading-relaxed mb-8">{quiz.intro}</p>

      <ol className="space-y-8">
        {quiz.questions.map((q, i) => {
          const chosen = picked[i];
          return (
            <li key={i}>
              <p className="text-paper font-medium mb-3">
                <span className="text-paper-dim mr-2">{i + 1}.</span>
                {q.q}
              </p>
              <div className="grid gap-2">
                {q.options.map((opt, oi) => {
                  const isChosen = chosen === oi;
                  const isCorrect = q.answer === oi;
                  let cls =
                    "border-stroke bg-canvas text-paper-dim hover:border-paper-dim";
                  let mark = null;
                  if (submitted) {
                    if (isCorrect) {
                      cls = "border-accent/60 bg-accent/10 text-paper";
                      mark = <FiCheck className="text-accent shrink-0" />;
                    } else if (isChosen) {
                      cls = "border-red-400/50 bg-red-500/10 text-paper";
                      mark = <FiX className="text-red-300 shrink-0" />;
                    } else {
                      cls = "border-stroke bg-canvas text-paper-dim/70";
                    }
                  } else if (isChosen) {
                    cls = "border-accent bg-accent/10 text-paper";
                  }
                  return (
                    <button
                      key={oi}
                      type="button"
                      disabled={submitted}
                      onClick={() => setPicked((p) => ({ ...p, [i]: oi }))}
                      className={`flex items-center justify-between gap-3 text-left text-sm px-4 py-2.5 rounded-lg border transition-colors ${cls} ${
                        submitted ? "cursor-default" : ""
                      }`}
                    >
                      <span>
                        <span className="text-paper-dim/60 mr-2">
                          {String.fromCharCode(65 + oi)}.
                        </span>
                        {opt}
                      </span>
                      {mark}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>

      {!submitted ? (
        <button
          type="button"
          onClick={submit}
          disabled={!answeredAll}
          className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {answeredAll ? "Submit answers" : `Answer all ${total} to submit`}
        </button>
      ) : (
        <div className="mt-8 bg-surface-1-solid border border-stroke rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-paper-dim text-xs uppercase tracking-[0.16em] mb-1">Your score</p>
              <p className="font-display text-paper text-3xl">
                {score}
                <span className="text-paper-dim text-xl"> / {total}</span>
                <span className="text-accent text-lg ml-2">
                  {Math.round((score / total) * 100)}%
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={retake}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-stroke text-paper-dim hover:text-paper hover:border-paper-dim transition text-sm font-medium"
            >
              <FiRefreshCw /> Retake
            </button>
          </div>
          {quiz.takeaway && (
            <div className="mt-5 pt-5 border-t border-stroke">
              <p className="text-accent text-xs font-medium tracking-[0.16em] uppercase mb-2">
                Key takeaway
              </p>
              <p className="text-paper-dim text-sm leading-relaxed">{quiz.takeaway}</p>
            </div>
          )}
          {completed && (
            <p className="mt-4 text-accent text-sm inline-flex items-center gap-1.5">
              <FiCheck /> Module quiz complete
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ModuleQuiz;
