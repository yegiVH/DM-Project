import "./style.css";
import { setupButton } from "./dm";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div class="game-container">

    <h1>🎮 Mind Reader</h1>
    <p class="subtitle">Think of a word. I will try to guess it.</p>

    <div class="dialogue-box">
      <p id="system-text">Press Start to begin.</p>
    </div>

    <div class="status">
      <span id="listening-indicator" class="listening off">
        🎤 Not listening
      </span>
    </div>

    <div class="controls">
      <button id="start-btn">Start Game</button>
    </div>

  </div>
`;

setupButton(document.querySelector<HTMLButtonElement>("#start-btn")!);