import React, { useState } from "react";
import Quizmaster from "./Quizmaster";
import Player from "./Player";

export default function App() {
  const [role, setRole] = useState(null);

  return (
    <div style={{ fontFamily: "sans-serif", padding: 32 }}>
      {!role && (
        <>
          <button onClick={() => setRole("quizmaster")}>
            I'm the Quizmaster
          </button>
          <button onClick={() => setRole("player")}>I'm a Player</button>
        </>
      )}
      {role === "quizmaster" && <Quizmaster />}
      {role === "player" && <Player />}
    </div>
  );
}
