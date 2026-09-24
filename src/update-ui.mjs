const bootstrap = [...document.scripts].find((script) =>
  script.src.includes("/src/bootstrap.mjs"),
);
const CURRENT_VERSION = bootstrap
  ? new URL(bootstrap.src, location.href).searchParams.get("v") || "dev"
  : "dev";

let latestVersion = CURRENT_VERSION;
let updateAvailable = false;
const pauseButton = document.querySelector("#pause");

function compareVersions(left, right) {
  const parse = (value) => {
    if (typeof value !== "string" || !/^\d+(?:\.\d+)*$/.test(value)) return null;
    return value.split(".").map(Number);
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return null;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const delta = (a[i] || 0) - (b[i] || 0);
    if (delta) return Math.sign(delta);
  }
  return 0;
}

function syncUpdateUI() {
  if (pauseButton) {
    let dot = pauseButton.querySelector(".update-dot");
    if (updateAvailable && !dot) {
      pauseButton.style.position = "relative";
      dot = document.createElement("span");
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
    } else if (!updateAvailable) {
      dot?.remove();
    }
  }

  const actions = document.querySelector("#overlay .pause-actions");
  if (!actions) return;
  let button = actions.querySelector("[data-app-update]");
  if (!updateAvailable) {
    button?.remove();
    return;
  }
  if (button) return;
  button = document.createElement("button");
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
    if (!response.ok) throw new Error("Version check failed");
    const data = await response.json();
    const ordering = compareVersions(data?.version, CURRENT_VERSION);
    updateAvailable = ordering === 1;
    latestVersion = updateAvailable ? data.version : CURRENT_VERSION;
  } catch {
    updateAvailable = false;
    latestVersion = CURRENT_VERSION;
  }
  syncUpdateUI();
}

new MutationObserver(syncUpdateUI).observe(document.querySelector("#overlay"), {
  childList: true,
  subtree: true,
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-app-update]");
  if (!button || !updateAvailable) return;
  const url = new URL(location.href);
  url.searchParams.set("update", latestVersion);
  location.replace(url.href);
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkForUpdate();
});
window.addEventListener("focus", checkForUpdate);
checkForUpdate();
