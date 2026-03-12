import "./style.css";
import { setupButton } from "./dm";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div class="game-container">

    <div class="header">
      <h1>Mind Reader</h1>
      <p class="subtitle">I think of a word — you have to guess it!</p>
    </div>

    <div class="game-stats" id="game-stats">
      <div class="stat">
        <span class="stat-label">Round</span>
        <span class="stat-value" id="round-display">—</span>
      </div>
      <div class="stat">
        <span class="stat-label">Score</span>
        <span class="stat-value" id="score-display">—</span>
      </div>
      <div class="stat">
        <span class="stat-label">Difficulty</span>
        <span class="stat-value" id="difficulty-display">—</span>
      </div>
    </div>

    <div id="clue-dots" class="clue-dots"></div>

    <div class="dialogue-box">
      <p id="system-text">Press Start to begin.</p>
    </div>

    <div class="status">
      <div id="listening-indicator" class="listening off">
        🎤 Not listening
      </div>
    </div>

    <div class="controls">
      <button id="start-btn">Start Game</button>
    </div>

  </div>
`;

setupButton(document.querySelector<HTMLButtonElement>("#start-btn")!);
