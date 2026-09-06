const bootstrap = [...document.scripts].find((s) => s.src.includes("/src/bootstrap.mjs"));
const CURRENT_VERSION = bootstrap
  ? new URL(bootstrap.src, location.href).searchParams.get("v") || "dev"
  : "dev";

let latestVersion = CURRENT_VERSION;
let updateAvailable = false;
const pauseButton = document.querySelector("#pause");

function markPauseButton() {
  if (!pauseButton || pauseButton.querySelector(".update-dot")) return;
  pauseButton.style.position = "relative";
  const dot = document.createElement("span");
  dot.className = "update-dot";
  dot.setAttribute("aria-hidden", "true");
  Object.assign(dot.style, {
    position: "absolute",
    top: "5px",
    right: "5px",
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    background: "#ffc977",
    boxShadow: "0 0 8px #ffc977",
    pointerEvents: "none",
  });
  pauseButton.append(dot);
}

function addUpdateAction() {
  if (!updateAvailable) return;
  const actions = document.querySelector("#overlay .pause-actions");
  if (!actions || actions.querySelector("[data-app-update]")) return;
  const button = document.createElement("button");
  button.className = "large-action";
  button.dataset.appUpdate = "1";
  button.setAttribute("aria-label", "最新版に更新");
  button.innerHTML = '<span style="font-size:24px;line-height:1">↻</span><span style="display:block;font-size:11px;font-weight:700;letter-spacing:.08em;margin-top:4px">更新</span>';
  actions.append(button);
}

async function checkForUpdate() {
  try {
    const response = await fetch(`./version.json?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const data = await response.json();
    if (!data?.version || data.version === CURRENT_VERSION) return;
    latestVersion = data.version;
    updateAvailable = true;
    markPauseButton();
    addUpdateAction();
  } catch {}
}

new MutationObserver(addUpdateAction).observe(document.querySelector("#overlay"), {
  childList: true,
  subtree: true,
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-app-update]");
  if (!button) return;
  const url = new URL(location.href);
  url.searchParams.set("update", latestVersion);
  location.replace(url.href);
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkForUpdate();
});
window.addEventListener("focus", checkForUpdate);
checkForUpdate();
