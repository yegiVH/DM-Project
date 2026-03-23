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

      <div class="stat">
        <span class="stat-label">Best</span>
        <span class="stat-value" id="best-score-display">—</span>
      </div>
      
    </div>

    <div id="clue-dots" class="clue-dots"></div>

    <div id="clue-display" class="clue-display"></div>

    <div class="dialogue-box">
      <p id="system-text">Press Start to begin.</p>
    </div>

    <div class="status">
      <div id="listening-indicator" class="listening off">
        🎤 Not listening
      </div>
    </div>

    <div id="text-fallback" class="text-fallback hidden">
      <p class="fallback-hint">Having trouble with the mic? Type instead:</p>
      <div class="fallback-row">
        <input type="text" id="fallback-input" class="fallback-input" placeholder="Type a word or command..." autocomplete="off" />
        <button id="fallback-btn" class="fallback-btn" type="button">Send</button>
      </div>
      <p class="fallback-cmds">hint · skip · repeat · give up · help</p>
    </div>

    <div class="controls">
      <button id="start-btn">Start Game</button>
    </div>

  </div>
`;

setupButton(document.querySelector<HTMLButtonElement>("#start-btn")!);
