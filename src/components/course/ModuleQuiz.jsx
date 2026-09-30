import { useMemo, useState } from "react";
import { FiCheck, FiX, FiRefreshCw } from "react-icons/fi";
import { getQuizResult, saveQuizResult } from "../../stores/courseStore";

// Interactive end-of-module quiz. Renders a quiz definition (questions with a
// correct-answer index) that CourseChapter fetched from /api/course; the quiz
// text is not in the bundle (DEF-07). On submit it scores the answers, reveals
// the correct choices, calls onComplete so the module's quiz "chapter" is
// marked done, and SAVES the score. Retake resets the answers without
// un-completing; a new submit replaces the saved score.
//
// The score used to live in useState alone, so it was gone the moment the
// learner navigated away and it was never part of the account the privacy
// policy describes. It is persisted now through courseStore, which mirrors it
// to users.completed_chapters.
//
// quizId is the quiz chapter's stable id ("m1quiz"), the key the saved score
// is stored under. The caller passes it; it is no longer recovered from a
// bundled quiz map.
const ModuleQuiz = ({ quiz, onComplete, completed, quizId }) => {
  const id = quizId || null;
  // A previously saved score, shown straight away so a learner who comes back
  // sees what they scored instead of an empty quiz.
  const saved = useMemo(() => getQuizResult(id), [id]);
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
    // Persisted before onComplete so the score and the completion land
    // together. A failed server write is swallowed inside courseStore and never
    // blocks the learner.
    saveQuizResult(id, { score, total });
    onComplete?.();
  };

  const retake = () => {
    setPicked({});
    setSubmitted(false);
  };

  return (
    <div>
      <p className="text-paper-dim text-base leading-relaxed mb-8">{quiz.intro}</p>

      {saved && !submitted && (
        <div className="mb-8 bg-surface-1-solid border border-stroke rounded-2xl px-5 py-4">
          <p className="text-paper-dim text-xs mb-1">Your last score, saved to your account</p>
          <p className="text-paper text-sm">
            <span className="font-semibold">
              {saved.score} / {saved.total}
            </span>
            <span className="text-accent ml-2">{saved.percent}%</span>
            <span className="text-paper-dim ml-2">on {new Date(saved.at).toLocaleDateString()}</span>
          </p>
        </div>
      )}

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
                      cls = "border-red-600/50 bg-red-500/10 text-paper";
                      mark = <FiX className="text-red-700 shrink-0" />;
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
                      className={`flex items-center justify-between gap-3 text-left text-sm px-4 py-2.5 rounded-lg border transition-colors ${cls} ${ submitted ?"cursor-default":""}`}
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
          className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-accent-fg font-semibold hover:bg-accent-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {answeredAll ? "Submit answers" : `Answer all ${total} to submit`}
        </button>
      ) : (
        <div className="mt-8 bg-surface-1-solid border border-stroke rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-paper-dim text-xs mb-1">Your score</p>
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
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-stroke text-paper-dim hover:text-paper hover:border-accent transition text-sm font-medium"
            >
              <FiRefreshCw /> Retake
            </button>
          </div>
          {quiz.takeaway && (
            <div className="mt-5 pt-5 border-t border-stroke">
              <p className="text-paper text-sm font-semibold mb-1">Key takeaway</p>
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
