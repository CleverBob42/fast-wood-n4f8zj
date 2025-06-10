import React, { useState, useEffect } from "react";
import Papa from "papaparse";

import { db, storage } from "./firebase";
import { doc, setDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Scores from "./Scores";
import QuizSelector from "./QuizSelector";
import "./styles.css";

const GAME_DOC = "game1";

// Quizmaster.js (near your imports or top of file)
function getShuffledOrder(length) {
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function resolveMediaUrls(questions) {
  const mediaFields = [
    "SOUND",
    "VIDEO",
    "BACKGROUND",
    "sound",
    "video",
    "background",
    "P1",
    "p1",
  ];
  // Add both uppercase and lowercase keys for robustness
  return Promise.all(
    questions.map(async (q) => {
      const qCopy = { ...q };
      for (const field of mediaFields) {
        if (qCopy[field] && !qCopy[field].toLowerCase().startsWith("http")) {
          try {
            const fileRef = ref(storage, "media/" + qCopy[field].trim());
            qCopy[field] = await getDownloadURL(fileRef);
          } catch {
            // If file missing, leave as is or set to null
            qCopy[field] = null;
          }
        }
      }
      return qCopy;
    })
  );
}

async function handleSelect(e) {
  const idx = e.target.value;
  if (!quizzes[idx]) return;
  const fileRef = quizzes[idx];
  const url = await getDownloadURL(fileRef);
  const res = await fetch(url);
  const csv = await res.text();
  Papa.parse(csv, {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      // Resolve all media filenames to URLs!
      const fixed = await resolveMediaUrls(results.data);
      onQuizLoaded(fixed);
    },
  });
}

export default function Quizmaster() {
  // ---- State ----
  const [step, setStep] = useState(1); // 1 = pick quiz/upload CSV, 2 = upload media, 3 = quiz controls
  const [questions, setQuestions] = useState([]);
  const [mediaNeeded, setMediaNeeded] = useState([]);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [current, setCurrent] = useState(0);
  const [tab, setTab] = useState("questions");
  const [progress, setProgress] = useState(0);
  const [missingFiles, setMissingFiles] = useState([]);

  const imageFilename = "90s v2.d0df8704-fdfe-4b08-a534-a7ff5c5ad17f.png";
  const [hardcodedUrl, setHardcodedUrl] = useState("");

  const [settings, setSettings] = useState({ questionTimer: 5 }); // or your preferred default
  const [timer, setTimer] = useState(settings.questionTimer); // start timer from settings
  const [timerActive, setTimerActive] = useState(false); // add this!

  useEffect(() => {
    getDownloadURL(ref(storage, "media/" + imageFilename)).then(
      setHardcodedUrl
    );
  }, []);

  useEffect(() => {
    if (!timerActive) return;
    if (timer <= 0) {
      setTimerActive(false);
      updateDoc(doc(db, "games", GAME_DOC), {
        timer: 0,
        timerActive: false,
      });
      return;
    }
    const interval = setInterval(() => {
      setTimer((t) => {
        const next = t - 1;
        updateDoc(doc(db, "games", GAME_DOC), {
          timer: next,
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerActive, timer]);

  //
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "games", GAME_DOC), (snap) => {
      const data = snap.data();
      if (data?.questions) {
        setQuestions(data.questions);
      }
    });
    return unsub;
  }, []);

  // ---- Helpers ----
  function cleanFilename(fname) {
    if (!fname) return "";
    const m = fname.match(/^(.+?\.(mp3|wav|mp4|jpg|jpeg|png|gif))/i);
    return m ? m[1] : fname.split("?")[0];
  }

  function getAllMediaFilenames(questions) {
    const mediaFields = ["sound", "video", "background", "p1"];
    const files = new Set();
    for (const q of questions) {
      for (const field of mediaFields) {
        if (q[field]) files.add(cleanFilename(q[field]));
      }
    }
    return Array.from(files);
  }

  function findFile(fileList, filename) {
    const clean = cleanFilename(filename).toLowerCase();
    return Array.from(fileList).find((f) => f.name.toLowerCase() === clean);
  }

  async function uploadAndReplaceMedia(questions, filesToUpload, setProgress) {
    let count = 0;
    for (const q of questions) {
      for (const field of ["sound", "video", "background", "p1"]) {
        if (q[field]) {
          const baseFile = cleanFilename(q[field]);
          const file = findFile(filesToUpload, baseFile);
          if (file) {
            try {
              const fileRef = ref(storage, `media/${file.name}`);
              await uploadBytes(fileRef, file);
              const url = await getDownloadURL(fileRef);
              q[field] = url;
            } catch (err) {
              console.error("Error uploading file:", file.name, err);
            }
          }
        }
      }
      count++;
      if (setProgress) setProgress(count / questions.length);
    }
    return questions;
  }

  // ---- CSV Handling ----
  const handleCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        let qs = results.data
          .filter(
            (q) =>
              q.CAT === "MULTICHOICE" ||
              q.CAT === "MULTIANSWER" ||
              q.CAT === "VANISHING_IMAGE"
          )
          .map((q) => {
            const answers = [q.A1, q.A2, q.A3, q.A4, q.A5, q.A6].filter(
              (a) => !!a
            );
            return {
              question: q.Q,
              answers,
              type: q.CAT,
              sound: q.SOUND,
              video: q.VIDEO,
              background: q.BACKGROUND,
              p1: q.P1,
              answersOrder: getShuffledOrder(answers.length),
            };
          });

        setQuestions(qs);
        const needed = getAllMediaFilenames(qs);
        setMediaNeeded(needed);
        setStep(needed.length ? 2 : 3);
      },
    });
  };

  // ---- Media upload handling ----
  const handleMediaFiles = (e) => {
    const files = e.target.files;
    setMediaFiles(files);
    // Check for any missing files (by name)
    const missing = mediaNeeded.filter((fname) => !findFile(files, fname));
    setMissingFiles(missing);
  };

  const handleUploadAll = async () => {
    let qs = await uploadAndReplaceMedia(questions, mediaFiles, setProgress);

    if (missingFiles.length) {
      alert("You are missing the following files: " + missingFiles.join(", "));
      return;
    }

    try {
      setQuestions(qs);
      await setDoc(doc(db, "games", GAME_DOC), {
        questions: qs,
        current: 0,
        state: "waiting",
      });
      setStep(3);
    } catch (err) {
      console.error("Error during upload or saving quiz:", err);
      alert("Error uploading files or saving quiz: " + err.message);
    }
  };

  const advance = async (by) => {
    const newIdx = Math.min(Math.max(current + by, 0), questions.length - 1);
    setCurrent(newIdx);

    // Start the timer automatically
    const seconds = settings.questionTimer || 20; // use settings or fallback
    setTimer(seconds);
    setTimerActive(true);

    await updateDoc(doc(db, "games", GAME_DOC), {
      current: newIdx,
      timer: seconds,
      timerActive: true,
    });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (tab !== "questions") return; // optional guard
      if (e.key === "ArrowRight") {
        advance(1);
      } else if (e.key === "ArrowLeft") {
        advance(-1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [current, questions.length, tab]);

  // ---- UI Step 1: Select/Upload Quiz ----
  if (step === 1) {
    return (
      <div>
        <h2>Step 1: Start a Quiz</h2>
        <QuizSelector
          onQuizLoaded={(data) => {
            let qs = data
              .filter((q) => q.CAT === "MULTICHOICE" || q.CAT === "MULTIANSWER")
              .map((q) => {
                const answers = [q.A1, q.A2, q.A3, q.A4, q.A5, q.A6].filter(
                  (a) => !!a
                );
                return {
                  question: q.Q,
                  answers,
                  type: q.CAT,
                  sound: q.SOUND,
                  video: q.VIDEO,
                  background: q.BACKGROUND,
                  p1: q.P1,
                  answersOrder: getShuffledOrder(answers.length),
                };
              });

            setQuestions(qs);
            const needed = getAllMediaFilenames(qs);
            setMediaNeeded(needed);
            setStep(3); // <<--- This forces it to always start the quiz
          }}
        />
        <div style={{ marginTop: 20, color: "#888" }}>
          Or upload a new quiz CSV:
        </div>
        <input type="file" accept=".csv" onChange={handleCSV} />
      </div>
    );
  }

  // ---- UI Step 2: Media Upload ----
  if (step === 2) {
    return (
      <div>
        <h2>Step 2: Upload Media Files</h2>
        <p>
          <strong>The following files are needed for your quiz:</strong>
        </p>
        <ul>
          {mediaNeeded.map((fname) => (
            <li key={fname}>
              {fname}
              {missingFiles.includes(fname) ? (
                <span style={{ color: "red" }}> (not selected)</span>
              ) : (
                <span style={{ color: "green" }}> ✓</span>
              )}
            </li>
          ))}
        </ul>
        <input
          type="file"
          accept=".mp3,.wav,.jpg,.jpeg,.png,.gif,.mp4"
          multiple
          onChange={handleMediaFiles}
        />
        {missingFiles.length > 0 && (
          <p style={{ color: "red" }}>Please select all missing files above.</p>
        )}
        <button disabled={missingFiles.length > 0} onClick={handleUploadAll}>
          Upload All & Start Quiz
        </button>
        {progress > 0 && progress < 1 && (
          <div>Uploading... {Math.round(progress * 100)}%</div>
        )}
      </div>
    );
  }

  // ---- UI Step 3: Quiz Controls ----
  // ---- UI Step 3: Quiz Controls ----
  const q = questions[current];
  const displayedAnswers = q.answersOrder
    ? q.answersOrder.map((i) => q.answers[i])
    : q.answers;

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setTab("questions")}>Questions</button>
          <button onClick={() => setTab("scores")}>Scores</button>
          <button onClick={() => setTab("settings")}>Settings</button>
          <button onClick={() => advance(-1)} disabled={current === 0}>
            ⬅ Previous
          </button>
          <button
            onClick={() => advance(1)}
            disabled={current === questions.length - 1}
          >
            Next ➡
          </button>
        </div>

        {/* Timer display */}
        <div
          style={{
            position: "absolute",
            top: 20,
            right: 40,
            fontWeight: 800,
            fontSize: "3rem",
            color: timer === 0 ? "#e53935" : "#ffffff",
            textShadow: "2px 2px 6px #000",
            zIndex: 100,
          }}
        >
          {timer > 0 ? `⏰ ${timer}s` : "⏰ Time's Up!"}
        </div>

        {q.sound && (
          <audio
            src={q.sound}
            autoPlay
            controls
            style={{ marginLeft: 20, minWidth: 200 }}
          />
        )}
      </div>

      <hr />

      {tab === "settings" && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #eee",
            borderRadius: 8,
            padding: 24,
            marginTop: 18,
            maxWidth: 340,
          }}
        >
          <h3>Quiz Settings</h3>
          <label>
            Question Timer (seconds):{" "}
            <input
              type="number"
              min={1}
              max={120}
              value={settings.questionTimer}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  questionTimer: Number(e.target.value),
                })
              }
              style={{ width: 60 }}
            />
          </label>
          <br />
          <br />
          <button
            onClick={async () => {
              await updateDoc(doc(db, "games", GAME_DOC), {
                questionTimer: settings.questionTimer,
              });
              alert("Settings saved!");
              setTab("questions");
            }}
          >
            Save & Close
          </button>
        </div>
      )}

      {tab === "questions" && (
        <div
          style={{
            width: "100vw",
            height: "100vh",
            maxWidth: "100vw",
            maxHeight: "100vh",
            overflow: "hidden",
            background: q.background
              ? `url(${q.background}) center center / cover no-repeat`
              : "#222", // fallback color if no background
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            aspectRatio: "4/3",
          }}
        >
          <div
            className="answer-option question-prompt"
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.6)",
              border: "2px solid #fff",
              borderRadius: "1.6em",
              padding: "1.3em 1.4em",
              marginBottom: 24,
              width: "100%",
              maxWidth: 700,
              fontSize: "1.9rem",
              fontWeight: 600,
              color: "#fff",
              textAlign: "center",
              boxShadow: "0 2px 8px 0 #0002",
            }}
          >
            Q{current + 1}: {q.question}
          </div>

          {/* ------ ADD THIS BLOCK BELOW ------ */}
          <div
            style={{
              fontWeight: 700,
              fontSize: 28,
              margin: "18px 0 8px 0",
              color: timerActive && timer <= 5 ? "#e53935" : "#2377ff",
              letterSpacing: 1.5,
              transition: "color 0.25s",
            }}
          >
            {timerActive && timer > 0 && <>⏰ {timer}s</>}
            {timerActive && timer === 0 && (
              <span style={{ color: "#e53935" }}>⏰ Time's Up!</span>
            )}
          </div>
          {/* ------ END TIMER BLOCK ------ */}

          <div style={{ marginTop: 16 }}>
            {q.p1 && (
              <img
                src={q.p1}
                alt="Clue"
                style={{ maxWidth: 300, display: "block", margin: "1em 0" }}
              />
            )}

            {q.video && <video controls width="320" src={q.video}></video>}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start",
                gap: "40px",
                marginTop: "20px",
                flexWrap: "wrap",
                width: "100%",
                maxWidth: "90%",
              }}
            >
              {/* Answers column */}
              <ol
                type="A"
                style={{
                  width: "100%",
                  maxWidth: 560,
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: "22px",
                  zIndex: 2,
                }}
              >
                {displayedAnswers.map((a, i) => (
                  <li key={i} style={{ width: "100%" }}>
                    <div
                      className={`answer-option option-${String.fromCharCode(
                        65 + i
                      ).toLowerCase()}`}
                      style={{
                        cursor: "default",
                        pointerEvents: "none",
                        fontSize: "1.5rem",
                        padding: "1.1em 1.2em",
                        width: "100%",
                        borderRadius: "1.6em",
                        borderWidth: "2px",
                        borderStyle: "solid",
                        margin: 0,
                        fontWeight: 500,
                        userSelect: "none",
                        boxShadow: "0 2px 8px 0 #0002",
                        opacity: timer === 0 ? 0.7 : 1,
                        transition: "opacity 0.25s",
                      }}
                    >
                      {a}
                    </div>
                  </li>
                ))}
              </ol>

              {/* Optional image column */}
              {q.p1 && (
                <div
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.6)",
                    padding: "10px",
                    borderRadius: "12px",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
                    maxWidth: "280px",
                    maxHeight: "280px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <img
                    src={q.p1}
                    alt="Question visual"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                      borderRadius: "8px",
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {tab === "scores" && <Scores numQuestions={questions.length} />}
    </div>
  );
}
