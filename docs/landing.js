(function () {
  "use strict";

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const liveMessages = document.getElementById("liveMessages");
  const miniEmpty = document.getElementById("miniEmpty");
  const livePrompt = document.getElementById("livePrompt");
  const liveCaret = document.getElementById("liveCaret");
  const liveSend = document.getElementById("liveSend");
  const liveState = document.getElementById("liveState");
  const liveCount = document.getElementById("liveCount");
  const liveLast = document.getElementById("liveLast");

  const heroPrompts = [
    {
      text: "Tell me a fun fact about space.",
      reply: "A day on Venus is longer than its year — Venus rotates once every 243 Earth days."
    },
    {
      text: "What's a small win for today?",
      reply: "You opened the document you'd been avoiding. That counts."
    },
    {
      text: "Give me a one-line joke.",
      reply: "I told my computer I needed a break — now it won't stop sending me vacation ads."
    }
  ];

  const promptPacks = {
    "Small talk": [
      "Hi! How's your day going?",
      "Hey! Tell me a fun fact in one sentence.",
      "What's a small thing that made you smile today?",
      "Give me a one-line joke.",
      "Describe your ideal weekend in one sentence.",
      "Recommend a song for a sunny morning."
    ],
    Curious: [
      "What's something surprising about the ocean?",
      "Tell me a cool fact about trees.",
      "What's a fun fact about space?",
      "What's a surprising fact about the human brain?",
      "Tell me something interesting about bees.",
      "What's a fun fact about lightning?"
    ],
    Creative: [
      "Give me a random word and a tiny poem about it.",
      "Tell me a short story in three sentences.",
      "Describe a dream treehouse.",
      "Suggest a name for a small coffee shop.",
      "Give me a two-line poem about the moon.",
      "Suggest a theme for a movie night."
    ],
    Kind: [
      "What's a simple way to brighten someone's day?",
      "Give me a random act of kindness idea.",
      "What's a nice thing to say to a friend?",
      "Give me a random compliment I can give someone.",
      "What's one easy way to be kind to a stranger?",
      "What's a good question to reflect on today?"
    ]
  };

  const categories = Object.keys(promptPacks);
  const promptCards = Array.from(document.querySelectorAll(".prompt-card"));
  const toast = document.getElementById("toast");
  let toastTimer = null;
  let heroToken = 0;

  const sleep = (milliseconds) =>
    new Promise((resolve) => window.setTimeout(resolve, milliseconds));

  function showToast(message) {
    if (!toast) return;
    if (toastTimer) window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 2400);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const helper = document.createElement("textarea");
        helper.value = text;
        helper.setAttribute("readonly", "");
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        const copied = document.execCommand("copy");
        helper.remove();
        return copied;
      } catch {
        return false;
      }
    }
  }

  /* --------------------------------------------------------------------- */
  /* Hero loop                                                              */
  /* --------------------------------------------------------------------- */

  function resetHero() {
    liveMessages.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "mini-empty";
    empty.innerHTML = "What can I help with?<span>The loop handles the rest.</span>";
    liveMessages.appendChild(empty);

    livePrompt.textContent = "";
    liveCaret.style.opacity = "1";
    liveSend.classList.remove("is-stop");
    liveSend.textContent = "↑";
    liveState.textContent = "Next message";
    liveCount.textContent = "in 18s";
    liveLast.textContent = "Last: “Tell me a fun fact about space.”";
  }

  async function typeHeroPrompt(text, token) {
    for (let index = 1; index <= text.length; index += 1) {
      if (token !== heroToken) return false;
      livePrompt.textContent = text.slice(0, index);
      await sleep(30 + Math.random() * 28);
    }
    return token === heroToken;
  }

  function heroUserMessage(text) {
    const message = document.createElement("div");
    message.className = "mini-message user";
    const bubble = document.createElement("span");
    bubble.className = "mini-bubble";
    bubble.textContent = text;
    message.appendChild(bubble);
    return message;
  }

  function heroTypingMessage() {
    const message = document.createElement("div");
    message.className = "mini-message ai";
    const avatar = document.createElement("span");
    avatar.className = "mini-avatar";
    avatar.textContent = "∞";
    const bubble = document.createElement("span");
    bubble.className = "mini-bubble";
    const typing = document.createElement("span");
    typing.className = "mini-typing";
    for (let index = 0; index < 3; index += 1) {
      typing.appendChild(document.createElement("i"));
    }
    bubble.appendChild(typing);
    message.append(avatar, bubble);
    return message;
  }

  function heroAiMessage(text) {
    const message = document.createElement("div");
    message.className = "mini-message ai";
    const avatar = document.createElement("span");
    avatar.className = "mini-avatar";
    avatar.textContent = "∞";
    const bubble = document.createElement("span");
    bubble.className = "mini-bubble";
    bubble.textContent = text;
    message.append(avatar, bubble);
    return message;
  }

  async function runHeroLoop() {
    if (prefersReducedMotion) {
      resetHero();
      liveMessages.replaceChildren();
      liveMessages.append(
        heroUserMessage("Tell me a fun fact about space."),
        heroAiMessage("A day on Venus is longer than its year — it spins once every 243 Earth days.")
      );
      livePrompt.textContent = "";
      liveCaret.style.opacity = "0";
      liveState.textContent = "Next message";
      liveCount.textContent = "in 18s";
      liveLast.textContent = "Last: “Tell me a fun fact about space.”";
      return;
    }

    let index = 0;
    while (true) {
      const token = ++heroToken;
      const item = heroPrompts[index % heroPrompts.length];
      index += 1;

      resetHero();
      await sleep(650);
      if (token !== heroToken) continue;

      if (!(await typeHeroPrompt(item.text, token))) continue;
      await sleep(380);
      if (token !== heroToken) continue;

      liveMessages.replaceChildren();
      liveMessages.append(heroUserMessage(item.text), heroTypingMessage());
      livePrompt.textContent = "";
      liveCaret.style.opacity = "0";
      liveSend.classList.add("is-stop");
      liveSend.textContent = "■";
      liveState.textContent = "The AI is replying…";
      liveCount.textContent = "1 sent";
      liveLast.textContent = `Last: “${item.text}”`;

      await sleep(1150);
      if (token !== heroToken) continue;

      liveMessages.replaceChildren();
      liveMessages.append(heroUserMessage(item.text), heroAiMessage(item.reply));
      liveSend.classList.remove("is-stop");
      liveSend.textContent = "↑";
      liveState.textContent = "Next message";

      for (let seconds = 18; seconds >= 1; seconds -= 1) {
        if (token !== heroToken) break;
        liveCount.textContent = `in ${seconds}s`;
        await sleep(280);
      }

      if (token === heroToken) await sleep(1100);
    }
  }

  /* --------------------------------------------------------------------- */
  /* Prompt samples                                                         */
  /* --------------------------------------------------------------------- */

  function pickPrompt(category) {
    const options = promptPacks[category];
    return options[Math.floor(Math.random() * options.length)];
  }

  function shufflePrompts() {
    const chosen = new Set();

    for (const card of promptCards) {
      let category = card.dataset.category;
      let prompt = pickPrompt(category);
      let attempts = 0;

      while (chosen.has(prompt) && attempts < 8) {
        category = categories[Math.floor(Math.random() * categories.length)];
        prompt = pickPrompt(category);
        attempts += 1;
      }
      chosen.add(prompt);

      card.dataset.category = category;
      const categoryEl = card.querySelector(".prompt-category");
      const textEl = card.querySelector("p");
      if (categoryEl) categoryEl.textContent = category;
      if (textEl) textEl.textContent = prompt;

      if (card.animate) {
        card.animate(
          [
            { opacity: 0.35, transform: "translateY(3px)" },
            { opacity: 1, transform: "translateY(0)" }
          ],
          { duration: 300, easing: "ease-out" }
        );
      }
    }
  }

  async function copyPrompts() {
    const lines = promptCards
      .map((card) => card.querySelector("p")?.textContent?.trim())
      .filter(Boolean);
    const copied = await copyText(lines.join("\n"));
    if (copied) {
      showToast("Four prompts copied — paste them into Custom messages.");
      const button = document.getElementById("copyPrompts");
      if (button) {
        const previous = button.textContent;
        button.textContent = "Copied ✓";
        window.setTimeout(() => {
          button.textContent = previous;
        }, 1800);
      }
    } else {
      showToast("Copy failed. Select the prompts manually.");
    }
  }

  async function copyClone() {
    const command = document.getElementById("cloneCommand")?.textContent?.trim();
    if (!command) return;
    const copied = await copyText(command);
    if (copied) {
      showToast("Clone command copied.");
      const button = document.getElementById("copyClone");
      if (button) {
        const previous = button.textContent;
        button.textContent = "Copied ✓";
        window.setTimeout(() => {
          button.textContent = previous;
        }, 1800);
      }
    } else {
      showToast("Copy failed. Select the command manually.");
    }
  }

  /* --------------------------------------------------------------------- */
  /* Reveal on scroll                                                       */
  /* --------------------------------------------------------------------- */

  function setupReveal() {
    const elements = Array.from(document.querySelectorAll(".reveal"));
    if (!elements.length) return;

    if (!("IntersectionObserver" in window) || prefersReducedMotion) {
      elements.forEach((element) => element.classList.add("visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    elements.forEach((element, index) => {
      element.style.transitionDelay = `${Math.min(index % 8, 5) * 35}ms`;
      observer.observe(element);
    });
  }

  /* --------------------------------------------------------------------- */
  /* Boot                                                                   */
  /* --------------------------------------------------------------------- */

  function bind() {
    document.getElementById("shufflePrompts")?.addEventListener("click", shufflePrompts);
    document.getElementById("copyPrompts")?.addEventListener("click", copyPrompts);
    document.getElementById("copyClone")?.addEventListener("click", copyClone);

    const year = new Date().getFullYear();
    document.querySelectorAll("[data-year]").forEach((element) => {
      element.textContent = year;
    });
  }

  bind();
  setupReveal();
  runHeroLoop().catch(() => {
    /* The static fallback remains usable if animation fails. */
  });
})();
