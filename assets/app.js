"use strict";

// Same-start comparison is deliberately not presented as frame-locked playback.
// Video bytes, speed, crop, and original audio tracks are never modified.
const media = [...document.querySelectorAll("audio, video")];
const cards = [...document.querySelectorAll(".generation-card")];
const status = document.getElementById("media-status");
const setStatus = text => { if (status) status.textContent = text; };
let activeGroup = null;
let generation = 0;
const groupText = (card, text) => { const el = card.querySelector(".group-status"); if (el) el.textContent = text; };
const videosIn = card => [...card.querySelectorAll("video")];

function endGroup(message = "Comparison paused.", except = null) {
  generation++;
  const group = activeGroup;
  activeGroup = null;
  if (!group) return;
  group.card.dataset.groupState = "idle";
  group.card.querySelector(".compare-play").disabled = false;
  group.videos.forEach(video => {
    if (video !== except) video.pause();
    video.muted = group.savedMutes.get(video);
  });
  group.card.classList.remove("is-playing");
  groupText(group.card, message);
}

function pauseAll(except = null) {
  endGroup("Comparison paused.", except);
  media.forEach(player => { if (player !== except) player.pause(); });
}

function applyGroupSound(group) {
  const selected = group.card.querySelector(".sound-select").value;
  group.videos.forEach(video => {
    const muted = selected === "none" || video.dataset.method !== selected;
    if (video.muted !== muted) video.muted = muted;
  });
}

function ready(video) {
  if (video.readyState >= 3) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("canplay", done);
      video.removeEventListener("error", failed);
    };
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("A video could not be loaded")); };
    const timer = setTimeout(failed, 20000);
    video.addEventListener("canplay", done, { once: true });
    video.addEventListener("error", failed, { once: true });
    video.preload = "auto";
    if (video.readyState === 0) video.load();
  });
}

async function playTogether(card) {
  pauseAll();
  const videos = videosIn(card);
  const token = ++generation;
  const group = { card, videos, running: false, savedMutes: new Map(videos.map(v => [v, v.muted])) };
  activeGroup = group;
  card.dataset.groupState = "loading";
  card.querySelector(".compare-play").disabled = true;
  groupText(card, "Loading the three original videos…");
  try {
    await Promise.all(videos.map(ready));
    if (token !== generation || activeGroup !== group) return;
    videos.forEach(video => { video.currentTime = 0; video.playbackRate = 1; });
    applyGroupSound(group);
    await Promise.all(videos.map(video => video.play()));
    if (token !== generation || activeGroup !== group) return;
    group.running = true;
    card.dataset.groupState = "playing";
    card.classList.add("is-playing");
    card.querySelector(".compare-play").disabled = false;
    const shortest = Math.min(...videos.map(video => video.duration));
    groupText(card, `Playing all three from 0 s; stopping at the shortest clip (${shortest.toFixed(2)} s). Starts are approximate, not frame-locked.`);
    setStatus(`Comparing example ${card.dataset.sample}. Only the selected output is audible.`);
  } catch (error) {
    if (activeGroup === group) {
      endGroup("Unable to start all three videos. Try again, or use their individual play controls.");
      setStatus("Comparison could not start. Original files remain available through the download links.");
    }
  }
}

media.forEach(player => {
  const card = player.closest(".generation-card");
  const label = player.getAttribute("aria-label");
  player.addEventListener("play", () => {
    if (!(activeGroup && activeGroup.card === card && player.tagName === "VIDEO")) {
      pauseAll(player);
      setStatus(`Now playing: ${label}.`);
    }
    card.classList.add("is-playing");
  });
  player.addEventListener("pause", () => {
    if (activeGroup && activeGroup.running && activeGroup.card === card && player.tagName === "VIDEO" && player.paused) {
      endGroup(player.ended ? "Shortest clip finished. Use the individual controls to watch any remaining footage." : "Comparison paused. Play all from start to compare again.");
    }
    if ([...card.querySelectorAll("audio,video")].every(item => item.paused)) card.classList.remove("is-playing");
  });
  player.addEventListener("ended", () => {
    if (activeGroup && activeGroup.card === card && player.tagName === "VIDEO") {
      endGroup("Shortest clip finished. Use the individual controls to watch any remaining footage.");
    }
  });
  // Native unmute within a group also switches the chosen track, preventing overlap.
  player.addEventListener("volumechange", () => {
    if (activeGroup && activeGroup.card === card && player.tagName === "VIDEO" && !player.muted) {
      card.querySelector(".sound-select").value = player.dataset.method;
      applyGroupSound(activeGroup);
    }
  });
  const onError = () => {
    if (activeGroup && activeGroup.card === card) endGroup("A video could not be loaded. Try its download link.");
    setStatus(`${label} could not be loaded. Open the original file using its download link.`);
  };
  player.addEventListener("error", onError);
  player.querySelector("source").addEventListener("error", onError);
});

cards.forEach(card => {
  card.querySelector(".compare-play").addEventListener("click", () => playTogether(card));
  card.querySelector(".compare-pause").addEventListener("click", () => {
    if (activeGroup && activeGroup.card === card) endGroup();
    card.querySelectorAll("audio,video").forEach(player => player.pause());
    groupText(card, "Example paused.");
  });
  card.querySelector(".compare-reset").addEventListener("click", () => {
    if (activeGroup && activeGroup.card === card) endGroup();
    card.querySelectorAll("audio,video").forEach(player => {
      player.pause();
      if (player.readyState >= 1) player.currentTime = 0;
    });
    groupText(card, "Reset to 0 s.");
  });
  card.querySelector(".sound-select").addEventListener("change", () => {
    if (activeGroup && activeGroup.card === card) applyGroupSound(activeGroup);
  });
});

// Paper links are intentionally empty placeholders: never navigate anywhere.
document.querySelectorAll("[data-paper-url], [data-hf-url]").forEach(element => {
  element.addEventListener("click", event => event.preventDefault());
});
