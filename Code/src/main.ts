import "./style.css";
import { setupButton } from "./dm.ts";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div>
    <div class="c">
      
    </div>
  </div>
`;

setupButton(document.querySelector<HTMLButtonElement>("#counter")!);
