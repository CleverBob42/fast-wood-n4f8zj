import React, { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import "./styles.css";

const GAME_DOC = "game1";

export default function Player() {
  const [game, setGame] = useState(null);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState([]);
  const [answered, setAnswered] = useState(false);
  const [team, setTeam] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [timer, setTimer] = useState(0);

  const inputRef = useRef();

  // Listen for live game state
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "games", GAME_DOC), (snap) => {
      const data = snap.data();
      setGame(data);
      setCurrent(data?.current ?? 0);
      setTimer(data?.timer ?? 0);
    });
    return unsub;
  }, []);

  useEffect(() => {
    setAnswered(false);
    setSelected([]);
    setFeedback(null);
  }, [current]);

  useEffect(() => {
    if (timer === 0 && !answered && team) {
      handleSubmit();
    }
    // eslint-disable-next-line
  }, [timer]);

  if (!game) return <div>Waiting for quiz to start...</div>;

  const q = game.questions[current];

  const displayedAnswers = q.answersOrder
    ? q.answersOrder.map((i) => q.answers[i])
    : q.answers;
  const correctShuffledIndex = q.answersOrder
    ? q.answersOrder.findIndex((i) => i === 0)
    : 0;

  if (!q) return <div>Waiting for next question...</div>;

  // Properly determine correctIndexes (single or multiple correct answers)
  let correctIndexes = [];
  if ("correctAnswer" in q) {
    correctIndexes = [q.correctAnswer];
  } else if ("correctAnswers" in q) {
    correctIndexes = q.correctAnswers;
  }

  const isMulti = q.type === "MULTIANSWER";

  // Check correctness (for feedback)
  function isCorrect(selected, q) {
    if (q.type === "MULTICHOICE") {
      // Use the shuffled correct index!
      return selected.length === 1 && selected[0] === correctShuffledIndex;
    }
    if (q.type === "MULTIANSWER") {
      // Add your multianswer logic here as needed
      return false; // or your real logic
    }
    return false;
  }

  const handleSubmit = async () => {
    if (!team) {
      alert("Enter a team name!");
      return;
    }
    const correct = isCorrect(selected, q);
    setFeedback(correct ? "Correct!" : "Incorrect.");
    setAnswered(true);

    // Store answer in Firestore
    await setDoc(doc(db, "games", GAME_DOC, "answers", `${current}-${team}`), {
      team,
      q: current,
      answer: selected,
      correct,
      points: correct ? 10 : 0, // static 10-point scoring for now
      time: Date.now(),
    });
  };

  return (
    <div>
      {/* --- TIMER DISPLAY BLOCK --- */}
      <div
        style={{
          fontWeight: 700,
          fontSize: 28,
          margin: "18px 0 8px 0",
          color: timer > 0 && timer <= 5 ? "#e53935" : "#2377ff",
          letterSpacing: 1.5,
          textAlign: "center",
          transition: "color 0.25s",
        }}
      >
        {timer > 0 ? (
          <>⏰ {timer}s</>
        ) : timer === 0 ? (
          <span style={{ color: "#e53935" }}>⏰ Time's Up!</span>
        ) : (
          ""
        )}
      </div>
      {/* --- END TIMER DISPLAY BLOCK --- */}

      <h2>Player Mode</h2>
      {!team && (
        <div>
          <input placeholder="Enter team name" ref={inputRef} />
          <button
            onClick={() => {
              setTeam(inputRef.current.value);
            }}
          >
            Join
          </button>
        </div>
      )}
      {team && (
        <div>
          <h3>
            Q{current + 1}: {q.question}
          </h3>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <ol type="A">
              {displayedAnswers.map((a, i) => (
                <li
                  key={i}
                  style={{ listStyle: "none", padding: 0, margin: 0 }}
                >
                  <label
                    className={
                      `answer-option option-${String.fromCharCode(
                        65 + i
                      ).toLowerCase()}` +
                      (answered && i === correctShuffledIndex
                        ? " correct"
                        : "") +
                      (answered &&
                      selected.includes(i) &&
                      i !== correctShuffledIndex
                        ? " incorrect"
                        : "") +
                      (!answered && selected.includes(i) ? " selected" : "")
                    }
                  >
                    <input
                      type={isMulti ? "checkbox" : "radio"}
                      name="ans"
                      value={i}
                      checked={selected.includes(i)}
                      disabled={answered}
                      onChange={(e) => {
                        if (answered || timer === 0) return; // Don't change after answer is locked or timer expired
                        if (isMulti) {
                          setSelected((sel) =>
                            e.target.checked
                              ? [...sel, i]
                              : sel.filter((idx) => idx !== i)
                          );
                        } else {
                          setSelected([i]);
                        }
                      }}
                      style={{ display: "none" }}
                    />

                    <span style={{ fontWeight: "bold", marginRight: 8 }}></span>
                    {a}
                  </label>
                </li>
              ))}
            </ol>
          </form>
        </div>
      )}
    </div>
  );
}
