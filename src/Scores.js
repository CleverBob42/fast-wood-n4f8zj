import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, onSnapshot } from "firebase/firestore";

const GAME_DOC = "game1";
const PAGE_SIZE = 8;
const PAGE_INTERVAL = 4000;

export default function Scores({ numQuestions }) {
  const [answers, setAnswers] = useState([]);
  const [scores, setScores] = useState([]);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "games", GAME_DOC, "answers"),
      (snap) => {
        const all = [];
        snap.forEach((doc) => all.push(doc.data()));
        setAnswers(all);
      }
    );
    return unsub;
  }, []);

  useEffect(() => {
    const scoreByTeam = {};
    answers.forEach((a) => {
      if (!scoreByTeam[a.team]) scoreByTeam[a.team] = 0;
      scoreByTeam[a.team] += a.points;
    });

    const sorted = Object.entries(scoreByTeam)
      .filter(([, score]) => !isNaN(score))
      .sort((a, b) => b[1] - a[1]);

    setScores(sorted);
    setPage(0);
  }, [answers]);

  useEffect(() => {
    if (scores.length <= PAGE_SIZE) return;
    const interval = setInterval(() => {
      setPage((prev) => (prev + 1) % Math.ceil(scores.length / PAGE_SIZE));
    }, PAGE_INTERVAL);
    return () => clearInterval(interval);
  }, [scores]);

  const pagedScores = scores.slice(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE
  );

  const getRankPrefix = (index) => {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return `${index + 1}.`;
  };

  return (
    <div
      style={{
        padding: 40,
        width: "100vw",
        height: "100vh",
        background: `url("https://firebasestorage.googleapis.com/v0/b/bobquiz-2727a.appspot.com/o/media%2F90strivia.png?alt=media") center center / cover no-repeat`,
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
      }}
    >
      <div
        className="answer-option question-prompt"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          border: "2px solid #fff",
          borderRadius: "1.6em",
          padding: "1.2em 1.5em",
          marginBottom: 36,
          width: "100%",
          maxWidth: 800,
          fontSize: "2.2rem",
          fontWeight: 600,
          color: "#fff",
          textAlign: "center",
          boxShadow: "0 2px 8px 0 #0004",
        }}
      >
        🏆 Current Scores
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          maxWidth: 600,
          width: "100%",
        }}
      >
        {pagedScores.map(([team, score], index) => (
          <div
            key={team}
            className="answer-option"
            style={{
              background: "rgba(255, 255, 255, 0.15)",
              border: "2px solid rgba(255,255,255,0.2)",
              borderRadius: "1.6em",
              padding: "1.1em 1.4em",
              fontSize: "1.8rem",
              fontWeight: 500,
              color: "#fff",
              display: "flex",
              justifyContent: "space-between",
              boxShadow: "0 2px 8px 0 rgba(0,0,0,0.3)",
            }}
          >
            <span>
              {getRankPrefix(index)} {team}
            </span>
            <span style={{ fontWeight: 700 }}>{score}</span>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 40,
          fontSize: "1rem",
          color: "#ddd",
        }}
      >
        Showing scores out of {numQuestions * 10} possible points.
      </div>
    </div>
  );
}
